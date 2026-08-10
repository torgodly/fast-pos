import { relations, sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(), // restaurant | cafe
  name: text("name").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    role: text("role", { enum: ["admin", "waiter", "cashier"] }).notNull(),
    venueId: text("venue_id").references(() => venues.id),
    username: text("username"),
    passwordHash: text("password_hash"),
    pinHash: text("pin_hash"),
    /** Only the main cashier may open/close shifts and print X/Z. */
    isMainCashier: integer("is_main_cashier", { mode: "boolean" })
      .notNull()
      .default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("users_username_idx").on(table.username)],
);

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** null = shared (cafe + restaurant) */
  venueId: text("venue_id").references(() => venues.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  kitchenPrinterId: integer("kitchen_printer_id").references(() => printers.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const printers = sqliteTable("printers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  venueId: text("venue_id")
    .notNull()
    .references(() => venues.id),
  name: text("name").notNull(),
  role: text("role", { enum: ["kitchen", "checkout", "both"] }).notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(9100),
  connectionType: text("connection_type", { enum: ["network", "local"] })
    .notNull()
    .default("network"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const cashierStations = sqliteTable("cashier_stations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  venueId: text("venue_id")
    .notNull()
    .references(() => venues.id),
  name: text("name").notNull(),
  printerId: integer("printer_id")
    .notNull()
    .references(() => printers.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** null = shared (cafe + restaurant) */
  venueId: text("venue_id").references(() => venues.id),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  name: text("name").notNull(),
  price: real("price").notNull(),
  kitchenPrinterId: integer("kitchen_printer_id").references(() => printers.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const tables = sqliteTable("tables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  venueId: text("venue_id")
    .notNull()
    .references(() => venues.id),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const shifts = sqliteTable(
  "shifts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id),
    workDate: text("work_date").notNull(),
    shiftNumber: integer("shift_number").notNull(),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    openedBy: integer("opened_by").references(() => users.id),
    openedAt: text("opened_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    closedBy: integer("closed_by").references(() => users.id),
    closedAt: text("closed_at"),
    xPrintedAt: text("x_printed_at"),
  },
  (table) => [
    uniqueIndex("shifts_venue_date_number_idx").on(
      table.venueId,
      table.workDate,
      table.shiftNumber,
    ),
  ],
);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  venueId: text("venue_id")
    .notNull()
    .references(() => venues.id),
  tableId: integer("table_id").references(() => tables.id),
  waiterId: integer("waiter_id").references(() => users.id),
  cashierId: integer("cashier_id").references(() => users.id),
  shiftId: integer("shift_id").references(() => shifts.id),
  status: text("status", { enum: ["open", "paid", "cancelled"] })
    .notNull()
    .default("open"),
  paymentMethod: text("payment_method", { enum: ["cash", "card"] }),
  total: real("total").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  paidAt: text("paid_at"),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  itemId: integer("item_id").references(() => items.id),
  itemName: text("item_name").notNull(),
  unitPrice: real("unit_price").notNull(),
  qty: integer("qty").notNull().default(1),
  lineTotal: real("line_total").notNull(),
  kitchenSentQty: integer("kitchen_sent_qty").notNull().default(0),
});

export const venuesRelations = relations(venues, ({ many }) => ({
  users: many(users),
  categories: many(categories),
  items: many(items),
  tables: many(tables),
  orders: many(orders),
  printers: many(printers),
  cashierStations: many(cashierStations),
  shifts: many(shifts),
}));

export const usersRelations = relations(users, ({ one }) => ({
  venue: one(venues, {
    fields: [users.venueId],
    references: [venues.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  venue: one(venues, {
    fields: [categories.venueId],
    references: [venues.id],
  }),
  kitchenPrinter: one(printers, {
    fields: [categories.kitchenPrinterId],
    references: [printers.id],
  }),
  items: many(items),
}));

export const printersRelations = relations(printers, ({ one, many }) => ({
  venue: one(venues, {
    fields: [printers.venueId],
    references: [venues.id],
  }),
  stations: many(cashierStations),
  kitchenCategories: many(categories),
  kitchenItems: many(items),
}));

export const cashierStationsRelations = relations(
  cashierStations,
  ({ one }) => ({
    venue: one(venues, {
      fields: [cashierStations.venueId],
      references: [venues.id],
    }),
    printer: one(printers, {
      fields: [cashierStations.printerId],
      references: [printers.id],
    }),
  }),
);

export const itemsRelations = relations(items, ({ one }) => ({
  venue: one(venues, {
    fields: [items.venueId],
    references: [venues.id],
  }),
  category: one(categories, {
    fields: [items.categoryId],
    references: [categories.id],
  }),
  kitchenPrinter: one(printers, {
    fields: [items.kitchenPrinterId],
    references: [printers.id],
  }),
}));

export const tablesRelations = relations(tables, ({ one }) => ({
  venue: one(venues, {
    fields: [tables.venueId],
    references: [venues.id],
  }),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  venue: one(venues, {
    fields: [shifts.venueId],
    references: [venues.id],
  }),
  openedByUser: one(users, {
    fields: [shifts.openedBy],
    references: [users.id],
  }),
  closedByUser: one(users, {
    fields: [shifts.closedBy],
    references: [users.id],
  }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  venue: one(venues, {
    fields: [orders.venueId],
    references: [venues.id],
  }),
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
  waiter: one(users, {
    fields: [orders.waiterId],
    references: [users.id],
  }),
  cashier: one(users, {
    fields: [orders.cashierId],
    references: [users.id],
  }),
  shift: one(shifts, {
    fields: [orders.shiftId],
    references: [shifts.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  item: one(items, {
    fields: [orderItems.itemId],
    references: [items.id],
  }),
}));
