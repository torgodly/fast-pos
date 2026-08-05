import { asc, eq } from "drizzle-orm";
import { Printer } from "lucide-react";
import { PrintersAdmin } from "@/components/admin/PrintersAdmin";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { cashierStations, printers } from "@/lib/db/schema";
import { getVenueName } from "@/lib/venues";

export default async function AdminPrintersPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);

  const allPrinters = db
    .select()
    .from(printers)
    .where(eq(printers.venueId, venue))
    .orderBy(asc(printers.name))
    .all();

  const stations = db
    .select()
    .from(cashierStations)
    .where(eq(cashierStations.venueId, venue))
    .orderBy(asc(cashierStations.name))
    .all();

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-info/10 text-info">
            <Printer className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">الطابعات والمحطات</h2>
            <p className="text-sm text-base-content/45">
              إدارة طابعات {getVenueName(venue)} وربط محطات الكاشير
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/printers" venue={venue} />
      </div>

      <PrintersAdmin
        venueId={venue}
        printers={allPrinters.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          host: p.host,
          port: p.port,
          active: p.active,
        }))}
        stations={stations.map((s) => ({
          id: s.id,
          name: s.name,
          printerId: s.printerId,
          active: s.active,
        }))}
      />
    </div>
  );
}
