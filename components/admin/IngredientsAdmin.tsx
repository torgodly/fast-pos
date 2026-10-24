"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDownUp, Package, Pencil, Plus, Warehouse } from "lucide-react";
import {
  adjustIngredientStock,
  adjustTrackedItemStock,
  deleteIngredient,
  setIngredientActive,
  upsertIngredient,
} from "@/app/actions/inventory";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";
import { useToast } from "@/components/ToastProvider";
import {
  baseToQuantity,
  formatQuantity,
  isLowStock,
  MOVEMENT_KIND_LABELS,
  UNIT_KIND_LABELS,
  type MovementKind,
  type UnitKind,
} from "@/lib/inventory/rules";

export type UnitOption = {
  id: number;
  name: string;
  kind: UnitKind;
  factorToBase: number;
  active: boolean;
};

export type IngredientRow = {
  id: number;
  name: string;
  stockBase: number;
  lowStockBase: number;
  active: boolean;
  unitId: number | null;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

export type TrackedItemRow = {
  id: number;
  name: string;
  stockBase: number;
  lowStockBase: number;
  active: boolean;
  unitId: number | null;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
  categoryName: string | null;
};

export type StockMovementRow = {
  key: string;
  targetType: "ingredient" | "item";
  targetName: string;
  deltaBase: number;
  kind: string;
  userName: string;
  note: string | null;
  createdAt: string;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

type IngredientModal =
  | { mode: "create" }
  | { mode: "edit"; ingredient: IngredientRow }
  | null;

type AdjustTarget = {
  targetType: "ingredient" | "item";
  id: number;
  name: string;
  stockBase: number;
  unitId: number | null;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

function unitOf(row: {
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
}) {
  return {
    name: row.unitName,
    kind: row.unitKind,
    factorToBase: row.factorToBase,
  };
}

function inputNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(3)));
}

