# Divider before the deferred «طلبات هاتف» button — 2026-11-01

## What changed

Cashiers were tapping the solid orange «طلبات هاتف» (آجل hold) button that sat
directly under the cash/card row. Both payment footers now split methods into
collect-now and deferred groups with a thin hairline (`role="separator"`)
between them; positions, colors, sizes, and order are otherwise unchanged.
The divider only renders when both groups exist.

- `components/PayButtons.tsx` — order page footer.
- `components/QuickSaleBoard.tsx` — بيع سريع footer.

## Verification

- TDD: `PayButtons.test.tsx` (3 tests) and `QuickSaleBoard.test.tsx` (2 tests)
  assert one separator between «بطاقة» and «طلبات هاتف», no separator when all
  methods collect money, and a lone hold button renders without an empty row.
- `npx vitest run` — 82 files / 520 tests pass.
- `npx tsc --noEmit` and scoped eslint — clean.
- `npm run build` + installer (`-SkipNpm`) + silent install: installed
  BUILD_ID `tWv9nD6dA-pxa0t9Zed02` matches the repo, service RUNNING,
  `http://127.0.0.1:3000/` → 200, DB fingerprint unchanged (`92586d0d…`).
