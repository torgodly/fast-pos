# License generator — installation ID paste fix

Date: 2026-10-24
Status: fixed, tested, compiled EXE rebuilt and verified
Report: the installation ID field in the compiled license generator
(`release/license-generator/Fast-POS-License-Generator.exe`) would not accept
pasted data.

## Investigation

- The field is a normal `ttk.Entry` bound to `installation_id`; Ctrl+V works in a
  scripted Tk run and the compiled EXE. There was no validation blocking paste.
- Real gaps found in the GUI:
  - No right-click menu on the entry, so right-click → Paste (common on Windows)
    does nothing.
  - No visible paste affordance (no Paste button).
  - Pasted text is not normalized. The activation page is Arabic RTL and displayed
    with `dir="ltr"`; copied IDs can carry newlines, spaces, or invisible bidi
    marks (U+200E/U+200F, etc.), which made generation fail with
    "Installation ID must be a UUID." even though the text looked correct.

## Fix

- `license_core.py`
  - New `normalize_installation_id()`: removes whitespace plus Unicode bidi/
    zero-width characters, then validates.
  - `create_license_payload()` and `verify_license_token()` now normalize the
    installation ID before validating/comparing.
- `license_generator.py`
  - Installation ID rows (Issue and Verify tabs) now have a **Paste** button.
  - Right-click context menu: Cut / Copy / Paste / Select all.
  - Ctrl+V, Shift+Insert, and Ctrl+A are bound explicitly; all paste paths use
    the normalized paste helper so both tabs show the same cleaned value.
- `test_license_core.py`
  - New test: pasted ID with spaces, a newline, and RTL marks produces a payload
    with the clean UUID and verifies successfully.

## Verification

- `py -3.14 -m unittest test_license_core -v` — 7 tests pass.
- `py -3.14 -m py_compile` on the three files — OK.
- Scripted Tk run: Paste button, Ctrl+V, and context-menu Paste each set the
  installation ID to the clean UUID; the Verify tab entry shares the value.
- Compiled EXE rebuilt with PyInstaller using the **same encrypted key bundle**
  extracted from the previous EXE (SHA-256 match; no passphrase required):
  `release/license-generator/Fast-POS-License-Generator.exe` (16.2 MB).
- Live test of the rebuilt EXE: pasted text containing RTL marks and a newline via
  Ctrl+V; the field showed `123e4567-e89b-42d3-a456-426614174000` and the new
  Paste button was visible. Screenshot captured during verification.
- Previous EXE backup: `build/license-generator/Fast-POS-License-Generator.prev.exe`.
  The extracted temporary key bundle was deleted after the build.

## Notes

- `desktop/license-generator/` is intentionally git-ignored (`.gitignore` line 9),
  so these source changes are local-only and will not appear in git status.
- Normal rebuild path remains `npm run license:gui:build`, which prompts for the
  embedded-key passphrase. The fix did not change the key or passphrase.
