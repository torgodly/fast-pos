import type Database from "better-sqlite3";
import {
  DEFAULT_REPORT_GROUP,
  LEGACY_CATEGORY_TO_GROUP,
  REPORT_GROUP_NAMES,
} from "@/lib/reports/groups";

/**
 * Ensure each venue has the 7 Arabic report groups and remaps items
 * from legacy categories. Safe to run repeatedly.
 */
export function migrateReportGroups(sqlite: Database.Database) {
  const venues = sqlite
    .prepare(`SELECT id FROM venues`)
    .all() as Array<{ id: string }>;

  for (const venue of venues) {
    const existing = sqlite
      .prepare(
        `SELECT id, name, kitchen_printer_id FROM categories WHERE venue_id = ?`,
      )
      .all(venue.id) as Array<{
      id: number;
      name: string;
      kitchen_printer_id: number | null;
    }>;

    const kitchenPrinter =
      (
        sqlite
          .prepare(
            `SELECT id FROM printers
             WHERE venue_id = ? AND role IN ('kitchen', 'both') AND active = 1
             ORDER BY name LIMIT 1`,
          )
          .get(venue.id) as { id: number } | undefined
      )?.id ?? null;

    const drinksPrinter =
      (
        sqlite
          .prepare(
            `SELECT id FROM printers
             WHERE venue_id = ? AND role IN ('kitchen', 'both') AND active = 1
             ORDER BY name DESC LIMIT 1`,
          )
          .get(venue.id) as { id: number } | undefined
      )?.id ?? kitchenPrinter;

    const groupIds = new Map<string, number>();

    REPORT_GROUP_NAMES.forEach((name, index) => {
      const found = existing.find((c) => c.name === name);
      if (found) {
        groupIds.set(name, found.id);
        sqlite
          .prepare(
            `UPDATE categories SET sort_order = ?, active = 1 WHERE id = ?`,
          )
          .run(index + 1, found.id);
        return;
      }

      const printerId =
        name === "مشروبات باردة" || name === "مشروبات ساخنة"
          ? drinksPrinter
          : kitchenPrinter;

      const result = sqlite
        .prepare(
          `INSERT INTO categories (venue_id, name, sort_order, kitchen_printer_id, active)
           VALUES (?, ?, ?, ?, 1)`,
        )
        .run(venue.id, name, index + 1, printerId);
      groupIds.set(name, Number(result.lastInsertRowid));
    });

    const defaultGroupId = groupIds.get(DEFAULT_REPORT_GROUP)!;

    for (const cat of existing) {
      if ((REPORT_GROUP_NAMES as readonly string[]).includes(cat.name)) {
        continue;
      }

      const targetName =
        LEGACY_CATEGORY_TO_GROUP[cat.name] ?? DEFAULT_REPORT_GROUP;
      const targetId = groupIds.get(targetName) ?? defaultGroupId;

      sqlite
        .prepare(`UPDATE items SET category_id = ? WHERE category_id = ?`)
        .run(targetId, cat.id);

      sqlite.prepare(`DELETE FROM categories WHERE id = ?`).run(cat.id);
    }

    // Deactivate any extra active categories that are not in the 7 groups
    sqlite
      .prepare(
        `UPDATE categories SET active = 0
         WHERE venue_id = ?
           AND name NOT IN (${REPORT_GROUP_NAMES.map(() => "?").join(",")})`,
      )
      .run(venue.id, ...REPORT_GROUP_NAMES);
  }
}
