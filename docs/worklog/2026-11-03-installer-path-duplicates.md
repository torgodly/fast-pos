# Installer — duplicate machine PATH entries on every update

Date: 2026-11-03
Status: fixed, installer rebuilt, verified on the production install

Report: every update installation added another `C:\Program Files\Fast POS\bin`
to the machine PATH. The owner found many duplicates in the environment variable
editor and deleted them by hand.

## Root cause

`installer/fast-pos.iss` used an `[Registry]` auto-append:

```
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment";
  ValueName: "Path"; ValueType: expandsz; ValueData: "{olddata};{app}\bin";
  Check: NeedsAddPath('{app}\bin')
```

Inno Setup does **not** expand constants in `Check:` parameters. `NeedsAddPath`
therefore searched for the literal text `;{APP}\BIN;` and always returned True, so
the entry was appended on every install/update.

Proven with a throwaway Inno script whose `Check` function logged its argument:

```
Param=[{app}\bin]
Expanded=[C:\Windows\bin]
```

Also reproduced end to end with the pre-fix EXE: one install over the existing
copy produced `;C:\Program Files\Fast POS\bin;C:\Program Files\Fast POS\bin`.

## Fix

`installer/fast-pos.iss`:

- Deleted the `[Registry]` PATH entry and the now-unused `NeedsAddPath`.
- New `RemovePathEntry(PathValue, Entry)` — case-insensitive, removes **all**
  occurrences of one entry (handles first, middle and last position).
- New `UpdateMachinePath` (called from `CurStepChanged(ssPostInstall)`):
  reads the system `Path` as a raw string, collapses every previous
  `{app}\bin` (cleaning up duplicates left by old installers), trims stray
  `;`, appends exactly one entry, and writes it back as `REG_EXPAND_SZ`.
  If the value exists but cannot be read it is left untouched rather than
  overwritten; it is created only when absent.
- Keep `ChangesEnvironment=yes` so Explorer picks up the change.
- Uninstaller (`CurUninstallStepChanged(usPostUninstall)`) now uses the same
  `RemovePathEntry`, so it removes all duplicates too.

No `setx` involved (it truncates at 1024 characters).

## Verification

- Rebuilt with `-SkipNpm`: `release/installer/Fast-POS-Setup-0.1.0.exe`,
  75,700,483 bytes, SHA-256
  `B1153D38B07991E0AF269AC2EE08ABEFECD696863FFC289FCC9D32DE516176DF`.
  Pre-fix backup: `build/installer/Fast-POS-Setup-0.1.0.prev.exe`.
- First run of the fixed installer collapsed the duplicated entries to a single
  `C:\Program Files\Fast POS\bin`; a second run left the count at 1. Setup log
  line: `System Path now contains a single Fast POS entry.`
- Installed build live check: `FastPOS` service Running, `http://127.0.0.1:3000/`
  → 200, installed database `C:\Program Files\Fast POS\server\data\pos.db`
  unchanged (same size/mtime).

## Incident: machine PATH wiped during manual cleanup

While removing the duplicates the owner cleared the **whole** machine PATH, not
just the Fast POS entry. The process-level `PATH` snapshot still held the
inherited value, so the machine PATH was reconstructed from it (44 entries,
excluding Qoder-only entries already present in the user PATH) and written back
elevated as `REG_EXPAND_SZ`, followed by a `WM_SETTINGCHANGE` broadcast.

- Registry before: `C:\Program Files\Fast POS\bin`
- Registry after: 44 system entries plus `C:\Program Files\Fast POS\bin`,
  1824 characters, one trailing `;` (harmless; the installer trims it on the
  next run), no duplicate entries, user PATH untouched.

## Notes

- `build/` scratch artifacts (`checkparam-test.iss`, its EXE and result file)
  were deleted after the investigation.
- The owner still commits the change (`installer/fast-pos.iss`).
