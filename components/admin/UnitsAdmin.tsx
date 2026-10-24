"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lock, Pencil, Plus, Ruler } from "lucide-react";
import {
  deleteUnit,
  setUnitActive,
  upsertUnit,
} from "@/app/actions/units";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";
import { UNIT_KIND_LABELS, type UnitKind } from "@/lib/inventory/rules";

export type UnitRow = {
  id: number;
  name: string;
  kind: UnitKind;
  factorToBase: number;
  builtIn: boolean;
  active: boolean;
  ingredientCount: number;
  itemCount: number;
  purchaseLineCount: number;
};

type UnitModal =
  | { mode: "create" }
  | { mode: "edit"; unit: UnitRow }
  | null;

function baseLabel(kind: UnitKind) {
  return kind === "weight" ? "غرام" : "حبة";
}

function usageText(unit: UnitRow) {
  const parts: string[] = [];
  if (unit.ingredientCount > 0) parts.push(`${unit.ingredientCount} مكوّن`);
  if (unit.itemCount > 0) parts.push(`${unit.itemCount} صنف`);
  if (unit.purchaseLineCount > 0) {
    parts.push(`${unit.purchaseLineCount} بند مشتريات`);
  }
  return parts.length > 0 ? parts.join(" · ") : "غير مستخدمة";
}

export function UnitsAdmin({ units }: { units: UnitRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<UnitModal>(null);
  const [kind, setKind] = useState<UnitKind>("weight");

  const editing = modal?.mode === "edit" ? modal.unit : null;

  function closeModal() {
    if (pending) return;
    setModal(null);
    setError(null);
  }

  function openCreate() {
    setError(null);
    setKind("weight");
    setModal({ mode: "create" });
  }

  function openEdit(unit: UnitRow) {
    setError(null);
    setKind(unit.kind);
    setModal({ mode: "edit", unit });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await upsertUnit(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      closeModal();
      router.refresh();
    });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">إجمالي الوحدات</p>
          <p className="mt-1 text-2xl font-black">{units.length}</p>
        </div>
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">
            وحدات أساسية
          </p>
          <p className="mt-1 text-2xl font-black">
            {units.filter((unit) => unit.builtIn).length}
          </p>
        </div>
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">
            وحدات مخصصة
          </p>
          <p className="mt-1 text-2xl font-black">
            {units.filter((unit) => !unit.builtIn).length}
          </p>
        </div>
      </div>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Ruler className="size-5" />
              </span>
              <div>
                <h3 className="font-black">وحدات القياس</h3>
                <p className="text-xs text-base-content/45">
                  الكيلو = 1000 غرام، الدزينة = 12 حبة — تُستخدم في المخزون
                  والمشتريات والأصناف
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={openCreate}
            >
              <Plus className="size-4" />
              إضافة وحدة
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الوحدة</th>
                  <th>النوع</th>
                  <th>معامل التحويل</th>
                  <th>الاستخدام</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr
                    key={unit.id}
                    className={!unit.active ? "opacity-50" : ""}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{unit.name}</span>
                        {unit.builtIn ? (
                          <span className="badge badge-primary badge-soft badge-sm gap-1">
                            <Lock className="size-3" />
                            أساسية
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {UNIT_KIND_LABELS[unit.kind]}
                      </span>
                    </td>
                    <td className="font-mono text-sm">
                      1 {unit.name} = {unit.factorToBase}{" "}
                      {baseLabel(unit.kind)}
                    </td>
                    <td className="text-xs text-base-content/60">
                      {usageText(unit)}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          unit.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {unit.active ? "نشطة" : "معطّلة"}
                      </span>
                    </td>
                    <td>
                      {unit.builtIn ? (
                        <span className="text-xs text-base-content/35">
                          محمية
                        </span>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="btn btn-square btn-ghost btn-sm"
                            title="تعديل"
                            onClick={() => openEdit(unit)}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <ToggleActiveButton
                            active={unit.active}
                            onToggle={async () => {
                              const result = await setUnitActive(
                                unit.id,
                                !unit.active,
                              );
                              if (result && "error" in result) {
                                window.alert(result.error);
                              }
                            }}
                          />
                          <DeleteConfirmButton
                            itemName={unit.name}
                            onDelete={() => deleteUnit(unit.id)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {units.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا توجد وحدات قياس بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-base-content/45">
            الوحدات المستخدمة في مكونات أو أصناف لا يمكن حذفها أو تغيير معاملها —
            عطّلها إن لم تعد بحاجة لإضافتها لاختيارات جديدة. الوحدات الأساسية
            محمية لأن كل الأرصدة تُخزَّن بوحداتها (غرام / حبة).
          </p>
        </div>
      </section>

      <AdminModal
        open={modal !== null}
        title={editing ? "تعديل وحدة" : "إضافة وحدة"}
        onClose={closeModal}
        pending={pending}
      >
        <form
          key={editing ? `edit-${editing.id}` : "create"}
          onSubmit={submit}
          className="space-y-4"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم الوحدة</span>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              placeholder="كيلو، دزينة، صندوق 12…"
              className="input input-bordered w-full"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">النوع</span>
              <select
                name="kind"
                className="select select-bordered w-full"
                value={kind}
                onChange={(event) => setKind(event.target.value as UnitKind)}
                required
              >
                <option value="weight">وزن (غرام أساس)</option>
                <option value="count">عدد (حبة أساس)</option>
              </select>
            </label>
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">
                معامل التحويل
              </span>
              <input
                name="factorToBase"
                type="number"
                min="1"
                max="1000000"
                step="1"
                defaultValue={editing?.factorToBase ?? ""}
                placeholder={kind === "weight" ? "1000" : "12"}
                className="input input-bordered w-full"
                required
              />
            </label>
          </div>
          <div className="rounded-xl bg-base-200/70 px-3 py-2 text-xs leading-6 text-base-content/60">
            كم {kind === "weight" ? "غراماً" : "حبة"} تحتوي الوحدة الواحدة؟
            مثلاً: كيلو = 1000، دزينة = 12، صندوق 24 = 24. تُخزَّن كل الأرصدة
            داخلياً بالـ{kind === "weight" ? "غرام" : "حبة"} ثم تُعرض بوحدتك
            المختارة.
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
              {editing ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
