"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BadgeCheck,
  Pencil,
  Plus,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  deleteStaff,
  setStaffActive,
  upsertStaff,
} from "@/app/actions/admin";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";

type StaffRow = {
  id: number;
  name: string;
  role: string;
  active: boolean;
  isMainCashier: boolean;
};

export function StaffAdmin({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; person: StaffRow }
    | null
  >(null);

  const editing = modal?.mode === "edit" ? modal.person : null;

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
      const result = await upsertStaff(formData);
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
        <div className="card-body gap-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-black">الموظفون</h3>
              <p className="text-xs text-base-content/45">
                سفرادجي وكاشير — نفس الفريق في المطعم والكافيه
              </p>
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
              إضافة موظف
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr
                    key={person.id}
                    className={!person.active ? "opacity-50" : ""}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="avatar avatar-placeholder">
                          <div className="w-9 rounded-xl bg-primary/10 text-primary">
                            <UserRound className="mx-auto mt-2 size-4" />
                          </div>
                        </div>
                        <span className="font-bold">{person.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-ghost gap-1.5">
                        {person.role === "waiter" ? (
                          <BadgeCheck className="size-3.5" />
                        ) : (
                          <WalletCards className="size-3.5" />
                        )}
                        {person.role === "waiter"
                          ? "سفرادجي"
                          : person.isMainCashier
                            ? "كاشير رئيسي"
                            : "كاشير"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          person.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {person.active ? "نشط" : "معطّل"}
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
                            setModal({ mode: "edit", person });
                          }}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <ToggleActiveButton
                          active={person.active}
                          onToggle={async () => {
                            await setStaffActive(person.id, !person.active);
                          }}
                        />
                        <DeleteConfirmButton
                          itemName={person.name}
                          onDelete={() => deleteStaff(person.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center opacity-60">
                      لا يوجد موظفون بعد
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
        title={editing ? "تعديل موظف" : "إضافة موظف"}
        onClose={closeModal}
        pending={pending}
      >
        <form onSubmit={submit} className="space-y-4">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">الاسم</span>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">الدور</span>
            <select
              name="role"
              className="select select-bordered w-full"
              defaultValue={editing?.role ?? "waiter"}
              required
            >
              <option value="waiter">سفرادجي</option>
              <option value="cashier">كاشير</option>
            </select>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">
              {editing ? "رمز PIN جديد (اختياري)" : "رمز PIN"}
            </span>
            <input
              name="pin"
              placeholder={editing ? "اتركه فارغاً للإبقاء على الرمز" : "4-6 أرقام"}
              className="input input-bordered w-full font-mono"
              pattern={editing ? undefined : "\\d{4,6}"}
              required={!editing}
            />
          </label>
          <label className="label cursor-pointer justify-start gap-3 rounded-xl border border-base-300/70 px-3 py-2.5">
            <input
              type="checkbox"
              name="isMainCashier"
              className="checkbox checkbox-primary"
              defaultChecked={editing?.isMainCashier ?? false}
            />
            <span className="label-text font-bold">
              كاشير رئيسي (فتح/إقفال الوردية وطباعة X و Z)
            </span>
          </label>
          <p className="text-xs text-base-content/45">
            يمكن تعيين كاشير رئيسي واحد فقط — التعيين الجديد يلغي السابق
          </p>
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
