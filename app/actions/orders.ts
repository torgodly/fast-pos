"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCashierStationContext } from "@/app/actions/station";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  categories,
  items,
  orderItems,
  orders,
  printers,
  tables,
  users,
} from "@/lib/db/schema";
import type { PaymentMethod, VenueId } from "@/lib/types";
import {
  formatDateTime,
  getVenueName,
  isVenueId,
} from "@/lib/venues";
import type { CheckoutReceiptData } from "@/lib/print/receipts";
import { buildCheckoutReceiptHtml } from "@/lib/print/receipts";
import { buildCheckoutPrintBytes } from "@/lib/print/checkout-bytes";
import { buildKitchenEscPos, chunkKitchenLines } from "@/lib/print/escpos";
import { getReceiptLogoPrintDataUrl } from "@/lib/print/logo";
import { printToPrinter } from "@/lib/print/network";
import { resolveKitchenPrinterForVenue } from "@/lib/print/resolve-kitchen-printer";
import { availableAtVenue } from "@/lib/menu/scope";
import { getReceiptFooterMessage } from "@/lib/settings";
import { auditPrintOutcome, recordSessionAudit } from "@/lib/audit";

function recalcOrderTotal(orderId: number) {
  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  db.update(orders)
    .set({ total })
    .where(eq(orders.id, orderId))
    .run();
  return total;
}

/** Waiters may only mutate orders they opened; cashiers can work any open order. */
function waiterOwnsOrder(
  session: { role: string; userId: number },
  order: { waiterId: number | null },
) {
  if (session.role !== "waiter") return true;
  return order.waiterId === session.userId;
}

export async function openTableOrder(venueId: string, tableId: number) {
  const session = await getSession();
  if (!session || session.role !== "waiter" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }

  const table = db
    .select()
    .from(tables)
    .where(
      and(
        eq(tables.id, tableId),
        eq(tables.venueId, venueId),
        eq(tables.active, true),
      ),
    )
    .get();

  if (!table) return { error: "الطاولة غير موجودة" };

  const existing = db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tableId, tableId),
        eq(orders.status, "open"),
        eq(orders.venueId, venueId),
      ),
    )
    .get();

  if (existing) {
    if (existing.waiterId !== session.userId) {
      return { error: "هذه الطاولة مع سفرادجي آخر" };
    }
    redirect(`/waiter/${venueId}/order/${existing.id}`);
  }

  const order = db
    .insert(orders)
    .values({
      venueId,
      tableId,
      waiterId: session.userId,
      status: "open",
      total: 0,
    })
    .returning()
    .get();

  revalidatePath(`/waiter/${venueId}`);
  redirect(`/waiter/${venueId}/order/${order.id}`);
}

export async function addItemToOrder(orderId: number, itemId: number) {
  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    return { error: "غير مصرح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "الفاتورة غير مفتوحة" };
  }
  if (!waiterOwnsOrder(session, order)) {
    return { error: "هذه الطاولة مع سفرادجي آخر" };
  }

  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }

  const item = db
    .select()
    .from(items)
    .where(
      and(
        eq(items.id, itemId),
        availableAtVenue(items.venueId, order.venueId),
        eq(items.active, true),
      ),
    )
    .get();

  if (!item) return { error: "الصنف غير موجود" };

  const existingLine = db
    .select()
    .from(orderItems)
    .where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.itemId, itemId)),
    )
    .get();

  if (existingLine) {
    const qty = existingLine.qty + 1;
    db.update(orderItems)
      .set({
        qty,
        lineTotal: qty * existingLine.unitPrice,
      })
      .where(eq(orderItems.id, existingLine.id))
      .run();
  } else {
    db.insert(orderItems)
      .values({
        orderId,
        itemId: item.id,
        itemName: item.name,
        unitPrice: item.price,
        qty: 1,
        lineTotal: item.price,
      })
      .run();
  }

  recalcOrderTotal(orderId);
  revalidateOrderPaths(order.venueId as VenueId, orderId, session.role);
  return { ok: true };
}

