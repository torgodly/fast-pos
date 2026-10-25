import {
  isExplicitWindowsPrinterName,
  validateAutoPrintHost,
} from "./checkout-print-mode";

export type ShiftReportPrintMode = "network" | "windows" | "unsupported";

type ReportPrinter = {
  connectionType: string;
  autoPrint: boolean;
  host: string;
};

export function resolveShiftReportPrintMode(
  printer: ReportPrinter,
): ShiftReportPrintMode {
  if (printer.connectionType !== "local") return "network";
  if (!printer.autoPrint) return "unsupported";
  return isExplicitWindowsPrinterName(printer.host) ? "windows" : "unsupported";
}

export function shiftReportPrintError(printer: ReportPrinter): string | null {
  if (printer.connectionType !== "local") return null;
  if (!printer.autoPrint) {
    return "طباعة تقارير الوردية تحتاج طابعة شبكة أو تفعيل «طباعة تلقائية» مع تحديد طابعة Windows";
  }
  return validateAutoPrintHost("local", true, printer.host);
}
