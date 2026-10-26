import type Database from "better-sqlite3";

/**
 * Allow printers.venue_id to be NULL (kitchen-only / shared).
 * Does NOT clear or rewrite existing venue assignments.
 */
export function migratePrinterVenueNullable(sqlite: Database.Database) {
  const cols = sqlite.prepare(`PRAGMA table_info(printers)`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const venueCol = cols.find((col) => col.name === "venue_id");
  if (!venueCol || venueCol.notnull !== 1) return;

  sqlite.pragma("foreign_keys = OFF");
  sqlite.exec(`
    BEGIN;
    CREATE TABLE printers__venue_null (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT REFERENCES venues(id),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      auto_print INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO printers__venue_null (
      id, venue_id, name, role, host, port, connection_type, auto_print, active
    )
    SELECT
      id,
      venue_id,
      name,
      role,
      host,
      port,
      COALESCE(connection_type, 'network'),
      COALESCE(auto_print, 0),
      active
    FROM printers;
    DROP TABLE printers;
    ALTER TABLE printers__venue_null RENAME TO printers;
    COMMIT;
  `);
  sqlite.pragma("foreign_keys = ON");
}
