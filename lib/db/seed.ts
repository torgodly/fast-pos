import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  categories,
  items,
  tables,
  users,
  venues,
} from "./schema";

export function seedIfNeeded(db: BetterSQLite3Database<typeof schema>) {
  const [{ value }] = db.select({ value: count() }).from(venues).all();
  if (value > 0) return;

  const adminPass = bcrypt.hashSync("admin123", 10);
  const pin1111 = bcrypt.hashSync("1111", 10);
  const pin2222 = bcrypt.hashSync("2222", 10);

  db.insert(venues)
    .values([
      { id: "restaurant", name: "مطعم" },
      { id: "cafe", name: "كافيه" },
    ])
    .run();

  db.insert(users)
    .values([
      {
        name: "المدير",
        role: "admin",
        username: "admin",
        passwordHash: adminPass,
        active: true,
      },
      {
        name: "أحمد",
        role: "waiter",
        venueId: null,
        pinHash: pin1111,
        active: true,
      },
      {
        name: "سارة",
        role: "cashier",
        venueId: null,
        pinHash: pin2222,
        active: true,
      },
    ])
    .run();

  const restCat = db
    .insert(categories)
    .values([
      { venueId: "restaurant", name: "أطباق رئيسية", sortOrder: 1 },
      { venueId: "restaurant", name: "مشروبات", sortOrder: 2 },
      { venueId: "cafe", name: "قهوة", sortOrder: 1 },
      { venueId: "cafe", name: "حلويات", sortOrder: 2 },
    ])
    .returning()
    .all();

  const restMain = restCat.find(
    (c) => c.venueId === "restaurant" && c.name === "أطباق رئيسية",
  )!;
  const restDrinks = restCat.find(
    (c) => c.venueId === "restaurant" && c.name === "مشروبات",
  )!;
  const cafeCoffee = restCat.find(
    (c) => c.venueId === "cafe" && c.name === "قهوة",
  )!;
  const cafeSweets = restCat.find(
    (c) => c.venueId === "cafe" && c.name === "حلويات",
  )!;

  db.insert(items)
    .values([
      {
        venueId: "restaurant",
        categoryId: restMain.id,
        name: "مشوي دجاج",
        price: 35,
      },
      {
        venueId: "restaurant",
        categoryId: restMain.id,
        name: "سمك مقلي",
        price: 45,
      },
      {
        venueId: "restaurant",
        categoryId: restDrinks.id,
        name: "عصير برتقال",
        price: 8,
      },
      {
        venueId: "restaurant",
        categoryId: restDrinks.id,
        name: "ماء",
        price: 3,
      },
      {
        venueId: "cafe",
        categoryId: cafeCoffee.id,
        name: "إسبريسو",
        price: 7,
      },
      {
        venueId: "cafe",
        categoryId: cafeCoffee.id,
        name: "كابتشينو",
        price: 10,
      },
      {
        venueId: "cafe",
        categoryId: cafeSweets.id,
        name: "كيك شوكولاتة",
        price: 15,
      },
      {
        venueId: "cafe",
        categoryId: cafeSweets.id,
        name: "كرواسون",
        price: 9,
      },
    ])
    .run();

  for (const venueId of ["restaurant", "cafe"] as const) {
    db.insert(tables)
      .values(
        Array.from({ length: 8 }, (_, i) => ({
          venueId,
          name: `طاولة ${i + 1}`,
          active: true,
        })),
      )
      .run();
  }

}
