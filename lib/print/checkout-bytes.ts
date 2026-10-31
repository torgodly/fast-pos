import type { CheckoutReceiptData } from "./receipts";
import { buildReceiptEscPos } from "./templates/build";

export async function buildCheckoutPrintBytes(
  receipt: CheckoutReceiptData,
): Promise<Uint8Array> {
  return buildReceiptEscPos(receipt);
}
