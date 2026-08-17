import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isVenueId } from "@/lib/venues";

/** Force-change PIN flow removed — send people to work or login. */
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
  redirect(
    session.role === "waiter" ? `/waiter/${venue}` : `/cashier/${venue}`,
  );
}
