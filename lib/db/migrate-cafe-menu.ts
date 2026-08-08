import type Database from "better-sqlite3";
import { DISPLAY_PRINTER_GROUPS } from "@/lib/reports/groups";

type MenuLine = { name: string; price: number };

const CAFE_MENU: Array<{
  category: string;
  sortOrder: number;
  items: MenuLine[];
}> = [
  {
    category: "الإفطار",
    sortOrder: 2,
    items: [
      { name: "فطور شرقي", price: 120 },
      { name: "فطور تركي", price: 110 },
      { name: "فطور فرنسي", price: 99 },
      { name: "فطور كلاسيك مع البيض", price: 40 },
      { name: "فطور كلاسيكي", price: 20 },
      { name: "فطور باريسي", price: 30 },
      { name: "أومليت عادي", price: 16 },
      { name: "أومليت جبنة", price: 18 },
      { name: "أومليت بالخضار", price: 20 },
      { name: "أومليت بالفطر", price: 22 },
      { name: "شكشوكة", price: 18 },
      { name: "شكشوكة تركية", price: 24 },
      { name: "بيض عيون", price: 12 },
    ],
  },
  {
    category: "مشروبات ساخنة",
    sortOrder: 4,
    items: [
      { name: "كابتشينو", price: 12 },
      { name: "إسبريسو", price: 7 },
      { name: "إسبريسو دبل", price: 10 },
      { name: "سبانش لاتيه", price: 12 },
      { name: "أمريكانو", price: 8 },
      { name: "كافي لاتيه", price: 12 },
      { name: "كافي لاتيه بندق", price: 20 },
      { name: "هوت شوكلت", price: 20 },
      { name: "ميكياتو كراميل", price: 20 },
      { name: "كراميل موكا مثلج", price: 20 },
      { name: "وايت موكا مثلج", price: 20 },
      { name: "كافي لاتيه فانيلا", price: 20 },
      { name: "قهوة عربية", price: 12 },
      { name: "قهوة عربية دبل", price: 13 },
      { name: "آيس سبانش لاتيه", price: 20 },
      { name: "نسكافيه حبوب دبل", price: 11 },
      { name: "نسكافيه حبوب عادية", price: 7 },
      { name: "نسكافيه عادية", price: 8 },
      { name: "نسكافيه تامة عادي", price: 15 },
      { name: "نسكافيه دبل عادي", price: 12 },
      { name: "معدلة ميكياتو", price: 7 },
      { name: "كريمة عادية", price: 7 },
      { name: "نص نص عادية", price: 7 },
      { name: "نص نص دبل", price: 10 },
      { name: "معدلة ميكياتو دبل", price: 10 },
      { name: "كريمة دبل", price: 10 },
      { name: "آيس كراميل ميكياتو", price: 20 },
      { name: "شاي", price: 8 },
    ],
  },
  {
    category: "مشروبات باردة",
    sortOrder: 3,
    items: [
      { name: "شاي مثلج خوخ", price: 15 },
      { name: "شاي مثلج فراولة", price: 15 },
      { name: "شاي مثلج مانجو", price: 15 },
      { name: "شاي مثلج باشن فروت", price: 15 },
      { name: "موهيتو", price: 15 },
      { name: "موهيتو كيوي", price: 20 },
      { name: "موهيتو فراولة", price: 20 },
      { name: "موهيتو فواكه", price: 20 },
      { name: "عصير برتقال", price: 18 },
      { name: "عصير مانجو", price: 20 },
      { name: "عصير فراولة", price: 20 },
      { name: "عصير كوكتيل", price: 25 },
      { name: "ليمون ونعنع", price: 18 },
      { name: "عصير جوافة", price: 25 },
      { name: "عصير توت وفراولة", price: 25 },
      { name: "عصير توت", price: 20 },
      { name: "ميلك شيك فراولة", price: 20 },
      { name: "ميلك شيك فانيلا", price: 20 },
      { name: "ميلك شيك شوكولاتة", price: 20 },
      { name: "ميلك شيك لوتس", price: 25 },
      { name: "ميلك شيك أوريو", price: 25 },
      { name: "مياه", price: 5 },
      { name: "مياه غازية", price: 5 },
      { name: "سفن أب", price: 5 },
      { name: "بيبسي", price: 5 },
      { name: "جرين", price: 5 },
      { name: "شويبس", price: 5 },
    ],
  },
  {
    category: "معجنات",
    sortOrder: 5,
    items: [
      { name: "إكلير كوفي", price: 12 },
      { name: "إكلير شوكولاتة", price: 12 },
      { name: "ميني إكلير كوفي", price: 5 },
      { name: "ميني إكلير شوكولاتة", price: 5 },
      { name: "تارت ليمون", price: 14 },
      { name: "تارت بيكان", price: 20 },
      { name: "تارت توت", price: 20 },
      { name: "تارت مانجو", price: 18 },
      { name: "تارت بندق وموز", price: 20 },
      { name: "فوندو", price: 25 },
      { name: "شوكا ديفا", price: 25 },
      { name: "تيراميسو", price: 18 },
      { name: "براونيز", price: 14 },
      { name: "تروا شوكولات", price: 25 },
      { name: "كيك رويال", price: 23 },
      { name: "موس شوكولاتة", price: 24 },
      { name: "تشيز كيك أوريو", price: 25 },
      { name: "تشيز كيك لوتس", price: 25 },
      { name: "تشيز كيك سان سيباستيان", price: 25 },
      { name: "ميلفاي بيكان", price: 23 },
      { name: "ميلفاي عادي", price: 14 },
      { name: "ميلفاي مانجو", price: 14 },
      { name: "إنجلش كيك فانيلا", price: 12 },
      { name: "إنجلش كيك شوكولاتة", price: 12 },
      { name: "إنجلش كيك بندق وفانيلا", price: 12 },
      { name: "إنجلش كيك ليمون", price: 12 },
      { name: "شارلوت مانجو", price: 24 },
      { name: "رد فلفت كيك", price: 20 },
      { name: "شارلوت فراولة", price: 24 },
      { name: "ماكرون فراولة", price: 20 },
    ],
  },
  {
    category: "فيينوازري",
    sortOrder: 7,
    items: [
      { name: "كوكيز شوكولاتة بالحليب", price: 14 },
      { name: "كوكيز شوكولاتة سوداء", price: 14 },
      { name: "كوكيز صغير", price: 9 },
      { name: "فينانسييه", price: 9 },
      { name: "فينانسييه بيستاشيو", price: 12 },
      { name: "مادلين 12 قطعة", price: 4 },
      { name: "مادلين 20 قطعة", price: 9 },
    ],
  },
];

