"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDownUp, Pencil, Plus, Warehouse } from "lucide-react";
import {
  adjustIngredientStock,
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
  gramsFromQuantity,
  gramsToDisplay,
  isLowStock,
  MOVEMENT_KIND_LABELS,
  type MovementKind,
  type QuantityBasis,
} from "@/lib/inventory/rules";

export type IngredientRow = {
  id: number;
  name: string;
  stockGrams: number;
  lowStockGrams: number;
  active: boolean;
};

export type MovementRow = {
  id: number;
  ingredientName: string;
  deltaGrams: number;
  kind: string;
  userName: string;
  note: string | null;
  createdAt: string;
};

type IngredientModal =
  | { mode: "create" }
  | { mode: "edit"; ingredient: IngredientRow }
  | null;

export function IngredientsAdmin({
  ingredients,
  movements,
  from,
  to,
}: {
  ingredients: IngredientRow[];
  movements: MovementRow[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<IngredientModal>(null);
  const [adjustTarget, setAdjustTarget] = useState<IngredientRow | null>(null);

  const editing = modal?.mode === "edit" ? modal.ingredient : null;

  function closeModals() {
    if (pending) return;
    setModal(null);
    setAdjustTarget(null);
    setError(null);
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
    const basis: QuantityBasis =
      String(formData.get("basis") ?? "g") === "kg" ? "kg" : "g";
    const note = String(formData.get("note") ?? "").trim();
    const grams = gramsFromQuantity(amount, basis);
    if (!Number.isFinite(grams) || grams <= 0) {
      setError("أدخل كمية أكبر من صفر");
      return;
    }
    const delta = direction === "out" ? -grams : grams;

    startTransition(async () => {
      setError(null);
      const result = await adjustIngredientStock(
        adjustTarget.id,
        delta,
        note || null,
      );
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      showToast(
        "success",
        `تم تعديل مخزون «${adjustTarget.name}» — الرصيد: ${
          result && "stockGrams" in result && result.stockGrams != null
            ? gramsToDisplay(result.stockGrams)
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
                  الرصيد بالغرام — يُعرض بالغرام أو الكيلوغرام
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={() => {
                setError(null);
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
                  <th>الرصيد</th>
                  <th>حد التنبيه</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ingredient) => {
                  const low = isLowStock(
                    ingredient.stockGrams,
                    ingredient.lowStockGrams,
                  );
                  const negative = ingredient.stockGrams < 0;
                  return (
                    <tr
                      key={ingredient.id}
                      className={!ingredient.active ? "opacity-50" : ""}
                    >
                      <td className="font-bold">{ingredient.name}</td>
                      <td
                        className={`font-mono font-bold ${
                          negative
                            ? "text-error"
                            : low
                              ? "text-warning"
                              : "text-base-content"
                        }`}
                      >
                        {gramsToDisplay(ingredient.stockGrams)}
                      </td>
                      <td className="text-base-content/60">
                        {ingredient.lowStockGrams > 0
                          ? gramsToDisplay(ingredient.lowStockGrams)
                          : "—"}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {negative ? (
                            <span className="badge badge-error badge-soft badge-sm">
                              سالب
                            </span>
                          ) : low ? (
                            <span className="badge badge-warning badge-soft badge-sm">
                              منخفض
                            </span>
                          ) : (
                            <span className="badge badge-success badge-soft badge-sm">
                              جيد
                            </span>
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
                              setAdjustTarget(ingredient);
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
                  );
                })}
                {ingredients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center opacity-60">
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-black">حركات المخزون</h3>
              <p className="text-xs text-base-content/45">
                شراء، بيع، تعديل يدوي، وتعديلات الفواتير
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
                  <th>المكوّن</th>
                  <th>النوع</th>
                  <th>التغيير</th>
                  <th>الموظف</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {movement.createdAt}
                    </td>
                    <td className="font-bold">{movement.ingredientName}</td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {MOVEMENT_KIND_LABELS[
                          movement.kind as MovementKind
                        ] ?? movement.kind}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap font-mono font-bold ${
                        movement.deltaGrams < 0 ? "text-error" : "text-success"
                      }`}
                    >
                      {movement.deltaGrams > 0 ? "+" : ""}
                      {gramsToDisplay(movement.deltaGrams)}
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
          <div className="flex gap-2">
            <label className="form-control flex-1">
              <span className="label-text mb-2 font-bold">حد التنبيه</span>
              <input
                name="lowStockValue"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing?.lowStockGrams ?? 0}
                className="input input-bordered w-full"
              />
            </label>
            <label className="form-control w-28">
              <span className="label-text mb-2 font-bold">الوحدة</span>
              <select
                name="lowStockBasis"
                className="select select-bordered w-full"
                defaultValue="g"
              >
                <option value="g">غرام</option>
                <option value="kg">كغ</option>
              </select>
            </label>
          </div>
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
              {adjustTarget ? gramsToDisplay(adjustTarget.stockGrams) : "—"}
            </strong>
          </div>
          <div className="flex gap-2">
            <label className="form-control flex-1">
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
            <label className="form-control flex-1">
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
            <label className="form-control w-28">
              <span className="label-text mb-2 font-bold">الوحدة</span>
              <select
                name="basis"
                className="select select-bordered w-full"
                defaultValue="g"
              >
                <option value="g">غرام</option>
                <option value="kg">كغ</option>
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
