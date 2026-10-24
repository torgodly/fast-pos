import { asc, desc, sql } from "drizzle-orm";
import { Ruler } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { UnitsAdmin, type UnitRow } from "@/components/admin/UnitsAdmin";
import { db } from "@/lib/db";
import {
  ingredients,
  items,
  purchaseInvoiceLines,
  units,
} from "@/lib/db/schema";

export default async function AdminUnitsPage() {
  await requireAdmin();

  const unitRows = db
    .select()
    .from(units)
    .orderBy(
      desc(units.builtIn),
      asc(units.kind),
      asc(units.factorToBase),
      asc(units.name),
    )
    .all();

  const ingredientCounts = db
    .select({
      unitId: ingredients.preferredUnitId,
      total: sql<number>`count(*)`,
    })
    .from(ingredients)
    .groupBy(ingredients.preferredUnitId)
    .all();
  const itemCounts = db
    .select({ unitId: items.unitId, total: sql<number>`count(*)` })
    .from(items)
    .groupBy(items.unitId)
    .all();
  const purchaseCounts = db
    .select({
      unitId: purchaseInvoiceLines.unitId,
      total: sql<number>`count(*)`,
    })
    .from(purchaseInvoiceLines)
    .groupBy(purchaseInvoiceLines.unitId)
    .all();

  function countMap(
    rows: Array<{ unitId: number | null; total: number }>,
  ): Map<number, number> {
    const map = new Map<number, number>();
    for (const row of rows) {
      if (row.unitId != null) map.set(row.unitId, Number(row.total));
    }
    return map;
  }

  const byIngredient = countMap(ingredientCounts);
  const byItem = countMap(itemCounts);
  const byPurchase = countMap(purchaseCounts);

  const rows: UnitRow[] = unitRows.map((unit) => ({
    id: unit.id,
    name: unit.name,
    kind: unit.kind,
    factorToBase: unit.factorToBase,
    builtIn: unit.builtIn,
    active: unit.active,
    ingredientCount: byIngredient.get(unit.id) ?? 0,
    itemCount: byItem.get(unit.id) ?? 0,
    purchaseLineCount: byPurchase.get(unit.id) ?? 0,
  }));

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Ruler className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">وحدات القياس</h2>
          <p className="text-sm text-base-content/45">
            وحدات الوزن والعدد ومعاملات التحويل — تُربط بالمكونات والأصناف
            والمشتريات
          </p>
        </div>
      </div>

      <UnitsAdmin units={rows} />
    </div>
  );
}
