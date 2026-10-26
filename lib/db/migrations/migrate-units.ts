import type Database from "better-sqlite3";
import {
  addColumnIfMissing,
  hasColumn,
  renameColumnIfNeeded,
} from "./helpers";

/**
 * Units v1: canonical stock quantities are base units (gram / piece).
 * Legacy databases store grams only; rename those columns in place so data
 * keeps working, then fill unit snapshots for old purchase lines.
 */
export function migrateUnits(sqlite: Database.Database) {
  renameColumnIfNeeded(sqlite, "ingredients", "stock_grams", "stock_base");
  renameColumnIfNeeded(
    sqlite,
    "ingredients",
    "low_stock_grams",
    "low_stock_base",
  );
  renameColumnIfNeeded(
    sqlite,
    "ingredient_movements",
    "delta_grams",
    "delta_base",
  );
  renameColumnIfNeeded(
    sqlite,
    "item_ingredients",
    "grams_per_unit",
    "qty_base",
  );
  renameColumnIfNeeded(
    sqlite,
    "purchase_invoice_lines",
    "qty_grams",
    "qty_base",
  );
  renameColumnIfNeeded(
    sqlite,
    "purchase_invoice_lines",
    "ingredient_name",
    "target_name",
  );

  addColumnIfMissing(
    sqlite,
    "ingredients",
    "preferred_unit_id",
    "INTEGER REFERENCES units(id)",
  );
  addColumnIfMissing(
    sqlite,
    "items",
    "unit_id",
    "INTEGER REFERENCES units(id)",
  );
  addColumnIfMissing(
    sqlite,
    "items",
    "track_stock",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    sqlite,
    "items",
    "stock_base",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    sqlite,
    "items",
    "low_stock_base",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    sqlite,
    "purchase_invoice_lines",
    "item_id",
    "INTEGER REFERENCES items(id)",
  );
  addColumnIfMissing(
    sqlite,
    "purchase_invoice_lines",
    "unit_id",
    "INTEGER REFERENCES units(id)",
  );
  addColumnIfMissing(sqlite, "purchase_invoice_lines", "unit_name", "TEXT");
  addColumnIfMissing(sqlite, "purchase_invoice_lines", "unit_kind", "TEXT");
  addColumnIfMissing(
    sqlite,
    "purchase_invoice_lines",
    "factor_to_base",
    "INTEGER",
  );

  const builtIns: Array<[string, "weight" | "count", number]> = [
    ["غرام", "weight", 1],
    ["كيلو", "weight", 1000],
    ["حبة", "count", 1],
    ["دزينة", "count", 12],
  ];
  const insertUnit = sqlite.prepare(
    `INSERT OR IGNORE INTO units (name, kind, factor_to_base, built_in, active)
     VALUES (?, ?, ?, 1, 1)`,
  );
  for (const [name, kind, factor] of builtIns) {
    insertUnit.run(name, kind, factor);
  }

  const marker = sqlite
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get("units_v1") as { value: string } | undefined;
  if (marker?.value) return;

  const gram = sqlite
    .prepare(`SELECT id FROM units WHERE name = 'غرام'`)
    .get() as { id: number } | undefined;
  const kilo = sqlite
    .prepare(`SELECT id FROM units WHERE name = 'كيلو'`)
    .get() as { id: number } | undefined;

  if (gram) {
    sqlite
      .prepare(
        `UPDATE ingredients SET preferred_unit_id = ? WHERE preferred_unit_id IS NULL`,
      )
      .run(gram.id);
  }

  if (hasColumn(sqlite, "purchase_invoice_lines", "unit_basis")) {
    sqlite
      .prepare(
        `UPDATE purchase_invoice_lines
         SET unit_name = CASE WHEN unit_basis = 'kg' THEN 'كيلو' ELSE 'غرام' END,
             unit_kind = 'weight',
             factor_to_base = CASE WHEN unit_basis = 'kg' THEN 1000 ELSE 1 END
         WHERE unit_name IS NULL`,
      )
      .run();
    sqlite
      .prepare(
        `UPDATE purchase_invoice_lines
         SET unit_id = CASE WHEN unit_basis = 'kg' THEN ? ELSE ? END
         WHERE unit_id IS NULL`,
      )
      .run(kilo?.id ?? null, gram?.id ?? null);
  } else {
    sqlite
      .prepare(
        `UPDATE purchase_invoice_lines
         SET unit_name = COALESCE(unit_name, 'غرام'),
             unit_kind = COALESCE(unit_kind, 'weight'),
             factor_to_base = COALESCE(factor_to_base, 1)
         WHERE unit_name IS NULL OR unit_kind IS NULL OR factor_to_base IS NULL`,
      )
      .run();
  }

  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run("units_v1", "1");
}
