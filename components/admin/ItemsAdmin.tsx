"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  PackagePlus,
  Pencil,
  Plus,
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
  getSystemPrinters,
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
import { encodeSystemPrinterRef } from "@/lib/print/system-printer-ref";
import type { SystemPrinter, VenueId } from "@/lib/types";
import {
  menuScopeLabel,
  venueIdToScope,
  type MenuVenueScope,
} from "@/lib/menu/scope";
import { formatMoney } from "@/lib/venues";
import {
  baseToQuantity,
  formatQuantity,
  isLowStock,
  UNIT_KIND_LABELS,
  type UnitKind,
} from "@/lib/inventory/rules";

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
  trackStock: boolean;
  unitId: number | null;
  stockBase: number;
  lowStockBase: number;
  unitName: string | null;
  unitKind: UnitKind | null;
  factorToBase: number | null;
};

type PrinterOption = {
  id: number;
  name: string;
  active: boolean;
  venueId: VenueId | null;
  host: string;
  port: number;
  role?: string;
};

type IngredientOption = {
  id: number;
  name: string;
  active: boolean;
  unitId: number | null;
  unitName: string;
  unitKind: UnitKind;
  factorToBase: number;
};

type UnitOption = {
  id: number;
  name: string;
  kind: UnitKind;
  factorToBase: number;
  active: boolean;
};

type BomRow = {
  ingredientId: string;
  qty: string;
  unitId: string;
};

type BomEntryRow = {
  itemId: number;
  ingredientId: number;
  qtyBase: number;
};

function inputNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(3)));
}

function itemUnit(row: {
  unitName: string | null;
  unitKind: UnitKind | null;
  factorToBase: number | null;
}) {
  const kind: UnitKind = row.unitKind ?? "count";
  return {
    name: row.unitName ?? (kind === "count" ? "حبة" : "غرام"),
    kind,
    factorToBase:
      typeof row.factorToBase === "number" && row.factorToBase > 0
        ? row.factorToBase
        : 1,
  };
}

