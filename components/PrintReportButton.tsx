"use client";

import { useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { printReportSummary } from "@/app/actions/reports";
import { useToast } from "@/components/ToastProvider";
import type { ReportFiltersInput } from "@/lib/reports/filters";

export function PrintReportButton({ filters }: { filters: ReportFiltersInput }) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await printReportSummary(filters);
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
      className="btn btn-sm gap-2 rounded-xl border-white/15 bg-white/10 text-white hover:bg-white/20"
      disabled={pending}
      onClick={run}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Printer className="size-3.5" />
      )}
      طباعة التقرير
    </button>
  );
}
