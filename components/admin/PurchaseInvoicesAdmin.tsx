"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ChevronLeft,
  LoaderCircle,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { createPurchaseInvoice } from "@/app/actions/inventory";
import { AdminModal } from "@/components/admin/AdminModal";
import { ActionFeedback } from "@/components/ActionFeedback";
import { formatMoney } from "@/lib/venues";
import type { QuantityBasis } from "@/lib/inventory/rules";

export type PurchaseInvoiceRow = {
  id: number;
  supplierName: string | null;
  invoiceNumber: string | null;
  totalCost: number;
  createdByName: string;
  createdAt: string;
  lineCount: number;
};

type Option = {
  id: number;
  name: string;
  active: boolean;
};

type DraftLine = {
  ingredientId: string;
  qty: string;
  unitBasis: QuantityBasis;
  unitPrice: string;
};

function blankLine(): DraftLine {
  return { ingredientId: "", qty: "", unitBasis: "kg", unitPrice: "" };
}

export function PurchaseInvoicesAdmin({
  invoices,
  suppliers,
  ingredients,
}: {
  invoices: PurchaseInvoiceRow[];
  suppliers: Option[];
  ingredients: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

  const grandTotal = lines.reduce((sum, line) => {
    const qty = Number(line.qty);
    const price = Number(line.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
    return sum + qty * price;
  }, 0);

  function resetForm() {
    setSupplierId("");
    setInvoiceNumber("");
    setNote("");
    setLines([blankLine()]);
    setError(null);
  }

  function closeModal() {
    if (pending) return;
    setOpen(false);
    resetForm();
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeLine(index: number) {
    setLines((rows) => rows.filter((_, i) => i !== index));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payloadLines: Array<{
      ingredientId: number;
      qty: number;
      unitBasis: QuantityBasis;
      unitPrice: number;
    }> = [];

    const activeLines = lines.filter(
      (line) =>
        line.ingredientId || line.qty.trim() || line.unitPrice.trim(),
    );
    if (activeLines.length === 0) {
      setError("أضف بنداً واحداً على الأقل");
      return;
    }

    for (const line of activeLines) {
      const ingredientId = Number(line.ingredientId);
      const qty = Number(line.qty);
      const unitPrice = Number(line.unitPrice);
      if (
        !Number.isInteger(ingredientId) ||
        ingredientId <= 0 ||
        !Number.isFinite(qty) ||
        qty <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        setError("أكمل بيانات كل بند: المكوّن، الكمية، وسعر الوحدة");
        return;
      }
      payloadLines.push({
        ingredientId,
        qty,
        unitBasis: line.unitBasis,
        unitPrice,
      });
    }

    startTransition(async () => {
      setError(null);
      const result = await createPurchaseInvoice({
        supplierId: supplierId ? Number(supplierId) : null,
        invoiceNumber: invoiceNumber.trim() || null,
        note: note.trim() || null,
        lines: payloadLines,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      resetForm();
      router.push(`/admin/purchases/${result.invoiceId}`);
    });
  }

  return (
    <>
      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShoppingCart className="size-5" />
              </span>
              <div>
                <h3 className="font-black">فواتير المشتريات</h3>
                <p className="text-xs text-base-content/45">
                  كل فاتورة تضيف الكميات للمخزون تلقائياً
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={() => {
                resetForm();
                setOpen(true);
              }}
            >
              <Plus className="size-4" />
              فاتورة جديدة
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>#</th>
                  <th>المورد</th>
                  <th>رقم الفاتورة</th>
                  <th>التاريخ</th>
                  <th>البنود</th>
                  <th>الإجمالي</th>
                  <th>المستخدم</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-black">#{invoice.id}</td>
                    <td>{invoice.supplierName ?? "—"}</td>
                    <td className="font-mono text-sm">
                      {invoice.invoiceNumber ?? "—"}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {invoice.createdAt}
                    </td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {invoice.lineCount}
                      </span>
                    </td>
                    <td className="font-black text-primary">
                      {formatMoney(invoice.totalCost)}
                    </td>
                    <td className="text-sm">{invoice.createdByName}</td>
                    <td>
                      <Link
                        href={`/admin/purchases/${invoice.id}`}
                        className="btn btn-square btn-ghost btn-sm"
                        title="فتح الفاتورة"
                      >
                        <ChevronLeft className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center opacity-60">
                      لا فواتير مشتريات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AdminModal
        open={open}
        title="فاتورة مشتريات جديدة"
        onClose={closeModal}
        pending={pending}
        wide
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">المورد</span>
              <select
                className="select select-bordered w-full"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">بدون مورد</option>
                {suppliers
                  .filter(
                    (supplier) =>
                      supplier.active || String(supplier.id) === supplierId,
                  )
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.active ? "" : " (معطّل)"}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">
                رقم فاتورة المورد
              </span>
              <input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                className="input input-bordered w-full font-mono"
                placeholder="INV-1234"
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">ملاحظة</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="input input-bordered w-full"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-base-300/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black">البنود</p>
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1 rounded-lg"
                onClick={() => setLines((rows) => [...rows, blankLine()])}
              >
                <Plus className="size-3.5" />
                إضافة بند
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {lines.map((line, index) => {
                const lineTotal =
                  Number(line.qty) * Number(line.unitPrice) || 0;
                return (
                  <div
                    key={index}
                    className="grid grid-cols-2 items-end gap-2 rounded-xl bg-base-200/40 p-2 sm:grid-cols-12"
                  >
                    <label className="form-control col-span-2 sm:col-span-4">
                      <span className="label-text mb-1 text-[11px] font-bold">
                        المكوّن
                      </span>
                      <select
                        className="select select-bordered select-sm w-full"
                        value={line.ingredientId}
                        onChange={(event) =>
                          updateLine(index, {
                            ingredientId: event.target.value,
                          })
                        }
                      >
                        <option value="">اختر مكوّناً</option>
                        {ingredients
                          .filter(
                            (ingredient) =>
                              ingredient.active ||
                              String(ingredient.id) === line.ingredientId,
                          )
                          .map((ingredient) => (
                            <option
                              key={ingredient.id}
                              value={ingredient.id}
                            >
                              {ingredient.name}
                              {ingredient.active ? "" : " (معطّل)"}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="form-control sm:col-span-2">
                      <span className="label-text mb-1 text-[11px] font-bold">
                        الكمية
                      </span>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.qty}
                        onChange={(event) =>
                          updateLine(index, { qty: event.target.value })
                        }
                        className="input input-bordered input-sm w-full"
                      />
                    </label>
                    <label className="form-control sm:col-span-1">
                      <span className="label-text mb-1 text-[11px] font-bold">
                        الوحدة
                      </span>
                      <select
                        className="select select-bordered select-sm w-full"
                        value={line.unitBasis}
                        onChange={(event) =>
                          updateLine(index, {
                            unitBasis: event.target.value as QuantityBasis,
                          })
                        }
                      >
                        <option value="kg">كغ</option>
                        <option value="g">غ</option>
                      </select>
                    </label>
                    <label className="form-control sm:col-span-2">
                      <span className="label-text mb-1 text-[11px] font-bold">
                        سعر الوحدة
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(event) =>
                          updateLine(index, { unitPrice: event.target.value })
                        }
                        className="input input-bordered input-sm w-full"
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <span className="label-text mb-1 block text-[11px] font-bold">
                        الإجمالي
                      </span>
                      <p className="font-mono text-sm font-black text-primary">
                        {formatMoney(lineTotal)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-square btn-ghost btn-sm text-error sm:col-span-1"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      title="حذف البند"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-base-300/60 pt-3">
              <span className="text-sm font-bold text-base-content/55">
                إجمالي الفاتورة
              </span>
              <span className="text-xl font-black text-primary">
                {formatMoney(grandTotal)}
              </span>
            </div>
          </div>

          <ActionFeedback tone="error" message={error} />
          <div className="modal-action mt-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeModal}
              disabled={pending}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                "حفظ الفاتورة"
              )}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
