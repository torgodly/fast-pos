import Link from "next/link";
import { ChefHat, Coffee } from "lucide-react";
import type { VenueId } from "@/lib/types";
import { VENUES } from "@/lib/venues";

export function VenueTabs({
  basePath,
  venue,
  keepParams,
}: {
  basePath: string;
  venue: VenueId;
  /** Extra query params to keep when switching venue (e.g. report filters). */
  keepParams?: Record<string, string | undefined | null>;
}) {
  function hrefFor(nextVenue: VenueId) {
    const params = new URLSearchParams();
    params.set("venue", nextVenue);
    if (keepParams) {
      for (const [key, value] of Object.entries(keepParams)) {
        if (key === "venue") continue;
        // Category IDs belong to one venue — drop on switch.
        if (key === "category") continue;
        if (value != null && String(value).trim() !== "") {
          params.set(key, String(value));
        }
      }
    }
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="mobile-scroll-x">
      <div
        role="tablist"
        className="inline-flex min-w-max gap-1 rounded-2xl border border-base-300/70 bg-base-100 p-1.5 shadow-sm"
      >
        {VENUES.map((v) => {
          const Icon = v.id === "restaurant" ? ChefHat : Coffee;
          return (
            <Link
              key={v.id}
              href={hrefFor(v.id)}
              role="tab"
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                venue === v.id
                  ? "bg-primary text-primary-content shadow-md shadow-primary/15"
                  : "text-base-content/50 hover:bg-base-200 hover:text-base-content"
              }`}
            >
              <Icon className="size-4" />
              {v.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
