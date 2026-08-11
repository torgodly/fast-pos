"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { printReportSummary } from "@/app/actions/reports";
import { useToast } from "@/components/ToastProvider";
import { printHtmlReceipt } from "@/lib/print/receipts";
import type { ReportFiltersInput } from "@/lib/reports/filters";

type PrinterChoice = {
  id: number;
  name: string;
  connectionType: string;
};

export function PrintReportButton({
  filters,
  printers,
}: {
  filters: ReportFiltersInput;
  printers: PrinterChoice[];
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [printerId, setPrinterId] = useState(String(printers[0]?.id ?? ""));

  useEffect(() => {
    if (!printers.some((printer) => String(printer.id) === printerId)) {
      setPrinterId(String(printers[0]?.id ?? ""));
    }
  }, [printers, printerId]);

  function run() {
    const id = Number(printerId);
    if (!id) {
      showToast("error", "اختر طابعة");
      return;
    }
    startTransition(async () => {
      const result = await printReportSummary(filters, id);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      if ("browserPrint" in result && result.browserPrint) {
        try {
          await printHtmlReceipt(result.receiptHtml);
          showToast("success", result.message);
        } catch (error) {
          showToast(
            "error",
            error instanceof Error ? error.message : "تعذر فتح نافذة الطباعة",
          );
        }
        return;
      }
      showToast("success", result.message);
    });
  }

  if (printers.length === 0) {
    return (
      <p className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/75">
        أضف طابعة شبكة من الإدارة ← الطابعات
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <select
        value={printerId}
        onChange={(event) => setPrinterId(event.target.value)}
        className="select select-sm min-w-44 rounded-xl border-white/20 bg-white/10 text-white"
        disabled={pending}
      >
        {printers.map((printer) => (
          <option key={printer.id} value={printer.id} className="text-neutral">
            {printer.name}
            {printer.connectionType === "local" ? " · متصفح" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-sm gap-2 rounded-xl border-white/15 bg-white text-neutral hover:bg-white/90"
        disabled={pending}
        onClick={run}
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Printer className="size-3.5" />
        )}
        طباعة الأصناف والمجموعات
      </button>
    </div>
  );
}
