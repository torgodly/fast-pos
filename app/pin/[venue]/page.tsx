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
  if (session?.role === "waiter") {
    redirect(`/waiter/${venue}`);
  }
  if (session?.role === "cashier") {
    redirect(`/cashier/${venue}`);
  }

  const VenueIcon = venue === "restaurant" ? ChefHat : Coffee;

  return (
    <main className="relative flex min-h-dvh flex-1 overflow-hidden p-4 sm:p-6 lg:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_45%,rgb(37_99_235_/_0.04)_45%)]" />
      <div className="page-shell relative z-10 flex flex-1 flex-col">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-content">
              <Sparkles className="size-5" />
            </span>
            <span className="font-black">فاست بوس</span>
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm gap-2 rounded-xl">
            <ArrowRight className="size-4" />
            رجوع
          </Link>
        </header>

        <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 py-8 lg:grid-cols-[1fr_440px] lg:gap-16">
          <section className="hidden lg:block">
            <div
              className={`mb-6 grid size-20 place-items-center rounded-3xl text-white shadow-xl ${
                venue === "restaurant"
                  ? "bg-gradient-to-br from-primary to-indigo-700 shadow-primary/20"
                  : "bg-gradient-to-br from-secondary to-cyan-800 shadow-secondary/20"
              }`}
            >
              <VenueIcon className="size-10" />
            </div>
            <p className="mb-2 font-bold text-primary">تسجيل دخول الموظفين</p>
            <h2 className="text-balance text-5xl font-black leading-tight">
              مساحة عمل
              <br />
              {getVenueName(venue)}
            </h2>
            <p className="mt-5 max-w-md text-lg leading-8 text-base-content/55">
              أدخل رمزك للوصول إلى شاشة النادل أو الكاشير. سيتم تحديد دورك
              تلقائياً.
            </p>
          </section>

          <PinPad venueId={venue} venueName={getVenueName(venue)} />
        </div>
      </div>
    </main>
  );
}
