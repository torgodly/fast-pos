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
    <header className="sticky top-0 z-30 shrink-0 border-b border-base-300 bg-base-100 px-2 py-1.5">
      <div className="page-shell flex h-11 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-lg text-white ${
              venueId === "restaurant" ? "bg-primary" : "bg-secondary"
            }`}
          >
            <VenueIcon className="size-4.5" />
          </span>
          <p className="truncate text-sm font-black">
            {getVenueName(venueId)}
            <span className="mx-1 text-base-content/30">·</span>
            <span className="font-bold text-base-content/55">{roleLabel}</span>
            <span className="mx-1 text-base-content/30">·</span>
            <span className="font-bold text-base-content/55">{name}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/"
            className="btn btn-ghost btn-sm h-9 min-h-9 gap-1.5 rounded-lg px-2.5"
          >
            <Home className="size-4" />
            <span className="hidden sm:inline">الرئيسية</span>
          </Link>
          <LogoutButton className="btn btn-error btn-sm h-9 min-h-9 gap-1.5 rounded-lg px-2.5">
            <LogOut className="size-4" />
            خروج
          </LogoutButton>
        </div>
      </div>
    </header>
  );
}
