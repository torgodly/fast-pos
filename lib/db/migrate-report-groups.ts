import type Database from "better-sqlite3";
import {
  DEFAULT_CAFE_GROUP,
  DEFAULT_RESTAURANT_GROUP,
  DISPLAY_PRINTER_GROUPS,
  LEGACY_CATEGORY_TO_GROUP,
  reportGroupsForVenue,
} from "@/lib/reports/groups";
import { findSharedCategory } from "./dedupe-shared-categories";

function pickPrinter(
  sqlite: Database.Database,
  venueId: string,
  kind: "kitchen" | "display",
): number | null {
  const rows = sqlite
    .prepare(
      `SELECT id, name FROM printers
       WHERE venue_id = ? AND role IN ('kitchen', 'both') AND active = 1
       ORDER BY id`,
    )
    .all(venueId) as Array<{ id: number; name: string }>;

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
 * Ensure each venue has its report groups and remaps items.
 * Also fixes category→printer links and clears stale item printer overrides.
 */
export function migrateReportGroups(sqlite: Database.Database) {
  const venues = sqlite
    .prepare(`SELECT id FROM venues`)
    .all() as Array<{ id: string }>;

  for (const venue of venues) {
    const groupNames = reportGroupsForVenue(venue.id);
    const defaultGroup =
      venue.id === "restaurant" ? DEFAULT_RESTAURANT_GROUP : DEFAULT_CAFE_GROUP;

    const existing = sqlite
      .prepare(
        `SELECT id, name, kitchen_printer_id FROM categories WHERE venue_id = ?`,
      )
      .all(venue.id) as Array<{
      id: number;
      name: string;
      kitchen_printer_id: number | null;
    }>;

    const kitchenPrinter = pickPrinter(sqlite, venue.id, "kitchen");
    const displayPrinter =
      pickPrinter(sqlite, venue.id, "display") ?? kitchenPrinter;

    const groupIds = new Map<string, number>();

    groupNames.forEach((name, index) => {
      const printerId = DISPLAY_PRINTER_GROUPS.has(name)
        ? displayPrinter
        : kitchenPrinter;

      const shared = findSharedCategory(sqlite, name);
      if (shared) {
        groupIds.set(name, shared.id);
        return;
      }

      const found = existing.find((c) => c.name === name);
      if (found) {
        groupIds.set(name, found.id);
        sqlite
          .prepare(
            `UPDATE categories
             SET sort_order = ?, active = 1, kitchen_printer_id = ?
             WHERE id = ?`,
          )
          .run(index + 1, printerId, found.id);
        return;
      }

      const result = sqlite
        .prepare(
          `INSERT INTO categories (venue_id, name, sort_order, kitchen_printer_id, active)
           VALUES (?, ?, ?, ?, 1)`,
        )
        .run(venue.id, name, index + 1, printerId);
      groupIds.set(name, Number(result.lastInsertRowid));
    });

    const defaultGroupId = groupIds.get(defaultGroup)!;

    for (const cat of existing) {
      if (groupNames.includes(cat.name)) {
        continue;
      }

      const targetName =
        LEGACY_CATEGORY_TO_GROUP[cat.name] ?? defaultGroup;
      const targetId =
        groupIds.get(targetName) ??
        groupIds.get(defaultGroup) ??
        defaultGroupId;

      sqlite
        .prepare(`UPDATE items SET category_id = ? WHERE category_id = ?`)
        .run(targetId, cat.id);

      sqlite.prepare(`DELETE FROM categories WHERE id = ?`).run(cat.id);
    }

    sqlite
      .prepare(
        `UPDATE categories SET active = 0
         WHERE venue_id = ?
           AND name NOT IN (${groupNames.map(() => "?").join(",")})`,
      )
      .run(venue.id, ...groupNames);

    // Stale item-level printer overrides cause معجنات → مطبخ instead of دسبلي
    sqlite
      .prepare(
        `UPDATE items SET kitchen_printer_id = NULL
         WHERE venue_id = ? AND kitchen_printer_id IS NOT NULL`,
      )
      .run(venue.id);
  }
}
