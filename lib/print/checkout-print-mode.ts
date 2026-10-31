export type CheckoutPrintMode = "windows" | "network";

export function isExplicitWindowsPrinterName(host: string | null | undefined) {
  const name = host?.trim() ?? "";
  return name.length > 0 && name.toLowerCase() !== "default";
}

export function resolveCheckoutPrintMode(printer: {
  connectionType: string;
}): CheckoutPrintMode {
  // Fast POS runs as a Windows service (LocalSystem); a "default" queue is not
  // the cashier's default, so local rows must carry an explicit queue name.
  return printer.connectionType === "local" ? "windows" : "network";
}

export function validateSystemPrinterName(
  host: string | null | undefined,
): string | null {
  if (isExplicitWindowsPrinterName(host)) return null;
  return "اختر طابعة Windows محددة — الطابعة الافتراضية تتبع حساب الخدمة وقد تطبع على طابعة أخرى";
}
