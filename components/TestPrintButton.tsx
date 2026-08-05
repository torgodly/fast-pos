"use client";

import { useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { testPrinter } from "@/app/actions/admin";
import { useToast } from "@/components/ToastProvider";

export function TestPrintButton({ printerId }: { printerId: number }) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await testPrinter(printerId);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast("success", result.message);
    });
  }

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm gap-1.5 rounded-xl"
      disabled={pending}
      onClick={run}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Printer className="size-3.5" />
      )}
      اختبار طباعة
    </button>
  );
}
