import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migratePrinterAutoPrint } from "./migrate-printer-auto-print";

function createLegacyPrinters(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO printers (
      venue_id, name, role, host, port, connection_type, active
    )
    VALUES ('restaurant', 'كاشير المطعم', 'checkout', 'default', 0, 'local', 1);
  `);
}

function printerColumns(sqlite: Database.Database) {
  return sqlite.prepare(`PRAGMA table_info(printers)`).all() as Array<{
    name: string;
  }>;
}

describe("migratePrinterAutoPrint", () => {
  it("adds auto_print disabled by default without changing existing rows", () => {
    const sqlite = new Database(":memory:");
    createLegacyPrinters(sqlite);

    migratePrinterAutoPrint(sqlite);

    expect(printerColumns(sqlite).map((column) => column.name)).toContain(
      "auto_print",
    );
    expect(
      sqlite
        .prepare(
          `SELECT name, connection_type, auto_print FROM printers WHERE id = 1`,
        )
        .get(),
    ).toEqual({
      name: "كاشير المطعم",
      connection_type: "local",
      auto_print: 0,
    });
  });

  it("keeps an existing auto_print value and can run again safely", () => {
    const sqlite = new Database(":memory:");
    createLegacyPrinters(sqlite);
    migratePrinterAutoPrint(sqlite);
    sqlite.prepare(`UPDATE printers SET auto_print = 1 WHERE id = 1`).run();

    migratePrinterAutoPrint(sqlite);

    expect(
      sqlite.prepare(`SELECT auto_print FROM printers WHERE id = 1`).get(),
    ).toEqual({ auto_print: 1 });
  });
});
