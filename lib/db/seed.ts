import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import {
  cashierStations,
  categories,
  items,
  orderItems,
  orders,
  printers,
  tables,
  users,
  venues,
} from "./schema";
import { floorTableNames } from "./floor-tables";

function pin(value: string) {
  return bcrypt.hashSync(value, 10);
}

function nowOffset(hoursAgo: number, minutesAgo = 0) {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo);
  d.setMinutes(d.getMinutes() - minutesAgo);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function yesterdayAt(hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type MenuLine = {
  name: string;
  price: number;
  printer: "kitchen" | "drinks";
  active?: boolean;
};

type SeedOptions = {
  demoStaff: boolean;
  sampleOrders: boolean;
};

export function seedIfNeeded(db: BetterSQLite3Database<typeof schema>) {
  const [{ value }] = db.select({ value: count() }).from(venues).all();
  if (value > 0) return;

  runSeed(db, { demoStaff: true, sampleOrders: true });
}

/** Fresh starter data: admin only, full menu, no sales. */
export function seedFactoryDatabase(db: BetterSQLite3Database<typeof schema>) {
  runSeed(db, { demoStaff: false, sampleOrders: false });
}

function runSeed(
  db: BetterSQLite3Database<typeof schema>,
  opts: SeedOptions,
) {
  const adminPass = bcrypt.hashSync("admin123", 10);

  db.insert(venues)
    .values([
      { id: "restaurant", name: "مطعم" },
      { id: "cafe", name: "كافيه" },
    ])
    .run();

  const staffValues = opts.demoStaff
    ? [
        {
          name: "المدير",
          role: "admin" as const,
          username: "admin",
          passwordHash: adminPass,
          active: true,
        },
        {
          name: "أحمد",
          role: "waiter" as const,
          venueId: null,
          pinHash: pin("1111"),
          active: true,
        },
        {
          name: "يوسف",
          role: "waiter" as const,
          venueId: null,
          pinHash: pin("3333"),
          active: true,
        },
        {
          name: "مريم",
          role: "waiter" as const,
          venueId: null,
          pinHash: pin("4444"),
          active: true,
        },
        {
          name: "سارة",
          role: "cashier" as const,
          venueId: null,
          pinHash: pin("2222"),
          isMainCashier: true,
          active: true,
        },
        {
          name: "خالد",
          role: "cashier" as const,
          venueId: null,
          pinHash: pin("5555"),
          isMainCashier: false,
          active: true,
        },
        {
          name: "ليلى",
          role: "waiter" as const,
          venueId: null,
          pinHash: pin("6666"),
          active: false,
        },
      ]
    : [
        {
          name: "المدير",
          role: "admin" as const,
          username: "admin",
          passwordHash: adminPass,
          active: true,
        },
      ];

  const staff = db.insert(users).values(staffValues).returning().all();

  const waiterAhmed = staff.find((u) => u.name === "أحمد");
  const waiterYousef = staff.find((u) => u.name === "يوسف");
  const waiterMaryam = staff.find((u) => u.name === "مريم");
  const cashierSara = staff.find((u) => u.name === "سارة");
  const cashierKhaled = staff.find((u) => u.name === "خالد");

  const seededPrinters = db
    .insert(printers)
    .values([
      {
        venueId: null,
        name: "مطبخ المطعم",
        role: "kitchen",
        host: "192.168.1.40",
        port: 9100,
        active: true,
      },
      {
        venueId: null,
        name: "مشروبات المطعم",
        role: "kitchen",
        host: "192.168.1.41",
        port: 9100,
        active: true,
      },
      {
        venueId: "restaurant",
        name: "كاشير المطعم",
        role: "checkout",
        host: "192.168.1.50",
        port: 9100,
        active: true,
      },
      {
        venueId: null,
        name: "مطبخ الكافيه",
        role: "kitchen",
        host: "192.168.1.60",
        port: 9100,
        active: true,
      },
      {
        venueId: null,
        name: "مشروبات الكافيه",
        role: "kitchen",
        host: "192.168.1.61",
        port: 9100,
        active: true,
      },
      {
        venueId: "cafe",
        name: "كاشير الكافيه",
        role: "checkout",
        host: "192.168.1.70",
        port: 9100,
        active: true,
      },
    ])
    .returning()
    .all();

  const restKitchen = seededPrinters.find((p) => p.name === "مطبخ المطعم")!;
  const restDrinksPrn = seededPrinters.find((p) => p.name === "مشروبات المطعم")!;
  const restCheckout = seededPrinters.find((p) => p.name === "كاشير المطعم")!;
  const cafeKitchen = seededPrinters.find((p) => p.name === "مطبخ الكافيه")!;
  const cafeDrinksPrn = seededPrinters.find((p) => p.name === "مشروبات الكافيه")!;
  const cafeCheckout = seededPrinters.find((p) => p.name === "كاشير الكافيه")!;

  db.insert(cashierStations)
    .values([
      {
        venueId: "restaurant",
        name: "كاشير المطعم",
        printerId: restCheckout.id,
        active: true,
      },
      {
        venueId: "cafe",
        name: "كاشير الكافيه",
        printerId: cafeCheckout.id,
        active: true,
      },
    ])
    .run();

  const cafeMenu: Array<{ category: string; sortOrder: number; items: MenuLine[] }> = [
    {
      category: "خبز",
      sortOrder: 1,
      items: [
        { name: "خبز فرنسي", price: 8, printer: "kitchen" },
        { name: "خبز توست", price: 6, printer: "kitchen" },
        { name: "خبز صامولي", price: 5, printer: "kitchen" },
      ],
    },
    {
      category: "الإفطار",
      sortOrder: 2,
      items: [
        { name: "فطور شرقي", price: 120, printer: "kitchen" },
        { name: "فطور تركي", price: 110, printer: "kitchen" },
        { name: "فطور فرنسي", price: 99, printer: "kitchen" },
        { name: "فطور كلاسيك مع البيض", price: 40, printer: "kitchen" },
        { name: "فطور كلاسيكي", price: 20, printer: "kitchen" },
        { name: "فطور باريسي", price: 30, printer: "kitchen" },
        { name: "أومليت عادي", price: 16, printer: "kitchen" },
        { name: "أومليت جبنة", price: 18, printer: "kitchen" },
        { name: "أومليت بالخضار", price: 20, printer: "kitchen" },
        { name: "أومليت بالفطر", price: 22, printer: "kitchen" },
        { name: "شكشوكة", price: 18, printer: "kitchen" },
        { name: "شكشوكة تركية", price: 24, printer: "kitchen" },
        { name: "بيض عيون", price: 12, printer: "kitchen" },
      ],
    },
    {
      category: "مشروبات باردة",
      sortOrder: 3,
      items: [
        { name: "كراميل موكا مثلج", price: 20, printer: "drinks" },
        { name: "وايت موكا مثلج", price: 20, printer: "drinks" },
        { name: "آيس سبانش لاتيه", price: 20, printer: "drinks" },
        { name: "آيس كراميل ميكياتو", price: 20, printer: "drinks" },
        { name: "شاي مثلج خوخ", price: 15, printer: "drinks" },
        { name: "شاي مثلج فراولة", price: 15, printer: "drinks" },
        { name: "شاي مثلج مانجو", price: 15, printer: "drinks" },
        { name: "شاي مثلج باشن فروت", price: 15, printer: "drinks" },
        { name: "موهيتو", price: 15, printer: "drinks" },
        { name: "موهيتو كيوي", price: 20, printer: "drinks" },
        { name: "موهيتو فراولة", price: 20, printer: "drinks" },
        { name: "موهيتو فواكه", price: 20, printer: "drinks" },
        { name: "عصير برتقال", price: 18, printer: "drinks" },
        { name: "عصير مانجو", price: 20, printer: "drinks" },
        { name: "عصير فراولة", price: 20, printer: "drinks" },
        { name: "عصير كوكتيل", price: 25, printer: "drinks" },
        { name: "ليمون ونعنع", price: 18, printer: "drinks" },
        { name: "عصير جوافة", price: 25, printer: "drinks" },
        { name: "عصير توت وفراولة", price: 25, printer: "drinks" },
        { name: "عصير توت", price: 20, printer: "drinks" },
        { name: "ميلك شيك فراولة", price: 20, printer: "drinks" },
        { name: "ميلك شيك فانيلا", price: 20, printer: "drinks" },
        { name: "ميلك شيك شوكولاتة", price: 20, printer: "drinks" },
        { name: "ميلك شيك لوتس", price: 25, printer: "drinks" },
        { name: "ميلك شيك أوريو", price: 25, printer: "drinks" },
        { name: "مياه", price: 5, printer: "drinks" },
        { name: "مياه غازية", price: 5, printer: "drinks" },
        { name: "سفن أب", price: 5, printer: "drinks" },
        { name: "بيبسي", price: 5, printer: "drinks" },
        { name: "جرين", price: 5, printer: "drinks" },
        { name: "شويبس", price: 5, printer: "drinks" },
      ],
    },
    {
      category: "مشروبات ساخنة",
      sortOrder: 4,
      items: [
        { name: "كابتشينو", price: 12, printer: "drinks" },
        { name: "إسبريسو", price: 7, printer: "drinks" },
        { name: "إسبريسو دبل", price: 10, printer: "drinks" },
        { name: "سبانش لاتيه", price: 12, printer: "drinks" },
        { name: "أمريكانو", price: 8, printer: "drinks" },
        { name: "كافي لاتيه", price: 12, printer: "drinks" },
        { name: "كافي لاتيه بندق", price: 20, printer: "drinks" },
        { name: "هوت شوكلت", price: 20, printer: "drinks" },
        { name: "ميكياتو كراميل", price: 20, printer: "drinks" },
        { name: "كافي لاتيه فانيلا", price: 20, printer: "drinks" },
        { name: "قهوة عربية", price: 12, printer: "drinks" },
        { name: "قهوة عربية دبل", price: 13, printer: "drinks" },
        { name: "نسكافيه حبوب دبل", price: 11, printer: "drinks" },
        { name: "نسكافيه حبوب عادية", price: 7, printer: "drinks" },
        { name: "نسكافيه عادية", price: 8, printer: "drinks" },
        { name: "نسكافيه تامة عادي", price: 15, printer: "drinks" },
        { name: "نسكافيه دبل عادي", price: 12, printer: "drinks" },
        { name: "معدلة ميكياتو", price: 7, printer: "drinks" },
        { name: "كريمة عادية", price: 7, printer: "drinks" },
        { name: "نص نص عادية", price: 7, printer: "drinks" },
        { name: "نص نص دبل", price: 10, printer: "drinks" },
        { name: "معدلة ميكياتو دبل", price: 10, printer: "drinks" },
        { name: "كريمة دبل", price: 10, printer: "drinks" },
        { name: "شاي", price: 8, printer: "drinks" },
      ],
    },
    {
      category: "معجنات",
      sortOrder: 5,
      items: [
        { name: "إكلير كوفي", price: 12, printer: "kitchen" },
        { name: "إكلير شوكولاتة", price: 12, printer: "kitchen" },
        { name: "ميني إكلير كوفي", price: 5, printer: "kitchen" },
        { name: "ميني إكلير شوكولاتة", price: 5, printer: "kitchen" },
        { name: "تارت ليمون", price: 14, printer: "kitchen" },
        { name: "تارت بيكان", price: 20, printer: "kitchen" },
        { name: "تارت توت", price: 20, printer: "kitchen" },
        { name: "تارت مانجو", price: 18, printer: "kitchen" },
        { name: "تارت بندق وموز", price: 20, printer: "kitchen" },
        { name: "فوندو", price: 25, printer: "kitchen" },
        { name: "شوكا ديفا", price: 25, printer: "kitchen" },
        { name: "تيراميسو", price: 18, printer: "kitchen" },
        { name: "براونيز", price: 14, printer: "kitchen" },
        { name: "تروا شوكولت", price: 25, printer: "kitchen" },
        { name: "كيك رويال", price: 23, printer: "kitchen" },
        { name: "موس شوكولاتة", price: 24, printer: "kitchen" },
        { name: "رد فلفت كيك", price: 20, printer: "kitchen" },
        { name: "تشيز كيك أوريو", price: 25, printer: "kitchen" },
        { name: "تشيز كيك لوتس", price: 25, printer: "kitchen" },
        { name: "تشيز كيك سان سيباستيان", price: 25, printer: "kitchen" },
        { name: "ميلفاي بيكان", price: 23, printer: "kitchen" },
        { name: "ميلفاي عادي", price: 14, printer: "kitchen" },
        { name: "ميلفاي مانجو", price: 14, printer: "kitchen" },
        { name: "إنجلش كيك فانيلا", price: 12, printer: "kitchen" },
        { name: "إنجلش كيك شوكولاتة", price: 12, printer: "kitchen" },
        { name: "إنجلش كيك بندق وفانيلا", price: 12, printer: "kitchen" },
        { name: "إنجلش كيك ليمون", price: 12, printer: "kitchen" },
        { name: "شارلوت مانجو", price: 24, printer: "kitchen" },
        { name: "شارلوت فراولة", price: 24, printer: "kitchen" },
        { name: "ماكرون فراولة", price: 20, printer: "kitchen" },
      ],
    },
    {
      category: "ساندويتش",
      sortOrder: 6,
      items: [
        { name: "ساندويتش جبنة", price: 18, printer: "kitchen" },
        { name: "ساندويتش دجاج", price: 22, printer: "kitchen" },
        { name: "ساندويتش تونة", price: 20, printer: "kitchen" },
      ],
    },
    {
      category: "فيينوازري",
      sortOrder: 7,
      items: [
        { name: "كوكيز شوكولاتة بالحليب", price: 14, printer: "kitchen" },
        { name: "كوكيز شوكولاتة سوداء", price: 14, printer: "kitchen" },
        { name: "كوكيز صغير", price: 9, printer: "kitchen" },
        { name: "فينانسييه", price: 9, printer: "kitchen" },
        { name: "فينانسييه بيستاشيو", price: 12, printer: "kitchen" },
        { name: "مادلين 12 قطعة", price: 4, printer: "kitchen" },
        { name: "مادلين 20 قطعة", price: 9, printer: "kitchen" },
        { name: "كرواسون سادة", price: 10, printer: "kitchen" },
        { name: "كرواسون شوكولاتة", price: 12, printer: "kitchen" },
      ],
    },
  ];

  function seedVenueMenu(
    venueId: "restaurant" | "cafe",
    kitchenId: number,
    drinksId: number,
  ) {
    const createdCats = db
      .insert(categories)
      .values(
        cafeMenu.map((group) => ({
          venueId,
          name: group.category,
          sortOrder: group.sortOrder,
          kitchenPrinterId:
            group.items[0]?.printer === "kitchen" ? kitchenId : drinksId,
          active: true,
        })),
      )
      .returning()
      .all();

    const catId = (name: string) =>
      createdCats.find((c) => c.name === name)!.id;

    const createdItems = db
      .insert(items)
      .values(
        cafeMenu.flatMap((group) =>
          group.items.map((entry) => ({
            venueId,
            categoryId: catId(group.category),
            name: entry.name,
            price: entry.price,
            active: entry.active ?? true,
          })),
        ),
      )
      .returning()
      .all();

    return createdItems;
  }

  const cafeItems = seedVenueMenu("cafe", cafeKitchen.id, cafeDrinksPrn.id);
  const restItems = seedVenueMenu(
    "restaurant",
    restKitchen.id,
    restDrinksPrn.id,
  );

  const cafeItem = (name: string) => cafeItems.find((i) => i.name === name)!;
  const restItem = (name: string) => restItems.find((i) => i.name === name)!;

  for (const venueId of ["restaurant", "cafe"] as const) {
    db.insert(tables)
      .values(
        floorTableNames(venueId).map((name) => ({
          venueId,
          name,
          active: true,
        })),
      )
      .run();
  }

  const restTables = db
    .select()
    .from(tables)
    .where(eq(tables.venueId, "restaurant"))
    .all();
  const cafeTables = db
    .select()
    .from(tables)
    .where(eq(tables.venueId, "cafe"))
    .all();

  const tableOf = (list: typeof restTables, name: string) =>
    list.find((row) => row.name === name)!;

  if (!opts.sampleOrders || !waiterAhmed || !waiterYousef || !waiterMaryam || !cashierSara || !cashierKhaled) {
    return;
  }

  function addOrder(opts: {
    venueId: "restaurant" | "cafe";
    lookup: typeof cafeItem;
    tableId: number | null;
    waiterId: number | null;
    cashierId: number | null;
    status: "open" | "paid" | "cancelled";
    paymentMethod?: "cash" | "card";
    createdAt: string;
    paidAt?: string;
    lines: Array<{ name: string; qty: number; sent?: boolean }>;
  }) {
    const priced = opts.lines.map((line) => {
      const menuItem = opts.lookup(line.name);
      return {
        item: menuItem,
        qty: line.qty,
        sent: line.sent ?? opts.status !== "open",
        lineTotal: menuItem.price * line.qty,
      };
    });
    const total = priced.reduce((sum, line) => sum + line.lineTotal, 0);

    const order = db
      .insert(orders)
      .values({
        venueId: opts.venueId,
        tableId: opts.tableId,
        waiterId: opts.waiterId,
        cashierId: opts.cashierId,
        status: opts.status,
        paymentMethod: opts.paymentMethod ?? null,
        total,
        createdAt: opts.createdAt,
        paidAt: opts.paidAt ?? null,
      })
      .returning()
      .get();

    for (const line of priced) {
      db.insert(orderItems)
        .values({
          orderId: order.id,
          itemId: line.item.id,
          itemName: line.item.name,
          unitPrice: line.item.price,
          qty: line.qty,
          lineTotal: line.lineTotal,
          kitchenSentQty: line.sent ? line.qty : 0,
        })
        .run();
    }
  }

  // Cafe open / paid samples
  addOrder({
    venueId: "cafe",
    lookup: cafeItem,
    tableId: tableOf(cafeTables, "طاولة 1").id,
    waiterId: waiterMaryam.id,
    cashierId: null,
    status: "open",
    createdAt: nowOffset(0, 40),
    lines: [
      { name: "كابتشينو", qty: 2, sent: true },
      { name: "تشيز كيك لوتس", qty: 1, sent: true },
    ],
  });

  addOrder({
    venueId: "cafe",
    lookup: cafeItem,
    tableId: tableOf(cafeTables, "طاولة 4").id,
    waiterId: waiterAhmed.id,
    cashierId: null,
    status: "open",
    createdAt: nowOffset(0, 12),
    lines: [
      { name: "كافي لاتيه", qty: 1, sent: false },
      { name: "إكلير شوكولاتة", qty: 2, sent: false },
    ],
  });

  addOrder({
    venueId: "cafe",
    lookup: cafeItem,
    tableId: tableOf(cafeTables, "طاولة 2").id,
    waiterId: waiterMaryam.id,
    cashierId: cashierSara.id,
    status: "paid",
    paymentMethod: "cash",
    createdAt: nowOffset(2, 30),
    paidAt: nowOffset(2, 0),
    lines: [
      { name: "إسبريسو", qty: 1 },
      { name: "فوندو", qty: 1 },
    ],
  });

  addOrder({
    venueId: "cafe",
    lookup: cafeItem,
    tableId: null,
    waiterId: null,
    cashierId: cashierKhaled.id,
    status: "paid",
    paymentMethod: "card",
    createdAt: nowOffset(0, 50),
    paidAt: nowOffset(0, 48),
    lines: [
      { name: "آيس سبانش لاتيه", qty: 2 },
      { name: "ميلك شيك أوريو", qty: 1 },
    ],
  });

  addOrder({
    venueId: "cafe",
    lookup: cafeItem,
    tableId: tableOf(cafeTables, "طاولة 101").id,
    waiterId: waiterYousef.id,
    cashierId: cashierSara.id,
    status: "paid",
    paymentMethod: "cash",
    createdAt: nowOffset(5, 0),
    paidAt: nowOffset(4, 20),
    lines: [
      { name: "فطور شرقي", qty: 1 },
      { name: "كابتشينو", qty: 2 },
      { name: "شارلوت فراولة", qty: 1 },
    ],
  });

  addOrder({
    venueId: "cafe",
    lookup: cafeItem,
    tableId: tableOf(cafeTables, "طاولة 3").id,
    waiterId: waiterMaryam.id,
    cashierId: cashierKhaled.id,
    status: "paid",
    paymentMethod: "card",
    createdAt: yesterdayAt(16, 20),
    paidAt: yesterdayAt(17, 0),
    lines: [
      { name: "قهوة عربية", qty: 2 },
      { name: "تارت ليمون", qty: 1 },
      { name: "عصير مانجو", qty: 1 },
    ],
  });

  // Restaurant samples using the same menu
  addOrder({
    venueId: "restaurant",
    lookup: restItem,
    tableId: tableOf(restTables, "طاولة 20").id,
    waiterId: waiterAhmed.id,
    cashierId: null,
    status: "open",
    createdAt: nowOffset(1, 10),
    lines: [
      { name: "فطور تركي", qty: 1, sent: true },
      { name: "كابتشينو", qty: 2, sent: true },
      { name: "أومليت جبنة", qty: 1, sent: false },
    ],
  });

  addOrder({
    venueId: "restaurant",
    lookup: restItem,
    tableId: tableOf(restTables, "طاولة 22").id,
    waiterId: waiterYousef.id,
    cashierId: null,
    status: "open",
    createdAt: nowOffset(0, 35),
    lines: [
      { name: "شكشوكة تركية", qty: 1, sent: true },
      { name: "شاي", qty: 2, sent: true },
    ],
  });

  addOrder({
    venueId: "restaurant",
    lookup: restItem,
    tableId: tableOf(restTables, "طاولة 21").id,
    waiterId: waiterAhmed.id,
    cashierId: cashierSara.id,
    status: "paid",
    paymentMethod: "cash",
    createdAt: nowOffset(3, 20),
    paidAt: nowOffset(2, 50),
    lines: [
      { name: "فطور كلاسيك مع البيض", qty: 2 },
      { name: "عصير برتقال", qty: 2 },
      { name: "براونيز", qty: 1 },
    ],
  });

  addOrder({
    venueId: "restaurant",
    lookup: restItem,
    tableId: tableOf(restTables, "VIP").id,
    waiterId: waiterMaryam.id,
    cashierId: cashierKhaled.id,
    status: "paid",
    paymentMethod: "card",
    createdAt: nowOffset(4, 0),
    paidAt: nowOffset(3, 10),
    lines: [
      { name: "فطور فرنسي", qty: 1 },
      { name: "كافي لاتيه بندق", qty: 2 },
      { name: "تشيز كيك سان سيباستيان", qty: 1 },
    ],
  });

  addOrder({
    venueId: "restaurant",
    lookup: restItem,
    tableId: null,
    waiterId: null,
    cashierId: cashierSara.id,
    status: "paid",
    paymentMethod: "cash",
    createdAt: nowOffset(1, 5),
    paidAt: nowOffset(1, 4),
    lines: [
      { name: "مياه", qty: 4 },
      { name: "بيبسي", qty: 2 },
    ],
  });

  addOrder({
    venueId: "restaurant",
    lookup: restItem,
    tableId: tableOf(restTables, "طاولة 23").id,
    waiterId: waiterYousef.id,
    cashierId: cashierSara.id,
    status: "paid",
    paymentMethod: "card",
    createdAt: yesterdayAt(19, 10),
    paidAt: yesterdayAt(20, 5),
    lines: [
      { name: "فطور باريسي", qty: 2 },
      { name: "أمريكانو", qty: 2 },
      { name: "ميلفاي عادي", qty: 1 },
    ],
  });

  addOrder({
    venueId: "restaurant",
    lookup: restItem,
    tableId: tableOf(restTables, "طاولة 25").id,
    waiterId: waiterAhmed.id,
    cashierId: cashierKhaled.id,
    status: "cancelled",
    createdAt: yesterdayAt(21, 0),
    lines: [{ name: "فطور شرقي", qty: 1 }],
  });
}