export async function updateOrderItemQty(
  orderItemId: number,
  qty: number,
) {
  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    return { error: "غير مصرح" };
  }

  const line = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .get();
  if (!line) return { error: "البند غير موجود" };

  const order = db.select().from(orders).where(eq(orders.id, line.orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "غير مصرح" };
  }
  if (!waiterOwnsOrder(session, order)) {
    return { error: "هذه الطاولة مع سفرادجي آخر" };
  }

  const kitchenSent = line.kitchenSentQty ?? 0;

  if (qty < kitchenSent) {
    return {
      error:
        kitchenSent > 0
          ? `لا يمكن تقليل الكمية عن ${kitchenSent} — تم تأكيدها للمطبخ`
          : "لا يمكن حذف صنف مؤكد للمطبخ",
    };
  }

  if (qty <= 0) {
    if (kitchenSent > 0) {
      return { error: "لا يمكن حذف صنف مؤكد للمطبخ" };
    }
    db.delete(orderItems).where(eq(orderItems.id, orderItemId)).run();
  } else {
    db.update(orderItems)
      .set({ qty, lineTotal: qty * line.unitPrice })
      .where(eq(orderItems.id, orderItemId))
      .run();
  }

  recalcOrderTotal(order.id);
  revalidateOrderPaths(order.venueId as VenueId, order.id, session.role);
  return { ok: true };
}

export async function removeOrderItem(orderItemId: number) {
  return updateOrderItemQty(orderItemId, 0);
}

export type PrintTargetResult = {
  printerId: number;
  printerName: string;
  host: string;
};

type KitchenSendResult =
  | { ok: true; skipped: true }
  | {
      ok: true;
      skipped: false;
      printedTo: PrintTargetResult[];
      failed: Array<PrintTargetResult & { reason: string }>;
      message: string;
    }
  | { error: string };

