import { and, asc, desc, gte, lte } from "drizzle-orm";
import { AlertTriangle, ArrowDown, Warehouse } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import {
  IngredientsAdmin,
  type IngredientRow,
  type MovementRow,
} from "@/components/admin/IngredientsAdmin";
import { db } from "@/lib/db";
import { ingredientMovements, ingredients } from "@/lib/db/schema";
import { isLowStock } from "@/lib/inventory/rules";
import {
  resolveReportDateRange,
  toDateTimeLocalValue,
} from "@/lib/reports/filters";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveReportDateRange({ venue: "", from: sp.from, to: sp.to });

  const ingredientRows: IngredientRow[] = db
    .select()
    .from(ingredients)
    .orderBy(asc(ingredients.name), asc(ingredients.id))
    .all();

  const movements: MovementRow[] = db
    .select({
      id: ingredientMovements.id,
      ingredientName: ingredientMovements.ingredientName,
      deltaGrams: ingredientMovements.deltaGrams,
      kind: ingredientMovements.kind,
      userName: ingredientMovements.userName,
      note: ingredientMovements.note,
      createdAt: ingredientMovements.createdAt,
    })
    .from(ingredientMovements)
    .where(
      and(
        gte(ingredientMovements.createdAt, range.fromSql),
        lte(ingredientMovements.createdAt, range.toSql),
      ),
    )
    .orderBy(desc(ingredientMovements.createdAt), desc(ingredientMovements.id))
    .limit(200)
    .all();

  const lowCount = ingredientRows.filter((row) =>
    isLowStock(row.stockGrams, row.lowStockGrams),
  ).length;
  const negativeCount = ingredientRows.filter(
    (row) => row.stockGrams < 0,
  ).length;

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Warehouse className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">المخزون</h2>
            <p className="text-sm text-base-content/45">
              مكونات، أرصدة بالغرام، وحركات مسجّلة عند الشراء والبيع
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">المكونات</p>
          <p className="mt-1 text-2xl font-black">{ingredientRows.length}</p>
        </div>
        <div className="premium-card rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-warning">
            <ArrowDown className="size-3.5" />
            منخفض
          </p>
          <p className="mt-1 text-2xl font-black text-warning">{lowCount}</p>
        </div>
        <div className="premium-card rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-error">
            <AlertTriangle className="size-3.5" />
            رصيد سالب
          </p>
          <p className="mt-1 text-2xl font-black text-error">{negativeCount}</p>
        </div>
      </div>

      <IngredientsAdmin
        ingredients={ingredientRows}
        movements={movements}
        from={toDateTimeLocalValue(range.from, "start")}
        to={toDateTimeLocalValue(range.to, "end")}
      />
    </div>
  );
}
