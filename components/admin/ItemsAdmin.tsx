"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Boxes, FolderPlus, PackagePlus, Pencil, Tag } from "lucide-react";
import {
  deleteCategory,
  deleteItem,
  setCategoryActive,
  setItemActive,
  upsertCategory,
  upsertItem,
} from "@/app/actions/admin";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";
import type { VenueId } from "@/lib/types";
import { formatMoney } from "@/lib/venues";

type CategoryRow = {
  id: number;
  name: string;
  sortOrder: number;
  active: boolean;
};

type ItemRow = {
  id: number;
  name: string;
  categoryId: number;
  price: number;
  kitchenPrinterId: number | null;
  active: boolean;
};

type PrinterOption = {
  id: number;
  name: string;
  active: boolean;
};

export function ItemsAdmin({
  venueId,
  categories: cats,
  items: allItems,
  kitchenPrinters,
  allKitchenPrinters,
}: {
  venueId: VenueId;
  categories: CategoryRow[];
  items: ItemRow[];
  kitchenPrinters: PrinterOption[];
  allKitchenPrinters: PrinterOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [categoryModal, setCategoryModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; category: CategoryRow }
    | null
  >(null);

  const [itemModal, setItemModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; item: ItemRow }
    | null
  >(null);

  const editingCategory =
    categoryModal?.mode === "edit" ? categoryModal.category : null;
  const editingItem = itemModal?.mode === "edit" ? itemModal.item : null;

  function closeModals() {
    if (pending) return;
    setCategoryModal(null);
    setItemModal(null);
    setError(null);
  }

  function submitCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("venueId", venueId);

    startTransition(async () => {
      setError(null);
      const result = await upsertCategory(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      closeModals();
      router.refresh();
    });
  }

  function submitItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("venueId", venueId);

    startTransition(async () => {
      setError(null);
      const result = await upsertItem(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      closeModals();
      router.refresh();
    });
  }

  return (
    <>
      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary">
                <Tag className="size-5" />
              </span>
              <div>
                <h3 className="font-black">التصنيفات</h3>
                <p className="text-xs text-base-content/45">مجموعات الأصناف</p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={() => {
                setError(null);
                setCategoryModal({ mode: "create" });
              }}
            >
              <FolderPlus className="size-4" />
              إضافة تصنيف
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الترتيب</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cats.map((cat) => (
                  <tr key={cat.id} className={!cat.active ? "opacity-50" : ""}>
                    <td>{cat.name}</td>
                    <td>{cat.sortOrder}</td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          cat.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {cat.active ? "نشط" : "معطّل"}
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
                            setCategoryModal({ mode: "edit", category: cat });
                          }}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <ToggleActiveButton
                          active={cat.active}
                          onToggle={async () => {
                            await setCategoryActive(cat.id, !cat.active);
                          }}
                        />
                        <DeleteConfirmButton
                          itemName={cat.name}
                          onDelete={() => deleteCategory(cat.id)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {cats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center opacity-60">
                      لا توجد تصنيفات بعد
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
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Boxes className="size-5" />
              </span>
              <div>
                <h3 className="font-black">قائمة الأصناف</h3>
                <p className="text-xs text-base-content/45">
                  اربط كل صنف بطابعة المطبخ
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              disabled={cats.filter((c) => c.active).length === 0}
              onClick={() => {
                setError(null);
                setItemModal({ mode: "create" });
              }}
            >
              <PackagePlus className="size-4" />
              إضافة صنف
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>التصنيف</th>
                  <th>طابعة المطبخ</th>
                  <th>السعر</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allItems.map((item) => {
                  const cat = cats.find((c) => c.id === item.categoryId);
                  const printer = allKitchenPrinters.find(
                    (p) => p.id === item.kitchenPrinterId,
                  );
                  return (
                    <tr
                      key={item.id}
                      className={!item.active ? "opacity-50" : ""}
                    >
                      <td>{item.name}</td>
                      <td>{cat?.name ?? "-"}</td>
                      <td>
                        {printer?.name ?? (
                          <span className="text-warning">غير مربوطة</span>
                        )}
                      </td>
                      <td>{formatMoney(item.price)}</td>
                      <td>
                        <span
                          className={`badge badge-sm ${
                            item.active
                              ? "badge-success badge-soft"
                              : "badge-ghost"
                          }`}
                        >
                          {item.active ? "نشط" : "معطّل"}
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
                              setItemModal({ mode: "edit", item });
                            }}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <ToggleActiveButton
                            active={item.active}
                            onToggle={async () => {
                              await setItemActive(item.id, !item.active);
                            }}
                          />
                          <DeleteConfirmButton
                            itemName={item.name}
                            onDelete={() => deleteItem(item.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {allItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا توجد أصناف بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AdminModal
        open={categoryModal !== null}
        title={editingCategory ? "تعديل تصنيف" : "إضافة تصنيف"}
        onClose={closeModals}
        pending={pending}
      >
        <form onSubmit={submitCategory} className="space-y-4">
          {editingCategory ? (
            <input type="hidden" name="id" value={editingCategory.id} />
          ) : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم التصنيف</span>
            <input
              name="name"
              defaultValue={editingCategory?.name ?? ""}
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">الترتيب</span>
            <input
              name="sortOrder"
              type="number"
              defaultValue={
                editingCategory?.sortOrder ?? cats.length + 1
              }
              className="input input-bordered w-full"
              required
            />
          </label>
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
              {editingCategory ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={itemModal !== null}
        title={editingItem ? "تعديل صنف" : "إضافة صنف"}
        onClose={closeModals}
        pending={pending}
      >
        <form onSubmit={submitItem} className="space-y-4">
          {editingItem ? (
            <input type="hidden" name="id" value={editingItem.id} />
          ) : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم الصنف</span>
            <input
              name="name"
              defaultValue={editingItem?.name ?? ""}
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">التصنيف</span>
            <select
              name="categoryId"
              className="select select-bordered w-full"
              defaultValue={editingItem?.categoryId ?? ""}
              required
            >
              <option value="" disabled>
                اختر التصنيف
              </option>
              {cats
                .filter((c) => c.active || c.id === editingItem?.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">السعر</span>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={editingItem?.price ?? ""}
              className="input input-bordered w-full"
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">طابعة المطبخ</span>
            <select
              name="kitchenPrinterId"
              className="select select-bordered w-full"
              defaultValue={editingItem?.kitchenPrinterId ?? ""}
            >
              <option value="">بدون طابعة مطبخ</option>
              {(editingItem ? allKitchenPrinters : kitchenPrinters).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.active ? " — معطّلة" : ""}
                </option>
              ))}
            </select>
          </label>
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
              {editingItem ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
