# Pagination for History Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side pagination (numbered pages, 25/50/100 row sizes) to the six admin history tables: invoices, audit log, cancelled items, inventory movements, purchases, and shifts.

**Architecture:** A shared `lib/pagination.ts` owns the URL contract (`?page=&size=`) and a Link-only `components/Pagination.tsx` renders the pager. Each page runs a filtered `count(*)` plus `limit/offset`; inventory movements uses one `UNION ALL` query so offsets span both movement tables, while purchases and shifts gain aggregate summary queries so headers stay correct across pages.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9 strict, Drizzle ORM 0.45 (`better-sqlite3`), DaisyUI/Tailwind, lucide-react, Vitest 5 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-03-pagination-design.md`

## Global Constraints

- No new dependencies; TypeScript 5.9 strict; Next.js 16 async `searchParams`.
- Server-rendered paging only; no client-side row slicing.
- `page` is 1-based; invalid → 1; past the end → clamp to the last page.
- `size` ∈ {25, 50, 100}; default 25; invalid → 25.
- Pager links preserve every current query param except `page`/`size` as specified.
- Filter forms and venue switches reset to page 1 and keep `size`.
- Print/PDF report paths must keep seeing all filtered rows.
- Tests never open the live DB; SQL is checked against a copied production DB.
- The agent never runs `git add/commit/push/reset/stash`; the owner commits. Plan tasks therefore end at verification, not commit.

---

### Task 1: Pagination helpers

**Files:**
- Create: `lib/pagination.ts`
- Test: `lib/pagination.test.ts`

**Interfaces:**
- Produces: `PAGE_SIZES`, `PageSize`, `DEFAULT_PAGE_SIZE`, `QueryParams`, `PageInfo`, `parsePageSize(value): PageSize`, `resolvePageInfo(input, total): PageInfo`, `pageHref(basePath, params, page, size): string`, `pageItems(current, totalPages): Array<number | "ellipsis">`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/pagination.test.ts
import { describe, expect, it } from "vitest";
import {
  pageHref,
  pageItems,
  parsePageSize,
  resolvePageInfo,
} from "./pagination";

describe("parsePageSize", () => {
  it("accepts 25/50/100 and falls back to 25", () => {
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("7")).toBe(25);
    expect(parsePageSize(undefined)).toBe(25);
    expect(parsePageSize("abc")).toBe(25);
  });
});

describe("resolvePageInfo", () => {
  it("computes offsets and display ranges", () => {
    expect(resolvePageInfo({ page: "3", size: "25" }, 786)).toEqual({
      page: 3,
      size: 25,
      offset: 50,
      total: 786,
      totalPages: 32,
      from: 51,
      to: 75,
    });
  });

  it("clamps pages past the end and ignores invalid pages", () => {
    expect(resolvePageInfo({ page: "999", size: "25" }, 786).page).toBe(32);
    expect(resolvePageInfo({ page: "-2", size: "25" }, 786).page).toBe(1);
    expect(resolvePageInfo({ page: "abc", size: "25" }, 786).page).toBe(1);
    expect(resolvePageInfo({ page: "2", size: "25" }, 0).page).toBe(1);
  });

  it("reports an empty range for zero rows", () => {
    expect(resolvePageInfo({}, 0)).toMatchObject({
      page: 1,
      offset: 0,
      total: 0,
      totalPages: 1,
      from: 0,
      to: 0,
    });
  });

  it("handles an exact multiple", () => {
    expect(resolvePageInfo({ page: "2", size: "25" }, 50)).toMatchObject({
      page: 2,
      offset: 25,
      totalPages: 2,
      from: 26,
      to: 50,
    });
  });
});

describe("pageHref", () => {
  it("preserves filters and omits default page and size", () => {
    expect(
      pageHref("/admin/invoices", { venue: "cafe", q: "42" }, 1, 25),
    ).toBe("/admin/invoices?venue=cafe&q=42");
    expect(pageHref("/admin/audit", {}, 1, 25)).toBe("/admin/audit");
  });

  it("writes non-default size and pages above 1", () => {
    expect(
      pageHref("/admin/invoices", { venue: "cafe" }, 2, 50),
    ).toBe("/admin/invoices?venue=cafe&size=50&page=2");
  });

  it("uses the first array value and drops blank values", () => {
    expect(
      pageHref(
        "/admin/invoices",
        { venue: ["cafe", "restaurant"], q: "   ", page: "9" },
        3,
        100,
      ),
    ).toBe("/admin/invoices?venue=cafe&size=100&page=3");
  });
});

describe("pageItems", () => {
  it("lists every page when they fit", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("adds ellipsis around edges", () => {
    expect(pageItems(1, 32)).toEqual([1, 2, "ellipsis", 32]);
    expect(pageItems(5, 32)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 32]);
    expect(pageItems(32, 32)).toEqual([1, "ellipsis", 31, 32]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/pagination.test.ts`
