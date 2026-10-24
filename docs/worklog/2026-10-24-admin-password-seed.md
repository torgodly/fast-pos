# Production seed admin password = 123 — worklog

Date: 2026-10-24
Status: implemented, verified (tests + typecheck + production build + installer)
Owner request: "make sure the production seed admin password is set to 123".

## Findings

- The production seed (`seedFactoryDatabase` → `runSeed` with `demo: false`) already
  hashed `"123"` for the `admin` user (`lib/db/seed.ts`).
- Seeding only runs when `venues` is empty. Existing dev and installed databases still
  held the previous default (`admin123`), so upgrades over preserved `data/` never
  received the new default.

## Change

- Added `upgradeLegacyAdminPassword(db)` in `lib/db/seed.ts`, called by
  `seedIfNeeded` before the venues check (so it also runs for existing databases):
  - Finds the seeded admin (`role = admin`, `username = admin`).
  - If the stored hash still matches `admin123`, replaces it with a fresh hash of
    `123` (bcrypt cost 10).
  - Custom/owner-changed passwords are never touched.
- Regression tests in `lib/db/seed.test.ts`:
  - Counter and full factory seeds assert the admin hash matches `123`.
  - A legacy database is upgraded from `admin123` to `123`, while a second admin
    with a custom password is unchanged.

## Verification (2026-10-24)

- `npx vitest run lib/db/seed.test.ts` — 3 passed.
- `npm test` — 20 files / 92 tests passed.
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeded.
- `npm run installer:build -- -SkipNpm` — Inno Setup 7.1.0 compile succeeded;
  `release/installer/Fast-POS-Setup-0.1.0.exe` rebuilt at 15:30 (46 MB), and the
  payload contains the `admin123` migration string.

## Notes

- Existing databases are migrated on the first start of the new build; the migration
  is idempotent and only affects the untouched legacy default.
- A fresh install still seeds `admin` / `123` directly.
