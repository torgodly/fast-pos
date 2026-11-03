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
            <span
              aria-disabled="true"
              className="btn join-item btn-sm btn-disabled"
            >
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
                aria-hidden="true"
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
            <span
              aria-disabled="true"
              className="btn join-item btn-sm btn-disabled"
            >
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
              aria-current={size === info.size ? "true" : undefined}
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
