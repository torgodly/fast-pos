import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import {
  ArrowRight,
  CalendarClock,
  FileText,
  ShoppingCart,
  Truck,
  UserRound,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/actions/auth";
import { db } from "@/lib/db";
import {
  purchaseInvoiceLines,
  purchaseInvoices,
  suppliers,
} from "@/lib/db/schema";
import {
  baseToQuantity,
  formatBaseQuantity,
  type UnitKind,
} from "@/lib/inventory/rules";
import { formatMoney } from "@/lib/venues";

function formatQty(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/\.?0+$/, "");
}

function lineUnit(line: {
  unitName: string | null;
  unitKind: "weight" | "count" | null;
  factorToBase: number | null;
}) {
  const kind: UnitKind = line.unitKind ?? "weight";
  return {
    name: line.unitName ?? (kind === "count" ? "حبة" : "غرام"),
    kind,
    factorToBase:
      typeof line.factorToBase === "number" && line.factorToBase > 0
        ? line.factorToBase
        : 1,
  };
}

export default async function AdminPurchaseInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();

  const invoice = db
    .select({
      id: purchaseInvoices.id,
      supplierId: purchaseInvoices.supplierId,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      note: purchaseInvoices.note,
      totalCost: purchaseInvoices.totalCost,
      createdByName: purchaseInvoices.createdByName,
      createdAt: purchaseInvoices.createdAt,
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(eq(purchaseInvoices.id, invoiceId))
    .get();
  if (!invoice) notFound();

  const lines = db
    .select()
    .from(purchaseInvoiceLines)
    .where(eq(purchaseInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(purchaseInvoiceLines.id))
    .all();

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShoppingCart className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">
              فاتورة مشتريات #{invoice.id}
            </h2>
            <p className="text-sm text-base-content/45">
              {invoice.invoiceNumber
                ? `رقم المورد: ${invoice.invoiceNumber}`
                : "بدون رقم مورد"}
            </p>
          </div>
        </div>
        <Link
          href="/admin/purchases"
          className="btn btn-ghost btn-sm gap-1.5 rounded-xl"
        >
          <ArrowRight className="size-4" />
          كل الفواتير
        </Link>
      </div>

      <section className="premium-card card">
        <div className="card-body grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-base-200 text-secondary">
              <Truck className="size-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-base-content/45">المورد</p>
              <p className="font-black">{invoice.supplierName ?? "بدون مورد"}</p>
              {invoice.supplierPhone ? (
                <p className="font-mono text-xs text-base-content/55" dir="ltr">
                  {invoice.supplierPhone}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-base-200 text-secondary">
              <FileText className="size-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-base-content/45">
                رقم فاتورة المورد
              </p>
              <p className="font-mono font-black">
                {invoice.invoiceNumber ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-base-200 text-secondary">
              <CalendarClock className="size-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-base-content/45">التاريخ</p>
              <p className="font-mono text-sm font-bold">{invoice.createdAt}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-base-200 text-secondary">
              <UserRound className="size-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-base-content/45">
                سجّلها
              </p>
              <p className="font-bold">{invoice.createdByName}</p>
            </div>
          </div>
        </div>
      </section>

      {invoice.note ? (
        <div className="rounded-2xl border border-base-300/70 bg-base-100 p-4 text-sm">
          <span className="font-bold text-base-content/45">ملاحظة: </span>
          {invoice.note}
        </div>
      ) : null}

      <section className="premium-card card">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الصنف / المكوّن</th>
                  <th>الكمية المُدخلة</th>
                  <th>المكافئ الأساسي</th>
                  <th>سعر الوحدة</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const unit = lineUnit(line);
                  return (
                    <tr key={line.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{line.targetName}</span>
                          <span className="badge badge-ghost badge-sm">
                            {line.itemId != null ? "صنف" : "مكوّن"}
                          </span>
                        </div>
                      </td>
                      <td className="font-mono">
                        {formatQty(
                          baseToQuantity(line.qtyBase, unit.factorToBase),
                        )}{" "}
                        {unit.name}
                      </td>
                      <td className="font-mono text-base-content/60">
                        {formatBaseQuantity(line.qtyBase, unit.kind)}
                      </td>
                      <td className="font-mono">
                        {formatMoney(line.unitPrice)}
                      </td>
                      <td className="font-black text-primary">
                        {formatMoney(line.lineTotal)}
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center opacity-60">
                      لا بنود في هذه الفاتورة
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4} className="text-left">
                    الإجمالي
                  </th>
                  <th className="text-primary">
                    {formatMoney(invoice.totalCost)}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
