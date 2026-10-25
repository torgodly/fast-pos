import { buildCheckoutEscPos } from "./escpos";
import { getReceiptLogoEscPos } from "./logo";
import type { CheckoutReceiptData } from "./receipts";
import { getBrandDetails, getReceiptFooterMessage } from "@/lib/settings";

export async function buildCheckoutPrintBytes(
  receipt: CheckoutReceiptData,
): Promise<Uint8Array> {
  const logo = await getReceiptLogoEscPos();
  const footerMessage = getReceiptFooterMessage();
  const brand = getBrandDetails();
  return buildCheckoutEscPos(
    {
      ...receipt,
      footerMessage,
      brandName: brand.name,
      brandPhone: brand.phone,
      brandAddress: brand.address,
    },
    logo,
  );
}