function pickCafePrinter(
  sqlite: Database.Database,
  kind: "kitchen" | "display",
): number | null {
  const rows = sqlite
    .prepare(
      `SELECT id, name FROM printers
       WHERE venue_id = 'cafe' AND role IN ('kitchen', 'both') AND active = 1
       ORDER BY id`,
    )
    .all() as Array<{ id: number; name: string }>;

  if (rows.length === 0) return null;

  if (kind === "display") {
    const display = rows.find(
      (p) =>
        p.name.includes("دسبلي") ||
        p.name.includes("ديسبلي") ||
        p.name.includes("display") ||
        p.name.includes("Display") ||
        p.name.includes("مشروبات"),
    );
    if (display) return display.id;
    return rows.length > 1 ? rows[rows.length - 1]!.id : rows[0]!.id;
  }

  const kitchen = rows.find(
    (p) => p.name.includes("مطبخ") && !p.name.includes("مشروبات"),
  );
  return kitchen?.id ?? rows[0]!.id;
}

/**
 * Replace cafe menu into report groups: إفطار / مشروبات / معجنات / فيينوازري.
 * Safe to re-run; keeps خبز + ساندويتش categories.
 */
export function migrateCafeMenu(sqlite: Database.Database) {
  const kitchenId = pickCafePrinter(sqlite, "kitchen");
  const displayId = pickCafePrinter(sqlite, "display") ?? kitchenId;
  if (!kitchenId && !displayId) return;

  const keepExtra = ["خبز", "ساندويتش"];
  const foodNames = CAFE_MENU.map((g) => g.category);

  for (const group of CAFE_MENU) {
    const printerId = DISPLAY_PRINTER_GROUPS.has(group.category)
      ? displayId
      : kitchenId;

    let cat = sqlite
      .prepare(
        `SELECT id FROM categories WHERE venue_id = 'cafe' AND name = ?`,
      )
      .get(group.category) as { id: number } | undefined;

    if (!cat) {
      const result = sqlite
        .prepare(
          `INSERT INTO categories (venue_id, name, sort_order, kitchen_printer_id, active)
           VALUES ('cafe', ?, ?, ?, 1)`,
        )
        .run(group.category, group.sortOrder, printerId);
      cat = { id: Number(result.lastInsertRowid) };
    } else {
      sqlite
        .prepare(
          `UPDATE categories
           SET sort_order = ?, kitchen_printer_id = ?, active = 1
           WHERE id = ?`,
        )
        .run(group.sortOrder, printerId, cat.id);
    }

    sqlite.prepare(`UPDATE items SET active = 0 WHERE category_id = ?`).run(cat.id);

    const findInCat = sqlite.prepare(
      `SELECT id FROM items WHERE venue_id = 'cafe' AND category_id = ? AND name = ?`,
    );
    const findAnywhere = sqlite.prepare(
      `SELECT id FROM items WHERE venue_id = 'cafe' AND name = ? LIMIT 1`,
    );
    const updateItem = sqlite.prepare(
      `UPDATE items
       SET price = ?, kitchen_printer_id = NULL, active = 1, category_id = ?
       WHERE id = ?`,
    );
    const insertItem = sqlite.prepare(
      `INSERT INTO items (venue_id, category_id, name, price, kitchen_printer_id, active)
       VALUES ('cafe', ?, ?, ?, NULL, 1)`,
    );

    for (const item of group.items) {
      const existing =
        (findInCat.get(cat.id, item.name) as { id: number } | undefined) ??
        (findAnywhere.get(item.name) as { id: number } | undefined);
      if (existing) {
        updateItem.run(item.price, cat.id, existing.id);
      } else {
        insertItem.run(cat.id, item.name, item.price);
      }
    }
  }

  // Keep only cafe report groups active
  const activeNames = [...foodNames, ...keepExtra];
  sqlite
    .prepare(
      `UPDATE categories SET active = 0
       WHERE venue_id = 'cafe'
         AND name NOT IN (${activeNames.map(() => "?").join(",")})`,
    )
    .run(...activeNames);

  sqlite
    .prepare(
      `UPDATE items SET active = 0
       WHERE venue_id = 'cafe'
         AND category_id IN (
           SELECT id FROM categories WHERE venue_id = 'cafe' AND active = 0
         )`,
    )
    .run();
}
