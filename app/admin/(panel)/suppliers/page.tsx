import { asc, sql } from "drizzle-orm";
import { Truck } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import {
  SuppliersAdmin,
  type SupplierRow,
} from "@/components/admin/SuppliersAdmin";
import { db } from "@/lib/db";
import { purchaseInvoices, suppliers } from "@/lib/db/schema";

export default async function AdminSuppliersPage() {
  await requireAdmin();

  const rows = db
    .select()
    .from(suppliers)
    .orderBy(asc(suppliers.name), asc(suppliers.id))
    .all();

  const counts = db
    .select({
      supplierId: purchaseInvoices.supplierId,
      count: sql<number>`count(*)`,
    })
    .from(purchaseInvoices)
    .groupBy(purchaseInvoices.supplierId)
    .all();

  const countsBySupplier = new Map<number, number>();
  for (const row of counts) {
    if (row.supplierId != null) {
      countsBySupplier.set(row.supplierId, Number(row.count));
    }
  }

  const supplierRows: SupplierRow[] = rows.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    notes: supplier.notes,
    active: supplier.active,
    invoiceCount: countsBySupplier.get(supplier.id) ?? 0,
  }));

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-info/10 text-info">
          <Truck className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">الموردون</h2>
          <p className="text-sm text-base-content/45">
            موردو المكونات المستخدمون في فواتير المشتريات
          </p>
        </div>
      </div>

      <SuppliersAdmin suppliers={supplierRows} />
    </div>
  );
}
