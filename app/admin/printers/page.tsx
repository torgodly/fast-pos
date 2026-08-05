import { and, asc, eq } from "drizzle-orm";
import {
  MonitorSmartphone,
  Plus,
  Power,
  Printer,
} from "lucide-react";
import {
  setCashierStationActive,
  setPrinterActive,
  upsertCashierStation,
  upsertPrinter,
} from "@/app/actions/admin";
import { requireAdmin } from "@/app/actions/auth";
import { TestPrintButton } from "@/components/TestPrintButton";
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

  const kitchenPrinters = allPrinters.filter((p) => p.role === "kitchen");
  const checkoutPrinters = allPrinters.filter(
    (p) => p.role === "checkout" && p.active,
  );

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

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Printer className="size-5" />
            </span>
            <div>
              <h3 className="font-black">الطابعات</h3>
              <p className="text-xs text-base-content/45">
                عنوان IP ثابت ومنفذ 9100 عادةً لطابعات XPrinter
              </p>
            </div>
          </div>

          <form
            action={upsertPrinter}
            className="grid gap-3 rounded-2xl bg-base-200/60 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[1fr_160px_1fr_120px_auto]"
          >
            <input type="hidden" name="venueId" value={venue} />
            <input
              name="name"
              placeholder="اسم الطابعة"
              className="input input-bordered w-full bg-base-100"
              required
            />
            <select
              name="role"
              className="select select-bordered w-full bg-base-100"
              defaultValue="kitchen"
              required
            >
              <option value="kitchen">مطبخ</option>
              <option value="checkout">فاتورة كاشير</option>
            </select>
            <input
              name="host"
              placeholder="192.168.1.40"
              className="input input-bordered w-full bg-base-100"
              required
            />
            <input
              name="port"
              type="number"
              defaultValue={9100}
              className="input input-bordered w-full bg-base-100"
              required
            />
            <button type="submit" className="btn btn-primary gap-2">
              <Plus className="size-4" />
              إضافة
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>النوع</th>
                  <th>العنوان</th>
                  <th>الحالة</th>
                  <th>اختبار</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allPrinters.map((printer) => (
                  <tr
                    key={printer.id}
                    className={!printer.active ? "opacity-50" : ""}
                  >
                    <td className="font-bold">{printer.name}</td>
                    <td>
                      {printer.role === "kitchen" ? "مطبخ" : "فاتورة كاشير"}
                    </td>
                    <td className="font-mono text-xs sm:text-sm">
                      {printer.host}:{printer.port}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          printer.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {printer.active ? "نشط" : "معطّل"}
                      </span>
                    </td>
                    <td>
                      {printer.active ? (
                        <TestPrintButton printerId={printer.id} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <form
                        action={async () => {
                          "use server";
                          await setPrinterActive(printer.id, !printer.active);
                        }}
                      >
                        <button
                          type="submit"
                          className="btn btn-square btn-ghost btn-sm"
                          title={printer.active ? "تعطيل" : "تفعيل"}
                        >
                          <Power className="size-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {allPrinters.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا توجد طابعات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {kitchenPrinters.length === 0 && (
            <p className="text-sm text-warning">
              أضف طابعة مطبخ واحدة على الأقل ثم اربط الأصناف بها من صفحة الأصناف.
            </p>
          )}
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary">
              <MonitorSmartphone className="size-5" />
            </span>
            <div>
              <h3 className="font-black">محطات الكاشير</h3>
              <p className="text-xs text-base-content/45">
                كل محطة تطبع فاتورة الدفع على طابعة محددة
              </p>
            </div>
          </div>

          <form
            action={upsertCashierStation}
            className="grid gap-3 rounded-2xl bg-base-200/60 p-3 sm:grid-cols-[1fr_1fr_auto] sm:p-4"
          >
            <input type="hidden" name="venueId" value={venue} />
            <input
              name="name"
              placeholder="اسم المحطة (مثال: كاشير 1)"
              className="input input-bordered w-full bg-base-100"
              required
            />
            <select
              name="printerId"
              className="select select-bordered w-full bg-base-100"
              required
              defaultValue=""
            >
              <option value="" disabled>
                طابعة الفاتورة
              </option>
              {checkoutPrinters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.host})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn btn-secondary gap-2"
              disabled={checkoutPrinters.length === 0}
            >
              <Plus className="size-4" />
              إضافة محطة
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>المحطة</th>
                  <th>طابعة الفاتورة</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => {
                  const printer = allPrinters.find(
                    (p) => p.id === station.printerId,
                  );
                  return (
                    <tr
                      key={station.id}
                      className={!station.active ? "opacity-50" : ""}
                    >
                      <td className="font-bold">{station.name}</td>
                      <td>
                        {printer
                          ? `${printer.name} (${printer.host})`
                          : "طابعة محذوفة"}
                      </td>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            station.active
                              ? "badge-success badge-soft"
                              : "badge-ghost"
                          }`}
                        >
                          {station.active ? "نشط" : "معطّل"}
                        </span>
                      </td>
                      <td>
                        <form
                          action={async () => {
                            "use server";
                            await setCashierStationActive(
                              station.id,
                              !station.active,
                            );
                          }}
                        >
                          <button
                            type="submit"
                            className="btn btn-square btn-ghost btn-sm"
                          >
                            <Power className="size-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {stations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center opacity-60">
                      لا توجد محطات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
