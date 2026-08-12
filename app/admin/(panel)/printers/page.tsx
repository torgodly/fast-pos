import { and, asc, eq, or } from "drizzle-orm";
import { Printer } from "lucide-react";
import { PrintersAdmin } from "@/components/admin/PrintersAdmin";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { isVenueId, getVenueName } from "@/lib/venues";
import type { VenueId } from "@/lib/types";

function dedupeKitchenPrinters<T extends { id: number; role: string; host: string; port: number }>(
  rows: T[],
): T[] {
  const seenKitchen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (row.role === "kitchen") {
      const key = `${row.host}:${row.port}`;
      if (seenKitchen.has(key)) continue;
      seenKitchen.add(key);
    }
    result.push(row);
  }
  return result;
}

export default async function AdminPrintersPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);

  // Kitchen = shared (shown once). Checkout/both = this venue's cashier department.
  const allPrinters = dedupeKitchenPrinters(
    db
      .select()
      .from(printers)
      .where(
        or(
          eq(printers.role, "kitchen"),
          and(eq(printers.venueId, venue), eq(printers.role, "checkout")),
          and(eq(printers.venueId, venue), eq(printers.role, "both")),
        ),
      )
      .orderBy(asc(printers.name), asc(printers.id))
      .all(),
  );

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-info/10 text-info">
            <Printer className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">الطابعات</h2>
            <p className="text-sm text-base-content/45">
              مطبخ مشترك + فواتير كاشير {getVenueName(venue)}
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/printers" venue={venue} />
        <p className="mt-3 text-sm text-base-content/55">
          طابعات المطبخ مشتركة. قسم <strong>مطعم / كافيه</strong> يُختار فقط
          لطابعة فاتورة الكاشير (أو جزء الفاتورة من «مطبخ + فاتورة»).
        </p>
      </div>

      <PrintersAdmin
        venueId={venue}
        printers={allPrinters.map((p) => ({
          id: p.id,
          venueId:
            p.venueId && isVenueId(p.venueId) ? (p.venueId as VenueId) : null,
          name: p.name,
          role: p.role,
          host: p.host,
          port: p.port,
          connectionType: p.connectionType,
          active: p.active,
        }))}
      />
    </div>
  );
}
