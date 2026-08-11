"use client";

import { useState, useTransition } from "react";
import { Armchair, Users } from "lucide-react";
import { openTableOrder } from "@/app/actions/orders";
import { ConfirmSheet } from "@/components/ConfirmSheet";

export function OpenTableButton({
  venueId,
  tableId,
  tableName,
}: {
  venueId: string;
  tableId: number;
  tableName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmOpen() {
    startTransition(async () => {
      await openTableOrder(venueId, tableId);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-24 w-full flex-col justify-between rounded-xl border border-base-300/70 bg-base-100 px-3 py-2.5 text-right hover:border-primary/40"
      >
        <div>
          <p className="font-black">{tableName}</p>
          <p className="text-xs text-base-content/45">متاحة</p>
        </div>
        <Armchair className="size-4 text-base-content/25" />
      </button>

      <ConfirmSheet
        open={open}
        title="فتح الطاولة"
        description={
          <>
            أخذ{" "}
            <span className="font-black text-base-content">{tableName}</span>{" "}
            للزبائن الآن؟ ستُضاف إلى طاولاتك.
          </>
        }
        confirmLabel="افتح الطاولة"
        cancelLabel="رجوع"
        pending={pending}
        icon={<Users className="size-6 text-primary" />}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={confirmOpen}
      />
    </>
  );
}
