import { and, asc, desc, eq, gte, like, lte } from "drizzle-orm";
import { AlertTriangle, ArrowDown, Package, Wallet, Warehouse } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import {
  IngredientsAdmin,
  type IngredientRow,
  type StockMovementRow,
  type TrackedItemRow,
  type UnitOption,
} from "@/components/admin/IngredientsAdmin";
import { db } from "@/lib/db";
import {
  categories,
  ingredientMovements,
  ingredients,
  itemMovements,
  items,
  units,
} from "@/lib/db/schema";
import { isLowStock, type UnitKind } from "@/lib/inventory/rules";
import { resolveMovementFilters } from "@/lib/inventory/movements";
import { getInventoryValuation } from "@/lib/inventory/valuation";
import {
  resolveReportDateRange,
  toDateTimeLocalValue,
} from "@/lib/reports/filters";
import { formatMoney } from "@/lib/venues";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    item?: string;
    category?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveReportDateRange({ venue: "", from: sp.from, to: sp.to });
  const movementFilters = resolveMovementFilters({
    item: sp.item,
    category: sp.category,
  });

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

  const ingredientRows: IngredientRow[] = db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      stockBase: ingredients.stockBase,
      lowStockBase: ingredients.lowStockBase,
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

  const trackedItemRows: TrackedItemRow[] = db
    .select({
      id: items.id,
      name: items.name,
      stockBase: items.stockBase,
      lowStockBase: items.lowStockBase,
      active: items.active,
      unitId: items.unitId,
      unitName: units.name,
      unitKind: units.kind,
      factorToBase: units.factorToBase,
      categoryId: categories.id,
      categoryName: categories.name,
    })
    .from(items)
    .leftJoin(units, eq(items.unitId, units.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .where(eq(items.trackStock, true))
    .orderBy(asc(items.name), asc(items.id))
    .all()
    .map((row) => ({
      ...row,
      unitName: row.unitName ?? "حبة",
      unitKind: (row.unitKind ?? "count") as UnitKind,
      factorToBase: row.factorToBase ?? 1,
    }));

  const trackedById = new Map(trackedItemRows.map((row) => [row.id, row]));

  const ingredientMovementConditions = [
    gte(ingredientMovements.createdAt, range.fromSql),
    lte(ingredientMovements.createdAt, range.toSql),
  ];
  if (movementFilters.item) {
    ingredientMovementConditions.push(
      like(ingredientMovements.ingredientName, `%${movementFilters.item}%`),
    );
  }

  const ingredientMovementRows = movementFilters.categoryId
    ? []
    : db
        .select({
          id: ingredientMovements.id,
          targetName: ingredientMovements.ingredientName,
          deltaBase: ingredientMovements.deltaBase,
          kind: ingredientMovements.kind,
          userName: ingredientMovements.userName,
          note: ingredientMovements.note,
          createdAt: ingredientMovements.createdAt,
          unitName: units.name,
          unitKind: units.kind,
          factorToBase: units.factorToBase,
        })
        .from(ingredientMovements)
        .leftJoin(ingredients, eq(ingredientMovements.ingredientId, ingredients.id))
        .leftJoin(units, eq(ingredients.preferredUnitId, units.id))
        .where(and(...ingredientMovementConditions))
        .orderBy(desc(ingredientMovements.createdAt), desc(ingredientMovements.id))
        .limit(200)
        .all();

  const itemMovementConditions = [
    gte(itemMovements.createdAt, range.fromSql),
    lte(itemMovements.createdAt, range.toSql),
  ];
  if (movementFilters.item) {
    itemMovementConditions.push(
      like(itemMovements.itemName, `%${movementFilters.item}%`),
    );
  }
  if (movementFilters.categoryId) {
    itemMovementConditions.push(eq(items.categoryId, movementFilters.categoryId));
  }

  const itemMovementRows = db
    .select({
      id: itemMovements.id,
      itemId: itemMovements.itemId,
      targetName: itemMovements.itemName,
      deltaBase: itemMovements.deltaBase,
      kind: itemMovements.kind,
      userName: itemMovements.userName,
      note: itemMovements.note,
      createdAt: itemMovements.createdAt,
      unitName: itemMovements.unitName,
      unitKind: itemMovements.unitKind,
      factorToBase: itemMovements.factorToBase,
    })
    .from(itemMovements)
    .leftJoin(items, eq(itemMovements.itemId, items.id))
    .where(and(...itemMovementConditions))
    .orderBy(desc(itemMovements.createdAt), desc(itemMovements.id))
    .limit(200)
    .all();

  const movements: StockMovementRow[] = [
    ...ingredientMovementRows.map((row) => ({
      key: `ingredient-${row.id}`,
      targetType: "ingredient" as const,
      targetName: row.targetName,
      deltaBase: row.deltaBase,
      kind: row.kind,
      userName: row.userName,
      note: row.note,
      createdAt: row.createdAt,
      unitName: row.unitName ?? "غرام",
      unitKind: (row.unitKind ?? "weight") as UnitKind,
      factorToBase: row.factorToBase ?? 1,
    })),
    ...itemMovementRows.map((row) => {
      const current =
        row.itemId != null ? trackedById.get(row.itemId) : undefined;
      return {
        key: `item-${row.id}`,
        targetType: "item" as const,
        targetName: row.targetName,
        deltaBase: row.deltaBase,
        kind: row.kind,
        userName: row.userName,
        note: row.note,
        createdAt: row.createdAt,
        unitName: row.unitName ?? current?.unitName ?? "حبة",
        unitKind: (row.unitKind ?? current?.unitKind ?? "count") as UnitKind,
        factorToBase: row.factorToBase ?? current?.factorToBase ?? 1,
      };
    }),
  ]
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key),
    )
    .slice(0, 200);

  const lowCount = [
    ...ingredientRows.map((row) => ({
      stock: row.stockBase,
      low: row.lowStockBase,
    })),
    ...trackedItemRows.map((row) => ({
      stock: row.stockBase,
      low: row.lowStockBase,
    })),
  ].filter((row) => isLowStock(row.stock, row.low)).length;
  const negativeCount = [
    ...ingredientRows.map((row) => row.stockBase),
    ...trackedItemRows.map((row) => row.stockBase),
  ].filter((stock) => stock < 0).length;

  const valuation = getInventoryValuation().summary;

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
              مكونات وأصناف متتبعة بوحدات وزن وعدد، وحركات مسجّلة عند الشراء
              والبيع
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">المكونات</p>
          <p className="mt-1 text-2xl font-black">{ingredientRows.length}</p>
        </div>
        <div className="premium-card rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-secondary">
            <Package className="size-3.5" />
            أصناف متتبعة
          </p>
          <p className="mt-1 text-2xl font-black text-secondary">
            {trackedItemRows.length}
          </p>
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

      <section className="premium-card rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-success/10 text-success">
              <Wallet className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-base-content/45">
                قيمة المخزون (بآخر سعر شراء)
              </p>
              <p className="text-2xl font-black">
                {formatMoney(valuation.total)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-base-content/60">
            <span>
              المكونات{" "}
              <b className="text-base-content">
                {formatMoney(valuation.ingredientValue)}
              </b>
            </span>
            <span>
              الأصناف المتتبعة{" "}
              <b className="text-base-content">
                {formatMoney(valuation.trackedItemValue)}
              </b>
            </span>
            {valuation.unpricedCount > 0 ? (
              <span className="text-warning">
                {valuation.unpricedCount} بلا سعر شراء مسجّل
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <IngredientsAdmin
        ingredients={ingredientRows}
        trackedItems={trackedItemRows}
        movements={movements}
        units={unitOptions}
        from={toDateTimeLocalValue(range.from, "start")}
        to={toDateTimeLocalValue(range.to, "end")}
        item={movementFilters.item}
        category={
          movementFilters.categoryId ? String(movementFilters.categoryId) : ""
        }
      />
    </div>
  );
}
