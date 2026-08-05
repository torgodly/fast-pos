"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MonitorSmartphone, Pencil, Plus, Printer } from "lucide-react";
import {
  deleteCashierStation,
  deletePrinter,
  setCashierStationActive,
  setPrinterActive,
  upsertCashierStation,
  upsertPrinter,
} from "@/app/actions/admin";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";
import { TestPrintButton } from "@/components/TestPrintButton";
import type { VenueId } from "@/lib/types";

type PrinterRow = {
  id: number;
  name: string;
  role: string;
  host: string;
  port: number;
  connectionType: string;
  active: boolean;
};

type StationRow = {
  id: number;
  name: string;
  printerId: number;
  active: boolean;
};

export function PrintersAdmin({
  venueId,
  printers: allPrinters,
  stations,
}: {
  venueId: VenueId;
  printers: PrinterRow[];
  stations: StationRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [printerModal, setPrinterModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; printer: PrinterRow }
    | null
  >(null);

  const [stationModal, setStationModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; station: StationRow }
    | null
  >(null);

  const checkoutPrinters = allPrinters.filter(
    (p) => p.role === "checkout" && p.active,
  );
  const allCheckout = allPrinters.filter((p) => p.role === "checkout");
  const kitchenPrinters = allPrinters.filter((p) => p.role === "kitchen");

  function closeModals() {
    if (pending) return;
    setPrinterModal(null);
    setStationModal(null);
    setError(null);
  }

  function submitPrinter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("venueId", venueId);

    startTransition(async () => {
      setError(null);
      const result = await upsertPrinter(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      closeModals();
      router.refresh();
    });
  }

  function submitStation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("venueId", venueId);

    startTransition(async () => {
      setError(null);
      const result = await upsertCashierStation(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      closeModals();
      router.refresh();
    });
  }

  const editingPrinter =
    printerModal?.mode === "edit" ? printerModal.printer : null;
  const editingStation =
    stationModal?.mode === "edit" ? stationModal.station : null;

  return (
    <>
      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Printer className="size-5" />
              </span>
              <div>
                <h3 className="font-black">الطابعات</h3>
                <p className="text-xs text-base-content/45">
                  IP ثابت — منفذ 9100 لطابعات XPrinter
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={() => {
                setError(null);
                setPrinterModal({ mode: "create" });
              }}
            >
              <Plus className="size-4" />
              إضافة طابعة
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>النوع</th>
                  <th>الاتصال</th>
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
                    <td>
                      {printer.connectionType === "local" ? (
                        <span className="badge badge-info badge-soft badge-sm">
                          USB محلي
                        </span>
                      ) : (
                        <span className="badge badge-ghost badge-sm">شبكة</span>
                      )}
                    </td>
                    <td className="font-mono text-xs sm:text-sm">
                      {printer.connectionType === "local"
                        ? printer.host === "default"
                          ? "USB — افتراضي"
                          : printer.host
                        : `${printer.host}:${printer.port}`}
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
                      {printer.active && printer.connectionType === "network" ? (
                        <TestPrintButton printerId={printer.id} />
                      ) : printer.connectionType === "local" ? (
                        <span className="text-xs text-base-content/45">USB</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-sm"
                          title="تعديل"
                          onClick={() => {
                            setError(null);
                            setPrinterModal({ mode: "edit", printer });
                          }}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <ToggleActiveButton
                          active={printer.active}
                          onToggle={async () => {
                            await setPrinterActive(printer.id, !printer.active);
                          }}
                        />
                        <DeleteConfirmButton
                          itemName={printer.name}
                          onDelete={() => deletePrinter(printer.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {allPrinters.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center opacity-60">
                      لا توجد طابعات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {kitchenPrinters.length === 0 && (
            <p className="text-sm text-warning">
              أضف طابعة مطبخ ثم اربط الأصناف بها من صفحة الأصناف.
            </p>
          )}
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary">
                <MonitorSmartphone className="size-5" />
              </span>
              <div>
                <h3 className="font-black">محطات الكاشير</h3>
                <p className="text-xs text-base-content/45">
                  كل محطة تطبع على طابعة فاتورة
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary gap-2"
              disabled={checkoutPrinters.length === 0}
              onClick={() => {
                setError(null);
                setStationModal({ mode: "create" });
              }}
            >
              <Plus className="size-4" />
              إضافة محطة
            </button>
          </div>

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
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="btn btn-square btn-ghost btn-sm"
                            title="تعديل"
                            onClick={() => {
                              setError(null);
                              setStationModal({ mode: "edit", station });
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <ToggleActiveButton
                            active={station.active}
                            onToggle={async () => {
                              await setCashierStationActive(
                                station.id,
                                !station.active,
                              );
                            }}
                          />
                          <DeleteConfirmButton
                            itemName={station.name}
                            onDelete={() => deleteCashierStation(station.id)}
                          />
                        </div>
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

      <AdminModal
        open={printerModal !== null}
        title={editingPrinter ? "تعديل طابعة" : "إضافة طابعة"}
        onClose={closeModals}
        pending={pending}
      >
        <form onSubmit={submitPrinter} className="space-y-4">
          {editingPrinter ? (
            <input type="hidden" name="id" value={editingPrinter.id} />
          ) : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم الطابعة</span>
            <input
              name="name"
              defaultValue={editingPrinter?.name ?? ""}
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">النوع</span>
            <select
              name="role"
              className="select select-bordered w-full"
              defaultValue={editingPrinter?.role ?? "checkout"}
              required
            >
              <option value="kitchen">مطبخ</option>
              <option value="checkout">فاتورة كاشير</option>
            </select>
            <span className="label-text-alt mt-2 text-base-content/45">
              طابعة USB للكاشير يجب أن تكون «فاتورة كاشير»، ثم أضف محطة مربوطة بها
            </span>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">طريقة الاتصال</span>
            <select
              name="connectionType"
              className="select select-bordered w-full"
              defaultValue={editingPrinter?.connectionType ?? "network"}
            >
              <option value="network">شبكة (IP)</option>
              <option value="local">USB على PC الكاشير</option>
            </select>
            <span className="label-text-alt mt-2 text-base-content/45">
              USB: شغّل SETUP.bat على PC الكاشير (ليس السيرفر) — طابعة Windows الافتراضية
            </span>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">
              IP (شبكة) — اتركه فارغاً لـ USB
            </span>
            <input
              name="host"
              defaultValue={
                editingPrinter?.host === "default"
                  ? ""
                  : (editingPrinter?.host ?? "")
              }
              placeholder="192.168.1.40 — أو فارغ لـ USB"
              className="input input-bordered w-full font-mono"
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">
              المنفذ (شبكة فقط — اترك 9100)
            </span>
            <input
              name="port"
              type="number"
              defaultValue={editingPrinter?.port || 9100}
              className="input input-bordered w-full"
            />
          </label>
          <ActionFeedback tone="error" message={error} />
          <div className="modal-action mt-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeModals}
              disabled={pending}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {editingPrinter ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={stationModal !== null}
        title={editingStation ? "تعديل محطة" : "إضافة محطة كاشير"}
        onClose={closeModals}
        pending={pending}
      >
        <form onSubmit={submitStation} className="space-y-4">
          {editingStation ? (
            <input type="hidden" name="id" value={editingStation.id} />
          ) : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم المحطة</span>
            <input
              name="name"
              defaultValue={editingStation?.name ?? ""}
              placeholder="كاشير 1"
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">طابعة الفاتورة</span>
            <select
              name="printerId"
              className="select select-bordered w-full"
              defaultValue={editingStation?.printerId ?? ""}
              required
            >
              <option value="" disabled>
                اختر الطابعة
              </option>
              {(editingStation ? allCheckout : checkoutPrinters).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.host}){!p.active ? " — معطّلة" : ""}
                </option>
              ))}
            </select>
          </label>
          <ActionFeedback tone="error" message={error} />
          <div className="modal-action mt-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeModals}
              disabled={pending}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={pending}
            >
              {editingStation ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
