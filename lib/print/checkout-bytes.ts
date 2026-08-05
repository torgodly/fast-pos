import { buildCheckoutEscPos } from "./escpos";
import { getReceiptLogoEscPos } from "./logo";
import type { CheckoutReceiptData } from "./receipts";
import { getReceiptFooterMessage } from "@/lib/settings";

export async function buildCheckoutPrintBytes(
  receipt: CheckoutReceiptData,
): Promise<Uint8Array> {
  const logo = await getReceiptLogoEscPos();
  const footerMessage = getReceiptFooterMessage();
  return buildCheckoutEscPos({ ...receipt, footerMessage }, logo);
}
