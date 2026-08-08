import Link from "next/link";
import { Coffee, ChefHat, Home, LogOut } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { getVenueName } from "@/lib/venues";
import type { VenueId } from "@/lib/types";

export function PosHeader({
  venueId,
  name,
  roleLabel,
}: {
  venueId: VenueId;
  name: string;
  roleLabel: string;
}) {
  const VenueIcon = venueId === "restaurant" ? ChefHat : Coffee;

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-base-300 bg-base-100 px-2 py-1">
      <div className="page-shell flex h-9 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-md text-white ${
              venueId === "restaurant" ? "bg-primary" : "bg-secondary"
            }`}
          >
            <VenueIcon className="size-3.5" />
          </span>
          <p className="truncate text-xs font-black">
            {getVenueName(venueId)}
            <span className="mx-1 text-base-content/30">·</span>
            <span className="font-bold text-base-content/55">{roleLabel}</span>
            <span className="mx-1 text-base-content/30">·</span>
            <span className="font-bold text-base-content/55">{name}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/"
            className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md px-2"
          >
            <Home className="size-3.5" />
            <span className="hidden sm:inline">الرئيسية</span>
          </Link>
          <LogoutButton className="btn btn-error btn-xs h-7 min-h-7 gap-1 rounded-md px-2">
            <LogOut className="size-3.5" />
            خروج
          </LogoutButton>
        </div>
      </div>
    </header>
  );
}
