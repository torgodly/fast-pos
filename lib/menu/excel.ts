import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, items } from "@/lib/db/schema";
import {
  parseMenuVenueScope,
  scopeToVenueId,
  venueIdToScope,
  type MenuVenueScope,
} from "@/lib/menu/scope";

const HEADERS = [
  "التصنيف",
  "النطاق",
  "ترتيب التصنيف",
  "التصنيف نشط",
  "الصنف",
  "السعر",
  "الصنف نشط",
] as const;

function scopeLabel(scope: MenuVenueScope) {
  if (scope === "shared") return "مشترك";
  if (scope === "restaurant") return "مطعم";
  return "كافيه";
}

function parseScope(value: unknown): MenuVenueScope | null {
  const raw = String(value ?? "")
    .trim()
    .replace(" فقط", "");
  if (!raw) return null;
  if (raw === "مشترك" || raw === "shared") return "shared";
  if (raw === "مطعم" || raw === "restaurant") return "restaurant";
  if (raw === "كافيه" || raw === "cafe") return "cafe";
  return parseMenuVenueScope(raw);
}

function parseBool(value: unknown, fallback = true) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "نعم", "نشط"].includes(raw)) return true;
  if (["0", "false", "no", "n", "لا", "معطل", "معطّل"].includes(raw)) {
    return false;
  }
  return fallback;
}

export async function buildMenuWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "فاست بوس";
  const sheet = workbook.addWorksheet("القائمة", {
    views: [{ rightToLeft: true }],
  });
  sheet.columns = [
    { header: HEADERS[0], key: "category", width: 22 },
    { header: HEADERS[1], key: "scope", width: 14 },
    { header: HEADERS[2], key: "sort", width: 14 },
    { header: HEADERS[3], key: "catActive", width: 14 },
    { header: HEADERS[4], key: "item", width: 28 },
    { header: HEADERS[5], key: "price", width: 12 },
    { header: HEADERS[6], key: "itemActive", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  const cats = db.select().from(categories).all();
  const allItems = db.select().from(items).all();
  cats.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  for (const cat of cats) {
    const catItems = allItems
      .filter((item) => item.categoryId === cat.id)
      .sort((a, b) => a.id - b.id);
    const scope = scopeLabel(venueIdToScope(cat.venueId));
    if (catItems.length === 0) {
      sheet.addRow({
        category: cat.name,
        scope,
        sort: cat.sortOrder,
        catActive: cat.active ? "نعم" : "لا",
        item: "",
        price: "",
        itemActive: "",
      });
      continue;
    }
    for (const item of catItems) {
      sheet.addRow({
        category: cat.name,
        scope,
        sort: cat.sortOrder,
        catActive: cat.active ? "نعم" : "لا",
        item: item.name,
        price: item.price,
        itemActive: item.active ? "نعم" : "لا",
      });
    }
  }

  return workbook;
}

export type MenuImportSummary = {
  categoriesCreated: number;
  categoriesUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  skipped: number;
  errors: string[];
};

export async function importMenuWorkbook(
  buffer: ArrayBuffer | Buffer,
): Promise<MenuImportSummary> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const summary: MenuImportSummary = {
    categoriesCreated: 0,
    categoriesUpdated: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    skipped: 0,
    errors: [],
  };
  if (!sheet) {
    summary.errors.push("الملف لا يحتوي على ورقة");
    return summary;
  }

  const cache = new Map<string, { id: number; venueId: string | null }>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const categoryName = String(row.getCell(1).value ?? "").trim();
    const scope = parseScope(row.getCell(2).value);
    const sortOrder = Number(row.getCell(3).value ?? 0) || 0;
    const catActive = parseBool(row.getCell(4).value, true);
    const itemName = String(row.getCell(5).value ?? "").trim();
    const priceRaw = row.getCell(6).value;
    const itemActive = parseBool(row.getCell(7).value, true);

    if (!categoryName || !scope) {
      summary.skipped += 1;
      return;
    }

    const venueId = scopeToVenueId(scope);
    const key = `${scope}::${categoryName}`;
    let cat = cache.get(key);
    if (!cat) {
      const existing = db
        .select()
        .from(categories)
        .where(eq(categories.name, categoryName))
        .all()
        .find((row) => row.venueId === venueId);
      if (existing) {
        db.update(categories)
          .set({
            sortOrder,
            active: catActive,
            venueId,
          })
          .where(eq(categories.id, existing.id))
          .run();
        cat = { id: existing.id, venueId };
        summary.categoriesUpdated += 1;
      } else {
        const created = db
          .insert(categories)
          .values({
            name: categoryName,
            venueId,
            sortOrder,
            active: catActive,
            kitchenPrinterId: null,
          })
          .returning()
          .get();
        cat = { id: created.id, venueId };
        summary.categoriesCreated += 1;
      }
      cache.set(key, cat);
    }

    if (!itemName) return;
    const price = Number(priceRaw);
    if (Number.isNaN(price) || price < 0) {
      summary.errors.push(`سطر ${rowNumber}: سعر غير صالح للصنف «${itemName}»`);
      return;
    }

    const existingItem = db
      .select()
      .from(items)
      .where(and(eq(items.categoryId, cat.id), eq(items.name, itemName)))
      .get();

    if (existingItem) {
      db.update(items)
        .set({
          price,
          active: itemActive,
          venueId: cat.venueId,
        })
        .where(eq(items.id, existingItem.id))
        .run();
      summary.itemsUpdated += 1;
    } else {
      db.insert(items)
        .values({
          name: itemName,
          price,
          active: itemActive,
          categoryId: cat.id,
          venueId: cat.venueId,
          kitchenPrinterId: null,
        })
        .run();
      summary.itemsCreated += 1;
    }
  });

  return summary;
}
