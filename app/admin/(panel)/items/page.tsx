import { and, asc, eq } from "drizzle-orm";
import { Boxes } from "lucide-react";
import { ItemsAdmin } from "@/components/admin/ItemsAdmin";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { categories, items, printers } from "@/lib/db/schema";
import { availableAtVenue } from "@/lib/menu/scope";
import { kitchenPrinterRolesFilter } from "@/lib/printers";
import { getVenueName } from "@/lib/venues";

export default async function AdminItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const venue = parseVenueParam(sp.venue);

  const cats = db
    .select()
    .from(categories)
    .where(availableAtVenue(categories.venueId, venue))
    .orderBy(asc(categories.sortOrder))
    .all();

  const allItems = db
    .select()
    .from(items)
    .where(availableAtVenue(items.venueId, venue))
    .all();

  const kitchenPrinters = db
    .select()
    .from(printers)
    .where(
      and(
        eq(printers.venueId, venue),
        kitchenPrinterRolesFilter,
        eq(printers.active, true),
      ),
    )
    .orderBy(asc(printers.name))
    .all();

  const allKitchenPrinters = db
    .select()
    .from(printers)
    .where(and(eq(printers.venueId, venue), kitchenPrinterRolesFilter))
    .all();

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Boxes className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">إدارة الأصناف</h2>
            <p className="text-sm text-base-content/45">
              تصنيفات وأصناف {getVenueName(venue)} + المشتركة بين الفرعين
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/items" venue={venue} />
      </div>

      <ItemsAdmin
        venueId={venue}
        categories={cats.map((cat) => ({
          id: cat.id,
          name: cat.name,
          sortOrder: cat.sortOrder,
          kitchenPrinterId: cat.kitchenPrinterId,
          active: cat.active,
          venueId: cat.venueId,
        }))}
        items={allItems.map((item) => ({
          id: item.id,
          name: item.name,
          categoryId: item.categoryId,
          price: item.price,
          active: item.active,
          venueId: item.venueId,
        }))}
        kitchenPrinters={kitchenPrinters.map((p) => ({
          id: p.id,
          name: p.name,
          active: p.active,
        }))}
        allKitchenPrinters={allKitchenPrinters.map((p) => ({
          id: p.id,
          name: p.name,
          active: p.active,
        }))}
      />
    </div>
  );
}
