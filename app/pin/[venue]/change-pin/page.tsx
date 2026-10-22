import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isVenueId } from "@/lib/venues";
import { isActiveVenueId, staffLandingPath } from "@/lib/deployment";

/** Force-change PIN flow removed — send people to work or login. */
export default async function ChangePinPage({
  params,
}: {
  params: Promise<{ venue: string }>;
}) {
  const { venue } = await params;
  if (!isVenueId(venue) || !isActiveVenueId(venue)) notFound();

  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    redirect(`/pin/${venue}`);
  }
  redirect(staffLandingPath(session.role, venue));
}
