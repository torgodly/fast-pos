import type Database from "better-sqlite3";
import { findSharedCategory } from "./dedupe-shared-categories";

type MenuLine = { name: string; price: number };

const RESTAURANT_MENU: Array<{
  category: string;
  sortOrder: number;
  items: MenuLine[];
}> = [
  {
    category: "شوربة",
    sortOrder: 1,
    items: [
      { name: "شوربة قمبري", price: 40 },
      { name: "شوربة فواكه البحر", price: 45 },
      { name: "شوربة فطر", price: 30 },
    ],
  },
  {
    category: "السلطات",
    sortOrder: 2,
    items: [
      { name: "سيزر سالاد", price: 40 },
      { name: "جرجير", price: 30 },
      { name: "سلطة إيطالية", price: 45 },
      { name: "سلطة يونانية", price: 40 },
      { name: "سلطة فواكه البحر", price: 45 },
    ],
  },
  {
    category: "الباستا",
    sortOrder: 3,
    items: [
      { name: "بيني أربياتا", price: 50 },
      { name: "بيني ألفريدو", price: 65 },
      { name: "بيني روزي قمبري", price: 75 },
      { name: "سباغيتي فواكه البحر صلصة حمراء", price: 70 },
      { name: "سباغيتي فواكه البحر صلصة بيضاء", price: 70 },
      { name: "رز فواكه البحر", price: 65 },
      { name: "رز بالبازيلاء", price: 75 },
      { name: "بيني أربع أجبان", price: 55 },
      { name: "سباغيتي بولونيز", price: 65 },
      { name: "لازانيا لحم مفروم", price: 65 },
      { name: "ستيك ماشروم دجاج", price: 65 },
      { name: "ستيك دجاج بالبيستو", price: 70 },
      { name: "أرياش لحم خروف", price: 90 },
      { name: "أرياش بقر فرنسية", price: 100 },
      { name: "ستيك ماشروم فيليه", price: 90 },
      { name: "توماهوك", price: 125 },
    ],
  },
  {
    category: "اسماك",
    sortOrder: 4,
    items: [
      { name: "وجبة وراقة مشوية", price: 75 },
      { name: "وجبة جمبري سوتيه فرانس", price: 85 },
    ],
  },
];

/**
 * Replace restaurant food menu with شوربة / السلطات / الباستا / اسماك.
 * Keeps drink categories and their items. Safe to re-run.
 */
export function migrateRestaurantMenu(sqlite: Database.Database) {
  const kitchen = sqlite
    .prepare(
      `SELECT id FROM printers
       WHERE venue_id = 'restaurant' AND role IN ('kitchen', 'both') AND active = 1
         AND (name LIKE '%مطبخ%' AND name NOT LIKE '%مشروبات%')
       ORDER BY id LIMIT 1`,
    )
    .get() as { id: number } | undefined;

  const kitchenId =
    kitchen?.id ??
    (
      sqlite
        .prepare(
          `SELECT id FROM printers
           WHERE venue_id = 'restaurant' AND role IN ('kitchen', 'both') AND active = 1
           ORDER BY id LIMIT 1`,
        )
        .get() as { id: number } | undefined
    )?.id;

  if (!kitchenId) return;

  const foodNames = RESTAURANT_MENU.map((g) => g.category);

  for (const group of RESTAURANT_MENU) {
    if (findSharedCategory(sqlite, group.category)) {
      continue;
    }

    let cat = sqlite
      .prepare(
        `SELECT id FROM categories WHERE venue_id = 'restaurant' AND name = ?`,
      )
      .get(group.category) as { id: number } | undefined;

    if (!cat) {
      const result = sqlite
        .prepare(
          `INSERT INTO categories (venue_id, name, sort_order, kitchen_printer_id, active)
           VALUES ('restaurant', ?, ?, ?, 1)`,
        )
        .run(group.category, group.sortOrder, kitchenId);
      cat = { id: Number(result.lastInsertRowid) };
    } else {
      sqlite
        .prepare(
          `UPDATE categories
           SET sort_order = ?, kitchen_printer_id = ?, active = 1
           WHERE id = ?`,
        )
        .run(group.sortOrder, kitchenId, cat.id);
    }

    // Soft-deactivate current items in this group (keep history FKs)
    sqlite
      .prepare(`UPDATE items SET active = 0 WHERE category_id = ?`)
      .run(cat.id);

    const findItem = sqlite.prepare(
      `SELECT id FROM items
       WHERE venue_id = 'restaurant' AND category_id = ? AND name = ?`,
    );
    const updateItem = sqlite.prepare(
      `UPDATE items
       SET price = ?, kitchen_printer_id = NULL, active = 1, category_id = ?
       WHERE id = ?`,
    );
    const insertItem = sqlite.prepare(
      `INSERT INTO items (venue_id, category_id, name, price, kitchen_printer_id, active)
       VALUES ('restaurant', ?, ?, ?, NULL, 1)`,
    );

    for (const item of group.items) {
      const existing = findItem.get(cat.id, item.name) as
        | { id: number }
        | undefined;
      if (existing) {
        updateItem.run(item.price, cat.id, existing.id);
      } else {
        // Also revive same-named item from another restaurant category
        const anywhere = sqlite
          .prepare(
            `SELECT id FROM items WHERE venue_id = 'restaurant' AND name = ? LIMIT 1`,
          )
          .get(item.name) as { id: number } | undefined;
        if (anywhere) {
          updateItem.run(item.price, cat.id, anywhere.id);
        } else {
          insertItem.run(cat.id, item.name, item.price);
        }
      }
    }
  }

  // Deactivate old cafe-style food groups on restaurant (keep drinks)
  sqlite
    .prepare(
      `UPDATE categories SET active = 0
       WHERE venue_id = 'restaurant'
         AND name NOT IN (${[...foodNames, "مشروبات باردة", "مشروبات ساخنة"].map(() => "?").join(",")})`,
    )
    .run(...foodNames, "مشروبات باردة", "مشروبات ساخنة");

  sqlite
    .prepare(
      `UPDATE items SET active = 0
       WHERE venue_id = 'restaurant'
         AND category_id IN (
           SELECT id FROM categories
           WHERE venue_id = 'restaurant' AND active = 0
         )`,
    )
    .run();
}
