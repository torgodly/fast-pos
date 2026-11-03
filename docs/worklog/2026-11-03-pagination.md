# Pagination for history lists — 2026-11-03

## What shipped

Server-side pagination on the six admin history surfaces that grow without bound:

| Page | URL | Per-page sizes |
|---|---|---|
| `/admin/invoices` | `?venue=&q=&page=&size=` | 25 / 50 / 100 |
| `/admin/audit` | `?venue=&from=&to=&kind=&user=&role=&result=&order=&q=&page=&size=` | 25 / 50 / 100 |
| `/admin/cancelled-items` | `?venue=&q=&page=&size=` | 25 / 50 / 100 |
| `/admin/inventory` (movement table) | `?from=&to=&item=&category=&page=&size=` | 25 / 50 / 100 |
| `/admin/purchases` | `?from=&to=&supplier=&q=&page=&size=` | 25 / 50 / 100 |
| `/admin/shifts` | `?venue=&page=&size=` | 25 / 50 / 100 |

Out of scope and unchanged: master-data lists, the cashier sales screen, report pages, and
print/PDF output.

## Decisions

- **URL contract.** `page` is 1-based; missing/invalid → 1; past the end → last page.
  `size` ∈ {25,50,100}, default 25, invalid → 25. Pager links keep every current filter.
  Filter forms and venue switches drop `page` but keep `size` (hidden `size` inputs on the
  GET forms; the inventory filter card forwards the prop).
- **Shared pieces.** `lib/pagination.ts` owns the math and URL building
  (`parsePageSize`, `resolvePageInfo`, `pageHref`, `pageItems`); `components/Pagination.tsx`
  is a server component (Link-only, `prefetch={false}`, DaisyUI `join`, `aria-current` for the
  active page and size) showing «عرض X–Y من Z» plus «السابق / 1 … n / التالي» and the
  «لكل صفحة» selector. It renders nothing when the filtered set is empty and hides page
  buttons when everything fits on one page.
- **Whole-set headers, page-scoped rows.** Purchases totals (invoice count, spend, line count,
  distinct suppliers) and the shifts header (closed count, sales, expenses, net differences)
  are SQL aggregates over the filtered set, not reductions of the current page.
- **Inventory movements** use one `UNION ALL` of the ingredient and item movement tables with
  every column explicitly aliased; `count(*)` runs over the subquery and ordering is
  `created_at desc, source desc, id desc` (item before ingredient on equal timestamps, matching
  the previous key ordering). The category filter short-circuits the ingredient branch.
- **Reports untouched.** `getPurchaseSummary` only applies `limit/offset` when the caller passes
  them; the PDF route and the thermal report whitelist `from/to/supplier/q` so a request can
  never inject paging.
- **Shifts.** `listShifts(venue, limit = 100, offset = 0)` keeps the cashier's
  `listShifts(venue, 60)` working; the admin history uses 25/50/100.

## Verification

- Full gate: vitest **87 files / 553 tests** pass; `tsc --noEmit` clean; focused eslint clean on
  all changed files; `npm run build` success, BUILD_ID `bYCpovZRwQhI2wriYdpeS`.
- Page windows checked against a read-only copy of the production DB (copy deleted afterwards):
  - orders **786** → 32 pages; last page offset 775 returns 11 rows (ids 21…11).
  - audit_events **2,070** → 83 pages; last page offset 2050 returns 20 rows.
  - movements **1,533 + 231 = 1,764** → 71 pages; 25 unique keys per page, no overlap,
    last page 14 rows.
  - purchases **34** → totals 8,265.6 / 34 lines / 4 suppliers, identical to the old row sums.
  - shifts: 18 total = **17 closed + 1 open** (the plan's "18 closed" was the total count);
    closed summary 20,944 sales / 0 expenses / −79 difference, identical to per-shift sums.
- Owner-side check still pending: the cancelled-items header uses the same aggregate shape but
  its production copy query was blocked by the auto-mode production-read guard on repeat access.

## Install

- Built with `-SkipNpm`: `release/installer/Fast-POS-Setup-0.1.0.exe`, **75,700,247 bytes**,
  SHA-256 `35adef4ccdf27d209a11d090d0dca9016e462ad91f3f9661c5f2fbe5ead32bed`.
- Installed silently over `C:\Program Files\Fast POS` (owner approved UAC).
- Post-install: installed BUILD_ID `bYCpovZRwQhI2wriYdpeS` (matches the build),
  `FastPOS` service Running, `http://127.0.0.1:3000/` → 200,
  `deployment.json` SHA-256 unchanged (`1d5d296f…`), and `pos.db` unchanged
  (1,007,616 bytes, mtime 2026-11-03 13:15:07 — no migration touched the live DB).

## Owner walk-through (pending)

Log in and open each page with a non-default size (e.g. `?size=50&page=2`): invoices, audit,
cancelled items, inventory movements, purchases, shifts. Confirm the count line, active page,
prev/next edges, size switch, and that filters keep the size and reset to page 1.

Build and install itself are verified above; only the visual walk-through remains.
