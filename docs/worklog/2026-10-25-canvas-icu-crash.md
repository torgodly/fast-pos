# Checkout crash — missing canvas ICU data (icudtl.dat) — worklog

Date: 2026-10-25
Status: fixed, verified (standalone + packaged runtime render, installer rebuilt)
Owner report: checkout on the customer's server aborted the service. Service logs showed:

```
SkIcuLoader: datafile missing: ...\server\node_modules\@napi-rs\canvas-win32-x64-msvc\icudtl.dat
SkIcuLoader: datafile missing: C:\Program Files\Fast POS\node\icudtl.dat
[skia] ** ERROR ** .../ParagraphBuilderImpl.cpp(182): fatal error: "check(fUnicode)"
```

## Root cause

- Checkout printing rasterizes Arabic receipt text: `lib/print/escpos.ts` →
  `lib/print/text-raster.ts` → `createCanvas` / `fillText` from `@napi-rs/canvas`.
- The platform package `@napi-rs/canvas-win32-x64-msvc` contains both
  `skia.win32-x64-msvc.node` **and** `icudtl.dat` (10.8 MB). Skia loads
  `icudtl.dat` at runtime, so neither `require()` tracing nor the previous
  `outputFileTracingIncludes` pattern (`@napi-rs/canvas/**/*`, wrapper only) copied it.
- Dev worked because the repo's `node_modules` has the file. The standalone build and
  installer payload shipped only `.node`, so the first Arabic text shaping aborted the
  Node process with an illegal instruction (exit 132) and WinSW stopped/restarted the
  service.

Reproduced exactly from `.next/standalone` before the fix by rendering
`مرحبا Hello 123`: same SkIcuLoader messages, Skia fatal error, exit 132.

## Fix

- `next.config.ts` — add the platform package to `outputFileTracingIncludes`:
  `node_modules/@napi-rs/canvas-win32-x64-msvc/**/*`.
- `scripts/build-installer.ps1` — fail the payload build if
  `server\node_modules\@napi-rs\canvas-win32-x64-msvc\icudtl.dat` is missing, so this
  cannot silently ship again.

## Verification (2026-10-25)

- `npm run build` — succeeded; `.next/standalone/.../icudtl.dat` present (10,876,560 bytes).
- Mixed Arabic/Latin render from `.next/standalone` — PNG 2168 bytes, exit 0.
- `npm run installer:build -- -SkipNpm` — Inno Setup 7.1.0 compile succeeded at 13:59;
  `release/installer/Fast-POS-Setup-0.1.0.exe` is now 49.5 MB (was 46.1 MB).
- Payload contains `icudtl.dat`; render with the packaged `node\node.exe` from
  `build/installer-payload/server` — PNG 2168 bytes, exit 0.

## Deployment

Run the rebuilt setup over the existing installation (upgrade): it stops the service,
keeps `server\data`, and copies the missing ICU file. No database migration involved.