/** Print kitchen tickets for lines not yet sent; updates kitchenSentQty on success. */
async function sendPendingKitchenTickets(options: {
  orderId: number;
  venueId: VenueId;
  tableName: string;
  staffName: string;
  requirePending?: boolean;
}): Promise<KitchenSendResult> {
  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, options.orderId))
    .all();

  if (lines.length === 0) {
    return options.requirePending
      ? { error: "أضف أصنافاً قبل الإرسال للمطبخ" }
      : { ok: true, skipped: true };
  }

  type Pending = {
    lineId: number;
    name: string;
    qty: number;
    printerId: number;
    printerName: string;
    host: string;
    port: number;
  };

  const pending: Pending[] = [];

  for (const line of lines) {
    const qty = line.qty - (line.kitchenSentQty ?? 0);
    if (qty <= 0) continue;

    if (!line.itemId) {
      return { error: `الصنف "${line.itemName}" غير مربوط بقائمة الأصناف` };
    }

    const item = db.select().from(items).where(eq(items.id, line.itemId)).get();
    if (!item) {
      return { error: `الصنف "${line.itemName}" غير مربوط بقائمة الأصناف` };
    }

    const category = db
      .select()
      .from(categories)
      .where(eq(categories.id, item.categoryId))
      .get();

    // Category printer wins when it belongs to this venue; otherwise auto-pick
    const printer = resolveKitchenPrinterForVenue({
      venueId: options.venueId,
      categoryName: category?.name,
      categoryPrinterId: category?.kitchenPrinterId,
      itemPrinterId: item.kitchenPrinterId,
    });

    if (!printer) {
      return {
        error: `لا توجد طابعة مربوطة للصنف "${line.itemName}" — اربط التصنيف من الإدارة ← الأصناف`,
      };
    }

    pending.push({
      lineId: line.id,
      name: line.itemName,
      qty,
      printerId: printer.id,
      printerName: printer.name,
      host: printer.host,
      port: printer.port,
    });
  }

  if (pending.length === 0) {
    return options.requirePending
      ? { error: "لا توجد أصناف جديدة لإرسالها للمطبخ" }
      : { ok: true, skipped: true };
  }

  const createdAt = new Date()
    .toLocaleTimeString("ar-LY", { hour: "2-digit", minute: "2-digit" })
    .replace(/[\u200e\u200f\u061c]/g, "");

  const groups = new Map<number, Pending[]>();
  for (const row of pending) {
    const list = groups.get(row.printerId) ?? [];
    list.push(row);
    groups.set(row.printerId, list);
  }

  const printedTo: PrintTargetResult[] = [];
  const failed: Array<PrintTargetResult & { reason: string }> = [];
  const succeededLineIds = new Set<number>();

  for (const [printerId, group] of groups) {
    const sample = group[0]!;
    const target = {
      printerId,
      printerName: sample.printerName,
      host: sample.host,
    };
    const itemLines = group.map((g) => ({ name: g.name, qty: g.qty }));
    const chunks = chunkKitchenLines(itemLines);
    try {
      for (let i = 0; i < chunks.length; i++) {
        const payload = buildKitchenEscPos({
          venueName: getVenueName(options.venueId),
          orderId: options.orderId,
          tableName: options.tableName,
          waiterName: options.staffName,
          createdAt,
          ticketPart:
            chunks.length > 1 ? `${i + 1}/${chunks.length}` : undefined,
          lines: chunks[i]!,
        });
        await printToPrinter({
          host: sample.host,
          port: sample.port,
          data: payload,
        });
      }
      printedTo.push(target);
      for (const g of group) succeededLineIds.add(g.lineId);
    } catch (error) {
      failed.push({
        ...target,
        reason:
          error instanceof Error
            ? error.message
            : `تعذر الاتصال بالطابعة ${sample.printerName}`,
      });
    }
  }

  for (const line of lines) {
    if (succeededLineIds.has(line.id) && line.qty > (line.kitchenSentQty ?? 0)) {
      db.update(orderItems)
        .set({ kitchenSentQty: line.qty })
        .where(eq(orderItems.id, line.id))
        .run();
    }
  }

  if (printedTo.length === 0) {
    return {
      error: failed
        .map((f) => `${f.printerName} (${f.host}): ${f.reason}`)
        .join(" — "),
    };
  }

  let message = `تم الإرسال إلى: ${printedTo.map((p) => p.printerName).join("، ")}`;
  if (failed.length > 0) {
    message += ` — فشلت: ${failed
      .map((f) => `${f.printerName} (${f.host})`)
      .join("، ")}`;
  }

  return { ok: true, skipped: false, printedTo, failed, message };
}

export async function confirmKitchenOrder(orderId: number): Promise<
  | { error: string }
  | {
      ok: true;
      printedTo: PrintTargetResult[];
      failed: Array<PrintTargetResult & { reason: string }>;
      message: string;
    }
> {
  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    return { error: "غير مصرح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "الفاتورة غير مفتوحة" };
  }
  if (!waiterOwnsOrder(session, order)) {
    return { error: "هذه الطاولة مع سفرادجي آخر" };
  }
  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;

  const result = await sendPendingKitchenTickets({
    orderId,
    venueId: order.venueId,
    tableName: table?.name ?? "بدون طاولة",
    staffName: session.name,
    requirePending: true,
  });

  if ("error" in result) {
    recordSessionAudit(session, {
      venueId: order.venueId,
      kind: "kitchen",
      orderId,
      success: false,
      detail: result.error,
    });
    return result;
  }

  revalidateOrderPaths(order.venueId, orderId, session.role);

  if (result.skipped) {
    return { error: "لا توجد أصناف جديدة لإرسالها للمطبخ" };
  }

  recordSessionAudit(session, {
    venueId: order.venueId,
    kind: "kitchen",
    orderId,
    printerName: result.printedTo.map((p) => p.printerName).join("، ") || null,
    success: result.failed.length === 0,
    detail: result.message,
  });

  return {
    ok: true,
    printedTo: result.printedTo,
    failed: result.failed,
    message: result.message,
  };
}

