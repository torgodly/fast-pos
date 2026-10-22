import { and, asc, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { Search, ShoppingCart } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import {
  PurchaseInvoicesAdmin,
  type PurchaseInvoiceRow,
} from "@/components/admin/PurchaseInvoicesAdmin";
import { db } from "@/lib/db";
import {
  ingredients,
  purchaseInvoiceLines,
  purchaseInvoices,
  suppliers,
} from "@/lib/db/schema";

export default async function AdminPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const conditions: SQL[] = [];
  if (q) {
    const pattern = `%${q}%`;
    const numeric = Number(q.replace("#", ""));
    const matches: SQL[] = [
      like(purchaseInvoices.invoiceNumber, pattern),
      like(purchaseInvoices.note, pattern),
      like(suppliers.name, pattern),
    ];
    if (Number.isInteger(numeric) && numeric > 0) {
      matches.push(eq(purchaseInvoices.id, numeric));
    }
    const combined = or(...matches);
    if (combined) conditions.push(combined);
  }

  const rows = db
    .select({
      id: purchaseInvoices.id,
      supplierName: suppliers.name,
      invoiceNumber: purchaseInvoices.invoiceNumber,
      totalCost: purchaseInvoices.totalCost,
      createdByName: purchaseInvoices.createdByName,
      createdAt: purchaseInvoices.createdAt,
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(purchaseInvoices.createdAt), desc(purchaseInvoices.id))
    .limit(100)
    .all();

  const lineCounts = db
    .select({
      invoiceId: purchaseInvoiceLines.invoiceId,
      count: sql<number>`count(*)`,
    })
    .from(purchaseInvoiceLines)
    .groupBy(purchaseInvoiceLines.invoiceId)
    .all();
  const countsByInvoice = new Map<number, number>();
  for (const row of lineCounts) {
    countsByInvoice.set(row.invoiceId, Number(row.count));
  }

  const invoices: PurchaseInvoiceRow[] = rows.map((row) => ({
    ...row,
    lineCount: countsByInvoice.get(row.id) ?? 0,
  }));

  const ingredientOptions = db
    .select({ id: ingredients.id, name: ingredients.name, active: ingredients.active })
    .from(ingredients)
    .orderBy(asc(ingredients.name), asc(ingredients.id))
    .all();

  const supplierOptions = db
    .select({ id: suppliers.id, name: suppliers.name, active: suppliers.active })
    .from(suppliers)
    .orderBy(asc(suppliers.name), asc(suppliers.id))
    .all();

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ShoppingCart className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">فواتير المشتريات</h2>
          <p className="text-sm text-base-content/45">
            عند حفظ الفاتورة تُضاف الكميات للمخزون وتُسجَّل حركة شراء
          </p>
        </div>
      </div>

      <form className="premium-card card">
        <div className="card-body flex flex-row items-end gap-2 p-4">
          <label className="form-control flex-1">
            <span className="label-text mb-1 text-xs font-bold">
              بحث (رقم، مورد، ملاحظة)
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="مثال: 12 أو INV-1234"
              className="input input-bordered input-sm"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm gap-1">
            <Search className="size-3.5" />
            بحث
          </button>
        </div>
      </form>

      <PurchaseInvoicesAdmin
        invoices={invoices}
        ingredients={ingredientOptions}
        suppliers={supplierOptions}
      />
    </div>
  );
}