Expected: FAIL — cannot resolve `./pagination`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/pagination.ts
export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

export type QueryParams = Record<string, string | string[] | undefined>;

export type PageInfo = {
  page: number;
  size: PageSize;
  offset: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
};

export function parsePageSize(value: unknown): PageSize {
  const numeric = Number(value);
  return (PAGE_SIZES as readonly number[]).includes(numeric)
    ? (numeric as PageSize)
    : DEFAULT_PAGE_SIZE;
}

function parsePage(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) return 1;
  return numeric;
}

export function resolvePageInfo(
  input: { page?: string; size?: string },
  total: number,
): PageInfo {
  const size = parsePageSize(input.size);
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / size));
  const page = Math.min(parsePage(input.page), totalPages);
  const offset = (page - 1) * size;
  return {
    page,
    size,
    offset,
    total: safeTotal,
    totalPages,
    from: safeTotal === 0 ? 0 : offset + 1,
    to: safeTotal === 0 ? 0 : Math.min(offset + size, safeTotal),
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function pageHref(
  basePath: string,
  params: QueryParams,
  page: number,
  size: PageSize,
): string {
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === "page" || key === "size") continue;
    const value = firstValue(raw);
    if (value != null && value.trim() !== "") search.set(key, value);
  }
  if (size !== DEFAULT_PAGE_SIZE) search.set("size", String(size));
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function pageItems(
  current: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([
    1,
    totalPages,
    current - 1,
    current,
    current + 1,
  ]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];
  for (const page of sorted) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }
  return items;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/pagination.test.ts`
Expected: PASS (10 tests).

---

### Task 2: Shared pager component

**Files:**
- Create: `components/Pagination.tsx`
- Test: `components/Pagination.test.tsx`

**Interfaces:**
- Consumes: `PageInfo`, `QueryParams`, `PAGE_SIZES`, `pageHref`, `pageItems` from Task 1.
- Produces: `<Pagination basePath: string, params: QueryParams, info: PageInfo />` server component.

- [ ] **Step 1: Write the failing test**

```tsx
// components/Pagination.test.tsx
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { resolvePageInfo } from "@/lib/pagination";
import { Pagination } from "./Pagination";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => {
    void prefetch;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

describe("Pagination", () => {
  it("renders the range, numbered pages and size links", () => {
    render(
      <Pagination
        basePath="/admin/invoices"
        params={{ venue: "cafe" }}
        info={resolvePageInfo({ page: "5", size: "25" }, 786)}
      />,
    );

    expect(screen.getByText("عرض 101–125 من 786")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "السابق" }).getAttribute("href"),
    ).toBe("/admin/invoices?venue=cafe&page=4");
    expect(
      screen.getByRole("link", { name: "32" }).getAttribute("href"),
    ).toBe("/admin/invoices?venue=cafe&page=32");
    expect(
      screen.getByRole("link", { name: "50" }).getAttribute("href"),
    ).toBe("/admin/invoices?venue=cafe&size=50");
  });

  it("renders nothing for an empty result", () => {
    const { container } = render(
      <Pagination
        basePath="/admin/audit"
        params={{}}
        info={resolvePageInfo({}, 0)}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides page buttons when everything fits on one page", () => {
    render(
      <Pagination
        basePath="/admin/shifts"
        params={{ venue: "restaurant" }}
        info={resolvePageInfo({}, 18)}
      />,
    );

    expect(screen.queryByRole("link", { name: "التالي" })).toBeNull();
    expect(screen.getByText("عرض 1–18 من 18")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/Pagination.test.tsx`
Expected: FAIL — cannot resolve `./Pagination`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/Pagination.tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  PAGE_SIZES,
  pageHref,
  pageItems,
  type PageInfo,
  type QueryParams,
} from "@/lib/pagination";

export function Pagination({
  basePath,
  params,
  info,
}: {
  basePath: string;
  params: QueryParams;
  info: PageInfo;
}) {
  if (info.total === 0) return null;

  const items = pageItems(info.page, info.totalPages);

  return (
    <nav
      aria-label="تصفح الصفحات"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300/60 bg-base-100 px-4 py-3"
    >
      <p className="text-xs font-bold text-base-content/55">
        عرض {info.from}–{info.to} من {info.total}
      </p>

      {info.totalPages > 1 ? (
        <div className="join">
          {info.page === 1 ? (
            <span className="btn join-item btn-sm btn-disabled">
              <ChevronRight className="size-4" />
              السابق
            </span>
          ) : (
            <Link
              href={pageHref(basePath, params, info.page - 1, info.size)}
              prefetch={false}
              className="btn join-item btn-sm"
            >
              <ChevronRight className="size-4" />
              السابق
            </Link>
          )}

          {items.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="btn join-item btn-sm btn-disabled"
              >
                …
              </span>
            ) : (
              <Link
                key={item}
                href={pageHref(basePath, params, item, info.size)}
                prefetch={false}
                aria-current={item === info.page ? "page" : undefined}
                className={`btn join-item btn-sm tabular-nums ${
                  item === info.page ? "btn-primary" : ""
                }`}
              >
                {item}
              </Link>
            ),
          )}

          {info.page === info.totalPages ? (
            <span className="btn join-item btn-sm btn-disabled">
              التالي
              <ChevronLeft className="size-4" />
            </span>
          ) : (
            <Link
              href={pageHref(basePath, params, info.page + 1, info.size)}
              prefetch={false}
              className="btn join-item btn-sm"
            >
              التالي
              <ChevronLeft className="size-4" />
            </Link>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-xs font-bold text-base-content/45">
        <span>لكل صفحة</span>
        <div className="join">
          {PAGE_SIZES.map((size) => (
            <Link
              key={size}
              href={pageHref(basePath, params, 1, size)}
              prefetch={false}
              className={`btn join-item btn-xs ${
                size === info.size ? "btn-primary" : "btn-ghost"
              }`}
            >
              {size}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/Pagination.test.tsx`
Expected: PASS (3 tests).

---

### Task 3: Invoices page

**Files:**
- Modify: `app/admin/(panel)/invoices/page.tsx`

**Interfaces:**
- Consumes: `resolvePageInfo` (Task 1), `Pagination` (Task 2).
- Produces: `/admin/invoices?venue=&q=&page=&size=`.

- [ ] **Step 1: Add paging to the query**

Change the `searchParams` type to include `page?: string; size?: string`. Import `resolvePageInfo` and `Pagination`.

After `conditions` are built and before the rows query:

```ts
const total =
  db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(and(...conditions))
    .get()?.value ?? 0;
const info = resolvePageInfo({ page: sp.page, size: sp.size }, total);
```

Replace `.limit(80)` with `.limit(info.size).offset(info.offset)`.

- [ ] **Step 2: Render the pager and keep size across venues**

Add `import { sql } from "drizzle-orm";` (merge into the existing import). Change the `VenueTabs` call to:

```tsx
<VenueTabs basePath="/admin/invoices" venue={venue} keepParams={{ size: sp.size }} />
```

After the table `</section>`, inside the page wrapper:

```tsx
<Pagination basePath="/admin/invoices" params={sp} info={info} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint "app/admin/(panel)/invoices/page.tsx" components/Pagination.tsx`
Expected: no output.

---

### Task 4: Audit log page

**Files:**
- Modify: `app/admin/(panel)/audit/page.tsx`

**Interfaces:**
- Consumes: `resolvePageInfo`, `Pagination`.
- Produces: `/admin/audit?...&page=&size=`.

- [ ] **Step 1: Count and page the rows**

Add `page?: string; size?: string` to the `searchParams` type. Add `sql` to the existing `drizzle-orm` import, and import `resolvePageInfo` and `Pagination`.

After the conditions are built:

```ts
const total =
  db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(auditEvents)
    .where(and(...conditions))
    .get()?.value ?? 0;
const info = resolvePageInfo({ page: sp.page, size: sp.size }, total);
```

Replace `.limit(400)` with `.limit(info.size).offset(info.offset)`.

- [ ] **Step 2: Header, tabs and pager**

Change the table header paragraph from `{rows.length} حركة` to `{info.total} حركة`.

In `hrefWith`, add `size: sp.size` to the merged object (it never emits `page`). This keeps the page size across venue tabs and presets while resetting to page 1.

After the audit table `</section>`:

```tsx
<Pagination basePath="/admin/audit" params={sp} info={info} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint "app/admin/(panel)/audit/page.tsx"`
Expected: no output.

---

### Task 5: Cancelled items page

**Files:**
- Modify: `app/admin/(panel)/cancelled-items/page.tsx`

**Interfaces:**
- Consumes: `resolvePageInfo`, `Pagination`.
- Produces: `/admin/cancelled-items?venue=&q=&page=&size=`.

- [ ] **Step 1: Replace the page-scoped header aggregate**

Add `page?: string; size?: string` to `searchParams`; import `sql`, `resolvePageInfo`, `Pagination`.

After `conditions` are built:

```ts
const stats = db
  .select({
    total: sql<number>`count(*)`.mapWith(Number),
    removed: sql<number>`coalesce(sum(${cancelledItems.lineTotalRemoved}), 0)`.mapWith(
      Number,
    ),
  })
  .from(cancelledItems)
  .innerJoin(orders, eq(cancelledItems.orderId, orders.id))
  .where(and(...conditions))
  .get();
const total = stats?.total ?? 0;
const removedTotal = stats?.removed ?? 0;
const info = resolvePageInfo({ page: sp.page, size: sp.size }, total);
```

Replace `.limit(200)` with `.limit(info.size).offset(info.offset)` and delete the old `const removedTotal = rows.reduce(...)` line.

- [ ] **Step 2: Keep size across venues and render the pager**

`VenueTabs` becomes:

```tsx
<VenueTabs basePath="/admin/cancelled-items" venue={venue} keepParams={{ size: sp.size }} />
```

The header text now reads `{total} إلغاء · خصم {formatMoney(removedTotal)}` (use the aggregates, not `rows.length`).

After the table container, still inside the page wrapper:

```tsx
<Pagination basePath="/admin/cancelled-items" params={sp} info={info} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint "app/admin/(panel)/cancelled-items/page.tsx"`
Expected: no output.

---

### Task 6: Purchases data and page

**Files:**
- Modify: `lib/reports/purchases.ts`
- Modify: `lib/reports/purchases.test.ts`
- Modify: `app/admin/(panel)/purchases/page.tsx`

**Interfaces:**
- Consumes: `resolvePageInfo`, `Pagination`.
- Produces: `countPurchaseInvoices(input: PurchaseFiltersInput): number`; `getPurchaseSummary(input: PurchaseFiltersInput & { limit?: number; offset?: number })` now returns `total: number` and aggregate `totals`; `rows` respects `limit/offset`.

- [ ] **Step 1: Update the tests first**

In `lib/reports/purchases.test.ts`, delete the `summarizePurchaseRows` describe block, the `row()` helper, the `PurchaseInvoiceSummary` import, and `summarizePurchaseRows` from the import list. Keep all four `resolvePurchaseRange` tests.

Run: `npx vitest run lib/reports/purchases.test.ts`
Expected: PASS (4 tests) — this only proves the old tests were removed.

- [ ] **Step 2: Refactor `getPurchaseSummary`**

In `lib/reports/purchases.ts`:

```ts
export type PurchaseFiltersInput = {
  from?: string;
  to?: string;
  supplier?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

function buildPurchaseContext(input: PurchaseFiltersInput) {
  const range = resolvePurchaseRange(input);
  const q = (input.q ?? "").trim();
  const supplierId = parseId(input.supplier);
  const conditions: SQL[] = [];
  if (range.fromSql) {
    conditions.push(sql`${purchaseInvoices.createdAt} >= ${range.fromSql}`);
  }
  if (range.toSql) {
    conditions.push(sql`${purchaseInvoices.createdAt} <= ${range.toSql}`);
  }
  if (supplierId) {
    conditions.push(eq(purchaseInvoices.supplierId, supplierId));
  }
  if (q) {
    const pattern = `%${q}%`;
    const numeric = Number(q.replace("#", ""));
    const matches: SQL[] = [
      like(purchaseInvoices.invoiceNumber, pattern),
      like(purchaseInvoices.note, pattern),
      like(suppliers.name, pattern),
    ];
    if (Number.isInteger(numeric) && numeric > 0) {
      matches.push(eq(purchaseInvoices.id, numeric));
    }
    const combined = or(...matches);
    if (combined) conditions.push(combined);
  }
  return { range, q, supplierId, conditions };
}

export function countPurchaseInvoices(input: PurchaseFiltersInput): number {
  const { conditions } = buildPurchaseContext(input);
  return (
    db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(purchaseInvoices)
      .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .get()?.value ?? 0
  );
}
```

Rewrite `getPurchaseSummary` to use the context, aggregate totals, and page the rows:

```ts
export function getPurchaseSummary(input: PurchaseFiltersInput) {
  const { range, q, supplierId, conditions } = buildPurchaseContext(input);

  const supplier =
    supplierId !== null
      ? db
          .select({ name: suppliers.name })
          .from(suppliers)
          .where(eq(suppliers.id, supplierId))
          .get()
      : null;

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const totalsRow = db
    .select({
      invoiceCount: sql<number>`count(*)`.mapWith(Number),
      totalSpent: sql<number>`coalesce(sum(${purchaseInvoices.totalCost}), 0)`.mapWith(
        Number,
      ),
      supplierCount:
        sql<number>`count(distinct ${purchaseInvoices.supplierId})`.mapWith(
          Number,
        ),
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(where)
    .get();

  const matchingInvoiceIds = db
    .select({ id: purchaseInvoices.id })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(where);

  const lineCount =
    db
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(purchaseInvoiceLines)
      .where(inArray(purchaseInvoiceLines.invoiceId, matchingInvoiceIds))
      .get()?.value ?? 0;

  const rows = db
    .select({
      id: purchaseInvoices.id,
      supplierName: suppliers.name,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      totalCost: purchaseInvoices.totalCost,
      createdAt: purchaseInvoices.createdAt,
      createdByName: purchaseInvoices.createdByName,
      lineCount: sql<number>`count(${purchaseInvoiceLines.id})`.mapWith(Number),
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .leftJoin(
      purchaseInvoiceLines,
      eq(purchaseInvoiceLines.invoiceId, purchaseInvoices.id),
    )
    .where(where)
    .groupBy(purchaseInvoices.id)
    .orderBy(desc(purchaseInvoices.createdAt), desc(purchaseInvoices.id))
    .limit(input.limit ?? -1)
    .offset(input.offset ?? 0)
    .all();

  return {
    ...range,
    q,
    supplierId,
    supplierName: supplier?.name ?? null,
    rows,
    total: totalsRow?.invoiceCount ?? 0,
    totals: {
      invoiceCount: totalsRow?.invoiceCount ?? 0,
      totalSpent: round2(totalsRow?.totalSpent ?? 0),
      lineCount,
      supplierCount: totalsRow?.supplierCount ?? 0,
    },
  };
}
```

Add `inArray` to the drizzle import. Delete `summarizePurchaseRows` and its type usage (keep `PurchaseSummaryTotals`).

Run: `npx tsc --noEmit`
Expected: no errors (confirms no other caller used the removed helper).

- [ ] **Step 3: Page the purchases screen**

In `app/admin/(panel)/purchases/page.tsx`, add `page?: string; size?: string` to `searchParams`; import `countPurchaseInvoices`, `resolvePageInfo`, `Pagination`.

Replace the top of the component body:

```ts
const filters = {
  q: sp.q,
  from: sp.from,
  to: sp.to,
  supplier: sp.supplier,
};
const total = countPurchaseInvoices(filters);
const info = resolvePageInfo({ page: sp.page, size: sp.size }, total);
const summary = getPurchaseSummary({
  ...filters,
  limit: info.size,
  offset: info.offset,
});
```

The summary band (`totals`) is unchanged because it is now aggregate-based. Add the pager after `<PurchaseInvoicesAdmin ... />`:

```tsx
<Pagination basePath="/admin/purchases" params={sp} info={info} />
```

- [ ] **Step 4: Verify**

Run: `npx vitest run lib/reports/purchases.test.ts`
Expected: PASS (4 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint lib/reports/purchases.ts "app/admin/(panel)/purchases/page.tsx"`
Expected: no output.

---

### Task 7: Shifts history

**Files:**
- Modify: `lib/shifts/core.ts`
- Modify: `app/admin/(panel)/shifts/page.tsx`

**Interfaces:**
- Consumes: `resolvePageInfo`, `Pagination`.
- Produces: `listShifts(venueId, limit = 100, offset = 0)`; `getShiftHistorySummary(venueId): { shiftCount, totalSales, expenseTotal, differenceTotal }`.

- [ ] **Step 1: Extend the shifts core**

Change the signature and add `.offset(offset)`:

```ts
export function listShifts(venueId: VenueId, limit = 100, offset = 0): ShiftListItem[] {
  // ...existing query...
    .orderBy(desc(shifts.closedAt))
    .limit(limit)
    .offset(offset)
    .all();
```

Append the aggregate helper next to `listShifts`:

```ts
export function getShiftHistorySummary(venueId: VenueId) {
  const closed = and(
    eq(shifts.venueId, venueId),
    eq(shifts.status, "closed"),
    isNotNull(shifts.closedAt),
  );

  const shiftRow = db
    .select({
      shiftCount: sql<number>`count(*)`.mapWith(Number),
      differenceTotal:
        sql<number>`coalesce(sum(${shifts.difference}), 0)`.mapWith(Number),
    })
    .from(shifts)
    .where(closed)
    .get();

  const salesRow = db
    .select({
      totalSales: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(shifts, eq(orders.shiftId, shifts.id))
    .where(
      and(
        eq(shifts.venueId, venueId),
        eq(shifts.status, "closed"),
        eq(orders.venueId, venueId),
        eq(orders.status, "paid"),
      ),
    )
    .get();

  const expenseRow = db
    .select({
      expenseTotal:
        sql<number>`coalesce(sum(${shiftExpenses.amount}), 0)`.mapWith(Number),
    })
    .from(shiftExpenses)
    .innerJoin(shifts, eq(shiftExpenses.shiftId, shifts.id))
    .where(and(eq(shifts.venueId, venueId), eq(shifts.status, "closed")))
    .get();

  return {
    shiftCount: shiftRow?.shiftCount ?? 0,
    totalSales: roundMoney(salesRow?.totalSales ?? 0),
    expenseTotal: roundMoney(expenseRow?.expenseTotal ?? 0),
    differenceTotal: roundMoney(shiftRow?.differenceTotal ?? 0),
  };
}
```

All imports (`sql`, `and`, `eq`, `isNotNull`, `orders`, `shiftExpenses`, `shifts`, `roundMoney`) already exist in the file.

- [ ] **Step 2: Page the shifts screen**

In `app/admin/(panel)/shifts/page.tsx`, add `page?: string; size?: string` to `searchParams`; import `getShiftHistorySummary` from `@/lib/shifts/core`, `resolvePageInfo`, and `Pagination`.

Replace the data block:

```ts
const history = getShiftHistorySummary(venue);
const info = resolvePageInfo(
  { page: sp.page, size: sp.size },
  history.shiftCount,
);
const rows = listShifts(venue, info.size, info.offset);
const openShift = getOpenShift(venue);
```

The header text becomes:

```tsx
{history.shiftCount} وردية مغلقة · إجمالي {formatMoney(history.totalSales)} ·
مصروفات {formatMoney(history.expenseTotal)} · صافي الفروقات{" "}
{formatMoney(history.differenceTotal)}
```

Add `keepParams={{ size: sp.size }}` to `VenueTabs`. After the table container, add:

```tsx
<Pagination basePath="/admin/shifts" params={sp} info={info} />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run lib/shifts`
Expected: PASS (existing suites unaffected).

Run: `npx eslint lib/shifts/core.ts "app/admin/(panel)/shifts/page.tsx"`
Expected: no output.

---

### Task 8: Inventory movements union and pager

**Files:**
- Modify: `app/admin/(panel)/inventory/page.tsx`

**Interfaces:**
- Consumes: `resolvePageInfo`, `Pagination`, `resolveMovementFilters`.
- Produces: `/admin/inventory?from=&to=&item=&category=&page=&size=`.

- [ ] **Step 1: Replace the two movement queries with one union**

Add `sql` to the drizzle import and import `resolvePageInfo`, `Pagination`. Add `page?: string; size?: string` to `searchParams`.

Replace everything from `const trackedById = ...` through the `movements` assembly with:

```ts
const ingredientMovementConditions = [
  gte(ingredientMovements.createdAt, range.fromSql),
  lte(ingredientMovements.createdAt, range.toSql),
];
if (movementFilters.item) {
  ingredientMovementConditions.push(
    like(ingredientMovements.ingredientName, `%${movementFilters.item}%`),
  );
}
if (movementFilters.categoryId) {
  ingredientMovementConditions.push(sql`1 = 0`);
}

const itemMovementConditions = [
  gte(itemMovements.createdAt, range.fromSql),
  lte(itemMovements.createdAt, range.toSql),
];
if (movementFilters.item) {
  itemMovementConditions.push(
    like(itemMovements.itemName, `%${movementFilters.item}%`),
  );
}
if (movementFilters.categoryId) {
  itemMovementConditions.push(eq(items.categoryId, movementFilters.categoryId));
}

const ingredientMovementQuery = db
  .select({
    source: sql<string>`'ingredient'`.as("source"),
    id: sql<number>`${ingredientMovements.id}`.as("id"),
    targetName: sql<string>`${ingredientMovements.ingredientName}`.as(
      "target_name",
    ),
    deltaBase: sql<number>`${ingredientMovements.deltaBase}`.as("delta_base"),
    kind: sql<string>`${ingredientMovements.kind}`.as("kind"),
    userName: sql<string>`${ingredientMovements.userName}`.as("user_name"),
    note: sql<string | null>`${ingredientMovements.note}`.as("note"),
    createdAt: sql<string>`${ingredientMovements.createdAt}`.as("created_at"),
    unitName: sql<string | null>`${units.name}`.as("unit_name"),
    unitKind: sql<string | null>`${units.kind}`.as("unit_kind"),
    factorToBase: sql<number | null>`${units.factorToBase}`.as(
      "factor_to_base",
    ),
    itemId: sql<number | null>`null`.as("item_id"),
  })
  .from(ingredientMovements)
  .leftJoin(ingredients, eq(ingredientMovements.ingredientId, ingredients.id))
  .leftJoin(units, eq(ingredients.preferredUnitId, units.id))
  .where(and(...ingredientMovementConditions));

const itemMovementQuery = db
  .select({
    source: sql<string>`'item'`.as("source"),
    id: sql<number>`${itemMovements.id}`.as("id"),
    targetName: sql<string>`${itemMovements.itemName}`.as("target_name"),
    deltaBase: sql<number>`${itemMovements.deltaBase}`.as("delta_base"),
    kind: sql<string>`${itemMovements.kind}`.as("kind"),
    userName: sql<string>`${itemMovements.userName}`.as("user_name"),
    note: sql<string | null>`${itemMovements.note}`.as("note"),
    createdAt: sql<string>`${itemMovements.createdAt}`.as("created_at"),
    unitName: sql<string | null>`coalesce(${itemMovements.unitName}, ${units.name})`.as(
      "unit_name",
    ),
    unitKind: sql<string | null>`coalesce(${itemMovements.unitKind}, ${units.kind})`.as(
      "unit_kind",
    ),
    factorToBase:
      sql<number | null>`coalesce(${itemMovements.factorToBase}, ${units.factorToBase})`.as(
        "factor_to_base",
      ),
    itemId: sql<number | null>`${itemMovements.itemId}`.as("item_id"),
  })
  .from(itemMovements)
  .leftJoin(items, eq(itemMovements.itemId, items.id))
  .leftJoin(units, eq(items.unitId, units.id))
  .where(and(...itemMovementConditions));

const movementsSource = ingredientMovementQuery
  .unionAll(itemMovementQuery)
  .as("movements");

const total =
  db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(movementsSource)
    .get()?.value ?? 0;
const info = resolvePageInfo({ page: sp.page, size: sp.size }, total);

const movementRows = db
  .select()
  .from(movementsSource)
  .orderBy(
    desc(movementsSource.createdAt),
    desc(movementsSource.source),
    desc(movementsSource.id),
  )
  .limit(info.size)
  .offset(info.offset)
  .all();

const movements: StockMovementRow[] = movementRows.map((row) => {
  const isItem = row.source === "item";
  return {
    key: `${row.source}-${row.id}`,
    targetType: isItem ? "item" : "ingredient",
    targetName: row.targetName,
    deltaBase: row.deltaBase,
    kind: row.kind,
    userName: row.userName,
    note: row.note,
    createdAt: row.createdAt,
    unitName: row.unitName ?? (isItem ? "حبة" : "غرام"),
    unitKind: (row.unitKind ?? (isItem ? "count" : "weight")) as UnitKind,
    factorToBase: row.factorToBase ?? 1,
  };
});
```

Every union column is explicitly aliased because Drizzle reads union output names from the first select; do not remove the `.as(...)` calls.

- [ ] **Step 2: Render the pager**

After the movement `<table>` container (inside the movement `section`):

```tsx
<Pagination basePath="/admin/inventory" params={sp} info={info} />
```

`IngredientsAdmin` still receives `item`/`category` for the filter card; its `applyFilter` does not submit `page`, so filtering resets to page 1.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint "app/admin/(panel)/inventory/page.tsx"`
Expected: no output.

---

### Task 9: End-to-end verification, installer, docs

**Files:**
- Create: `docs/worklog/2026-11-03-pagination.md`
- Modify: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\MEMORY.md`
- Create: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\pagination.md`

- [ ] **Step 1: Full automated gate**

Run: `npx vitest run`
Expected: all suites pass (85+ files).

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npx eslint lib/pagination.ts components/Pagination.tsx lib/reports/purchases.ts lib/shifts/core.ts "app/admin/(panel)/invoices/page.tsx" "app/admin/(panel)/audit/page.tsx" "app/admin/(panel)/cancelled-items/page.tsx" "app/admin/(panel)/purchases/page.tsx" "app/admin/(panel)/shifts/page.tsx" "app/admin/(panel)/inventory/page.tsx"`
Expected: no output.

Run: `npm run build`
Expected: success; note the new `.next/BUILD_ID`.

- [ ] **Step 2: Verify paging SQL against a copied production DB**

Copy `pos.db`, `pos.db-wal`, `pos.db-shm` from `C:\Program Files\Fast POS\server\data` into a temp folder and run read-only queries with the project's `better-sqlite3`:

- `orders` count = 786 and the 25-row windows for pages 1, 2 and 32 match `LIMIT 25 OFFSET 0/25/775`.
- `audit_events` count = 2,070; first and last page windows match.
- `ingredient_movements` + `item_movements` union count = 1,764; the union order (`created_at desc`, source desc, id desc) returns 25 rows per page with no duplicates or gaps between pages 1 and 2.
- `purchase_invoices` filtered count = 34; the aggregate totals equal the old row-sum values.
- `shifts` closed count = 18; the history summary totals equal the previous 18-row sums.

Delete the temp copy afterwards.

- [ ] **Step 3: Build and install**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm`
Expected: `release/installer/Fast-POS-Setup-0.1.0.exe` rebuilt; record size and SHA-256.

Install silently (owner approves UAC), then verify: installed `BUILD_ID` equals the new build, `FastPOS` service Running, `http://127.0.0.1:3000/` → 200, `deployment.json` SHA-256 unchanged (`1d5d296f…`), DB schema fingerprint unchanged (42 objects, `6e4d7334…`).

- [ ] **Step 4: Document**

Write `docs/worklog/2026-11-03-pagination.md` with the URL contract, the six pages, the union/aggregate details, the verification numbers, installer hash, and the pending owner login walk-through. Add the memory file `pagination.md` (project scope) and one index line in `MEMORY.md`:

```md
- [Pagination](pagination.md) — Shared numbered pager (25/50/100) on the six admin history lists; server-side counts, movements union, aggregate summaries (2026-11-03).
```
