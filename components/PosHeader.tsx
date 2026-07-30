import Link from "next/link";
import {
  ChefHat,
  Coffee,
  Home,
  LogOut,
  UserRound,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
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
    <header className="sticky top-0 z-30 border-b border-base-300/60 bg-base-100/90 px-3 py-2.5 shadow-sm backdrop-blur-xl sm:px-5">
      <div className="page-shell navbar min-h-0 gap-2 p-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md ${
              venueId === "restaurant"
                ? "bg-gradient-to-br from-primary to-indigo-700 shadow-primary/15"
                : "bg-gradient-to-br from-secondary to-cyan-800 shadow-secondary/15"
            }`}
          >
            <VenueIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-black sm:text-lg">
                {getVenueName(venueId)}
              </p>
              <span className="badge badge-primary badge-soft badge-sm">
                {roleLabel}
              </span>
            </div>
            <p className="flex items-center gap-1 truncate text-xs font-bold text-base-content/55 sm:text-sm">
              <UserRound className="size-3.5 shrink-0" />
              {name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/"
            className="btn btn-outline btn-sm gap-2 rounded-xl sm:btn-md"
          >
            <Home className="size-4.5" />
            <span className="hidden sm:inline">الرئيسية</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="btn btn-error btn-sm gap-2 rounded-xl sm:btn-md"
            >
              <LogOut className="size-4.5" />
              <span>خروج</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
