"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  addItemToOrder,
  removeOrderItem,
  updateOrderItemQty,
} from "@/app/actions/orders";
import {
  CancelKitchenItemDialog,
  type CancelKitchenTarget,
} from "@/components/CancelKitchenItemDialog";
import {
  CategoryItemPicker,
  type MenuCategory,
  type MenuItem,
} from "@/components/CategoryItemPicker";
import {
  PosMobileBar,
  PosMobileSheet,
  PosTicketLines,
  PosTicketPanel,
  type PosTicketLine,
} from "@/components/PosTicket";
import { formatMoney } from "@/lib/venues";

type Line = {
  id: number;
  itemId: number | null;
  itemName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  kitchenSentQty?: number | null;
};

export type CancelledTicketLine = {
  id: number;
  name: string;
  qty: number;
  reason: string;
  removedByName: string;
};

export function OrderMenu({
  orderId,
  categories,
  items,
  lines,
  total,
  footer,
  isMainCashier = false,
  cancelledLines = [],
  ticketAlwaysVisible = false,
}: {
  orderId: number;
  categories: MenuCategory[];
  items: MenuItem[];
  lines: Line[];
  total: number;
  footer?: ReactNode;
  isMainCashier?: boolean;
  cancelledLines?: CancelledTicketLine[];
  ticketAlwaysVisible?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [cartOpen, setCartOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CancelKitchenTarget | null>(
    null,
  );

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty, 0),
    [lines],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const cat of categories) counts[cat.id] = 0;
    const itemById = new Map(items.map((item) => [item.id, item]));
    for (const line of lines) {
      if (line.itemId == null) continue;
      const item = itemById.get(line.itemId);
      if (item) {
        counts[item.categoryId] = (counts[item.categoryId] ?? 0) + line.qty;
      }
    }
    return counts;
  }, [lines, items, categories]);

  const ticketLines: PosTicketLine[] = lines.map((line) => {
    const kitchenSent = line.kitchenSentQty ?? 0;
    return {
      key: line.id,
      name: line.itemName,
      qty: line.qty,
      lineTotal: line.lineTotal,
      unitPrice: line.unitPrice,
      kitchenSent,
      canReduce: isMainCashier || line.qty > kitchenSent,
      canRemove: isMainCashier || kitchenSent === 0,
    };
  });

  function add(itemId: number) {
    startTransition(async () => {
      await addItemToOrder(orderId, itemId);
    });
  }

  function openKitchenCancel(line: Line, defaultRemoveQty: number) {
    setCancelTarget({
      id: line.id,
      name: line.itemName,
      qty: line.qty,
      unitPrice: line.unitPrice,
      kitchenSent: line.kitchenSentQty ?? 0,
      defaultRemoveQty,
    });
  }

  function changeQty(key: string | number, qty: number) {
    const line = lines.find((row) => row.id === Number(key));
    if (!line) return;
    const kitchenSent = line.kitchenSentQty ?? 0;
    if (isMainCashier && qty < kitchenSent) {
      openKitchenCancel(line, Math.max(1, line.qty - qty));
      return;
    }
    startTransition(async () => {
      await updateOrderItemQty(Number(key), qty);
    });
  }

  function remove(key: string | number) {
    const line = lines.find((row) => row.id === Number(key));
    if (!line) return;
    if (isMainCashier && (line.kitchenSentQty ?? 0) > 0) {
      openKitchenCancel(line, line.qty);
      return;
    }
    startTransition(async () => {
      await removeOrderItem(Number(key));
    });
  }

  const cancelledBlock =
    cancelledLines.length > 0 ? (
      <div className="rounded-lg border border-error/20 bg-error/5 px-2 py-1.5 text-[11px]">
        <p className="mb-1 font-black text-error">أُلغي من الكاشير الرئيسي</p>
        <ul className="space-y-1">
          {cancelledLines.map((row) => (
            <li key={row.id}>
              <span className="font-bold">
                −{row.qty}× {row.name}
              </span>
              <span className="text-base-content/55">
                {" "}
                · {row.removedByName} · {row.reason}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const footerBlock = (
    <>
      <div className="flex items-center justify-between lg:hidden">
        <span className="text-sm font-bold text-base-content/50">
          الإجمالي
        </span>
        <span className="text-lg font-black tabular-nums text-primary">
          {formatMoney(total)}
        </span>
      </div>
      {footer}
    </>
  );

  const ticketFooter = (
    <>
      {cancelledBlock}
      {footer}
    </>
  );

  return (
    <>
      <div
        className={`grid min-h-0 min-w-0 flex-1 overflow-hidden ${
          ticketAlwaysVisible
            ? "grid-rows-[minmax(0,1fr)_minmax(13rem,40%)] md:grid-rows-1 md:grid-cols-[minmax(0,1fr)_minmax(16rem,36%)]"
            : "grid-rows-[minmax(0,1fr)] pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,34%)] lg:pb-0"
        }`}
      >
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border border-base-300 bg-base-100 p-1.5">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            onAddItem={(item) => add(item.id)}
          />
        </div>

        <div
          className={`min-h-0 ${
            ticketAlwaysVisible ? "flex flex-col" : "hidden lg:flex lg:flex-col"
          }`}
        >
          <PosTicketPanel
            itemCount={itemCount}
            total={total}
            lines={ticketLines}
            pending={pending}
            emptyLabel="لا أصناف"
            compact={ticketAlwaysVisible}
            onChangeQty={changeQty}
            onRemove={remove}
            footer={ticketFooter}
          />
        </div>
      </div>

      {ticketAlwaysVisible ? null : (
        <>
          <PosMobileBar
            itemCount={itemCount}
            total={total}
            actionLabel="فاتورة"
            onOpen={() => setCartOpen(true)}
          />

          <PosMobileSheet
            open={cartOpen}
            title="فاتورة"
            itemCount={itemCount}
            onClose={() => setCartOpen(false)}
            footer={
              <>
                {cancelledBlock}
                {footerBlock}
              </>
            }
          >
            <PosTicketLines
              lines={ticketLines}
              pending={pending}
              emptyLabel="لا أصناف"
              onChangeQty={changeQty}
              onRemove={remove}
            />
          </PosMobileSheet>
        </>
      )}

      <CancelKitchenItemDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
      />
    </>
  );
}
