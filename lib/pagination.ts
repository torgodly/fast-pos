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
