"use client";

import { printHtmlReceipt } from "@/lib/print/receipts";

type BrowserPrintInput = {
  browserPrint?: boolean;
  receiptHtml?: string;
  stationName?: string;
};

export async function finishCheckoutPrint(
  result: BrowserPrintInput,
): Promise<{ printOk: boolean; message: string }> {
  if (!result.browserPrint || !result.receiptHtml) {
    return { printOk: true, message: "" };
  }

  try {
    await printHtmlReceipt(result.receiptHtml);
    const station = result.stationName ? ` (${result.stationName})` : "";
    return {
      printOk: true,
      message: `تم الدفع وطباعة الفاتورة${station}`,
    };
  } catch (error) {
    return {
      printOk: false,
      message:
        error instanceof Error
          ? `تم الدفع — فشلت الطباعة: ${error.message}`
          : "تم الدفع — فشلت الطباعة من المتصفح",
    };
  }
}
