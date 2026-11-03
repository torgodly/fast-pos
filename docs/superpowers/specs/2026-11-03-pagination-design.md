# Pagination for history lists — design — 2026-11-03

**Goal:** page the six admin history tables that grow without bound, using a shared server-side pager with a numbered UI and a 25/50/100 page-size choice.

**Scope:** `/admin/invoices`, `/admin/audit`, `/admin/cancelled-items`, `/admin/inventory` (movement table), `/admin/purchases`, `/admin/shifts`.

**Out of scope:** master-data lists (items, customers, suppliers, staff, units, printers, payment methods, tables), the cashier sales screen, report pages, and print/PDF output.

## Global constraints

- No new dependencies; TypeScript 5.9 strict; Next.js 16 App Router with async `searchParams`.
- Server-rendered paging; no client-side row slicing.
- Existing filters, venue tabs, PDF and thermal reports keep working unchanged.
- Tests never open the live DB; page SQL is checked against a copy.
- The agent never commits; the owner commits.

## URL contract

- `page`: positive integer, 1-based. Missing/invalid → 1. Past the last page → clamped to the last page.
- `size`: one of `25`, `50`, `100`; default `25`. Missing/invalid → default.
- All existing filter params (`venue`, `q`, `from`, `to`, `supplier`, `kind`, `user`, `role`, `result`, `order`, `item`, `category`, `day`, `date`) are preserved by pager links.
- Any filter form or venue switch drops `page` (returns to page 1) and keeps `size`.
- Examples: `/admin/invoices?venue=cafe&size=50&page=3`.

## Shared pieces

### `lib/pagination.ts`

```ts
export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

export type QueryParams = Record<string, string | string[] | undefined>;

export type PageInfo = {
  page: number;      // clamped to [1, totalPages]
  size: PageSize;
  offset: number;    // (page - 1) * size
  total: number;
  totalPages: number; // at least 1
  from: number;      // 1-based first row on this page; 0 when total = 0
  to: number;        // last row on this page; 0 when total = 0
};

export function parsePageSize(value: unknown): PageSize;
export function resolvePageInfo(
  input: { page?: string; size?: string },
  total: number,
): PageInfo;

export function pageHref(
  basePath: string,
  params: QueryParams,
  page: number,
  size: PageSize,
): string;

export function pageItems(
  current: number,
  totalPages: number,
): Array<number | "ellipsis">;
```

- `pageHref` copies current params (first value of arrays), omits empty values, omits `page` when it is 1, and omits `size` when it is the default. It always drops nothing else.
- `pageItems` returns all pages when `totalPages <= 7`; otherwise `1, …, current-1..current+1, …, last` with deduplicated edges.

### `components/Pagination.tsx`

Server component (Link-only, no client JS):

```tsx
export function Pagination({
  basePath,
  params,
  info,
}: {
  basePath: string;
  params: QueryParams;
  info: PageInfo;
})
```

- Returns `null` when `info.total === 0`.
- Renders «عرض {from}–{to} من {total}».
- Renders «السابق» / numbered buttons / «التالي» (DaisyUI `join`, all `prefetch={false}`). Prev/next are disabled at the edges; the current page button is active.
- Renders «لكل صفحة» + 25 / 50 / 100 buttons; switching size links to page 1 with the new size.
- When `totalPages === 1`, only the count line and size buttons render (no page buttons).

## Page changes

### 1. Invoices — `app/admin/(panel)/invoices/page.tsx`

- Count `orders` with the existing venue/invoice-number conditions.
- Rows: `.orderBy(desc(orders.id)).limit(info.size).offset(info.offset)` replacing `.limit(80)`.
- Render `<Pagination>` under the table card.

### 2. Audit log — `app/admin/(panel)/audit/page.tsx`

- Count `audit_events` with the existing conditions; rows use `limit/offset` (removes `limit(400)`).
- Header shows the total, not the page length.
- `hrefWith` keeps `size` but never emits `page`; the venue tabs and presets therefore reset to page 1.

