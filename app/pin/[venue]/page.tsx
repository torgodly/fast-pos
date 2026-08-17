import Link from "next/link";
import { ArrowRight, ChefHat, Coffee, Sparkles } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PinPad } from "@/components/PinPad";
import { getSession } from "@/lib/auth/session";
import { getVenueName, isVenueId } from "@/lib/venues";

export default async function PinPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();

  const session = await getSession();
  if (session?.role === "admin") {
    redirect("/admin");
  }
  if (
    session &&
    (session.role === "waiter" || session.role === "cashier") &&
    session.mustChangePin
  ) {
    redirect(`/pin/${venue}/change-pin`);
  }
  if (session?.role === "waiter") {
    redirect(`/waiter/${venue}`);
  }
  if (session?.role === "cashier") {
    redirect(`/cashier/${venue}`);
  }

  const VenueIcon = venue === "restaurant" ? ChefHat : Coffee;

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col p-3 sm:p-5 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_45%,rgb(37_99_235_/_0.04)_45%)]" />
      <div className="page-shell relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between pb-2">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-content sm:size-10">
              <Sparkles className="size-4 sm:size-5" />
            </span>
            <span className="font-black">فاست بوس</span>
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm gap-2 rounded-xl">
            <ArrowRight className="size-4" />
            رجوع
          </Link>
        </header>

        <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-4 py-2 lg:grid-cols-[1fr_400px] lg:gap-12 lg:py-4 min-[900px]:min-h-0">
          <section className="hidden min-[1100px]:block">
            <div
              className={`mb-4 grid size-16 place-items-center rounded-3xl text-white shadow-xl ${
                venue === "restaurant"
                  ? "bg-gradient-to-br from-primary to-indigo-700 shadow-primary/20"
                  : "bg-gradient-to-br from-secondary to-cyan-800 shadow-secondary/20"
              }`}
            >
              <VenueIcon className="size-8" />
            </div>
            <p className="mb-2 font-bold text-primary">تسجيل دخول الموظفين</p>
            <h2 className="text-balance text-4xl font-black leading-tight">
              مساحة عمل
              <br />
              {getVenueName(venue)}
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-base-content/55">
              أدخل رمزك للوصول إلى شاشة السفرادجي أو الكاشير. سيتم تحديد دورك
              تلقائياً.
            </p>
          </section>

          <div className="flex min-h-0 w-full flex-col justify-center">
            <div className="mb-3 text-center min-[1100px]:hidden">
              <p className="text-sm font-bold text-primary">دخول الموظفين</p>
              <h2 className="text-xl font-black">{getVenueName(venue)}</h2>
            </div>
            <PinPad venueId={venue} venueName={getVenueName(venue)} />
          </div>
        </div>
      </div>
    </main>
  );
}
