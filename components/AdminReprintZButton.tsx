"use client";

import { useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { adminReprintZReport } from "@/app/actions/shifts";
import { useToast } from "@/components/ToastProvider";

export function AdminReprintZButton({ shiftId }: { shiftId: number }) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm gap-1.5 rounded-xl"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await adminReprintZReport(shiftId);
          if ("error" in result) {
            showToast("error", result.error);
            return;
          }
          showToast("success", result.message);
        });
      }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Printer className="size-3.5" />
      )}
      طباعة
    </button>
  );
}
