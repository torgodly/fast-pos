import { isExplicitWindowsPrinterName } from "./checkout-print-mode";

export type ShiftReportPrintMode = "network" | "windows" | "unsupported";

type ReportPrinter = {
  connectionType: string;
  host: string;
};

export function resolveShiftReportPrintMode(
  printer: ReportPrinter,
): ShiftReportPrintMode {
  if (printer.connectionType !== "local") return "network";
  return isExplicitWindowsPrinterName(printer.host) ? "windows" : "unsupported";
}

export function shiftReportPrintError(printer: ReportPrinter): string | null {
  if (printer.connectionType !== "local") return null;
  if (isExplicitWindowsPrinterName(printer.host)) return null;
  return "اختر طابعة Windows محددة من الإدارة ← الطابعات لطباعة تقارير الوردية";
}
