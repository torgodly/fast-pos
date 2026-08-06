import { asc, eq } from "drizzle-orm";
import { Printer } from "lucide-react";
import { PrintersAdmin } from "@/components/admin/PrintersAdmin";
import { requireAdmin } from "@/app/actions/auth";
import { VenueTabs } from "@/components/VenueTabs";
import { parseVenueParam } from "@/lib/admin-venue";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
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
              إدارة طابعات {getVenueName(venue)}
            </p>
          </div>
        </div>
        <VenueTabs basePath="/admin/printers" venue={venue} />
        <p className="mt-3 text-sm text-base-content/55">
          كل قسم له طابعة كاشير خاصة. الموظف يختار <strong>مطعم</strong> أو{" "}
          <strong>كافيه</strong> من الصفحة الرئيسية — لا حاجة لاختيار محطة
          إضافية.
        </p>
      </div>

      <PrintersAdmin
        venueId={venue}
        printers={allPrinters.map((p) => ({
          id: p.id,
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
