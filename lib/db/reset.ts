import { getSqlite } from "./index";

export type ResetOptions = {
  sales: boolean;
  printers: boolean;
  staff: boolean;
  menu: boolean;
  tables: boolean;
  receiptSettings: boolean;
};

/** Clears sales, printers/stations, and staff. Keeps items, categories, tables, venues, admin users. */
export function resetSalesPrintersAndUsers() {
  applyPartialReset({
    sales: true,
    printers: true,
    staff: true,
    menu: false,
    tables: false,
    receiptSettings: false,
  });
}

export function applyPartialReset(options: ResetOptions) {
  const sqlite = getSqlite();

  sqlite.exec("PRAGMA foreign_keys = OFF");

  if (options.sales || options.menu) {
    sqlite.exec("DELETE FROM order_items");
    sqlite.exec("DELETE FROM orders");
    try {
      sqlite.exec("DELETE FROM shifts");
    } catch {
      /* shifts table may not exist on very old DBs */
    }
  }

  if (options.printers) {
    sqlite.exec("UPDATE items SET kitchen_printer_id = NULL");
    sqlite.exec("UPDATE categories SET kitchen_printer_id = NULL");
    sqlite.exec("DELETE FROM cashier_stations");
    sqlite.exec("DELETE FROM printers");
  }

  if (options.staff) {
    sqlite.exec("UPDATE orders SET waiter_id = NULL, cashier_id = NULL");
    sqlite.exec("DELETE FROM users WHERE role != 'admin'");
  }

  if (options.menu) {
    sqlite.exec("DELETE FROM items");
    sqlite.exec("DELETE FROM categories");
  }

  if (options.tables) {
    sqlite.exec("UPDATE orders SET table_id = NULL");
    sqlite.exec("DELETE FROM tables");
  }

  if (options.receiptSettings) {
    sqlite.exec("DELETE FROM app_settings");
  }

  sqlite.exec("PRAGMA foreign_keys = ON");
}
