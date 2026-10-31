"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, Printer } from "lucide-react";
import {
  deletePrinter,
  getSystemPrinters,
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
import { isExplicitWindowsPrinterName } from "@/lib/print/checkout-print-mode";
import { getVenueName, VENUES } from "@/lib/venues";
import type { SystemPrinter, VenueId } from "@/lib/types";

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
  const [nameDraft, setNameDraft] = useState("");
  const [connectionDraft, setConnectionDraft] = useState<"network" | "local">(
    "local",
  );
  const [hostDraft, setHostDraft] = useState("");
  const [portDraft, setPortDraft] = useState("9100");
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [systemPrintersStatus, setSystemPrintersStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [systemPrintersError, setSystemPrintersError] = useState<string | null>(
    null,
  );

  const [printerModal, setPrinterModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; printer: PrinterRow }
    | null
  >(null);

  const kitchenPrinters = allPrinters.filter((p) => supportsKitchen(p.role));
  const checkoutPrinters = allPrinters.filter(
    (p) => supportsCheckout(p.role) && p.active,
  );
  const venueCheckoutPrinters = checkoutPrinters.filter(
    (p) => p.venueId === venueId,
  );

  async function loadSystemPrinters() {
    setSystemPrintersStatus("loading");
    setSystemPrintersError(null);
    try {
      const result = await getSystemPrinters();
      if ("error" in result) {
        setSystemPrintersStatus("error");
        setSystemPrintersError(result.error);
        return;
      }
      setSystemPrinters(result.printers);
      setSystemPrintersStatus("ready");
    } catch {
      setSystemPrintersStatus("error");
      setSystemPrintersError("تعذر قراءة طابعات Windows المثبتة");
    }
  }

  function openPrinterModal(
    modal: { mode: "create" } | { mode: "edit"; printer: PrinterRow },
  ) {
    const printer = modal.mode === "edit" ? modal.printer : null;
    // New printers default to the Windows system printer; existing rows keep
    // their stored connection type.
    const isLocal = !printer || printer.connectionType === "local";
    const localPrinterName =
      printer && isLocal && isExplicitWindowsPrinterName(printer.host)
        ? printer.host
        : "";

    setRoleDraft(printer?.role ?? "checkout");
    setNameDraft(printer?.name ?? "");
    setConnectionDraft(isLocal ? "local" : "network");
    setHostDraft(isLocal ? localPrinterName : (printer?.host ?? ""));
    setPortDraft(String(printer?.port || 9100));
    setError(null);
    setPrinterModal(modal);
    void loadSystemPrinters();
  }

  function closeModals() {
    if (pending) return;
    setPrinterModal(null);
    setError(null);
  }

  function changeRole(value: string) {
    setRoleDraft(value);
  }

  function changeConnection(value: "network" | "local") {
    setConnectionDraft(value);
    setHostDraft("");
    setPortDraft(value === "local" ? "0" : "9100");
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
  const systemPrinterMissing =
    connectionDraft === "local" && !isExplicitWindowsPrinterName(hostDraft);

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
                  طباعة مباشرة ESC/POS — نظام Windows أو شبكة IP
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={() => openPrinterModal({ mode: "create" })}
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
                        isExplicitWindowsPrinterName(printer.host) ? (
                          <span className="badge badge-success badge-soft badge-sm">
                            نظام Windows
                          </span>
                        ) : (
                          <span className="badge badge-warning badge-soft badge-sm">
                            تحتاج تحديد
                          </span>
                        )
                      ) : (
                        <span className="badge badge-ghost badge-sm">
                          شبكة
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs sm:text-sm">
                      {printer.connectionType === "local"
                        ? isExplicitWindowsPrinterName(printer.host)
                          ? `Windows — ${printer.host}`
                          : "اختر طابعة Windows محددة"
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
                      {printer.active ? (
                        <TestPrintButton printerId={printer.id} />
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
                          onClick={() =>
                            openPrinterModal({ mode: "edit", printer })
                          }
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

          {venueCheckoutPrinters.length === 0 && (
            <p className="text-sm text-warning">
              لا توجد طابعة فاتورة كاشير لقسم {getVenueName(venueId)} — أضف
              «فاتورة كاشير» أو «مطبخ + فاتورة» واختر القسم {getVenueName(venueId)}.
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
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">النوع</span>
            <select
              name="role"
              className="select select-bordered w-full"
              value={roleDraft}
              onChange={(event) => changeRole(event.target.value)}
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
                key={`venue-${editingPrinter?.id ?? "new"}-${roleDraft}`}
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
              value={connectionDraft}
              onChange={(event) =>
                changeConnection(event.target.value as "network" | "local")
              }
            >
              <option value="local">طابعة النظام (Windows)</option>
              <option value="network">طابعة الشبكة (IP)</option>
            </select>
            <span className="label-text-alt mt-2 text-base-content/45">
              {connectionDraft === "local"
                ? "تُرسل الفاتورة مباشرة ESC/POS إلى الطابعة على جهاز Fast POS — بدون نافذة طباعة في المتصفح."
                : "اتصال مباشر عبر IP والمنفذ (افتراضي 9100)."}
            </span>
          </label>
          {connectionDraft === "network" ? (
            <>
              <label className="form-control w-full">
                <span className="label-text mb-2 font-bold">IP / Host</span>
                <input
                  name="host"
                  value={hostDraft}
                  onChange={(event) => setHostDraft(event.target.value)}
                  placeholder="192.168.1.40"
                  className="input input-bordered w-full font-mono"
                  required
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text mb-2 font-bold">
                  المنفذ (افتراضي 9100)
                </span>
                <input
                  name="port"
                  type="number"
                  value={portDraft}
                  onChange={(event) => setPortDraft(event.target.value)}
                  className="input input-bordered w-full"
                />
              </label>
            </>
          ) : (
            <>
              <label className="form-control w-full">
                <span className="label-text mb-2 font-bold">
                  طابعة Windows على جهاز Fast POS
                </span>
                {systemPrintersStatus === "error" ? (
                  <input
                    name="host"
                    value={hostDraft}
                    onChange={(event) => setHostDraft(event.target.value)}
                    placeholder="أدخل اسم الطابعة كما هو في Windows"
                    className="input input-bordered w-full"
                    required
                  />
                ) : (
                  <select
                    name="host"
                    className="select select-bordered w-full"
                    value={hostDraft}
                    onChange={(event) => setHostDraft(event.target.value)}
                    disabled={systemPrintersStatus === "loading"}
                    required
                  >
                    <option value="">
                      {systemPrintersStatus === "loading"
                        ? "جارٍ قراءة طابعات Windows..."
                        : "اختر طابعة Windows..."}
                    </option>
                    {hostDraft &&
                    !systemPrinters.some((p) => p.name === hostDraft) ? (
                      <option value={hostDraft}>
                        {hostDraft} — غير مثبتة حالياً
                      </option>
                    ) : null}
                    {systemPrinters.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.name}
                        {printer.isDefault ? " — الافتراضية في Windows" : ""}
                      </option>
                    ))}
                  </select>
                )}
                <span className="label-text-alt mt-2 text-base-content/45">
                  يجب أن تكون الطابعة مثبتة على جهاز Fast POS وتدعم ESC/POS.
                </span>
                {systemPrintersStatus === "error" ? (
                  <span className="label-text-alt mt-1 text-warning">
                    {systemPrintersError ?? "تعذر قراءة طابعات Windows"} —
                    أدخل الاسم يدوياً.
                  </span>
                ) : null}
                {systemPrinterMissing ? (
                  <span className="label-text-alt mt-1 text-warning">
                    اختر طابعة Windows محددة — الطابعة الافتراضية تتبع حساب الخدمة
                    وقد تطبع على طابعة أخرى.
                  </span>
                ) : null}
              </label>
              <input type="hidden" name="port" value="0" />
            </>
          )}
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
              className="btn btn-primary"
              disabled={pending || systemPrinterMissing}
            >
              {editingPrinter ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
