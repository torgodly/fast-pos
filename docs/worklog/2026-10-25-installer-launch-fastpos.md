# Installer "Launch Fast POS" option — worklog

Date: 2026-10-25
Status: implemented and installer rebuilt

## Change

`installer/fast-pos.iss` — added a finish-page checkbox:

```
Filename: "{app}\bin\fast-pos-open.cmd"; Description: "تشغيل Fast POS الآن | Launch Fast POS now";
  Flags: postinstall nowait skipifsilent; StatusMsg: "فتح Fast POS..."
```

- Checked by default on the Finished page, next to the existing (unchecked) README
  option.
- Runs `fast-pos-open.cmd`, which waits up to 60 s for port 3000 to accept
  connections (the service was just started), then opens `http://localhost:3000`
  in the default browser.
- `skipifsilent` keeps unattended installs from opening a browser.

## Verification

- Rebuilt with `npm run installer:build -- -SkipNpm`.
- `release/installer/Fast-POS-Setup-0.1.0.exe`, 2026-10-25 16:18, 49,476,778 bytes.
- SHA-256: `1f85e0c79a8e1f9aa7437e6cfec63d1bfcb416c1ca698bd051d1f8b17c4e7c61`
- Payload contains `bin/fast-pos-open.cmd`.
- Not installed/run in this session; the running service on port 3000 was left
  untouched.
