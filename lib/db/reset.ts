import { getSqlite } from "./index";

/** Clears sales, printers/stations, and staff. Keeps items, categories, tables, venues, admin users. */
export function resetSalesPrintersAndUsers() {
  const sqlite = getSqlite();

  sqlite.exec(`
    PRAGMA foreign_keys = OFF;
    UPDATE items SET kitchen_printer_id = NULL;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM cashier_stations;
    DELETE FROM printers;
    DELETE FROM users WHERE role != 'admin';
    PRAGMA foreign_keys = ON;
  `);
}
