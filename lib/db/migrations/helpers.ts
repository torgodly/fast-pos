import type Database from "better-sqlite3";

export function tableColumns(sqlite: Database.Database, table: string) {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
}

export function hasColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
) {
  return tableColumns(sqlite, table).some((col) => col.name === column);
}

export function renameColumnIfNeeded(
  sqlite: Database.Database,
  table: string,
  from: string,
  to: string,
) {
  if (!hasColumn(sqlite, table, from) || hasColumn(sqlite, table, to)) return;
  sqlite.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
}

export function addColumnIfMissing(
  sqlite: Database.Database,
  table: string,
  column: string,
  definition: string,
) {
  if (hasColumn(sqlite, table, column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
