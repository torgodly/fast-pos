import type Database from "better-sqlite3";
import { DISPLAY_PRINTER_GROUPS } from "@/lib/reports/groups";

type MenuLine = { name: string; price: number };

const CAFE_MENU: Array<{
  category: string;
  sortOrder: number;
  items: MenuLine[];
}> = [
  {
    category: "مشروبات ساخنة",
    sortOrder: 1,
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
      { name: "كافي لاتيه فانيلا", price: 20 },
      { name: "قهوة عربية", price: 12 },
      { name: "قهوة عربية دبل", price: 13 },
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
      { name: "شاي", price: 8 },
    ],
  },
  {
    category: "مشروبات باردة",
    sortOrder: 2,
    items: [
      { name: "كراميل موكا مثلج", price: 20 },
      { name: "وايت موكا مثلج", price: 20 },
      { name: "آيس سبانش لاتيه", price: 20 },
      { name: "آيس كراميل ميكياتو", price: 20 },
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
      { name: "ماء", price: 5 },
      { name: "مشروبات", price: 5 },
      { name: "مياه", price: 5 },
      { name: "مياه غازية", price: 5 },
      { name: "سفن أب", price: 5 },
      { name: "بيبسي", price: 5 },
      { name: "جرين", price: 5 },
      { name: "شويبس", price: 5 },
    ],
  },
  {
    category: "خبز",
    sortOrder: 3,
    items: [
      { name: "خبز السريال", price: 6 },
      { name: "خبز ساندويتش السريال", price: 2 },
      { name: "خبز مني السريال", price: 1 },
      { name: "خبز سوردو السريال", price: 10 },
      { name: "خبز ساندويتش بقيت", price: 2 },
      { name: "خبز مني باقيت", price: 0.5 },
      { name: "خبز باقيت", price: 3 },
      { name: "خبز سوردو باقيت", price: 10 },
      { name: "قمح ساندويتش", price: 2 },
      { name: "قمح باقيت", price: 6 },
      { name: "قمح سوردو", price: 10 },
      { name: "خبز الشباتا", price: 2 },
      { name: "خبز الشباتا خاص", price: 1.5 },
    ],
  },
  {
    category: "كرواسونات",
    sortOrder: 4,
    items: [
      { name: "كرواسون مانقا", price: 18 },
      { name: "كرواسون سادة", price: 7 },
      { name: "كرواسون شكولاطة", price: 9 },
      { name: "كرواسون زبيب", price: 8 },
      { name: "كرواسون لوز", price: 14 },
      { name: "كرواسون لوز وشكلاطة", price: 18 },
      { name: "كرواسون بستاشيو", price: 18 },
      { name: "كرواسون زعتر", price: 9 },
      { name: "كرواسون جبنة", price: 10 },
      { name: "كرواسون ميني جبنة", price: 3 },
      { name: "كرواسون ميني زعتر", price: 3 },
      { name: "كرواسون ميني سادة", price: 2 },
      { name: "كرواسون بيليه", price: 10 },
    ],
  },
  {
    category: "فينيسي",
    sortOrder: 5,
    items: [{ name: "فينيسي 5 قطع", price: 9 }],
  },
  {
    category: "كوكيز",
    sortOrder: 6,
    items: [
      { name: "كوكيز صغير 5 قطع", price: 9 },
      { name: "كوكيز حليب", price: 14 },
      { name: "كوكيز شكلاطة", price: 14 },
    ],
  },
  {
    category: "تارت",
    sortOrder: 7,
    items: [
      { name: "تارت بندق", price: 20 },
      { name: "تارت بيكان", price: 20 },
      { name: "تارت منقا", price: 18 },
      { name: "تارت فول سوداني", price: 20 },
      { name: "تارت مشمش", price: 18 },
      { name: "تارت ليمون", price: 14 },
      { name: "تارت شكلاطة", price: 20 },
      { name: "تارت توت", price: 18 },
      { name: "تارت ميني", price: 8 },
      { name: "تارت موز", price: 18 },
    ],
  },
  {
    category: "فلان",
    sortOrder: 8,
    items: [
      { name: "فلان فانيليا", price: 14 },
      { name: "فلان شكولاطة", price: 15 },
    ],
  },
  {
    category: "كلير",
    sortOrder: 9,
    items: [
      { name: "كلير ميني شكلاطة / كوفي", price: 8 },
      { name: "كلير شكلاطة / كوفي", price: 12 },
    ],
  },
  {
    category: "ملفاي",
    sortOrder: 10,
    items: [
      { name: "ملفاي مانقا", price: 14 },
      { name: "ملفاي كلاسيك", price: 14 },
      { name: "ملفاي بيكان", price: 23 },
      { name: "ملفاي بندق", price: 23 },
    ],
  },
  {
    category: "حلويات",
    sortOrder: 11,
    items: [
      { name: "براونيز", price: 14 },
      { name: "إضافة شكلاطة / عسل", price: 5 },
      { name: "إضافة آيس كريم", price: 10 },
      { name: "سوكسيل", price: 20 },
      { name: "اوبيرا", price: 20 },
      { name: "رويال", price: 25 },
      { name: "تري شوكلت كراميل", price: 25 },
      { name: "شوكو ديفا", price: 20 },
      { name: "فوندوم", price: 25 },
      { name: "سانسبسيال", price: 25 },
    ],
  },
  {
    category: "تشيز كيك",
    sortOrder: 12,
    items: [
      { name: "تشيز كيك لوتس", price: 25 },
      { name: "تشيز كيك اوريو", price: 25 },
      { name: "تشيز كيك توت", price: 25 },
    ],
  },
  {
    category: "انقلش كيك",
    sortOrder: 13,
    items: [
      { name: "انقلش كيك شوكلت", price: 12 },
      { name: "انقلش كيك ليمون", price: 12 },
      { name: "انقلش كيك فانيليا", price: 12 },
      { name: "انقلش كيك شوكلت وبندق", price: 20 },
    ],
  },
  {
    category: "قطع كيك",
    sortOrder: 14,
    items: [
      { name: "قطعة شارلوت مانقا", price: 24 },
      { name: "قطعة رد فلفت", price: 20 },
      { name: "قطعة كيكة جزر", price: 18 },
      { name: "قطعة كيكة بندق", price: 24 },
      { name: "قطعة كيكة موس شوكلت", price: 24 },
    ],
  },
  {
    category: "كيكة كاملة",
    sortOrder: 15,
    items: [
      { name: "كيكة رد فلفت", price: 210 },
      { name: "كيكة جزر", price: 95 },
      { name: "كيكة بندق", price: 150 },
      { name: "كيكة موس شوكلت", price: 150 },
    ],
  },
  {
    category: "سندوتشات",
    sortOrder: 16,
    items: [
      { name: "إضافة جبنة", price: 5 },
      { name: "سندوتش تن", price: 18 },
      { name: "سندوتش دجاج", price: 21 },
      { name: "سندوتش اوميلت", price: 18 },
      { name: "سندوتش ميني كايزر تن", price: 10 },
      { name: "ميني كايزر مايونيز وتن", price: 10 },
      { name: "توست 3 أجبان", price: 18 },
      { name: "توست 3 أجبان سلامي", price: 20 },
      { name: "سندوتش بيستو", price: 18 },
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
 * Replace the cafe menu completely. Restaurant + users/tables are untouched.
 * Safe to re-run on every boot.
 */
export function migrateCafeMenu(sqlite: Database.Database) {
  const kitchenId = pickCafePrinter(sqlite, "kitchen");
  const displayId = pickCafePrinter(sqlite, "display") ?? kitchenId;

  const foodNames = CAFE_MENU.map((g) => g.category);
  const keepItemNames = new Set(
    CAFE_MENU.flatMap((g) => g.items.map((item) => item.name)),
  );

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
       SET price = ?, kitchen_printer_id = NULL, active = 1, category_id = ?, venue_id = 'cafe'
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

  sqlite
    .prepare(
      `UPDATE categories SET active = 0
       WHERE venue_id = 'cafe'
         AND name NOT IN (${foodNames.map(() => "?").join(",")})`,
    )
    .run(...foodNames);

  const keepNames = [...keepItemNames];
  sqlite
    .prepare(
      `UPDATE items SET active = 0
       WHERE venue_id = 'cafe'
         AND name NOT IN (${keepNames.map(() => "?").join(",")})`,
    )
    .run(...keepNames);
}
