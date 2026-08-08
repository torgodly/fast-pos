import Link from "next/link";
import {
  ChefHat,
  Coffee,
  Home,
  LogOut,
  UserRound,
} from "lucide-react";
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
    <header className="sticky top-0 z-30 border-b border-base-300/60 bg-base-100/95 px-2 py-1.5 shadow-sm backdrop-blur-xl sm:px-4 sm:py-2">
      <div className="page-shell navbar min-h-0 gap-2 p-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-xl text-white shadow-md sm:size-10 ${
              venueId === "restaurant"
                ? "bg-gradient-to-br from-primary to-indigo-700 shadow-primary/15"
                : "bg-gradient-to-br from-secondary to-cyan-800 shadow-secondary/15"
            }`}
          >
            <VenueIcon className="size-4 sm:size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <p className="truncate text-sm font-black sm:text-base">
                {getVenueName(venueId)}
              </p>
              <span className="badge badge-primary badge-soft badge-sm">
                {roleLabel}
              </span>
            </div>
            <p className="flex items-center gap-1 truncate text-[11px] font-bold text-base-content/55 sm:text-xs">
              <UserRound className="size-3 shrink-0" />
              {name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/"
            className="btn btn-outline btn-sm h-9 min-h-9 gap-1.5 rounded-xl px-2.5"
          >
            <Home className="size-4" />
            <span className="hidden sm:inline">الرئيسية</span>
          </Link>
          <LogoutButton className="btn btn-error btn-sm h-9 min-h-9 gap-1.5 rounded-xl px-2.5">
            <LogOut className="size-4" />
            <span>خروج</span>
          </LogoutButton>
        </div>
      </div>
    </header>
  );
}
