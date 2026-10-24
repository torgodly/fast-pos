# Uninstaller removes the whole Fast POS folder — worklog

Date: 2026-10-24
Status: implemented, verified (compiler + disposable uninstall lab)
Owner request: "the uninstall should completely delete the fastpos folder from program files if chosen to delete the data too".

## Root cause

- Deletion of `{app}\server\data` ran in `CurUninstallStepChanged(usPostUninstall)`.
- Inno processes the uninstall log (files, application directory, `[UninstallDelete]`,
  directory cleanup) **before** `usPostUninstall`. The data still existed during that
  cleanup, so `dirifempty {app}\server` and `dirifempty {app}` failed. Deleting the data
  afterwards left an empty `C:\Program Files\Fast POS` with no remaining directory pass.
- `[UninstallDelete]` has no `Check` parameter, so conditional data deletion cannot be
  moved into that section.

## Change — `installer/fast-pos.iss`

- Removed the `[UninstallRun]` stop entry. The service is now stopped from code in
  `CurUninstallStepChanged(usUninstall)` via `StopFastPosService`, which runs for both
  keep-data and delete-data paths, before any files or data are touched.
- Added `DeleteRuntimeData`, which deletes only `{app}\server\data` (never
  `{app}\server`, which holds the app) with up to 10 attempts 500 ms apart to wait for
  SQLite handles to be released.
- When the user chooses data deletion (prompt Yes or `/DELETEUSERDATA`), it now runs in
  `usUninstall` — before the uninstall log and directory cleanup — so Inno can remove the
  emptied `server` and `{app}` directories. The same helper and `RemoveDir` calls are
  retried in `usPostUninstall` as a fallback.
- Keep-data remains the default and still leaves `server\data` untouched.

## Verification (2026-10-24)

- `npm run installer:build -- -SkipNpm` — Inno Setup 7.1.0 compile succeeded at 15:41;
  `release/installer/Fast-POS-Setup-0.1.0.exe` rebuilt (46 MB).
- Disposable lab installer (same `[UninstallDelete]`/`[Code]`, unprivileged, temp dir):
  - silent uninstall with `/DELETEUSERDATA`: the install folder no longer exists
    (`Test-Path` = False).
  - silent uninstall without the flag: app files removed; `server\data\pos.db` and
    `deployment.json` preserved.
- The real setup was not installed/uninstalled because it creates an admin service,
  firewall rule and PATH entry; the lab exercises the identical cleanup code. The only
  untested line is the pre-existing `FastPOS-service.exe stop` invocation.
