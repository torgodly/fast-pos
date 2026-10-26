import type Database from "better-sqlite3";

export function migratePrinterAutoPrint(sqlite: Database.Database) {
  const columns = sqlite.prepare(`PRAGMA table_info(printers)`).all() as Array<{
    name: string;
  }>;
  if (columns.some((column) => column.name === "auto_print")) return;
  sqlite.exec(
    `ALTER TABLE printers ADD COLUMN auto_print INTEGER NOT NULL DEFAULT 0`,
  );
}
