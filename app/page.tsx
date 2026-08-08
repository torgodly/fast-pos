import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChefHat,
  Coffee,
  LockKeyhole,
  LogOut,
  UserRound,
} from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { getSession } from "@/lib/auth/session";
import { VENUES } from "@/lib/venues";

export default async function HomePage() {
  const session = await getSession();
  if (session?.role === "admin") {
    redirect("/admin");
  }
  const roleLabel =
    session?.role === "waiter"
      ? "سفرادجي"
      : session?.role === "cashier"
        ? "كاشير"
        : null;

  return (
    <main className="flex min-h-dvh flex-1 flex-col p-3 sm:p-4">
      <div className="page-shell flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 py-1">
          <p className="text-sm font-black">فاست بوس</p>
          {session ? (
            <div className="flex items-center gap-1.5 text-xs text-base-content/55">
              <UserRound className="size-3.5" />
              <span className="font-bold text-base-content">{session.name}</span>
              {roleLabel ? <span>· {roleLabel}</span> : null}
            </div>
          ) : (
            <Link
              href="/admin/login"
              className="btn btn-ghost btn-xs h-7 min-h-7 gap-1 rounded-md"
            >
              <LockKeyhole className="size-3.5" />
              إدارة
            </Link>
          )}
        </header>

        <section className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-3 py-6">
          <p className="text-center text-sm font-black">اختر الفرع</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {VENUES.map((venue) => {
              const Icon = venue.id === "restaurant" ? ChefHat : Coffee;
              const venueHref =
                session?.role === "waiter"
                  ? `/waiter/${venue.id}`
                  : session?.role === "cashier"
                    ? `/cashier/${venue.id}`
                    : `/pin/${venue.id}`;
              return (
                <Link
                  key={venue.id}
                  href={venueHref}
                  className={`flex min-h-24 items-center gap-3 rounded-xl px-4 py-3 text-white ${
                    venue.id === "restaurant" ? "bg-primary" : "bg-secondary"
                  }`}
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-white/15">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xl font-black">{venue.name}</span>
                </Link>
              );
            })}
          </div>

          {session ? (
            <LogoutButton className="btn btn-error btn-sm mt-2 h-10 min-h-10 w-full gap-1.5 rounded-lg">
              <LogOut className="size-4" />
              خروج
            </LogoutButton>
          ) : null}
        </section>
      </div>
    </main>
  );
}
