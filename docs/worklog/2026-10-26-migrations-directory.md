# Migrations directory refactor

Date: 2026-10-26
Status: implemented, tested, installer built, installed on production

## Requirement

Move all database migrations into a dedicated directory under `lib/db/` and
record that path as the project convention.

## What moved

All boot migrations now live in `lib/db/migrations/`:

- Standalone modules moved with `git mv`: `migrate-cafe-menu`,
  `migrate-nullable-menu-venue`, `migrate-payment-methods`,
  `migrate-printer-auto-print`, `migrate-report-groups`,
  `migrate-restaurant-menu`, `migrate-shift-cash`, `migrate-shift-expenses`,
  `migrate-tables`, plus the shared `dedupe-shared-categories.ts`.
- Their tests moved alongside them: `migrate-payment-methods.test.ts`,
  `migrate-printer-auto-print.test.ts`, `migrate-shift-cash.test.ts`,
  `migrate-shift-expenses.test.ts`.
- Inline migrations extracted from `lib/db/index.ts` into their own modules:
  `migrate-units.ts`, `migrate-printer-venue-nullable.ts`,
  `migrate-deduplicate-kitchen-printers.ts`, `migrate-shared-staff.ts`.
- Shared column helpers (`tableColumns`, `hasColumn`, `renameColumnIfNeeded`,
  `addColumnIfMissing`) moved to `lib/db/migrations/helpers.ts`.

`lib/db/index.ts` now only owns the connection, `ensureSchema()`, the seed
lock, and the ordered migration calls in `createDb()`. `floor-tables.ts`
stayed in `lib/db/` because the seed and UI use it, not just migrations.

## Convention

- New boot migrations belong in `lib/db/migrations/` as idempotent exported
  `migrateX(sqlite)` functions, with tests next to them.
- Every migration must be wired into `createDb()` in `lib/db/index.ts`.
- Shared data/helpers used by seed or UI stay outside the migrations folder.

## Verification

- `npm test`: 44 files / 217 tests passed (no behavior change).
- `npx tsc --noEmit`: clean. `eslint` on `lib/db/index.ts` and
  `lib/db/migrations`: clean.
- Installer rebuilt and installed over `C:\Program Files\Fast POS`; installed
  `BUILD_ID` `jV2OgzlDu0yaXQv99pgSQ` matches the local build, the FastPOS
  service is running, `http://localhost:3000/` returns 200, and production
  data is intact (1 order, 2 order items, 10 categories; cash/card/phone
  methods unchanged).

Older worklogs still reference the pre-refactor `lib/db/migrate-*.ts` paths;
those references describe where the work happened at the time.
