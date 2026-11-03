import { asc, desc, eq } from "drizzle-orm";
import {
  Banknote,
  Filter,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { requireAdmin } from "@/app/actions/auth";
import {
  PurchaseInvoicesAdmin,
  type PurchaseInvoiceRow,
  type PurchaseTargetOption,
  type UnitOption,
} from "@/components/admin/PurchaseInvoicesAdmin";
import { PdfDownloadButton } from "@/components/PdfDownloadButton";
import { Pagination } from "@/components/Pagination";
import { PrintReportButton } from "@/components/PrintReportButton";
import { db } from "@/lib/db";
import {
  ingredients,
  items,
  printers,
  suppliers,
  units,
} from "@/lib/db/schema";
import type { UnitKind } from "@/lib/inventory/rules";
import { resolvePageInfo } from "@/lib/pagination";
import {
  countPurchaseInvoices,
  getPurchaseSummary,
} from "@/lib/reports/purchases";
import { formatDateTime, formatMoney } from "@/lib/venues";

export default async function AdminPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    supplier?: string;
    page?: string;
    size?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = {
    q: sp.q,
    from: sp.from,
    to: sp.to,
    supplier: sp.supplier,
  };
  const total = countPurchaseInvoices(filters);
  const info = resolvePageInfo({ page: sp.page, size: sp.size }, total);
  const summary = getPurchaseSummary({
    ...filters,
    limit: info.size,
    offset: info.offset,
  });
  const { totals } = summary;

  const invoices: PurchaseInvoiceRow[] = summary.rows.map((row) => ({
    ...row,
    createdByName: row.createdByName ?? "",
  }));

  const reportFilters = {
    from: summary.from ?? undefined,
    to: summary.to ?? undefined,
    supplier: summary.supplierId ? String(summary.supplierId) : undefined,
    q: summary.q || undefined,
  };

  const activeFilterCount = [
    summary.from,
    summary.to,
    summary.supplierId,
    summary.q,
  ].filter(Boolean).length;

  const rangeLabel = `${summary.fromSql ? formatDateTime(summary.fromSql) : "البداية"} → ${summary.toSql ? formatDateTime(summary.toSql) : "الآن"}`;

  const unitOptions: UnitOption[] = db
    .select()
    .from(units)
    .orderBy(desc(units.builtIn), asc(units.kind), asc(units.factorToBase))
    .all()
    .map((unit) => ({
      id: unit.id,
      name: unit.name,
      kind: unit.kind,
      factorToBase: unit.factorToBase,
      active: unit.active,
    }));

  const ingredientOptions: PurchaseTargetOption[] = db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      active: ingredients.active,
      unitId: ingredients.preferredUnitId,
      unitName: units.name,
      unitKind: units.kind,
      factorToBase: units.factorToBase,
    })
    .from(ingredients)
    .leftJoin(units, eq(ingredients.preferredUnitId, units.id))
    .orderBy(asc(ingredients.name), asc(ingredients.id))
    .all()
    .map((row) => ({
      ...row,
      unitName: row.unitName ?? "غرام",
      unitKind: (row.unitKind ?? "weight") as UnitKind,
      factorToBase: row.factorToBase ?? 1,
    }));

  const trackedItemOptions: PurchaseTargetOption[] = db
    .select({
      id: items.id,
      name: items.name,
      active: items.active,
      unitId: items.unitId,
      unitName: units.name,
      unitKind: units.kind,
      factorToBase: units.factorToBase,
    })
    .from(items)
    .leftJoin(units, eq(items.unitId, units.id))
    .where(eq(items.trackStock, true))
    .orderBy(asc(items.name), asc(items.id))
    .all()
    .map((row) => ({
      ...row,
      unitName: row.unitName ?? "حبة",
      unitKind: (row.unitKind ?? "count") as UnitKind,
      factorToBase: row.factorToBase ?? 1,
    }));

  const supplierOptions = db
    .select({ id: suppliers.id, name: suppliers.name, active: suppliers.active })
    .from(suppliers)
    .orderBy(asc(suppliers.name), asc(suppliers.id))
    .all();

  const reportPrinters = db
    .select({
      id: printers.id,
      name: printers.name,
      connectionType: printers.connectionType,
      venueId: printers.venueId,
    })
    .from(printers)
    .where(eq(printers.active, true))
    .orderBy(asc(printers.name), asc(printers.id))
    .all();

  const preferredPrinters = [
    ...reportPrinters.filter((printer) => printer.venueId === "restaurant"),
    ...reportPrinters.filter((printer) => printer.venueId === "cafe"),
  ];

  return (
    <div className="space-y-7">
      <section className="premium-card card overflow-hidden">
        <div className="card-body gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ShoppingCart className="size-6" />
              </span>
              <div>
                <h2 className="text-2xl font-black sm:text-3xl">
                  فواتير المشتريات
                </h2>
                <p className="text-sm text-base-content/45">
                  {totals.invoiceCount} فاتورة · {formatMoney(totals.totalSpent)}{" "}
                  · مخزون المطعم والكافيه
                </p>
                <p className="mt-1 text-xs font-bold text-base-content/40">
                  {rangeLabel}
                  {summary.supplierName ? ` · ${summary.supplierName}` : ""}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <PrintReportButton
                filters={reportFilters}
                printers={preferredPrinters.map((printer) => ({
                  id: printer.id,
                  name: printer.name,
                  connectionType: printer.connectionType,
                }))}
                report="purchases"
                label="طباعة تقرير المشتريات"
              />
              <PdfDownloadButton
                request={{ document: "purchases", filters: reportFilters }}
                label="تنزيل تقرير المشتريات PDF"
                className="btn btn-sm gap-2 rounded-xl border-white/15 bg-white text-neutral hover:bg-white/90"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "إجمالي المصروف",
            value: formatMoney(totals.totalSpent),
            hint: "مبلغ المشتريات ضمن الفلاتر",
            icon: Banknote,
            color: "bg-success/10 text-success",
          },
          {
            label: "عدد الفواتير",
            value: String(totals.invoiceCount),
            hint: "فواتير مشتريات مطابقة",
            icon: ReceiptText,
            color: "bg-primary/10 text-primary",
          },
          {
            label: "بنود الشراء",
            value: String(totals.lineCount),
            hint: "أسطر المكونات والأصناف",
            icon: PackageSearch,
            color: "bg-info/10 text-info",
          },
          {
            label: "الموردون",
            value: String(totals.supplierCount),
            hint: "موردون ضمن الفترة",
            icon: Truck,
            color: "bg-secondary/10 text-secondary",
          },
        ].map(({ label, value, hint, icon: Icon, color }) => (
          <div key={label} className="premium-card card">
            <div className="card-body flex-row items-center gap-4 p-5">
              <span
                className={`grid size-12 shrink-0 place-items-center rounded-2xl ${color}`}
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-base-content/45">{label}</p>
                <p className="mt-0.5 truncate text-2xl font-black">{value}</p>
                <p className="text-xs text-base-content/35">{hint}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <details
        className="premium-card group card"
        open={activeFilterCount > 0}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Filter className="size-5" />
            </span>
            <span>
              <span className="block font-black">فلاتر المشتريات</span>
              <span className="block text-xs text-base-content/45">
                الفترة والمورد والبحث — اترك التاريخ فارغاً لعرض كل السجل
              </span>
            </span>
          </span>
          {activeFilterCount > 0 ? (
            <span className="badge badge-primary">
              {activeFilterCount} فلتر نشط
            </span>
          ) : (
            <span className="badge badge-ghost">عرض الفلاتر</span>
          )}
        </summary>
        <form
          method="get"
          action="/admin/purchases"
          className="grid gap-3 border-t border-base-300/60 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4"
        >
          {sp.size ? <input type="hidden" name="size" value={sp.size} /> : null}
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">من تاريخ</span>
            <input
              type="date"
              name="from"
              defaultValue={summary.from ?? ""}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">إلى تاريخ</span>
            <input
              type="date"
              name="to"
              defaultValue={summary.to ?? ""}
              className="input input-bordered w-full"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">المورد</span>
            <select
              name="supplier"
              defaultValue={summary.supplierId ?? ""}
              className="select select-bordered w-full"
            >
              <option value="">كل الموردين</option>
              {supplierOptions.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.active ? "" : " (معطّل)"}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1.5 font-bold">
              بحث (رقم، مورد، ملاحظة)
            </span>
            <input
              type="search"
              name="q"
              defaultValue={summary.q}
              placeholder="مثال: 12 أو INV-1234"
              className="input input-bordered w-full"
            />
          </label>
          <div className="flex items-end gap-2 xl:col-span-4">
            <button
              type="submit"
              className="btn btn-primary flex-1 gap-2 sm:flex-none"
            >
              <Search className="size-4" />
              تطبيق الفلاتر
            </button>
            <Link href="/admin/purchases" className="btn btn-ghost gap-2">
              <RotateCcw className="size-4" />
              إعادة ضبط
            </Link>
          </div>
        </form>
      </details>

      <PurchaseInvoicesAdmin
        invoices={invoices}
        ingredients={ingredientOptions}
        trackedItems={trackedItemOptions}
        units={unitOptions}
        suppliers={supplierOptions}
      />

      <Pagination basePath="/admin/purchases" params={sp} info={info} />
    </div>
  );
}
