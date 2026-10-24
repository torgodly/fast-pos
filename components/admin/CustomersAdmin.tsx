"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Contact, Pencil, Plus } from "lucide-react";
import {
  deleteCustomer,
  setCustomerActive,
  upsertCustomer,
} from "@/app/actions/customers";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";

export type CustomerRow = {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  ordersCount: number;
};

type CustomerModal =
  | { mode: "create" }
  | { mode: "edit"; customer: CustomerRow }
  | null;

export function CustomersAdmin({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<CustomerModal>(null);

  const editing = modal?.mode === "edit" ? modal.customer : null;

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
      const result = await upsertCustomer(formData);
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
                <Contact className="size-5" />
              </span>
              <div>
                <h3 className="font-black">العملاء</h3>
                <p className="text-xs text-base-content/45">
                  يُستخدمون في الفواتير والإيصالات — الاسم والهاتف والملاحظات
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
              إضافة عميل
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
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className={!customer.active ? "opacity-50" : ""}
                  >
                    <td className="font-bold">{customer.name}</td>
                    <td className="font-mono text-sm" dir="ltr">
                      {customer.phone ?? "—"}
                    </td>
                    <td className="max-w-[16rem] truncate text-sm text-base-content/60">
                      {customer.notes ?? "—"}
                    </td>
                    <td>
                      <span className="badge badge-ghost badge-sm">
                        {customer.ordersCount}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          customer.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {customer.active ? "نشط" : "معطّل"}
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
                            setModal({ mode: "edit", customer });
                          }}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <ToggleActiveButton
                          active={customer.active}
                          onToggle={async () => {
                            const result = await setCustomerActive(
                              customer.id,
                              !customer.active,
                            );
                            if (result && "error" in result) {
                              window.alert(result.error);
                            }
                          }}
                        />
                        <DeleteConfirmButton
                          itemName={customer.name}
                          onDelete={() => deleteCustomer(customer.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا يوجد عملاء بعد
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
        title={editing ? "تعديل عميل" : "إضافة عميل"}
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
            <span className="label-text mb-2 font-bold">اسم العميل</span>
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
