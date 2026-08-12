"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  PackagePlus,
  Pencil,
  Power,
  PowerOff,
  Printer,
  AlertCircle,
  Trash2,
} from "lucide-react";
import {
  deleteCategory,
  deleteItem,
  deleteItems,
  moveItemsToCategory,
  setCategoryActive,
  setItemActive,
  setItemsActive,
  upsertCategory,
  upsertItem,
} from "@/app/actions/admin";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";
import type { VenueId } from "@/lib/types";
import {
  menuScopeLabel,
  venueIdToScope,
  type MenuVenueScope,
} from "@/lib/menu/scope";
import { formatMoney } from "@/lib/venues";

type CategoryRow = {
  id: number;
  name: string;
  sortOrder: number;
  kitchenPrinterId: number | null;
  restaurantKitchenPrinterId: number | null;
  cafeKitchenPrinterId: number | null;
  active: boolean;
  venueId: string | null;
};

type ItemRow = {
  id: number;
  name: string;
  categoryId: number;
  price: number;
  active: boolean;
  venueId: string | null;
};

type PrinterOption = {
  id: number;
  name: string;
  active: boolean;
  venueId: VenueId | null;
};

type ItemModalState =
  | { mode: "create" }
  | { mode: "edit"; item: ItemRow }
  | null;

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

  const sortedCats = useMemo(
    () => [...cats].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [cats],
  );

  const [selectedId, setSelectedId] = useState<number | null>(
    () => sortedCats[0]?.id ?? null,
  );

  useEffect(() => {
    setSelectedId((current) => {
      if (sortedCats.length === 0) return null;
      if (current && sortedCats.some((c) => c.id === current)) return current;
      return sortedCats[0]!.id;
    });
  }, [sortedCats]);

  useEffect(() => {
    setSelectedItemIds([]);
    setBulkConfirm(null);
  }, [selectedId]);

  const selected = sortedCats.find((c) => c.id === selectedId) ?? null;
  const selectedItems = useMemo(
    () =>
      selected
        ? allItems.filter((i) => i.categoryId === selected.id)
        : [],
    [allItems, selected],
  );

  const [categoryModal, setCategoryModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; category: CategoryRow }
    | null
  >(null);
  const [categoryScopeDraft, setCategoryScopeDraft] =
    useState<MenuVenueScope>(venueId);

  const [itemModal, setItemModal] = useState<ItemModalState>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState<
    "enable" | "disable" | "delete" | "move" | null
  >(null);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | null>(null);

  const editingCategory =
    categoryModal?.mode === "edit" ? categoryModal.category : null;
  const editingItem = itemModal?.mode === "edit" ? itemModal.item : null;

  function openCategoryCreate() {
    setError(null);
    setCategoryScopeDraft(venueId);
    setCategoryModal({ mode: "create" });
  }

  function openCategoryEdit(category: CategoryRow) {
    setError(null);
    setCategoryScopeDraft(venueIdToScope(category.venueId));
    setCategoryModal({ mode: "edit", category });
  }

  function printerName(id: number | null) {
    if (!id) return null;
    return allKitchenPrinters.find((p) => p.id === id)?.name ?? null;
  }

  function printersForVenue(_target: VenueId, activeOnly = false) {
    // Kitchen printers are shared across venues.
    return allKitchenPrinters.filter(
      (printer) => !activeOnly || printer.active,
    );
  }

  function sharedPrinterSummary(cat: CategoryRow) {
    const restaurant = printerName(cat.restaurantKitchenPrinterId);
    const cafe = printerName(cat.cafeKitchenPrinterId);
    if (restaurant && cafe) return `مطعم: ${restaurant} · كافيه: ${cafe}`;
    if (restaurant) return `مطعم: ${restaurant} · كافيه: لم تُحدَّد`;
    if (cafe) return `مطعم: لم تُحدَّد · كافيه: ${cafe}`;
    return null;
  }

  function sharedHasPrinters(cat: CategoryRow) {
    return Boolean(cat.restaurantKitchenPrinterId || cat.cafeKitchenPrinterId);
  }

  function closeModals() {
    if (pending) return;
    setCategoryModal(null);
    setItemModal(null);
    setBulkConfirm(null);
    setError(null);
  }

  const allVisibleSelected =
    selectedItems.length > 0 &&
    selectedItems.every((item) => selectedItemIds.includes(item.id));

  function toggleItemSelected(id: number) {
    setSelectedItemIds((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedItemIds([]);
      return;
    }
    setSelectedItemIds(selectedItems.map((item) => item.id));
  }

  function runBulkAction() {
    if (!bulkConfirm || selectedItemIds.length === 0) return;
    const ids = selectedItemIds;
    const action = bulkConfirm;
    const targetCategoryId = bulkCategoryId;
    if (action === "move") {
      if (targetCategoryId == null) {
        setError("اختر التصنيف الجديد");
        return;
      }
      if (targetCategoryId === selectedId) {
        setError("الأصناف في هذا التصنيف بالفعل");
        return;
      }
    }
    startTransition(async () => {
      setError(null);
      const result =
        action === "delete"
          ? await deleteItems(ids)
          : action === "move"
            ? await moveItemsToCategory(ids, targetCategoryId!)
            : await setItemsActive(ids, action === "enable");
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setBulkConfirm(null);
      setSelectedItemIds([]);
      if (action === "move" && targetCategoryId != null) {
        setSelectedId(targetCategoryId);
      }
      router.refresh();
    });
  }

  function submitCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

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
    if (selected && itemModal?.mode === "create") {
      formData.set("categoryId", String(selected.id));
      formData.set("venueScope", venueIdToScope(selected.venueId));
    }

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

  function ScopeBadge({ venueScopeId }: { venueScopeId: string | null }) {
    const scope = venueIdToScope(venueScopeId);
    const tone =
      scope === "shared"
        ? "badge-secondary"
        : scope === "restaurant"
          ? "badge-primary"
          : "badge-accent";
    return (
      <span className={`badge badge-sm ${tone} badge-soft`}>
        {menuScopeLabel(scope)}
      </span>
    );
  }

  function CategoryScopePicker({
    value,
    onChange,
  }: {
    value: MenuVenueScope;
    onChange: (scope: MenuVenueScope) => void;
  }) {
    const options: { id: MenuVenueScope; label: string; hint: string }[] = [
      {
        id: "restaurant",
        label: "مطعم فقط",
        hint: "يظهر في المطعم",
      },
      {
        id: "cafe",
        label: "كافيه فقط",
        hint: "يظهر في الكافيه",
      },
      {
        id: "shared",
        label: "مشترك",
        hint: "مطعم + كافيه معاً",
      },
    ];

    return (
      <div className="space-y-2">
        <p className="text-sm font-black">أين يظهر هذا التصنيف؟</p>
        <input type="hidden" name="venueScope" value={value} />
        <div className="grid grid-cols-3 gap-2">
          {options.map((option) => {
            const active = value === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.id)}
                className={`rounded-xl border px-2 py-3 text-center transition ${
                  active
                    ? "border-primary bg-primary text-primary-content shadow-md"
                    : "border-base-300 bg-base-100 hover:border-primary/40"
                }`}
              >
                <span className="block text-sm font-black">{option.label}</span>
                <span
                  className={`mt-0.5 block text-[10px] leading-tight ${
                    active ? "text-primary-content/80" : "text-base-content/45"
                  }`}
                >
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Quick guide */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "اختر النطاق",
            desc: "مطعم / كافيه / مشترك",
          },
          {
            n: "2",
            title: "أنشئ تصنيفاً",
            desc: "قهوة، إفطار، حلويات…",
          },
          {
            n: "3",
            title: "أضف الأصناف",
            desc: "مرة واحدة للمشترك بين الفرعين",
          },
        ].map((step) => (
          <div
            key={step.n}
            className="flex items-start gap-3 rounded-2xl border border-base-300/70 bg-base-100 p-4"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-black text-primary-content">
              {step.n}
            </span>
            <div>
              <p className="font-black">{step.title}</p>
              <p className="text-xs text-base-content/50">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {kitchenPrinters.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <AlertCircle className="size-5 shrink-0 text-warning" />
          <p className="text-sm">
            أضف طابعات مطبخ من صفحة <strong>الطابعات</strong> قبل ربط
            التصنيفات.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* ── Categories ── */}
        <section className="premium-card rounded-2xl">
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black">التصنيفات</h3>
                <p className="text-xs text-base-content/45">
                  {sortedCats.length} تصنيف — اختر واحداً لإدارة أصنافه
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5 rounded-xl"
                onClick={openCategoryCreate}
              >
                <FolderPlus className="size-4" />
                تصنيف جديد
              </button>
            </div>

            {sortedCats.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base-300 py-12 text-center">
                <FolderOpen className="mx-auto mb-3 size-9 text-base-content/20" />
                <p className="font-bold text-base-content/50">لا توجد تصنيفات</p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm mt-4 rounded-xl"
                  onClick={openCategoryCreate}
                >
                  إنشاء أول تصنيف
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {sortedCats.map((cat) => {
                  const count = allItems.filter(
                    (i) => i.categoryId === cat.id,
                  ).length;
                  const isSelected = cat.id === selectedId;
                  const isShared = cat.venueId == null;
                  const hasPrinter = isShared
                    ? sharedHasPrinters(cat)
                    : !!cat.kitchenPrinterId;
                  const printer = isShared
                    ? sharedPrinterSummary(cat)
                    : printerName(cat.kitchenPrinterId);

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedId(cat.id)}
                      className={`flex min-h-[6.75rem] flex-col justify-between rounded-2xl border p-3.5 text-right transition duration-200 active:scale-[0.98] sm:min-h-[7.25rem] sm:p-4 ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/15"
                          : "border-base-300/70 bg-base-100 hover:border-primary/25 hover:shadow-sm"
                      } ${!cat.active ? "opacity-55" : ""}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={`grid size-9 place-items-center rounded-xl ${
                            isSelected
                              ? "bg-primary text-primary-content"
                              : "bg-base-200 text-secondary"
                          }`}
                        >
                          <FolderOpen className="size-4" />
                        </span>
                        {hasPrinter ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
                        ) : (
                          <AlertCircle className="size-4 shrink-0 text-warning" />
                        )}
                      </span>
                      <span className="mt-2 block min-w-0">
                        <span className="mb-1 inline-flex">
                          <ScopeBadge venueScopeId={cat.venueId} />
                        </span>
                        <span className="block line-clamp-2 text-sm font-black leading-5">
                          {cat.name}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-base-content/45">
                          <span>{count} صنف</span>
                          {printer ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">{printer}</span>
                            </>
                          ) : (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-bold text-warning">
                                بدون طابعة
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── Selected category detail ── */}
        <main className="premium-card flex min-h-[24rem] flex-col overflow-hidden rounded-2xl">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <FolderOpen className="size-10 text-base-content/15" />
              <p className="font-black text-base-content/40">
                اختر تصنيفاً أعلاه
              </p>
            </div>
          ) : (
            <>
              {/* Category header */}
              <div className="border-b border-base-300/60 bg-base-200/30 px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-black">{selected.name}</h3>
                      <ScopeBadge venueScopeId={selected.venueId} />
                      {!selected.active ? (
                        <span className="badge badge-ghost badge-sm">معطّل</span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-content/55">
                      <span className="inline-flex items-center gap-1.5">
                        <Printer className="size-3.5" />
                        {selected.venueId == null
                          ? sharedHasPrinters(selected)
                            ? sharedPrinterSummary(selected)
                            : (
                                <span className="font-bold text-warning">
                                  لم تُحدَّد طابعات الفرعين
                                </span>
                              )
                          : (printerName(selected.kitchenPrinterId) ?? (
                              <span className="font-bold text-warning">
                                لم تُحدَّد طابعة
                              </span>
                            ))}
                      </span>
                      <span>ترتيب: {selected.sortOrder}</span>
                      <span>{selectedItems.length} صنف</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
                      onClick={() => openCategoryEdit(selected)}
                    >
                      <Pencil className="size-3.5" />
                      تعديل التصنيف
                    </button>
                    <ToggleActiveButton
                      active={selected.active}
                      onToggle={async () => {
                        await setCategoryActive(selected.id, !selected.active);
                      }}
                    />
                    <DeleteConfirmButton
                      itemName={selected.name}
                      onDelete={() => deleteCategory(selected.id)}
                    />
                  </div>
                </div>
              </div>

              {/* Items header */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                <p className="font-black">الأصناف</p>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedItemIds.length > 0 ? (
                    <>
                      <span className="text-xs font-bold text-base-content/50">
                        {selectedItemIds.length} محدد
                      </span>
                      <button
                        type="button"
                        className="btn btn-success btn-sm gap-1.5 rounded-lg"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setBulkConfirm("enable");
                        }}
                      >
                        <Power className="size-3.5" />
                        تشغيل
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setBulkConfirm("disable");
                        }}
                      >
                        <PowerOff className="size-3.5" />
                        إيقاف
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm gap-1.5 rounded-lg"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setBulkCategoryId(
                            sortedCats.find((cat) => cat.id !== selectedId)?.id ??
                              null,
                          );
                          setBulkConfirm("move");
                        }}
                      >
                        <FolderInput className="size-3.5" />
                        نقل تصنيف
                      </button>
                      <button
                        type="button"
                        className="btn btn-error btn-outline btn-sm gap-1.5 rounded-lg"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setBulkConfirm("delete");
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        حذف
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1.5 rounded-lg"
                    disabled={!selected.active}
                    onClick={() => {
                      setError(null);
                      setItemModal({ mode: "create" });
                    }}
                  >
                    <PackagePlus className="size-3.5" />
                    إضافة صنف
                  </button>
                </div>
              </div>

              {/* Items list */}
              <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
                {selectedItems.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-base-300 bg-base-100 py-14 text-center">
                    <PackagePlus className="mx-auto mb-2 size-8 text-base-content/20" />
                    <p className="font-bold text-base-content/45">
                      لا أصناف في «{selected.name}» بعد
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm mt-4 gap-1.5 rounded-lg"
                      disabled={!selected.active}
                      onClick={() => setItemModal({ mode: "create" })}
                    >
                      <PackagePlus className="size-3.5" />
                      أضف أول صنف
                    </button>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-base-300/60">
                    <table className="table">
                      <thead>
                        <tr className="bg-base-200/50 text-base-content/50">
                          <th className="w-10">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={allVisibleSelected}
                              onChange={toggleSelectAll}
                              aria-label="تحديد الكل"
                            />
                          </th>
                          <th>اسم الصنف</th>
                          <th>السعر</th>
                          <th className="w-20 text-center">الحالة</th>
                          <th className="w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItems.map((item) => (
                          <tr
                            key={item.id}
                            className={!item.active ? "opacity-45" : ""}
                          >
                            <td>
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={selectedItemIds.includes(item.id)}
                                onChange={() => toggleItemSelected(item.id)}
                                aria-label={`تحديد ${item.name}`}
                              />
                            </td>
                            <td className="font-bold">{item.name}</td>
                            <td className="font-bold text-primary">
                              {formatMoney(item.price)}
                            </td>
                            <td className="text-center">
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
                              <div className="flex justify-end gap-0.5">
                                <button
                                  type="button"
                                  className="btn btn-square btn-ghost btn-xs"
                                  title="تعديل"
                                  onClick={() => {
                                    setError(null);
                                    setItemModal({ mode: "edit", item });
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <ToggleActiveButton
                                  active={item.active}
                                  onToggle={async () => {
                                    await setItemActive(
                                      item.id,
                                      !item.active,
                                    );
                                  }}
                                />
                                <DeleteConfirmButton
                                  itemName={item.name}
                                  onDelete={() => deleteItem(item.id)}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Category modal ── */}
      <AdminModal
        open={categoryModal !== null}
        title={editingCategory ? "تعديل التصنيف" : "تصنيف جديد"}
        onClose={closeModals}
        pending={pending}
      >
        <form onSubmit={submitCategory} className="space-y-4">
          {editingCategory ? (
            <input type="hidden" name="id" value={editingCategory.id} />
          ) : null}
          <CategoryScopePicker
            value={categoryScopeDraft}
            onChange={setCategoryScopeDraft}
          />
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم التصنيف</span>
            <input
              name="name"
              defaultValue={editingCategory?.name ?? ""}
              placeholder="قهوة، إفطار، حلويات…"
              className="input input-bordered w-full"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">ترتيب الظهور</span>
              <input
                name="sortOrder"
                type="number"
                defaultValue={editingCategory?.sortOrder ?? cats.length + 1}
                className="input input-bordered w-full"
                required
              />
            </label>
            {categoryScopeDraft === "shared" ? (
              <input type="hidden" name="kitchenPrinterId" value="" />
            ) : (
              <label className="form-control w-full">
                <span className="label-text mb-2 font-bold">طابعة المطبخ</span>
                <select
                  key={`${categoryScopeDraft}-${editingCategory?.id ?? "new"}`}
                  name="kitchenPrinterId"
                  className="select select-bordered w-full"
                  defaultValue={
                    categoryScopeDraft === "restaurant"
                      ? (editingCategory?.restaurantKitchenPrinterId ??
                        editingCategory?.kitchenPrinterId ??
                        "")
                      : (editingCategory?.cafeKitchenPrinterId ??
                        editingCategory?.kitchenPrinterId ??
                        "")
                  }
                >
                  <option value="">— بدون —</option>
                  {(categoryScopeDraft === venueId
                    ? kitchenPrinters
                    : printersForVenue(categoryScopeDraft, !editingCategory)
                  ).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {!p.active ? " (معطّلة)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {categoryScopeDraft === "shared" ? (
            <div className="space-y-3 rounded-xl border border-secondary/30 bg-secondary/10 p-3">
              <p className="text-xs text-base-content/70">
                <strong className="text-secondary">مشترك:</strong> يظهر في
                المطعم والكافيه. اختر طابعة مطبخ لكل فرع.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="form-control w-full">
                  <span className="label-text mb-2 font-bold">
                    طابعة مطبخ المطعم
                  </span>
                  <select
                    key={`restaurant-${editingCategory?.id ?? "new"}`}
                    name="restaurantKitchenPrinterId"
                    className="select select-bordered w-full"
                    defaultValue={
                      editingCategory?.restaurantKitchenPrinterId ?? ""
                    }
                  >
                    <option value="">— بدون —</option>
                    {printersForVenue("restaurant", !editingCategory).map(
                      (p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {!p.active ? " (معطّلة)" : ""}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="form-control w-full">
                  <span className="label-text mb-2 font-bold">
                    طابعة مطبخ الكافيه
                  </span>
                  <select
                    key={`cafe-${editingCategory?.id ?? "new"}`}
                    name="cafeKitchenPrinterId"
                    className="select select-bordered w-full"
                    defaultValue={editingCategory?.cafeKitchenPrinterId ?? ""}
                  >
                    <option value="">— بدون —</option>
                    {printersForVenue("cafe", !editingCategory).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {!p.active ? " (معطّلة)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}
          {editingCategory ? (
            <p className="rounded-lg bg-base-200/80 px-3 py-2 text-xs text-base-content/55">
              تغيير النطاق إلى <strong>مشترك</strong> يجعل كل أصناف هذا التصنيف
              مشتركة أيضاً.
            </p>
          ) : (
            <p className="rounded-lg bg-base-200/80 px-3 py-2 text-xs text-base-content/55">
              اختر <strong>مشترك</strong> إذا كان التصنيف والأصناف نفسها في
              المطعم والكافيه — بدون تكرار.
            </p>
          )}
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
              {editingCategory ? "حفظ" : "إنشاء"}
            </button>
          </div>
        </form>
      </AdminModal>

      {/* ── Bulk confirm ── */}
      <AdminModal
        open={bulkConfirm !== null}
        title={
          bulkConfirm === "delete"
            ? "تأكيد الحذف"
            : bulkConfirm === "disable"
              ? "تأكيد الإيقاف"
              : bulkConfirm === "move"
                ? "نقل الأصناف"
                : "تأكيد التشغيل"
        }
        onClose={closeModals}
        pending={pending}
      >
        {bulkConfirm === "move" ? (
          <div className="space-y-3">
            <p className="text-sm leading-7 text-base-content/70">
              نقل {selectedItemIds.length} صنفاً إلى تصنيف آخر. نطاق الصنف
              سيطابق التصنيف الجديد.
            </p>
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">التصنيف الجديد</span>
              <select
                className="select select-bordered w-full"
                value={bulkCategoryId ?? ""}
                onChange={(event) =>
                  setBulkCategoryId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">— اختر —</option>
                {sortedCats.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                    {cat.id === selectedId ? " (الحالي)" : ""}
                    {` · ${menuScopeLabel(venueIdToScope(cat.venueId))}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className="text-sm leading-7 text-base-content/70">
            {bulkConfirm === "delete"
              ? `حذف ${selectedItemIds.length} صنفاً نهائياً؟ لا يمكن التراجع.`
              : bulkConfirm === "disable"
                ? `إيقاف ${selectedItemIds.length} صنفاً؟ لن تظهر في شاشات البيع.`
                : `تشغيل ${selectedItemIds.length} صنفاً؟ ستظهر في شاشات البيع.`}
          </p>
        )}
        <ActionFeedback tone="error" message={error} />
        <div className="modal-action mt-4">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={closeModals}
            disabled={pending}
          >
            إلغاء
          </button>
          <button
            type="button"
            className={`btn ${
              bulkConfirm === "delete"
                ? "btn-error"
                : bulkConfirm === "disable"
                  ? "btn-warning"
                  : bulkConfirm === "move"
                    ? "btn-primary"
                    : "btn-success"
            }`}
            disabled={pending}
            onClick={runBulkAction}
          >
            {bulkConfirm === "delete"
              ? "نعم، احذف"
              : bulkConfirm === "disable"
                ? "نعم، أوقف"
                : bulkConfirm === "move"
                  ? "نعم، انقل"
                  : "نعم، شغّل"}
          </button>
        </div>
      </AdminModal>

      {/* ── Item modal ── */}
      <AdminModal
        open={itemModal !== null}
        title={
          editingItem
            ? "تعديل الصنف"
            : selected
              ? `صنف جديد — ${selected.name}`
              : "صنف جديد"
        }
        onClose={closeModals}
        pending={pending}
      >
        <form onSubmit={submitItem} className="space-y-4">
          {editingItem ? (
            <input type="hidden" name="id" value={editingItem.id} />
          ) : null}
          {!editingItem && selected ? (
            <input type="hidden" name="categoryId" value={selected.id} />
          ) : null}
          <div className="rounded-lg bg-base-200/80 px-3 py-2 text-sm">
            النطاق:{" "}
            <strong>
              {menuScopeLabel(
                venueIdToScope(
                  selected?.venueId ?? editingItem?.venueId ?? venueId,
                ),
              )}
            </strong>
            <span className="ms-1 text-xs text-base-content/45">
              (يطابق التصنيف)
            </span>
          </div>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم الصنف</span>
            <input
              name="name"
              defaultValue={editingItem?.name ?? ""}
              placeholder="كابتشينو، فطور شرقي…"
              className="input input-bordered w-full"
              required
            />
          </label>
          {editingItem ? (
            <label className="form-control w-full">
              <span className="label-text mb-2 font-bold">التصنيف</span>
              <select
                name="categoryId"
                className="select select-bordered w-full"
                defaultValue={editingItem.categoryId}
                required
              >
                {cats
                  .filter(
                    (c) =>
                      (c.active || c.id === editingItem.categoryId) &&
                      c.venueId ===
                        (selected?.venueId ?? editingItem.venueId),
                  )
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <div className="rounded-lg bg-base-200/80 px-3 py-2 text-sm">
              التصنيف:{" "}
              <strong>{selected?.name ?? "—"}</strong>
            </div>
          )}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">السعر (د.ل)</span>
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
              {editingItem ? "حفظ" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
