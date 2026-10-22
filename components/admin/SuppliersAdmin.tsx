"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, Truck } from "lucide-react";
import {
  deleteSupplier,
  setSupplierActive,
  upsertSupplier,
} from "@/app/actions/inventory";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";

export type SupplierRow = {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  invoiceCount: number;
};

type SupplierModal =
  | { mode: "create" }
  | { mode: "edit"; supplier: SupplierRow }
  | null;

export function SuppliersAdmin({ suppliers }: { suppliers: SupplierRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<SupplierModal>(null);

  const editing = modal?.mode === "edit" ? modal.supplier : null;

  function closeModal() {
    if (pending) return;
    setModal(null);
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await upsertSupplier(formData);
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
      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Truck className="size-5" />
              </span>
              <div>
                <h3 className="font-black">الموردون</h3>
                <p className="text-xs text-base-content/45">
                  يُستخدمون في فواتير المشتريات — الاسم والهاتف والملاحظات
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
              إضافة مورد
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الهاتف</th>
                  <th>ملاحظات</th>
                  <th>الفواتير</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className={!supplier.active ? "opacity-50" : ""}
                  >
                    <td className="font-bold">{supplier.name}</td>
                    <td className="font-mono text-sm" dir="ltr">
                      {supplier.phone ?? "—"}
                    </td>
                    <td className="max-w-[16rem] truncate text-sm text-base-content/60">
                      {supplier.notes ?? "—"}
                    </td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {supplier.invoiceCount}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          supplier.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {supplier.active ? "نشط" : "معطّل"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-sm"
                          title="تعديل"
                          onClick={() => {
                            setError(null);
                            setModal({ mode: "edit", supplier });
                          }}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <ToggleActiveButton
                          active={supplier.active}
                          onToggle={async () => {
                            const result = await setSupplierActive(
                              supplier.id,
                              !supplier.active,
                            );
                            if (result && "error" in result) {
                              window.alert(result.error);
                            }
                          }}
                        />
                        <DeleteConfirmButton
                          itemName={supplier.name}
                          onDelete={() => deleteSupplier(supplier.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا يوجد موردون بعد
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
        title={editing ? "تعديل مورد" : "إضافة مورد"}
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
            <span className="label-text mb-2 font-bold">اسم المورد</span>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">الهاتف (اختياري)</span>
            <input
              name="phone"
              defaultValue={editing?.phone ?? ""}
              dir="ltr"
              className="input input-bordered w-full text-left font-mono"
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">ملاحظات (اختياري)</span>
            <textarea
              name="notes"
              defaultValue={editing?.notes ?? ""}
              rows={2}
              className="textarea textarea-bordered w-full"
            />
          </label>
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