/** Same kitchen IP listed twice (cashier dept rows) → one choice for kitchen link. */
function dedupeKitchenOptions(rows: PrinterOption[]): PrinterOption[] {
  const byHost = new Map<string, PrinterOption>();
  for (const row of rows) {
    const key = `${row.host}:${row.port}`;
    const existing = byHost.get(key);
    if (!existing) {
      byHost.set(key, row);
      continue;
    }
    // Prefer pure kitchen over checkout+kitchen duplicate rows.
    if (existing.role === "both" && row.role === "kitchen") {
      byHost.set(key, row);
    } else if (existing.role === row.role && row.id < existing.id) {
      byHost.set(key, row);
    }
  }
  return [...byHost.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
}


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
  ingredients,
  units,
  bomByItem,
  counterMode,
}: {
  venueId: VenueId;
  categories: CategoryRow[];
  items: ItemRow[];
  kitchenPrinters: PrinterOption[];
  allKitchenPrinters: PrinterOption[];
  ingredients: IngredientOption[];
  units: UnitOption[];
  bomByItem: BomEntryRow[];
  counterMode: boolean;
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
  const [systemPrinters, setSystemPrinters] = useState<SystemPrinter[]>([]);
  const [systemPrintersStatus, setSystemPrintersStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [systemPrintersError, setSystemPrintersError] = useState<string | null>(
    null,
  );

  const [itemModal, setItemModal] = useState<ItemModalState>(null);
  const [bomDraft, setBomDraft] = useState<BomRow[]>([]);
  const [trackStock, setTrackStock] = useState(false);
  const [stockUnitId, setStockUnitId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState<
    "enable" | "disable" | "delete" | "move" | null
  >(null);

  const defaultStockUnitId = useMemo(() => {
    const preferred =
      units.find(
        (unit) =>
          unit.kind === "count" && unit.factorToBase === 1 && unit.active,
      ) ?? units.find((unit) => unit.active);
    return preferred ? String(preferred.id) : "";
  }, [units]);

  useEffect(() => {
    if (!itemModal) {
      setBomDraft([]);
      return;
    }
    if (itemModal.mode === "create") {
      setBomDraft([]);
      return;
    }
    const rows = bomByItem
      .filter((row) => row.itemId === itemModal.item.id)
      .map((row) => {
        const ingredient = ingredients.find(
          (entry) => entry.id === row.ingredientId,
        );
        return {
          ingredientId: String(row.ingredientId),
          qty: inputNumber(
            baseToQuantity(row.qtyBase, ingredient?.factorToBase ?? 1),
          ),
          unitId: ingredient?.unitId
            ? String(ingredient.unitId)
            : defaultStockUnitId,
        };
      });
    setBomDraft(rows);
  }, [itemModal, bomByItem, ingredients, defaultStockUnitId]);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | null>(null);

  const editingCategory =
    categoryModal?.mode === "edit" ? categoryModal.category : null;
  const editingItem = itemModal?.mode === "edit" ? itemModal.item : null;

  async function loadSystemPrinters() {
    setSystemPrintersStatus("loading");
    setSystemPrintersError(null);
    try {
      const result = await getSystemPrinters();
      if ("error" in result) {
        setSystemPrintersStatus("error");
        setSystemPrintersError(result.error);
        return;
      }
      setSystemPrinters(result.printers);
      setSystemPrintersStatus("ready");
    } catch {
      setSystemPrintersStatus("error");
      setSystemPrintersError("تعذر قراءة طابعات النظام");
    }
  }

  function openCategoryCreate() {
    setError(null);
    setCategoryScopeDraft(venueId);
    setCategoryModal({ mode: "create" });
    void loadSystemPrinters();
  }

  function openCategoryEdit(category: CategoryRow) {
    setError(null);
    setCategoryScopeDraft(venueIdToScope(category.venueId));
    setCategoryModal({ mode: "edit", category });
    void loadSystemPrinters();
  }

  function openItemCreate() {
    setError(null);
    setTrackStock(false);
    setStockUnitId(defaultStockUnitId);
    setItemModal({ mode: "create" });
  }

  function openItemEdit(item: ItemRow) {
    setError(null);
    setTrackStock(item.trackStock);
    setStockUnitId(item.unitId ? String(item.unitId) : defaultStockUnitId);
    setItemModal({ mode: "edit", item });
  }

  function printerName(id: number | null) {
    if (!id) return null;
    return allKitchenPrinters.find((p) => p.id === id)?.name ?? null;
  }

  function printersForVenue(_target: VenueId, activeOnly = false) {
    // Kitchen printers are shared; hide duplicate DB rows for the same IP.
    return dedupeKitchenOptions(
      allKitchenPrinters.filter((printer) => !activeOnly || printer.active),
    );
  }

  const kitchenPrinterChoices = dedupeKitchenOptions(kitchenPrinters);

  const existingKitchenHostPorts = useMemo(
    () =>
      new Set(
        allKitchenPrinters.map(
          (printer) => `${printer.host}:${printer.port}`,
        ),
      ),
    [allKitchenPrinters],
  );

  const systemPrinterChoices = useMemo(
    () =>
      systemPrinters.filter((printer) => {
        if (!printer.host) return true;
        return !existingKitchenHostPorts.has(
          `${printer.host}:${printer.port ?? 9100}`,
        );
      }),
    [systemPrinters, existingKitchenHostPorts],
  );

  function renderSystemPrinterOptions() {
    if (systemPrintersStatus !== "ready" || systemPrinterChoices.length === 0) {
      return null;
    }

    return (
      <optgroup label="طابعات النظام (Windows)">
        {systemPrinterChoices.map((printer) => {
          const value = encodeSystemPrinterRef(printer);
          if (!value) {
            return (
              <option
                key={printer.name}
                value={`local:${printer.name}`}
                disabled
              >
                {printer.name} · USB — غير مدعومة لطباعة المطبخ
              </option>
            );
          }
          return (
            <option key={printer.name} value={value}>
              {printer.name} · {printer.host}:{printer.port ?? 9100}
            </option>
          );
        })}
      </optgroup>
    );
  }

  function renderSystemPrinterHint() {
    if (systemPrintersStatus === "loading") {
      return (
        <p className="flex items-center gap-2 text-xs text-base-content/45">
          <LoaderCircle className="size-3.5 animate-spin" />
          جارٍ قراءة الطابعات المثبتة على السيرفر...
        </p>
      );
    }
    if (systemPrintersStatus === "error") {
      return (
        <p className="text-xs text-warning">
          {systemPrintersError ?? "تعذر قراءة طابعات النظام"} — يمكنك اختيار
          طابعة مضافة.
        </p>
      );
    }
    if (systemPrinters.filter((printer) => printer.host).length === 0) {
      return (
        <p className="text-xs text-base-content/45">
          لا توجد طابعات شبكة مثبتة على السيرفر — طابعات USB لا تصلح لطباعة
          المطبخ.
        </p>
      );
    }
    if (systemPrinterChoices.filter((printer) => printer.host).length === 0) {
      return (
        <p className="text-xs text-base-content/45">
          كل طابعات الشبكة المثبتة مضافة مسبقاً.
        </p>
      );
    }
    return (
      <p className="text-xs text-base-content/45">
        اختيار طابعة شبكة من النظام يضيفها ويربطها بالتصنيف عند الحفظ.
      </p>
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

  function addBomRow() {
    setBomDraft((rows) => [
      ...rows,
      { ingredientId: "", qty: "", unitId: "" },
    ]);
  }

  function updateBomRow(index: number, patch: Partial<BomRow>) {
    setBomDraft((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function updateBomIngredient(index: number, ingredientId: string) {
    const ingredient = ingredients.find(
      (entry) => String(entry.id) === ingredientId,
    );
    setBomDraft((rows) =>
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              ingredientId,
              unitId: ingredient?.unitId ? String(ingredient.unitId) : "",
            }
          : row,
      ),
    );
  }

  function removeBomRow(index: number) {
    setBomDraft((rows) => rows.filter((_, i) => i !== index));
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

    if (trackStock) {
      formData.set("ingredientsJson", "[]");
    } else {
      const bomRows: Array<{
        ingredientId: number;
        qty: number;
        unitId: number;
      }> = [];
      for (const row of bomDraft) {
        if (!row.ingredientId && !row.qty.trim() && !row.unitId) continue;
        const ingredientId = Number(row.ingredientId);
        const qty = Number(row.qty);
        const unitId = Number(row.unitId);
        if (
          !Number.isInteger(ingredientId) ||
          ingredientId <= 0 ||
          !Number.isFinite(qty) ||
          qty <= 0 ||
          !Number.isInteger(unitId) ||
          unitId <= 0
        ) {
          setError("أكمل بيانات مكونات الصنف أو احذف الصفوف الفارغة");
          return;
        }
        bomRows.push({ ingredientId, qty, unitId });
      }
      formData.set("ingredientsJson", JSON.stringify(bomRows));
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

    if (counterMode) {
      return <input type="hidden" name="venueScope" value="restaurant" />;
    }

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
            n: "1",
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

      {kitchenPrinterChoices.length === 0 ? (
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
                    onClick={openItemCreate}
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
                      onClick={openItemCreate}
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
                          <th className="w-32">المخزون</th>
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
                            <td>
                              {item.trackStock ? (
                                <div className="flex flex-col items-start gap-1">
                                  <span
                                    className={`font-mono text-sm font-bold ${
                                      item.stockBase < 0
                                        ? "text-error"
                                        : isLowStock(
                                              item.stockBase,
                                              item.lowStockBase,
                                            )
                                          ? "text-warning"
                                          : ""
                                    }`}
                                  >
                                    {formatQuantity(
                                      item.stockBase,
                                      itemUnit(item),
                                    )}
                                  </span>
                                  {isLowStock(
                                    item.stockBase,
                                    item.lowStockBase,
                                  ) ? (
                                    <span className="badge badge-warning badge-soft badge-xs">
                                      منخفض
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs text-base-content/35">
                                  غير متتبع
                                </span>
                              )}
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
                                  onClick={() => openItemEdit(item)}
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
                    ? kitchenPrinterChoices
                    : printersForVenue(categoryScopeDraft, !editingCategory)
                  ).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.role === "both" ? " · مطبخ+فاتورة" : ""}
                      {!p.active ? " (معطّلة)" : ""}
                    </option>
                  ))}
                  {renderSystemPrinterOptions()}
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
                          {p.role === "both" ? " · مطبخ+فاتورة" : ""}
                          {!p.active ? " (معطّلة)" : ""}
                        </option>
                      ),
                    )}
                    {renderSystemPrinterOptions()}
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
                        {p.role === "both" ? " · مطبخ+فاتورة" : ""}
                        {!p.active ? " (معطّلة)" : ""}
                      </option>
                    ))}
                    {renderSystemPrinterOptions()}
                  </select>
                </label>
              </div>
            </div>
          ) : null}
          {renderSystemPrinterHint()}
          {counterMode ? null : editingCategory ? (
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
          {counterMode ? null : (
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
          )}
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

          <div className="rounded-2xl border border-base-300/70 p-3.5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="trackStock"
                className="checkbox checkbox-primary mt-0.5"
                checked={trackStock}
                onChange={(event) => setTrackStock(event.target.checked)}
              />
              <span>
                <span className="block text-sm font-black">
                  تتبع مخزون هذا الصنف
                </span>
                <span className="mt-0.5 block text-xs leading-6 text-base-content/45">
                  للأصناف الجاهزة للبيع (مشروب معلّب، قطعة جبن…). تُخصم الكمية
                  من رصيد الصنف عند الدفع وتُضاف من فواتير المشتريات.
                </span>
              </span>
            </label>

            {trackStock ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="form-control w-full">
                    <span className="label-text mb-2 font-bold">
                      وحدة البيع/المخزون
                    </span>
                    <select
                      name="unitId"
                      className="select select-bordered w-full"
                      value={stockUnitId}
                      onChange={(event) =>
                        setStockUnitId(event.target.value)
                      }
                      required
                    >
                      {units
                        .filter(
                          (unit) =>
                            unit.active ||
                            String(unit.id) === stockUnitId ||
                            String(unit.id) ===
                              String(editingItem?.unitId ?? ""),
                        )
                        .map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name} · {UNIT_KIND_LABELS[unit.kind]}
                            {unit.active ? "" : " (معطّلة)"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="form-control w-full">
                    <span className="label-text mb-2 font-bold">
                      حد التنبيه (بالوحدة المختارة)
                    </span>
                    <input
                      key={`low-${stockUnitId}`}
                      name="lowStockValue"
                      type="number"
                      min="0"
                      step="0.001"
                      defaultValue={
                        editingItem?.trackStock
                          ? inputNumber(
                              baseToQuantity(
                                editingItem.lowStockBase,
                                units.find(
                                  (unit) =>
                                    String(unit.id) === stockUnitId,
                                )?.factorToBase ??
                                  editingItem.factorToBase ??
                                  1,
                              ),
                            )
                          : 0
                      }
                      className="input input-bordered w-full"
                    />
                  </label>
                </div>
                {editingItem?.trackStock ? (
                  <div className="rounded-xl bg-base-200/70 px-3 py-2 text-sm">
                    الرصيد الحالي:{" "}
                    <strong className="font-mono">
                      {formatQuantity(
                        editingItem.stockBase,
                        itemUnit(editingItem),
                      )}
                    </strong>
                  </div>
                ) : null}
                <p className="text-xs text-base-content/45">
                  تُخصم وحدة بيع واحدة من الرصيد عند كل عملية بيع. لا يمكن
                  تغيير الوحدة أو إيقاف التتبع بعد وجود رصيد أو حركات مخزون.
                </p>
              </div>
            ) : null}
          </div>

          {trackStock ? (
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5 text-sm leading-7 text-base-content/65">
              هذا الصنف يتتبع رصيده مباشرةً، لذا لا يمكن ربط مكونات (BOM) به.
              أوقف تتبع المخزون أولاً إذا أردت استخدام المكونات.
            </div>
          ) : (
            <div className="rounded-2xl border border-base-300/70 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black">مكونات الصنف (BOM)</p>
                  <p className="mt-0.5 text-xs text-base-content/45">
                    كمية المكوّن لكل وحدة تُباع — تُخصم من المخزون عند الدفع
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs gap-1 rounded-lg"
                  onClick={addBomRow}
                  disabled={
                    ingredients.length === 0 ||
                    bomDraft.length >= ingredients.length
                  }
                >
                  <Plus className="size-3.5" />
                  إضافة مكوّن
                </button>
              </div>

              {ingredients.length === 0 ? (
                <p className="mt-3 rounded-xl bg-base-200/60 px-3 py-2 text-xs text-base-content/55">
                  لا توجد مكونات بعد — أضفها من{" "}
                  <Link
                    href="/admin/inventory"
                    className="link link-primary font-bold"
                  >
                    صفحة المخزون
                  </Link>
                  .
                </p>
              ) : bomDraft.length === 0 ? (
                <p className="mt-3 text-xs text-base-content/45">
                  بدون مكونات — المخزون لن يتأثر عند بيع هذا الصنف.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {bomDraft.map((row, index) => {
                    const takenElsewhere = new Set(
                      bomDraft
                        .filter((_, i) => i !== index)
                        .map((other) => other.ingredientId)
                        .filter(Boolean),
                    );
                    const ingredient = ingredients.find(
                      (entry) => String(entry.id) === row.ingredientId,
                    );
                    const rowUnits = ingredient
                      ? units.filter(
                          (unit) =>
                            unit.kind === ingredient.unitKind &&
                            (unit.active ||
                              String(unit.id) === row.unitId),
                        )
                      : [];
                    return (
                      <div
                        key={index}
                        className="grid grid-cols-12 items-center gap-2"
                      >
                        <select
                          className="select select-bordered select-sm col-span-12 sm:col-span-5"
                          value={row.ingredientId}
                          onChange={(event) =>
                            updateBomIngredient(index, event.target.value)
                          }
                        >
                          <option value="">اختر مكوّناً</option>
                          {ingredients
                            .filter(
                              (entry) =>
                                (entry.active ||
                                  String(entry.id) === row.ingredientId) &&
                                !takenElsewhere.has(String(entry.id)),
                            )
                            .map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}
                                {entry.active ? "" : " (معطّل)"}
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={row.qty}
                          onChange={(event) =>
                            updateBomRow(index, { qty: event.target.value })
                          }
                          placeholder="الكمية"
                          className="input input-bordered input-sm col-span-5 sm:col-span-3"
                        />
                        <select
                          className="select select-bordered select-sm col-span-5 sm:col-span-3"
                          value={row.unitId}
                          onChange={(event) =>
                            updateBomRow(index, {
                              unitId: event.target.value,
                            })
                          }
                          disabled={!ingredient}
                          required
                        >
                          {!ingredient ? (
                            <option value="">الوحدة</option>
                          ) : null}
                          {rowUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.name}
                              {unit.active ? "" : " (معطّلة)"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-sm col-span-2 text-error sm:col-span-1"
                          onClick={() => removeBomRow(index)}
                          title="حذف المكوّن"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
              {editingItem ? "حفظ" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