export function IngredientsAdmin({
  ingredients,
  trackedItems,
  movements,
  units,
  from,
  to,
}: {
  ingredients: IngredientRow[];
  trackedItems: TrackedItemRow[];
  movements: StockMovementRow[];
  units: UnitOption[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<IngredientModal>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null);
  const [ingredientUnitId, setIngredientUnitId] = useState("");

  const editing = modal?.mode === "edit" ? modal.ingredient : null;

  function closeModals() {
    if (pending) return;
    setModal(null);
    setAdjustTarget(null);
    setError(null);
  }

  function compatibleUnits(kind: UnitKind, currentId: number | null) {
    return units.filter(
      (unit) => unit.kind === kind && (unit.active || unit.id === currentId),
    );
  }

  function defaultUnitId(kind: UnitKind, currentId: number | null) {
    return (
      currentId ??
      units.find(
        (unit) => unit.kind === kind && unit.active && unit.factorToBase === 1,
      )?.id ??
      units.find((unit) => unit.kind === kind && unit.active)?.id ??
      ""
    );
  }

  function submitIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await upsertIngredient(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      closeModals();
      router.refresh();
    });
  }

  function submitAdjust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustTarget) return;
    const formData = new FormData(event.currentTarget);
    const direction = String(formData.get("direction") ?? "in");
    const amount = Number(formData.get("amount"));
    const unitId = Number(formData.get("unitId"));
    const note = String(formData.get("note") ?? "").trim();
    const unit = units.find((row) => row.id === unitId);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("أدخل كمية أكبر من صفر");
      return;
    }
    if (!unit || unit.kind !== adjustTarget.unitKind) {
      setError("اختر وحدة قياس متوافقة");
      return;
    }
    const delta = direction === "out" ? -amount : amount;

    startTransition(async () => {
      setError(null);
      const result =
        adjustTarget.targetType === "ingredient"
          ? await adjustIngredientStock(
              adjustTarget.id,
              delta,
              unitId,
              note || null,
            )
          : await adjustTrackedItemStock(
              adjustTarget.id,
              delta,
              unitId,
              note || null,
            );
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      showToast(
        "success",
        `تم تعديل مخزون «${adjustTarget.name}» — الرصيد: ${
          result && "stockBase" in result && result.stockBase != null
            ? formatQuantity(result.stockBase, unit)
            : "—"
        }`,
      );
      closeModals();
      router.refresh();
    });
  }

  function applyFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const fromValue = String(formData.get("from") ?? "").trim();
    const toValue = String(formData.get("to") ?? "").trim();
    if (fromValue) params.set("from", fromValue);
    if (toValue) params.set("to", toValue);
    router.push(
      params.toString()
        ? `/admin/inventory?${params.toString()}`
        : "/admin/inventory",
    );
  }

  function statusBadges(stockBase: number, lowStockBase: number) {
    const low = isLowStock(stockBase, lowStockBase);
    return (
      <div className="flex flex-wrap gap-1">
        {stockBase < 0 ? (
          <span className="badge badge-error badge-soft badge-sm">سالب</span>
        ) : low ? (
          <span className="badge badge-warning badge-soft badge-sm">منخفض</span>
        ) : (
          <span className="badge badge-success badge-soft badge-sm">جيد</span>
        )}
      </div>
    );
  }

  return (
    <>
      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Warehouse className="size-5" />
              </span>
              <div>
                <h3 className="font-black">المكونات والمخزون</h3>
                <p className="text-xs text-base-content/45">
                  الأرصدة تُخزَّن بالغرام أو الحبة وتُعرض بوحدة كل مكوّن
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={() => {
                setError(null);
                setIngredientUnitId(
                  String(defaultUnitId("weight", null) || ""),
                );
                setModal({ mode: "create" });
              }}
            >
              <Plus className="size-4" />
              إضافة مكوّن
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>المكوّن</th>
                  <th>الوحدة</th>
                  <th>الرصيد</th>
                  <th>حد التنبيه</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ingredient) => (
                  <tr
                    key={ingredient.id}
                    className={!ingredient.active ? "opacity-50" : ""}
                  >
                    <td className="font-bold">{ingredient.name}</td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {ingredient.unitName}
                      </span>
                    </td>
                    <td
                      className={`font-mono font-bold ${
                        ingredient.stockBase < 0
                          ? "text-error"
                          : isLowStock(
                                ingredient.stockBase,
                                ingredient.lowStockBase,
                              )
                            ? "text-warning"
                            : "text-base-content"
                      }`}
                    >
                      {formatQuantity(ingredient.stockBase, unitOf(ingredient))}
                    </td>
                    <td className="text-base-content/60">
                      {ingredient.lowStockBase > 0
                        ? formatQuantity(
                            ingredient.lowStockBase,
                            unitOf(ingredient),
                          )
                        : "—"}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {statusBadges(
                          ingredient.stockBase,
                          ingredient.lowStockBase,
                        )}
                        {!ingredient.active ? (
                          <span className="badge badge-ghost badge-sm">
                            معطّل
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-sm"
                          title="تعديل يدوي للمخزون"
                          onClick={() => {
                            setError(null);
                            setAdjustTarget({
                              targetType: "ingredient",
                              id: ingredient.id,
                              name: ingredient.name,
                              stockBase: ingredient.stockBase,
                              unitId: ingredient.unitId,
                              unitName: ingredient.unitName,
                              unitKind: ingredient.unitKind,
                              factorToBase: ingredient.factorToBase,
                            });
                          }}
                        >
                          <ArrowDownUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-sm"
                          title="تعديل"
                          onClick={() => {
                            setError(null);
                            setIngredientUnitId(
                              String(
                                ingredient.unitId ??
                                  defaultUnitId(
                                    ingredient.unitKind,
                                    null,
                                  ) ??
                                  "",
                              ),
                            );
                            setModal({ mode: "edit", ingredient });
                          }}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <ToggleActiveButton
                          active={ingredient.active}
                          onToggle={async () => {
                            await setIngredientActive(
                              ingredient.id,
                              !ingredient.active,
                            );
                          }}
                        />
                        <DeleteConfirmButton
                          itemName={ingredient.name}
                          onDelete={() => deleteIngredient(ingredient.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {ingredients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا توجد مكونات بعد — أضف مكوّناً أو سجّل فاتورة مشتريات.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary">
                <Package className="size-5" />
              </span>
              <div>
                <h3 className="font-black">أصناف متتبعة المخزون</h3>
                <p className="text-xs text-base-content/45">
                  أصناف بيع تُخصم كميتها من مخزونها الخاص عند الدفع — بلا مكونات
                </p>
              </div>
            </div>
            <Link
              href="/admin/items"
              className="btn btn-ghost btn-sm rounded-xl"
              prefetch={false}
            >
              إدارة الأصناف
            </Link>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>التصنيف</th>
                  <th>الوحدة</th>
                  <th>الرصيد</th>
                  <th>حد التنبيه</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trackedItems.map((item) => (
                  <tr key={item.id} className={!item.active ? "opacity-50" : ""}>
                    <td className="font-bold">{item.name}</td>
                    <td className="text-sm text-base-content/60">
                      {item.categoryName ?? "—"}
                    </td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {item.unitName}
                      </span>
                    </td>
                    <td
                      className={`font-mono font-bold ${
                        item.stockBase < 0
                          ? "text-error"
                          : isLowStock(item.stockBase, item.lowStockBase)
                            ? "text-warning"
                            : "text-base-content"
                      }`}
                    >
                      {formatQuantity(item.stockBase, unitOf(item))}
                    </td>
                    <td className="text-base-content/60">
                      {item.lowStockBase > 0
                        ? formatQuantity(item.lowStockBase, unitOf(item))
                        : "—"}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {statusBadges(item.stockBase, item.lowStockBase)}
                        {!item.active ? (
                          <span className="badge badge-ghost badge-sm">
                            معطّل
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-square btn-ghost btn-sm"
                        title="تعديل يدوي للمخزون"
                        onClick={() => {
                          setError(null);
                          setAdjustTarget({
                            targetType: "item",
                            id: item.id,
                            name: item.name,
                            stockBase: item.stockBase,
                            unitId: item.unitId,
                            unitName: item.unitName,
                            unitKind: item.unitKind,
                            factorToBase: item.factorToBase,
                          });
                        }}
                      >
                        <ArrowDownUp className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {trackedItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center opacity-60">
                      لا أصناف متتبعة بعد — فعّل «تتبع المخزون» من صفحة الأصناف.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-black">حركات المخزون</h3>
              <p className="text-xs text-base-content/45">
                شراء، بيع، تعديل يدوي، وتعديلات الفواتير — للمكونات والأصناف
              </p>
            </div>
            <form
              onSubmit={applyFilter}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-bold">من</span>
                <input
                  type="datetime-local"
                  name="from"
                  defaultValue={from}
                  className="input input-bordered input-sm"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1 text-xs font-bold">إلى</span>
                <input
                  type="datetime-local"
                  name="to"
                  defaultValue={to}
                  className="input input-bordered input-sm"
                />
              </label>
              <button type="submit" className="btn btn-primary btn-sm">
                عرض
              </button>
              <Link
                href="/admin/inventory"
                className="btn btn-ghost btn-sm"
                prefetch={false}
              >
                اليوم
              </Link>
            </form>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>العنصر</th>
                  <th>النوع</th>
                  <th>التغيير</th>
                  <th>الموظف</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.key}>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {movement.createdAt}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{movement.targetName}</span>
                        <span className="badge badge-ghost badge-sm">
                          {movement.targetType === "item" ? "صنف" : "مكوّن"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {MOVEMENT_KIND_LABELS[
                          movement.kind as MovementKind
                        ] ?? movement.kind}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap font-mono font-bold ${
                        movement.deltaBase < 0 ? "text-error" : "text-success"
                      }`}
                    >
                      {movement.deltaBase > 0 ? "+" : ""}
                      {formatQuantity(movement.deltaBase, {
                        name: movement.unitName,
                        kind: movement.unitKind,
                        factorToBase: movement.factorToBase,
                      })}
                    </td>
                    <td className="text-sm">{movement.userName}</td>
                    <td className="max-w-[16rem] truncate text-sm text-base-content/60">
                      {movement.note ?? "—"}
                    </td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا حركات مخزون في هذه الفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AdminModal
        open={modal !== null}
        title={editing ? "تعديل مكوّن" : "إضافة مكوّن"}
        onClose={closeModals}
        pending={pending}
      >
        <form
          key={editing ? `edit-${editing.id}` : "create"}
          onSubmit={submitIngredient}
          className="space-y-4"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم المكوّن</span>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              placeholder="لحم بقري، جبنة موزاريلا…"
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">وحدة القياس</span>
            <select
              name="unitId"
              className="select select-bordered w-full"
              value={ingredientUnitId}
              onChange={(event) =>
                setIngredientUnitId(event.target.value)
              }
              required
            >
              {units
                .filter(
                  (unit) =>
                    unit.active ||
                    unit.id === editing?.unitId ||
                    String(unit.id) === ingredientUnitId,
                )
                .map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} · {UNIT_KIND_LABELS[unit.kind]}
                    {unit.active ? "" : " (معطّلة)"}
                  </option>
                ))}
            </select>
            <span className="label-text mt-1 text-xs text-base-content/45">
              تحدد الوحدة كيفية عرض الرصيد وإدخال الكميات — لا يمكن تغيير نوعها
              بعد وجود رصيد أو حركات.
            </span>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">
              حد التنبيه (بالوحدة المختارة)
            </span>
            <input
              key={`ingredient-low-${ingredientUnitId}`}
              name="lowStockValue"
              type="number"
              min="0"
              step="0.001"
              defaultValue={
                editing
                  ? inputNumber(
                      baseToQuantity(
                        editing.lowStockBase,
                        units.find(
                          (unit) =>
                            String(unit.id) === ingredientUnitId,
                        )?.factorToBase ?? editing.factorToBase,
                      ),
                    )
                  : 0
              }
              className="input input-bordered w-full"
            />
          </label>
          <p className="text-xs text-base-content/45">
            يظهر تنبيه «منخفض» عندما يصل الرصيد إلى هذا الحد أو أقل. صفر = بدون
            تنبيه. الرصيد الفعلي يُضاف من فاتورة مشتريات أو تعديل يدوي.
          </p>
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
              {editing ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={adjustTarget !== null}
        title={
          adjustTarget ? `تعديل مخزون — ${adjustTarget.name}` : "تعديل مخزون"
        }
        onClose={closeModals}
        pending={pending}
      >
        <form onSubmit={submitAdjust} className="space-y-4">
          <div className="rounded-xl bg-base-200/70 px-3 py-2 text-sm">
            الرصيد الحالي:{" "}
            <strong className="font-mono">
              {adjustTarget
                ? formatQuantity(adjustTarget.stockBase, unitOf(adjustTarget))
                : "—"}
            </strong>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="form-control min-w-32 flex-1">
              <span className="label-text mb-2 font-bold">العملية</span>
              <select
                name="direction"
                className="select select-bordered w-full"
                defaultValue="in"
              >
                <option value="in">إضافة للمخزون</option>
                <option value="out">خصم من المخزون</option>
              </select>
            </label>
            <label className="form-control min-w-28 flex-1">
              <span className="label-text mb-2 font-bold">الكمية</span>
              <input
                name="amount"
                type="number"
                min="0.001"
                step="0.001"
                className="input input-bordered w-full"
                required
              />
            </label>
            <label className="form-control min-w-28 flex-1">
              <span className="label-text mb-2 font-bold">الوحدة</span>
              <select
                name="unitId"
                className="select select-bordered w-full"
                defaultValue={
                  adjustTarget
                    ? defaultUnitId(
                        adjustTarget.unitKind,
                        adjustTarget.unitId,
                      )
                    : ""
                }
                required
              >
                {adjustTarget
                  ? compatibleUnits(
                      adjustTarget.unitKind,
                      adjustTarget.unitId,
                    ).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                        {unit.active ? "" : " (معطّلة)"}
                      </option>
                    ))
                  : null}
              </select>
            </label>
          </div>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">ملاحظة (اختياري)</span>
            <input
              name="note"
              placeholder="جرد، تالف، تصحيح…"
              className="input input-bordered w-full"
            />
          </label>
          <p className="text-xs text-base-content/45">
            يُسجَّل التعديل في حركات المخزون باسمك. الرصيد قد يصبح سالباً إذا
            خصمت أكثر من المتاح.
          </p>
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
              تطبيق التعديل
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
