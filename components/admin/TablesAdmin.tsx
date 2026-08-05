"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Armchair, Pencil, Plus } from "lucide-react";
import { deleteTable, setTableActive, upsertTable } from "@/app/actions/admin";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";
import type { VenueId } from "@/lib/types";

type TableRow = {
  id: number;
  name: string;
  active: boolean;
};

export function TablesAdmin({
  venueId,
  tables,
}: {
  venueId: VenueId;
  tables: TableRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; table: TableRow }
    | null
  >(null);

  const editing = modal?.mode === "edit" ? modal.table : null;

  function closeModal() {
    if (pending) return;
    setModal(null);
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("venueId", venueId);

    startTransition(async () => {
      setError(null);
      const result = await upsertTable(formData);
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
              <h3 className="font-black">قائمة الطاولات</h3>
              <p className="text-xs text-base-content/45">
                {tables.length} طاولة مسجلة
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
              إضافة طاولة
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {tables.map((table) => (
              <div
                key={table.id}
                className={`group relative overflow-hidden rounded-2xl border p-4 transition ${
                  table.active
                    ? "border-base-300/70 bg-base-100 hover:-translate-y-0.5 hover:border-info/30 hover:shadow-md"
                    : "border-base-300/50 bg-base-200/60 opacity-55"
                }`}
              >
                <div className="mb-5 flex items-start justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-info/10 text-info">
                    <Armchair className="size-5" />
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-circle btn-ghost btn-sm"
                      title="تعديل"
                      onClick={() => {
                        setError(null);
                        setModal({ mode: "edit", table });
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <ToggleActiveButton
                      active={table.active}
                      onToggle={async () => {
                        await setTableActive(table.id, !table.active);
                      }}
                    />
                    <DeleteConfirmButton
                      itemName={table.name}
                      onDelete={() => deleteTable(table.id)}
                    />
                  </div>
                </div>
                <p className="truncate text-lg font-black">{table.name}</p>
                <span
                  className={`badge badge-sm mt-1 ${
                    table.active ? "badge-success badge-soft" : "badge-ghost"
                  }`}
                >
                  {table.active ? "نشطة" : "معطّلة"}
                </span>
              </div>
            ))}
            {tables.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-base-300 p-10 text-center">
                <Armchair className="mx-auto mb-3 size-8 text-base-content/25" />
                <p className="font-bold">لا توجد طاولات بعد</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-4 gap-2"
                  onClick={() => setModal({ mode: "create" })}
                >
                  <Plus className="size-4" />
                  إضافة طاولة
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <AdminModal
        open={modal !== null}
        title={editing ? "تعديل طاولة" : "إضافة طاولة"}
        onClose={closeModal}
        pending={pending}
      >
        <form onSubmit={submit} className="space-y-4">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم الطاولة</span>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              placeholder="طاولة 1"
              className="input input-bordered w-full"
              required
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
