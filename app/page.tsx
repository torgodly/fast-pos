import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ChefHat,
  Coffee,
  LockKeyhole,
  LogOut,
  Sparkles,
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
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden p-4 sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-primary/10 blur-3xl sm:size-96" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 size-80 rounded-full bg-secondary/10 blur-3xl sm:size-[28rem]" />

      <div className="page-shell relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/20 sm:size-11">
              <Sparkles className="size-4.5 sm:size-5" />
            </span>
            <div>
              <p className="text-lg font-black leading-tight sm:text-xl">
                فاست بوس
              </p>
              <p className="text-[11px] text-base-content/45 sm:text-xs">
                نظام نقاط البيع
              </p>
            </div>
          </div>

          {session ? (
            <div className="flex max-w-[55%] items-center gap-2 rounded-2xl border border-base-300/70 bg-base-100/80 px-2.5 py-1.5 shadow-sm backdrop-blur-sm sm:max-w-none sm:px-3 sm:py-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:size-9">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-black">{session.name}</p>
                {roleLabel ? (
                  <p className="text-[11px] text-base-content/45 sm:text-xs">
                    {roleLabel}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <Link
              href="/admin/login"
              className="btn btn-ghost btn-sm h-10 min-h-10 gap-2 rounded-xl px-3"
            >
              <LockKeyhole className="size-4" />
              <span className="hidden sm:inline">لوحة الإدارة</span>
              <span className="sm:hidden">إدارة</span>
            </Link>
          )}
        </header>

        <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-6 sm:py-8 lg:py-10">
          <div className="mb-5 text-center sm:mb-7">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
              اختر مساحة العمل
            </h1>
            <p className="mt-1.5 text-sm text-base-content/50 sm:text-base">
              {session
                ? "اختر الفرع للمتابعة"
                : "اختر الفرع ثم أدخل رمزك الشخصي"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:gap-5">
            {VENUES.map((venue, index) => {
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
                  className={`group relative overflow-hidden rounded-3xl text-white shadow-xl transition duration-300 active:scale-[0.98] ${
                    index === 0
                      ? "bg-gradient-to-br from-primary via-blue-600 to-indigo-700 shadow-primary/25"
                      : "bg-gradient-to-br from-secondary via-teal-600 to-cyan-800 shadow-secondary/25"
                  }`}
                >
                  <div className="absolute -left-8 -top-10 size-36 rounded-full border-[20px] border-white/5 sm:size-44" />
                  <div className="absolute -bottom-14 -right-8 size-40 rounded-full bg-white/5 sm:size-48" />

                  <div className="relative flex items-center gap-4 p-5 sm:gap-5 sm:p-6 lg:p-7">
                    <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20 sm:size-16 lg:size-[4.5rem]">
                      <Icon
                        className="size-7 sm:size-8 lg:size-9"
                        strokeWidth={1.75}
                      />
                    </span>

                    <div className="min-w-0 flex-1 text-right">
                      <h2 className="truncate text-2xl font-black leading-none sm:text-3xl lg:text-4xl">
                        {venue.name}
                      </h2>
                      <p className="mt-1.5 truncate text-sm text-white/70 sm:text-base">
                        {venue.description}
                      </p>
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm font-bold ring-1 ring-white/15 transition group-hover:bg-white/25 sm:px-3.5 sm:py-2.5">
                      دخول
                      <ArrowLeft className="size-4 transition group-hover:-translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {session ? (
            <div className="mt-5 sm:mt-6">
              <LogoutButton className="btn btn-error btn-md h-12 min-h-12 w-full gap-2 rounded-2xl text-base font-black shadow-lg shadow-error/15 sm:h-14 sm:min-h-14 sm:text-lg">
                <LogOut className="size-5" />
                تسجيل الخروج
              </LogoutButton>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
