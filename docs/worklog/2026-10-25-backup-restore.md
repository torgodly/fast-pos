# Backup & restore — worklog

Date: 2026-10-25
Status: implemented; unit, integration and UI tests green; typecheck and
production build green. Installer rebuild/verification noted below.

## Request

Admin settings page needed a complete backup and restore flow:

- download a single archive with everything needed to rebuild the system;
- upload an archive (or a raw `.db`) to restore it;
- only the admin password confirms a restore (no typed confirmation);
- an open shift must warn but must not block the restore.

Decisions confirmed with the owner: archive contains the whole SQLite database
plus the custom receipt logo and a manifest; restore requires the admin password;
open shifts are replaced with a warning.

## Archive (`lib/backup/core.ts`)

`.fastpos` = ZIP (`JSZip`, DEFLATE level 6) containing:

- `pos.db` — consistent snapshot via better-sqlite3 `db.backup()` (includes WAL);
- `receipt-logo.png` — only when a custom logo exists;
- `manifest.json` — `app`, `formatVersion: 1`, `createdAt`, `hasLogo`, counts
  (venues/users/items/orders).

File name: `fastpos-backup-YYYY-MM-DD-HHmm.fastpos`.

`readBackupFile` accepts a raw SQLite file (`.db`) or the archive; rejects
unknown formats, broken ZIPs, archives without a DB, and archives whose DB lacks
the SQLite header. `inspectBackupDatabase` runs `PRAGMA integrity_check` (must be
exactly `ok`) and requires `venues`, `users`, `items`, `orders`, `app_settings`;
it returns counts for the success message.

## Restore pipeline (`app/api/admin/backup/restore/route.ts`)

1. Admin session (401/403), same-origin check, single-restore lock (409),
   request-size limits (250 MB upload / 512 MB DB inside).
2. Admin password re-verified against `users.password_hash` with bcrypt (403
   `كلمة المرور غير صحيحة`).
3. Parse + validate the upload; write the DB to a temp directory.
4. Count open shifts (`shifts.status = 'open'`) for the response warning.
5. Safety snapshot of the live DB at `data/backups/pre-restore-<timestamp>.db`
   via the SQLite backup API; keep the last 5 (`pruneBackups`).
6. `closeDatabase()` → synchronous `replaceDatabaseFile` →
   `getSqlite()` reopens through `createDb()` (schema migrations + seed).
7. Failure while reopening automatically restores the displaced DB file and
   returns a rolled-back error. The replacement copies the new DB and deletes
   stale `-wal`/`-shm` files so old WAL frames can never attach to the new DB.
8. Receipt logo: replaced/removed for archive restores (an archive reflects the
   backed-up instance), left untouched for a raw `.db` restore. Logo cache is
   cleared; `revalidatePath` refreshes admin/cashier/waiter views.

Success JSON: `ok`, `counts`, `replacedOpenShifts`, `safetyBackup`, `logo`
(`restored|removed|kept`), optional `warning`.

## Live DB reopen (`lib/db/index.ts`)

The restore must apply without restarting the service. `db` is now a stable
Proxy over the cached Drizzle instance, and the raw connection lives in
`globalThis.__posSqlite`; every `db.*` call resolves the current instance.
`closeDatabase()` clears both refs and closes the connection, and
`getSqlite()`/the proxy reopen lazily. Already-imported `db` bindings in server
actions and route bundles keep working after the swap.

## API

- `GET /api/admin/backup` — admin only; streams the `.fastpos` archive with
  `Content-Disposition: attachment`, `no-store`, `nosniff`.
- `POST /api/admin/backup/restore` — admin only; multipart `file` + `password`.

## UI

- `components/admin/BackupRestorePanel.tsx`: download card (direct link to the
  API route), permanent warning explaining full replacement + automatic safety
  snapshot + open-shift replacement, file input (`.fastpos`/`.db`), admin
  password field, client-side required checks, upload with progress state,
  success summary (counts, safety snapshot name), open-shift warning from the
  server, and error feedback.
- Section «النسخ الاحتياطي والاستعادة» added to
  `app/admin/(panel)/settings/page.tsx` above the danger zone.

## Security

- Admin session + bcrypt password confirmation; no restore without it.
- Same-origin `Origin`/`Host` check on the POST route.
- Uploaded DB is only opened `readonly` with `fileMustExist` and validated before
  touching the live file; replacement happens in a temp directory copy.
- The restore lock prevents two swaps racing in one process.

## Tests

- `lib/backup/core.test.ts` (15): archive snapshot + manifest + logo + name,
  raw/archive parsing and rejects, safety snapshot naming/content, pruning,
  logo apply modes, validation (valid/corrupt/missing tables), swap success
  (stale WAL removed), cleanup failure after a successful reopen, and rollback.
- `lib/db/reopen.test.ts` (1): `closeDatabase()` + file swap + lazy reopen is
  visible through both `getSqlite()` and the `db` proxy.
- `lib/backup/route.test.ts` (6, Node environment): download 401/200+ZIP;
  restore 401, wrong password 403 with no snapshot, success 200 with safety
  snapshot + open-shift count, corrupt upload 400 keeping the live DB.
- `components/admin/BackupRestorePanel.test.tsx` (5): download link, client
  validation, multipart upload + success/refresh, open-shift warning, server
  error display.
- Full suite on the final code: 38 files / 180 tests green. `npx tsc --noEmit`
  clean. `npm run build` succeeded and lists `/api/admin/backup` and
  `/api/admin/backup/restore`.
- Installer rebuilt after the swap hardening:
  `release/installer/Fast-POS-Setup-0.1.0.exe`, 49,486,685 bytes, SHA-256
  `8f5105a2c869cdb919ec1b7c236844c9201317e97be512a4680cffa55d500e62`.
- Installed on the owner's production machine 2026-10-25 20:30:
  installed build ID `OGahFdf0Jx7sZ7sZrsRrs` matches the local build, service
  `FastPOS` running on port 3000 (PID 14928), installed chunks contain the
  settings panel string and both backup routes. Live smoke checks:
  `GET /api/admin/backup` → 401 (auth required, route exists),
  `POST /api/admin/backup/restore` → 401, `/admin/settings` → 307 to login,
  `/` → 200. Production DB copied and inspected: `integrity_check: ok`,
  1 venue / 2 users / 85 items / 1 order / 0 open shifts (unchanged), and no
  `data/backups` directory (no restore was run).

## Files

- New: `lib/backup/core.ts`, `lib/backup/core.test.ts`, `lib/backup/route.test.ts`,
  `lib/db/reopen.test.ts`, `app/api/admin/backup/route.ts`,
  `app/api/admin/backup/restore/route.ts`,
  `components/admin/BackupRestorePanel.tsx`,
  `components/admin/BackupRestorePanel.test.tsx`.
- Changed: `lib/db/index.ts` (proxy + `closeDatabase`),
  `app/admin/(panel)/settings/page.tsx`, `package.json` (+`jszip`).

## Owner handoff

- Download backups from admin → الإعدادات → النسخ الاحتياطي والاستعادة.
- Restore accepts `.fastpos` or a raw `.db`; it replaces all live data. A
  `pre-restore-*.db` safety snapshot is kept in `data/backups` (last 5).
- Do not run a test restore against the live sales database; the integration
  tests use a temp database instead.
