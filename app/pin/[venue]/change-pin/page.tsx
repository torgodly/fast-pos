import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ChangePinForm } from "@/components/ChangePinForm";
import { getSession } from "@/lib/auth/session";
import { getVenueName, isVenueId } from "@/lib/venues";

export default async function ChangePinPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue)) notFound();

  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    redirect(`/pin/${venue}`);
  }
  if (!session.mustChangePin) {
    redirect(
      session.role === "waiter" ? `/waiter/${venue}` : `/cashier/${venue}`,
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col p-3 sm:p-5 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_45%,rgb(245_158_11_/_0.06)_45%)]" />
      <div className="page-shell relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between pb-2">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-content sm:size-10">
              <Sparkles className="size-4 sm:size-5" />
            </span>
            <span className="font-black">فاست بوس</span>
          </Link>
          <span className="text-sm text-base-content/45">
            {getVenueName(venue)}
          </span>
        </header>

        <div className="flex flex-1 items-center justify-center py-6">
          <ChangePinForm venueId={venue} staffName={session.name} />
        </div>

        <p className="pb-2 text-center text-xs text-base-content/40">
          <ArrowRight className="me-1 inline size-3" />
          لن تتمكن من فتح شاشات العمل قبل تغيير الرمز
        </p>
      </div>
    </main>
  );
}
