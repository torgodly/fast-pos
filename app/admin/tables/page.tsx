import { eq } from "drizzle-orm";
import { Armchair, Plus, Power, TableProperties } from "lucide-react";
import { setTableActive, upsertTable } from "@/app/actions/admin";
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

      <section className="premium-card card">
        <div className="card-body gap-6 p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-black">قائمة الطاولات</h3>
              <p className="text-xs text-base-content/45">
                {rows.length} طاولة مسجلة
              </p>
            </div>
          <form
            action={upsertTable}
            className="flex w-full gap-2 sm:w-auto"
          >
            <input type="hidden" name="venueId" value={venue} />
            <input
              name="name"
              placeholder="اسم الطاولة"
              className="input input-bordered min-w-0 flex-1 bg-base-100 sm:w-56"
              required
            />
            <button type="submit" className="btn btn-primary gap-2">
              <Plus className="size-4" />
              <span className="hidden sm:inline">إضافة طاولة</span>
            </button>
          </form>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {rows.map((table) => (
              <div
                key={table.id}
                className={`group relative overflow-hidden rounded-2xl border p-4 transition ${
                  table.active
                    ? "border-base-300/70 bg-base-100 hover:-translate-y-0.5 hover:border-info/30 hover:shadow-md"
                    : "border-base-300/50 bg-base-200/60 opacity-55"
                }`}
              >
                <div className="mb-5 flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-info/10 text-info">
                    <Armchair className="size-5" />
                  </span>
                <form
                  action={async () => {
                    "use server";
                    await setTableActive(table.id, !table.active);
                  }}
                >
                  <button
                    type="submit"
                    className="btn btn-circle btn-ghost btn-sm"
                    title={table.active ? "تعطيل" : "تفعيل"}
                  >
                    <Power className="size-4" />
                  </button>
                </form>
                </div>
                <p className="truncate text-lg font-black">{table.name}</p>
                <span
                  className={`badge badge-sm mt-1 ${
                    table.active
                      ? "badge-success badge-soft"
                      : "badge-ghost"
                  }`}
                >
                  {table.active ? "نشطة" : "معطّلة"}
                </span>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-base-300 p-10 text-center">
                <Armchair className="mx-auto mb-3 size-8 text-base-content/25" />
                <p className="font-bold">لا توجد طاولات بعد</p>
                <p className="text-sm text-base-content/45">
                  أضف أول طاولة من الحقل أعلاه
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
