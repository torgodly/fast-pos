import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Building2,
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
        : session?.role === "admin"
          ? "مدير"
          : null;

  return (
    <main className="relative flex min-h-dvh flex-1 overflow-hidden p-4 sm:p-6 lg:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-secondary/10 blur-3xl" />

      <div className="page-shell relative z-10 flex flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/20">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-xl font-black leading-tight">فاست بوس</p>
              <p className="text-xs text-base-content/50">نظام نقاط البيع</p>
            </div>
          </div>

          {session ? (
            <div className="flex items-center gap-2 rounded-2xl border border-base-300/70 bg-base-100/80 px-3 py-2 shadow-sm backdrop-blur-sm">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="size-4.5" />
              </span>
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-black">{session.name}</p>
                <p className="text-xs text-base-content/45">{roleLabel}</p>
              </div>
            </div>
          ) : (
            <Link
              href="/admin/login"
              className="btn btn-ghost btn-sm gap-2 rounded-xl text-base-content/70 sm:btn-md"
            >
              <LockKeyhole className="size-4" />
              <span className="hidden sm:inline">لوحة الإدارة</span>
            </Link>
          )}
        </header>

        <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center py-10 sm:py-16">
          <div className="mb-8 max-w-2xl sm:mb-12">
            <div className="badge badge-primary badge-soft mb-4 gap-2 py-3 font-bold">
              <span className="size-1.5 rounded-full bg-primary" />
              جاهز لاستقبال الطلبات
            </div>
            <h1 className="text-balance text-4xl font-black leading-[1.2] tracking-tight sm:text-5xl lg:text-6xl">
              {session ? (
                <>
                  أهلاً{" "}
                  <span className="text-primary">{session.name}</span>
                  ، اختر مساحة العمل
                </>
              ) : (
                <>
                  أهلاً بك، اختر
                  <span className="text-primary"> مساحة العمل</span>
                </>
              )}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-base-content/60 sm:text-lg">
              {session
                ? "أنت مسجّل الدخول. اختر المطعم أو الكافيه للمتابعة، أو سجّل الخروج من الزر أدناه."
                : "دخول سريع وآمن لفريق المطعم والكافيه. اختر المكان وابدأ العمل فوراً برمزك الشخصي."}
            </p>
          </div>

          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
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
                  className={`group card min-h-64 overflow-hidden border-0 text-white shadow-2xl transition duration-300 hover:-translate-y-1 ${
                    index === 0
                      ? "bg-gradient-to-br from-primary via-blue-600 to-indigo-700 shadow-primary/20"
                      : "bg-gradient-to-br from-secondary via-teal-600 to-cyan-800 shadow-secondary/20"
                  }`}
                >
                  <div className="card-body relative justify-between p-7 sm:p-9">
                    <div className="absolute -left-12 -top-14 size-48 rounded-full border-[28px] border-white/5" />
                    <div className="absolute -bottom-20 -right-12 size-56 rounded-full bg-white/5" />
                    <div className="relative flex items-start justify-between">
                      <span className="grid size-16 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                        <Icon className="size-8" strokeWidth={1.8} />
                      </span>
                      <span className="grid size-11 place-items-center rounded-full bg-white/10 transition group-hover:-translate-x-1 group-hover:bg-white/20">
                        <ArrowLeft className="size-5" />
                      </span>
                    </div>
                    <div className="relative">
                      <p className="mb-1 text-sm font-bold text-white/65">
                        نقطة البيع
                      </p>
                      <h2 className="text-4xl font-black sm:text-5xl">
                        {venue.name}
                      </h2>
                      <p className="mt-2 text-white/70">{venue.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {session ? (
            <div className="mt-8 sm:mt-10">
              <LogoutButton className="btn btn-error btn-lg h-16 w-full rounded-2xl text-lg font-black shadow-lg shadow-error/20 sm:h-20 sm:text-xl">
                <LogOut className="size-6" />
                تسجيل الخروج — {session.name}
              </LogoutButton>
            </div>
          ) : null}
        </section>

        <footer className="flex flex-col gap-2 border-t border-base-300/60 py-4 text-xs text-base-content/45 sm:flex-row sm:items-center sm:justify-between">
          <span>نظام موحّد لإدارة المبيعات والفريق</span>
          <span className="flex items-center gap-1.5">
            <Building2 className="size-3.5" />
            المطعم والكافيه في مكان واحد
          </span>
        </footer>
      </div>
    </main>
  );
}
