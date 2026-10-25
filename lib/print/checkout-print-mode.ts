export type CheckoutPrintMode = "browser" | "windows" | "network";

export function isExplicitWindowsPrinterName(host: string | null | undefined) {
  const name = host?.trim() ?? "";
  return name.length > 0 && name.toLowerCase() !== "default";
}

export function resolveCheckoutPrintMode(printer: {
  connectionType: string;
  autoPrint: boolean;
  host: string;
}): CheckoutPrintMode {
  if (printer.connectionType !== "local") return "network";
  if (!printer.autoPrint) return "browser";
  // Fast POS runs as a Windows service (LocalSystem); its "default" queue is not
  // the logged-in cashier's default and may be a kitchen printer.
  return isExplicitWindowsPrinterName(printer.host) ? "windows" : "browser";
}

export function resolvePrinterAutoPrint(
  role: string,
  connectionType: string,
  requested: boolean,
): boolean {
  if (connectionType !== "local") return false;
  return role === "checkout" || role === "both" ? requested : false;
}

export function validateAutoPrintHost(
  connectionType: string,
  autoPrint: boolean,
  host: string,
): string | null {
  if (!autoPrint || connectionType !== "local") return null;
  if (isExplicitWindowsPrinterName(host)) return null;
  return "اختر طابعة Windows محددة للطباعة التلقائية — الطابعة الافتراضية تتبع حساب الخدمة وقد تطبع على طابعة أخرى";
}
