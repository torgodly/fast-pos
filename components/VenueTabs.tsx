import Link from "next/link";
import { ChefHat, Coffee } from "lucide-react";
import type { VenueId } from "@/lib/types";
import { VENUES } from "@/lib/venues";

export function VenueTabs({
  basePath,
  venue,
}: {
  basePath: string;
  venue: VenueId;
}) {
  return (
    <div className="mobile-scroll-x mt-4">
      <div
        role="tablist"
        className="inline-flex min-w-max gap-1 rounded-2xl border border-base-300/70 bg-base-100 p-1.5 shadow-sm"
      >
        {VENUES.map((v) => {
          const Icon = v.id === "restaurant" ? ChefHat : Coffee;
          return (
            <Link
              key={v.id}
              href={`${basePath}?venue=${v.id}`}
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
