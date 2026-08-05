import { eq } from "drizzle-orm";
import { TableProperties } from "lucide-react";
import { TablesAdmin } from "@/components/admin/TablesAdmin";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { tables } from "@/lib/db/schema";
import { getVenueName } from "@/lib/venues";

export default async function AdminTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);

  const rows = db
    .select()
    .from(tables)
    .where(eq(tables.venueId, venue))
    .all();

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-info/10 text-info">
            <TableProperties className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">إدارة الطاولات</h2>
            <p className="text-sm text-base-content/45">
              مخطط طاولات {getVenueName(venue)}
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/tables" venue={venue} />
      </div>

      <TablesAdmin
        venueId={venue}
        tables={rows.map((table) => ({
          id: table.id,
          name: table.name,
          active: table.active,
        }))}
      />
    </div>
  );
}
