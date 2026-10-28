# Remote access (temporary Cloudflare tunnel) + login throttling — worklog

Date: 2026-10-28
Status: implemented, tested, installer built, installed and verified on production

## Requirement

Let the restaurant owner reach the installed, LAN-only Fast POS from anywhere,
started by a staff member, for as long as that staff member keeps a command
window open. Requested as another command next to the existing `installer/bin`
commands, no domain available.

## Locked decisions

- **Cloudflare quick tunnel** (`cloudflared tunnel --url`): no domain, no
  Cloudflare account, random `https://<slug>.trycloudflare.com` per run.
- **URL only** — no Cloudflare Access gate. Whoever has the URL reaches the
  login page and still needs credentials.
- **Lifetime = the window.** Closing the console (X included) or Ctrl+C kills
  `cloudflared`. `fast-pos-remote stop` is the crash fallback.
- **No** session timer, DB preflight, bcryptjs vendoring, or refusal to run
  with the default admin password. The owner holds the admin password and the
  tunnel dies with the window.
- Staff PIN `2580` still opens the POS remotely — README-FIRST warns the owner
  to change it.

## Implementation

### Launcher

- `installer/bin/fast-pos-remote.cmd` → `installer/remote/remote.ps1 %*`
  (`powershell -NoProfile -ExecutionPolicy Bypass`), pauses on error.
- `remote.ps1` commands: `start` (default) and `stop`.
- Start flow: probe `127.0.0.1:3000` with a 2 s TCP connect → resolve
  `cloudflared.exe` (`{app}\cloudflared`, dev fallback
  `build\downloads\cloudflared`) → kill a stale tunnel recorded in state → prune
  logs older than 7 days → create a Job Object → start cloudflared hidden with
  `--no-autoupdate --logfile <state-dir>\cloudflared.log` → assign the child to
  the job → poll the log for the URL (90 × 500 ms) → write
  `%LOCALAPPDATA%\FastPOS\remote-tunnel.json` → copy the URL to the clipboard →
  print instructions → `Wait-Process` → kill the child, close the job, remove its
  own state.
- Kill-on-close uses a Windows Job Object:
  `JOB_OBJECT_EXTENDED_LIMIT_INFORMATION` with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` (0x2000) via `Add-Type` P/Invoke
  (`CreateJobObject`, `SetInformationJobObject`, `AssignProcessToJobObject`).
  If assignment fails the launcher aborts instead of leaving an orphan.
- `stop` reads the state file, verifies the PID still belongs to cloudflared,
  kills the tree, deletes the state, prints the outcome. Works after a crash or
  after the console was killed from Task Manager.

### Installer

- `build-installer.ps1` copies `installer\remote` to `{app}\remote` and
  `build\downloads\cloudflared\cloudflared.exe` to `{app}\cloudflared`, after
  verifying SHA-256
  `83E726ED18EA78C5AD5213C4C3A3A27051393950D2BC8ED4DE69BEC12D14EAAE`.
  A missing file or hash mismatch fails the build.
- `fast-pos.iss` adds the Start Menu shortcut **Fast POS Remote Access**
  (`{app}\bin\fast-pos-remote.cmd`, app icon).
- `README-FIRST.txt` documents the command, the URL behaviour, keeping the
  window open, `stop`, and the PIN warning.

### Login throttling

The app becoming publicly reachable made brute force a real threat, so the
previously dead `lib/auth/rate-limit.ts` is now wired in:

- `clientIp(request)` = first `x-forwarded-for` entry, else `x-real-ip`, else
  `"local"` (cloudflared sets `x-forwarded-for`).
- `/api/auth/pin`: key `pin:<ip>:<venue>`, checked after venue/PIN format
  validation and before the DB lookup; failure → 401, success clears the bucket.
- `/api/auth/admin`: key `admin:<ip>` **only**, so rotating usernames cannot
  bypass the lockout; checked before body parsing/DB.
- Policy: 8 failures / 15 min → 429 with `Retry-After` and a 5 min lock,
  in-memory (resets on restart).

## Tests

- `lib/auth/rate-limit.test.ts` — IP fallbacks, key formats, admin lock after 8.
- `app/api/auth/admin/route.test.ts` (new, in-memory sqlite + mocked `@/lib/db`)
  — wrong/right password, 8 failures then 429 even with the correct password,
  success clears, per-IP independence.
- `app/api/auth/pin/route.test.ts` (new, activation + deployment mocked) —
  same matrix per IP+venue, plus venue isolation.
- Full suite: 238 tests pass; typecheck and `next build` clean.

## Findings and pitfalls

- **Host rewriting:** Cloudflare replaces `Host` with the tunnel hostname and
  adds `x-forwarded-proto: https` / `x-forwarded-for`. It does not add
  `x-forwarded-host`. Because `Origin` and `Host` are rewritten consistently,
  the `hasSameOrigin` guards in the backup-restore and logo-upload routes still
  pass unchanged.
- **cloudflared log is held open for writing** by Go:
  `[IO.File]::ReadAllText` throws a sharing violation. Poll with
  `[IO.File]::Open(path, Open, Read, ReadWrite)` + `StreamReader`.
- **`Start-Process -RedirectStandardError`** locks its file against reads —
  unusable for URL polling; use cloudflared's own `--logfile` instead.
- **`Write-Host` output vanishes** when PowerShell stdout is redirected (our
  tests launch it from a hidden cmd). Every message uses `Write-Output`.
- **Async stderr handlers** (`BeginErrorReadLine` + scriptblock) crashed
  PowerShell 5.1 with exit code 2; removed in favour of log-file polling.
- **`npm run installer:build` runs `npm ci`** (the script no longer passes
  `-SkipNpm`, edited by the owner). An interrupted `npm ci` left
  `node_modules` partial (vitest/next missing, ENOTEMPTY on
  `node_modules/next/dist/client`); recovered by removing `node_modules/next`
  and running `npm install --ignore-scripts`, then 238 tests + build green.
  During normal work prefer
  `powershell -File scripts/build-installer.ps1 -SkipNpm` when `.next` is valid.

## Verification

- Echo-server test: public HTTPS reaches the local listener, `Host` is the
  tunnel host, killing the job kills cloudflared, `stop` kills it too, launcher
  exits cleanly.
- Installed production build: service running, `BUILD_ID` matches the repo,
  app root 200 (Arabic title), `/pin/restaurant` 200, wrong admin password →
  401 in Arabic, tunnel URL returns 502 after `stop`, LAN access still 200.