### 3. Cancelled items — `app/admin/(panel)/cancelled-items/page.tsx`

- One aggregate query over the same joins/conditions: `count(*)` and `coalesce(sum(line_total_removed), 0)`; header shows total count and total discount across all matches.
- Rows: `limit/offset` replaces `limit(200)`.

### 4. Inventory movements — `app/admin/(panel)/inventory/page.tsx`

- Replace the two-query merge with one `UNION ALL` select of the two movement tables. Every selected expression is explicitly aliased (`source`, `id`, `target_name`, `delta_base`, `kind`, `user_name`, `note`, `created_at`, `unit_name`, `unit_kind`, `factor_to_base`, `item_id`) so the union's column names are stable.
  - Left branch: `ingredient_movements` joined to `ingredients`/`units`, `source = 'ingredient'`, `item_id = null`.
  - Right branch: `item_movements` joined to `items` (category filter) and `items`/`units` for unit fallbacks, `source = 'item'`.
  - Existing item/category/date filters apply inside each branch; the ingredient branch is omitted when a category is selected.
- Page rows: `.orderBy(created_at desc, source desc, id desc).limit(info.size).offset(info.offset)` (item before ingredient on equal timestamps, matching today's key ordering).
- Total: `select count(*)` over the union subquery.
- The section header keeps the displayed-page count («N حركة معروضة»); the pager shows the total and range.

### 5. Purchases — `app/admin/(panel)/purchases/page.tsx`

- `getPurchaseSummary(input)` accepts optional `limit`/`offset`; the rows query applies them.
- Totals become SQL aggregates over the filtered set (invoice count, `sum(total_cost)`, line count, distinct non-null supplier ids), so the summary band and `total` are independent of the page.
- `getPurchaseSummary` without `limit`/`offset` (PDF route, thermal report) still returns every filtered invoice.
- Page rows: `limit/offset` replaces the unpaged list; pager under the table.
- `summarizePurchaseRows` is removed with its tests; totals come from the aggregate mapper.

### 6. Shifts — `app/admin/(panel)/shifts/page.tsx`

- `listShifts(venueId, limit = 100, offset = 0)` keeps the cashier call `listShifts(venue, 60)` working.
- New `getShiftHistorySummary(venueId)` returns `{ shiftCount, totalSales, expenseTotal, differenceTotal }` over all closed shifts of the venue: `totalSales` = sum of paid orders linked by `shiftId` for the venue; `expenseTotal` = sum of shift expenses; `differenceTotal` = sum of stored `difference`.
- The header uses that summary; rows are `listShifts(venue, info.size, info.offset)` and the pager sits under the table.

## Interaction and edge cases

- Filter submissions and venue switches reset to page 1 because their forms/links never carry `page`.
- `?page=999` clamps to the last page; `?size=7` falls back to 25; `?page=-2` → 1.
- Empty results show the existing empty-state row and hide the pager.
- Print/PDF reports are unaffected (they never pass `limit`/`offset`).
- Invoice-number search, audit presets, movement filters and purchases filters all continue to drive the counts.

## Testing

- TDD `lib/pagination.test.ts`: size parsing, page clamping, offset/range math for empty and exact-multiple totals, `pageHref` preserving filters and omitting defaults, `pageItems` edge cases.
- TDD `components/Pagination.test.tsx`: RTL Arabic labels, prev/next disabled states, size links resetting to page 1, single-page mode.
- SQL verification against a copy of the production DB: totals and page windows for invoices (786), audit (2,070), movements (~1,764), purchases (34), shifts (18); confirm page 1 of size 25 and the last page agree with `count(*)`.
- Full vitest, `tsc --noEmit`, focused eslint, `npm run build`, installer with `-SkipNpm`, silent install, and the usual BUILD_ID/service/HTTP/deployment-hash/DB-fingerprint checks.
- Owner login walk-through of all six pagers remains an owner action.
