"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Printer } from "lucide-react";
import {
  deletePrinter,
  setPrinterActive,
  upsertPrinter,
} from "@/app/actions/admin";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";
import { TestPrintButton } from "@/components/TestPrintButton";
import {
  printerRoleLabel,
  supportsCheckout,
  supportsKitchen,
} from "@/lib/printers";
import { getVenueName, VENUES } from "@/lib/venues";
import type { VenueId } from "@/lib/types";

type PrinterRow = {
  id: number;
  venueId: VenueId | null;
  name: string;
  role: string;
  host: string;
  port: number;
  connectionType: string;
  active: boolean;
};

function needsCashierVenue(role: string) {
  return role === "checkout" || role === "both";
}

export function PrintersAdmin({
  venueId,
  printers: allPrinters,
}: {
  venueId: VenueId;
  printers: PrinterRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState("checkout");

  const [printerModal, setPrinterModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; printer: PrinterRow }
    | null
  >(null);

  const kitchenPrinters = allPrinters.filter((p) => supportsKitchen(p.role));
  const checkoutPrinters = allPrinters.filter(
    (p) => supportsCheckout(p.role) && p.active && p.venueId === venueId,
  );

  useEffect(() => {
    if (!printerModal) return;
    setRoleDraft(
      printerModal.mode === "edit" ? printerModal.printer.role : "checkout",
    );
  }, [printerModal]);

  function closeModals() {
    if (pending) return;
    setPrinterModal(null);
    setError(null);
  }

  function submitPrinter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

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

  const editingPrinter =
    printerModal?.mode === "edit" ? printerModal.printer : null;
  const showVenue = needsCashierVenue(roleDraft);

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
                  المطبخ مشترك · قسم فاتورة الكاشير للمطعم أو الكافيه فقط
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
                  <th>قسم الكاشير</th>
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
                      {printer.role === "kitchen" ? (
                        <span className="badge badge-ghost badge-sm">
                          مشترك (مطبخ)
                        </span>
                      ) : printer.venueId ? (
                        <span className="badge badge-ghost badge-sm">
                          {getVenueName(printer.venueId)}
                        </span>
                      ) : (
                        <span className="badge badge-warning badge-soft badge-sm">
                          غير محدد
                        </span>
                      )}
                    </td>
                    <td>{printerRoleLabel(printer.role)}</td>
                    <td>
                      {printer.connectionType === "local" ? (
                        <span className="badge badge-info badge-soft badge-sm">
                          Chrome
                        </span>
                      ) : (
                        <span className="badge badge-ghost badge-sm">شبكة</span>
                      )}
                    </td>
                    <td className="font-mono text-xs sm:text-sm">
                      {printer.connectionType === "local"
                        ? "Chrome — جهاز الكاشير"
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
                        <span className="text-xs text-base-content/45">Chrome</span>
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
                    <td colSpan={8} className="text-center opacity-60">
                      لا توجد طابعات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {kitchenPrinters.length === 0 && (
            <p className="text-sm text-warning">
              أضف طابعة مطبخ ثم اربط التصنيفات بها من صفحة الأصناف.
            </p>
          )}

          {checkoutPrinters.length === 0 && (
            <p className="text-sm text-warning">
              أضف طابعة «فاتورة كاشير» أو «مطبخ + فاتورة» بقسم{" "}
              {getVenueName(venueId)} — بدونها لا يعمل التحصيل.
            </p>
          )}
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
              value={roleDraft}
              onChange={(event) => setRoleDraft(event.target.value)}
              required
            >
              <option value="kitchen">مطبخ</option>
              <option value="checkout">فاتورة كاشير</option>
              <option value="both">مطبخ + فاتورة</option>
            </select>
            <span className="label-text-alt mt-2 text-base-content/45">
              المطبخ مشترك بين الفرعين. القسم يخص فاتورة الكاشير فقط
            </span>
          </label>
          {showVenue ? (
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">
                قسم فاتورة الكاشير
              </span>
              <select
                name="venueId"
                className="select select-bordered w-full"
                defaultValue={editingPrinter?.venueId ?? venueId}
                required
              >
                {VENUES.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
              <span className="label-text-alt mt-2 text-base-content/45">
                {roleDraft === "both"
                  ? "يحدد أي قسم تطبع له فاتورة الكاشير — المطبخ يبقى مشتركاً"
                  : "فواتير هذا القسم فقط"}
              </span>
            </label>
          ) : (
            <p className="rounded-xl border border-base-300 bg-base-200/50 px-3 py-2 text-sm text-base-content/65">
              طابعة مطبخ مشتركة — بدون قسم مطعم/كافيه
            </p>
          )}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">طريقة الاتصال</span>
            <select
              name="connectionType"
              className="select select-bordered w-full"
              defaultValue={editingPrinter?.connectionType ?? "network"}
            >
              <option value="network">شبكة (IP)</option>
              <option value="local">Chrome على جهاز الكاشير</option>
            </select>
            <span className="label-text-alt mt-2 text-base-content/45">
              Chrome: يفتح نافذة طباعة المتصفح على PC الكاشير عند الدفع
            </span>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">
              IP (شبكة) — اتركه فارغاً لـ Chrome
            </span>
            <input
              name="host"
              defaultValue={
                editingPrinter?.host === "default"
                  ? ""
                  : (editingPrinter?.host ?? "")
              }
              placeholder="192.168.1.40 — أو فارغ لـ Chrome"
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
    </>
  );
}