async function buildCheckoutReceiptForOrder(
  orderId: number,
): Promise<{ error: string } | { receipt: CheckoutReceiptData; venueId: VenueId }> {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "paid") {
    return { error: "الفاتورة غير مدفوعة أو غير موجودة" };
  }
  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }
  if (!order.paymentMethod) {
    return { error: "بيانات الدفع غير مكتملة" };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  if (lines.length === 0) {
    return { error: "الفاتورة فارغة" };
  }

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;
  const cashier = order.cashierId
    ? db.select().from(users).where(eq(users.id, order.cashierId)).get()
    : null;
  const isQuickSale = order.tableId === null;

  return {
    venueId: order.venueId,
    receipt: {
      venueName: getVenueName(order.venueId),
      orderId: order.id,
      tableName: table?.name ?? (isQuickSale ? "بيع سريع" : "بدون طاولة"),
      waiterName: waiter?.name ?? null,
      cashierName: cashier?.name ?? "كاشير",
      paymentMethod: order.paymentMethod,
      paidAt: formatDateTime(order.paidAt ?? order.createdAt),
      total: order.total,
      lines: lines.map((line) => ({
        name: line.itemName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    },
  };
}

async function printCheckoutReceipt(
  receipt: CheckoutReceiptData,
  printer: typeof printers.$inferSelect,
): Promise<
  | { printOk: true }
  | {
      printOk: false;
      printError: string;
    }
  | {
      printOk: false;
      browserPrint: true;
      receiptHtml: string;
    }
> {
  try {
    if (printer.connectionType === "local") {
      const footerMessage = getReceiptFooterMessage();
      const logoDataUrl = getReceiptLogoPrintDataUrl();
      return {
        printOk: false,
        browserPrint: true,
        receiptHtml: buildCheckoutReceiptHtml(
          { ...receipt, footerMessage },
          logoDataUrl,
        ),
      };
    }

    const data = await buildCheckoutPrintBytes(receipt);
    await printToPrinter({
      host: printer.host,
      port: printer.port,
      data,
    });
    return { printOk: true };
  } catch (error) {
    return {
      printOk: false,
      printError:
        error instanceof Error
          ? error.message
          : "تعذر طباعة فاتورة الدفع",
    };
  }
}

export async function payOrder(
  orderId: number,
  paymentMethod: PaymentMethod,
): Promise<
  | { error: string }
  | {
      ok: true;
      nextUrl: string;
      printOk: boolean;
      printError?: string;
      browserPrint?: boolean;
      receiptHtml?: string;
      message: string;
    }
> {
  const session = await getSession();
  if (!session || session.role !== "cashier") {
    return { error: "فقط الكاشير يمكنه الدفع" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "الفاتورة غير مفتوحة" };
  }
  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }

  const stationCtx = await getCashierStationContext(order.venueId);
  if ("error" in stationCtx) {
    return { error: stationCtx.error };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  if (lines.length === 0) {
    return { error: "الفاتورة فارغة" };
  }

  const total = recalcOrderTotal(orderId);
  const isQuickSale = order.tableId === null;
  const paidAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  db.update(orders)
    .set({
      status: "paid",
      paymentMethod,
      cashierId: session.userId,
      shiftId: null,
      total,
      paidAt,
    })
    .where(eq(orders.id, orderId))
    .run();

  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;

  const receipt: CheckoutReceiptData = {
    venueName: getVenueName(order.venueId),
    orderId: order.id,
    tableName: table?.name ?? (isQuickSale ? "بيع سريع" : "بدون طاولة"),
    waiterName: waiter?.name ?? null,
    cashierName: session.name,
    paymentMethod,
    paidAt: formatDateTime(paidAt),
    total,
    lines: lines.map((line) => ({
      name: line.itemName,
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
  };

  const printResult = await printCheckoutReceipt(
    receipt,
    stationCtx.printer,
  );

  const printed = auditPrintOutcome(printResult, stationCtx.printer.name);
  recordSessionAudit(session, {
    venueId: order.venueId,
    kind: "receipt",
    orderId,
    printerName: stationCtx.printer.name,
    success: printed.success,
    detail: printed.detail,
  });

  revalidatePath(`/cashier/${order.venueId}`);
  revalidatePath(`/waiter/${order.venueId}`);
  revalidatePath(`/cashier/${order.venueId}/order/${orderId}`);

  if ("browserPrint" in printResult && printResult.browserPrint) {
    return {
      ok: true,
      nextUrl: `/cashier/${order.venueId}`,
      printOk: false,
      browserPrint: true,
      receiptHtml: printResult.receiptHtml,
      message: `تم الدفع — اختر الطابعة في نافذة Chrome`,
    };
  }

  if (printResult.printOk) {
    return {
      ok: true,
      nextUrl: `/cashier/${order.venueId}`,
      printOk: true,
      message: `تم الدفع وطباعة الفاتورة على ${stationCtx.printer.name}`,
    };
  }

  const printError =
    "printError" in printResult ? printResult.printError : "تعذر الطباعة";

  return {
    ok: true,
    nextUrl: `/cashier/${order.venueId}`,
    printOk: false,
    printError,
    message: `تم الدفع بنجاح، لكن فشلت طباعة الفاتورة على ${stationCtx.printer.name}: ${printError}`,
  };
}

export type QuickSaleLine = {
  itemId: number;
  name: string;
  unitPrice: number;
  qty: number;
};

export async function payQuickSale(
  venueId: string,
  cart: QuickSaleLine[],
  paymentMethod: PaymentMethod,
): Promise<
  | { error: string }
  | {
      ok: true;
      printOk: boolean;
      printError?: string;
      browserPrint?: boolean;
      receiptHtml?: string;
      message: string;
    }
> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (cart.length === 0) {
    return { error: "الفاتورة فارغة" };
  }

  const stationCtx = await getCashierStationContext(venueId);
  if ("error" in stationCtx) {
    return { error: stationCtx.error };
  }

  const priced = cart.map((line) => {
    const qty = Math.max(1, Math.trunc(line.qty));
    const item = db
      .select()
      .from(items)
      .where(
        and(
          eq(items.id, line.itemId),
          availableAtVenue(items.venueId, venueId),
          eq(items.active, true),
        ),
      )
      .get();
    return item ? { item, qty } : null;
  });

  if (priced.some((line) => line === null)) {
    return { error: "أحد الأصناف غير متاح" };
  }

  const validLines = priced as { item: typeof items.$inferSelect; qty: number }[];
  const total = validLines.reduce(
    (sum, line) => sum + line.item.price * line.qty,
    0,
  );

  const order = db
    .insert(orders)
    .values({
      venueId,
      tableId: null,
      waiterId: null,
      cashierId: session.userId,
      shiftId: null,
      status: "open",
      total,
    })
    .returning()
    .get();

  for (const line of validLines) {
    db.insert(orderItems)
      .values({
        orderId: order.id,
        itemId: line.item.id,
        itemName: line.item.name,
        unitPrice: line.item.price,
        qty: line.qty,
        lineTotal: line.item.price * line.qty,
        kitchenSentQty: 0,
      })
      .run();
  }

  const savedLines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .all();
  if (savedLines.length === 0) {
    db.delete(orders).where(eq(orders.id, order.id)).run();
    return { error: "فشل حفظ أصناف البيع السريع" };
  }

  function abortQuickSale() {
    db.delete(orderItems).where(eq(orderItems.orderId, order.id)).run();
    db.delete(orders).where(eq(orders.id, order.id)).run();
  }

  // Fast sell must always print kitchen before checkout receipt
  const kitchenResult = await sendPendingKitchenTickets({
    orderId: order.id,
    venueId,
    tableName: "بيع سريع",
    staffName: session.name,
    requirePending: true,
  });
  if ("error" in kitchenResult) {
    recordSessionAudit(session, {
      venueId,
      kind: "kitchen",
      orderId: order.id,
      success: false,
      detail: kitchenResult.error,
    });
    abortQuickSale();
    return { error: `المطبخ: ${kitchenResult.error}` };
  }
  if (kitchenResult.skipped || kitchenResult.printedTo.length === 0) {
    recordSessionAudit(session, {
      venueId,
      kind: "kitchen",
      orderId: order.id,
      success: false,
      detail: "لم يتم طباعة تذكرة المطبخ",
    });
    abortQuickSale();
    return { error: "المطبخ: لم يتم طباعة تذكرة المطبخ — تحقق من طابعات المطبخ" };
  }

  recordSessionAudit(session, {
    venueId,
    kind: "kitchen",
    orderId: order.id,
    printerName: kitchenResult.printedTo.map((p) => p.printerName).join("، "),
    success: kitchenResult.failed.length === 0,
    detail: kitchenResult.message,
  });

  const paidAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  db.update(orders)
    .set({
      status: "paid",
      paymentMethod,
      paidAt,
    })
    .where(eq(orders.id, order.id))
    .run();

  const receipt: CheckoutReceiptData = {
    venueName: getVenueName(venueId),
    orderId: order.id,
    tableName: "بيع سريع",
    waiterName: null,
    cashierName: session.name,
    paymentMethod,
    paidAt: formatDateTime(paidAt),
    total,
    lines: validLines.map((line) => ({
      name: line.item.name,
      qty: line.qty,
      unitPrice: line.item.price,
      lineTotal: line.item.price * line.qty,
    })),
  };

  const printResult = await printCheckoutReceipt(
    receipt,
    stationCtx.printer,
  );

  const printed = auditPrintOutcome(printResult, stationCtx.printer.name);
  recordSessionAudit(session, {
    venueId,
    kind: "receipt",
    orderId: order.id,
    printerName: stationCtx.printer.name,
    success: printed.success,
    detail: printed.detail,
  });

  revalidatePath(`/cashier/${venueId}`);
  revalidatePath(`/cashier/${venueId}/quick`);

  const kitchenNote = ` + مطبخ (${kitchenResult.printedTo
    .map((p) => p.printerName)
    .join("، ")})`;

  if ("browserPrint" in printResult && printResult.browserPrint) {
    return {
      ok: true,
      printOk: false,
      browserPrint: true,
      receiptHtml: printResult.receiptHtml,
      message: `تم الدفع${kitchenNote} — اختر طابعة الفاتورة في نافذة Chrome`,
    };
  }

  if (printResult.printOk) {
    return {
      ok: true,
      printOk: true,
      message: `تم الدفع وطباعة الفاتورة على ${stationCtx.printer.name}${kitchenNote}`,
    };
  }

  const printError =
    "printError" in printResult ? printResult.printError : "تعذر الطباعة";

  return {
    ok: true,
    printOk: false,
    printError,
    message: `تم الدفع${kitchenNote}، لكن فشلت طباعة الفاتورة على ${stationCtx.printer.name}: ${printError}`,
  };
}

export async function reprintOrderReceipt(
  orderId: number,
  venueId: string,
): Promise<
  | { error: string }
  | {
      ok: true;
      printOk: boolean;
      printError?: string;
      browserPrint?: boolean;
      receiptHtml?: string;
      message: string;
    }
> {
  const session = await getSession();
  if (!session || session.role !== "cashier") {
    return { error: "غير مصرح" };
  }
  if (!isVenueId(venueId)) {
    return { error: "فرع غير صالح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "paid") {
    return { error: "الفاتورة غير مدفوعة" };
  }
  if (order.venueId !== venueId) {
    return { error: "الفاتورة لقسم آخر" };
  }
  if (order.cashierId !== session.userId) {
    return { error: "يمكنك إعادة طباعة مبيعاتك فقط" };
  }

  const built = await buildCheckoutReceiptForOrder(orderId);
  if ("error" in built) {
    return { error: built.error };
  }

  const stationCtx = await getCashierStationContext(venueId);
  if ("error" in stationCtx) {
    return { error: stationCtx.error };
  }

  const printResult = await printCheckoutReceipt(
    built.receipt,
    stationCtx.printer,
  );

  const printed = auditPrintOutcome(printResult, stationCtx.printer.name);
  recordSessionAudit(session, {
    venueId,
    kind: "reprint",
    orderId,
    printerName: stationCtx.printer.name,
    success: printed.success,
    detail: printed.detail,
  });

  if ("browserPrint" in printResult && printResult.browserPrint) {
    return {
      ok: true,
      printOk: false,
      browserPrint: true,
      receiptHtml: printResult.receiptHtml,
      message: "اختر الطابعة في نافذة Chrome",
    };
  }

  if (printResult.printOk) {
    return {
      ok: true,
      printOk: true,
      message: `تمت إعادة الطباعة على ${stationCtx.printer.name}`,
    };
  }

  const printError =
    "printError" in printResult ? printResult.printError : "تعذر الطباعة";

  return {
    ok: true,
    printOk: false,
    printError,
    message: `فشلت إعادة الطباعة: ${printError}`,
  };
}

type PreviewPrintResult =
  | { error: string }
  | {
      ok: true;
      printOk: boolean;
      printError?: string;
      browserPrint?: boolean;
      receiptHtml?: string;
      message: string;
    };

async function finishPreviewPrint(
  receipt: CheckoutReceiptData,
  venueId: VenueId,
  session: { userId: number; name: string; role: string },
): Promise<PreviewPrintResult> {
  const stationCtx = await getCashierStationContext(venueId);
  if ("error" in stationCtx) {
    recordSessionAudit(session, {
      venueId,
      kind: "preview",
      orderId: receipt.orderId || null,
      success: false,
      detail: stationCtx.error,
    });
    return { error: stationCtx.error };
  }

  const printResult = await printCheckoutReceipt(receipt, stationCtx.printer);
  const printed = auditPrintOutcome(printResult, stationCtx.printer.name);
  recordSessionAudit(session, {
    venueId,
    kind: "preview",
    orderId: receipt.orderId || null,
    printerName: stationCtx.printer.name,
    success: printed.success,
    detail: printed.detail,
  });

  if ("browserPrint" in printResult && printResult.browserPrint) {
    return {
      ok: true,
      printOk: false,
      browserPrint: true,
      receiptHtml: printResult.receiptHtml,
      message: "اختر الطابعة في نافذة Chrome",
    };
  }

  if (printResult.printOk) {
    return {
      ok: true,
      printOk: true,
      message: `تمت طباعة الفاتورة على ${stationCtx.printer.name}`,
    };
  }

  const printError =
    "printError" in printResult ? printResult.printError : "تعذر الطباعة";

  return {
    ok: true,
    printOk: false,
    printError,
    message: `فشلت طباعة الفاتورة: ${printError}`,
  };
}

/** Print the same checkout receipt before payment, for the customer to review. */
export async function printOpenOrderReceipt(
  orderId: number,
): Promise<PreviewPrintResult> {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "cashier" && session.role !== "waiter")
  ) {
    return { error: "غير مصرح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "الفاتورة غير مفتوحة" };
  }
  if (!isVenueId(order.venueId)) {
    return { error: "فرع غير صالح" };
  }
  if (!waiterOwnsOrder(session, order)) {
    return { error: "هذه الطاولة مع سفرادجي آخر" };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();
  if (lines.length === 0) {
    return { error: "أضف أصنافاً قبل طباعة الفاتورة" };
  }

  const total = recalcOrderTotal(orderId);
  const table = order.tableId
    ? db.select().from(tables).where(eq(tables.id, order.tableId)).get()
    : null;
  const waiter = order.waiterId
    ? db.select().from(users).where(eq(users.id, order.waiterId)).get()
    : null;

  return finishPreviewPrint(
    {
      venueName: getVenueName(order.venueId),
      orderId: order.id,
      tableName: table?.name ?? (order.tableId === null ? "بيع سريع" : "بدون طاولة"),
      waiterName: waiter?.name ?? (session.role === "waiter" ? session.name : null),
      cashierName: session.role === "cashier" ? session.name : "—",
      paymentMethod: "preview",
      paidAt: formatDateTime(new Date().toISOString().slice(0, 19).replace("T", " ")),
      total,
      lines: lines.map((line) => ({
        name: line.itemName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    },
    order.venueId,
    session,
  );
}

export async function printQuickSalePreview(
  venueId: string,
  cart: QuickSaleLine[],
): Promise<PreviewPrintResult> {
  const session = await getSession();
  if (!session || session.role !== "cashier" || !isVenueId(venueId)) {
    return { error: "غير مصرح" };
  }
  if (cart.length === 0) {
    return { error: "أضف أصنافاً قبل طباعة الفاتورة" };
  }

  const priced = cart.map((line) => {
    const qty = Math.max(1, Math.trunc(line.qty));
    const item = db
      .select()
      .from(items)
      .where(
        and(
          eq(items.id, line.itemId),
          availableAtVenue(items.venueId, venueId),
          eq(items.active, true),
        ),
      )
      .get();
    return item ? { item, qty } : null;
  });

  if (priced.some((line) => line === null)) {
    return { error: "أحد الأصناف غير متاح" };
  }

  const validLines = priced as { item: typeof items.$inferSelect; qty: number }[];
  const total = validLines.reduce(
    (sum, line) => sum + line.item.price * line.qty,
    0,
  );

  return finishPreviewPrint(
    {
      venueName: getVenueName(venueId),
      orderId: 0,
      tableName: "بيع سريع",
      waiterName: null,
      cashierName: session.name,
      paymentMethod: "preview",
      paidAt: formatDateTime(new Date().toISOString().slice(0, 19).replace("T", " ")),
      total,
      lines: validLines.map((line) => ({
        name: line.item.name,
        qty: line.qty,
        unitPrice: line.item.price,
        lineTotal: line.item.price * line.qty,
      })),
    },
    venueId,
    session,
  );
}

export async function cancelOpenOrder(orderId: number) {
  const session = await getSession();
  if (!session || (session.role !== "waiter" && session.role !== "cashier")) {
    return { error: "غير مصرح" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order || order.status !== "open") {
    return { error: "غير مصرح" };
  }
  if (!waiterOwnsOrder(session, order)) {
    return { error: "هذه الطاولة مع سفرادجي آخر" };
  }

  const lines = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();

  if (lines.length > 0 && session.role !== "cashier") {
    return { error: "لا يمكن إلغاء فاتورة تحتوي أصنافاً" };
  }

  db.update(orders)
    .set({ status: "cancelled" })
    .where(eq(orders.id, orderId))
    .run();

  const base =
    session.role === "cashier"
      ? `/cashier/${order.venueId}`
      : `/waiter/${order.venueId}`;
  revalidatePath(base);
  redirect(base);
}

function revalidateOrderPaths(
  venueId: VenueId,
  orderId: number,
  role: string,
) {
  if (role === "waiter") {
    revalidatePath(`/waiter/${venueId}`);
    revalidatePath(`/waiter/${venueId}/order/${orderId}`);
  } else {
    revalidatePath(`/cashier/${venueId}`);
    revalidatePath(`/cashier/${venueId}/order/${orderId}`);
    revalidatePath(`/cashier/${venueId}/quick`);
  }
}
