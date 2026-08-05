import { buildTestEscPos } from "./escpos";
import { getReceiptLogoEscPos } from "./logo";

export async function buildTestPrintBytes(
  printerName: string,
): Promise<Uint8Array> {
  const logo = await getReceiptLogoEscPos();
  return buildTestEscPos(printerName, logo);
}
