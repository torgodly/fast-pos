"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  addItemToOrder,
  removeOrderItem,
  updateOrderItemQty,
} from "@/app/actions/orders";
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

export function OrderMenu({
  orderId,
  categories,
  items,
  lines,
  total,
  footer,
}: {
  orderId: number;
  categories: MenuCategory[];
  items: MenuItem[];
  lines: Line[];
  total: number;
  footer?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [cartOpen, setCartOpen] = useState(false);

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

  const ticketLines: PosTicketLine[] = lines.map((line) => ({
    key: line.id,
    name: line.itemName,
    qty: line.qty,
    lineTotal: line.lineTotal,
    unitPrice: line.unitPrice,
    kitchenSent: line.kitchenSentQty ?? 0,
  }));

  function add(itemId: number) {
    startTransition(async () => {
      await addItemToOrder(orderId, itemId);
    });
  }

  function changeQty(key: string | number, qty: number) {
    startTransition(async () => {
      await updateOrderItemQty(Number(key), qty);
    });
  }

  function remove(key: string | number) {
    startTransition(async () => {
      await removeOrderItem(Number(key));
    });
  }

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

  return (
    <>
      <div className="grid min-h-0 flex-1 gap-1.5 overflow-hidden pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,34%)] lg:pb-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border border-base-300 bg-base-100 p-1.5">
          <CategoryItemPicker
            categories={categories}
            items={items}
            categoryCounts={categoryCounts}
            pending={pending}
            onAddItem={(item) => add(item.id)}
          />
        </div>

        <div className="hidden h-full min-h-0 lg:flex lg:flex-col">
          <PosTicketPanel
            itemCount={itemCount}
            total={total}
            lines={ticketLines}
            pending={pending}
            emptyLabel="لا أصناف"
            onChangeQty={changeQty}
            onRemove={remove}
            footer={footer}
          />
        </div>
      </div>

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
        footer={footerBlock}
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
  );
}
