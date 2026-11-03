# License generator — date picker and lifetime option

Date: 2026-11-03
Status: fixed, EXE rebuilt on Python 3.15 and visually verified

Report: the expiration date picker in the offline license generator was slow to
navigate (month-by-month only, so reaching another year took up to 12 clicks),
there was no lifetime shortcut, and the date field could not be typed manually.

## Changes (`desktop/license-generator/license_generator.py`)

- `DatePicker` header now has:
  - `«` / `»` buttons that jump one year (12 months) at a time.
  - A month dropdown and a year spinbox (typed years accepted, range hint
    2000–2100, clamped 1–9999), applied via `apply_month_year()`.
  - Existing `‹` / `›` month buttons now delegate to `shift_months(±1)`.
- Issue tab:
  - Expiration textbox is editable (`ttk.Entry`, no `readonly`); the label now
    reads `Expiration date (UTC, YYYY-MM-DD)`.
  - New **Lifetime license** checkbox sets `2099-01-01` and disables both the
    textbox and the date picker; unchecking re-enables them and, if the value is
    still `2099-01-01`, resets the date to today.
  - `open_date_picker()` and `issue_license()` strip surrounding whitespace from
    typed dates; payload validation still rejects malformed/earlier-than-issue
    dates with the existing message box.
  - `TCheckbutton` style added to match the white cards.

## Verification

- `py -3.14` scripted Tk run (GUI CHECKS OK): editable entry, lifetime toggle
  (2099-01-01 + disabled entry/button), uncheck restores today, manual date kept
  when lifetime is untouched, year jump 2026→2027, direct month/year selection
  (February 2034), invalid typed year rollback, month arrows.
- `py -3.14` import + core unit tests: 7/7 pass (run via
  `unittest.defaultTestLoader`, not `-m`, see blocker).

## Python 3.15 retest and EXE rebuild (2026-11-03, later)

The owner replaced the broken Python installs with Python 3.15.2
(`C:\Users\zakaria\AppData\Local\Python\pythoncore-3.15-64`), which is healthy:
`importlib._abc`, `zipfile`, `tkinter` and PyInstaller all import. Installed
`requirements.txt` (`cryptography 49.0.0`, `pyinstaller 6.22.3`) for it.

- `py -3.15 -m unittest test_license_core -v` — 7/7 pass.
- `py -3.15` scripted Tk run — 19/19 checks pass (editable entry, manual date,
  lifetime on/off incl. disabled states and reset-to-today, picker opens on the
  seeded month/year, `«`/`»` jump whole years, `‹` one month, typed year and
  month dropdown apply, invalid year rolls back).
- EXE rebuilt without the passphrase prompt by extracting the unchanged
  encrypted key bundle from the previous EXE
  (`PyInstaller.archive.readers.CArchiveReader`, `embedded-license-key.json`,
  SHA-256 `d653ce66d887e850bc07ce32d7c8ed16db8ecdfb2b185f7f89a3f0d27a6f62a7`)
  and running PyInstaller with the same flags as `build-license-gui.ps1`.
  Re-extracting from the new EXE gives the identical bundle.
- New artifact: `release/license-generator/Fast-POS-License-Generator.exe`,
  17,718,104 bytes, SHA-256
  `41b03ab743a556e288bdbedd092bc48b170b6be0f0b8b79d7b7ff17f9bc79020`.
  Previous EXE kept at
  `build/license-generator/Fast-POS-License-Generator.2026-10-24.exe`.
- Bundled-module check: unmarshalled the `license_generator` script entry and
  confirmed `shift_months`, `apply_month_year`, `toggle_lifetime`, `DatePicker`
  and the `2099-01-01` constant are present.
- Live EXE run: window shows the editable `Expiration date (UTC, YYYY-MM-DD)`
  field, `Choose date...` button, `Lifetime license (expires 2099-01-01)`
  checkbox and the embedded-key hint; the picker opens with `« ‹ month year › »`
  header. The EXE stayed alive in a controlled 12-second run and closed cleanly
  on `WM_CLOSE`; the embedded key file was deleted after building.

`desktop/license-generator/` is git-ignored, so these edits do not appear in
`git status`; only this worklog is tracked.
