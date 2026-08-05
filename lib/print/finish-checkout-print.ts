"use client";

import { printViaLocalAgent } from "@/lib/print/local-client";

type LocalPrintInput = {
  localPrint?: boolean;
  printData?: string;
  localPrinterName?: string;
  stationName?: string;
};

export async function finishCheckoutPrint(
  result: LocalPrintInput,
): Promise<{ printOk: boolean; message: string }> {
  if (!result.localPrint || !result.printData) {
    return { printOk: true, message: "" };
  }

  const local = await printViaLocalAgent({
    data: result.printData,
    printerName: result.localPrinterName,
  });

  if ("error" in local) {
    return {
      printOk: false,
      message: `تم الدفع — فشلت الطباعة المحلية: ${local.error}`,
    };
  }

  const station = result.stationName ? ` (${result.stationName})` : "";
  return {
    printOk: true,
    message: `تم الدفع وطباعة الفاتورة على الطابعة المحلية${station}`,
  };
}
