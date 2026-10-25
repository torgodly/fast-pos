export type ReceiptBrandBlock = {
  title: string;
  subtitle: string;
  contacts: string[];
};

export function receiptBrandBlock(input: {
  venueName: string;
  brandName?: string | null;
  brandPhone?: string | null;
  brandAddress?: string | null;
}): ReceiptBrandBlock {
  const venueName = input.venueName.trim();
  const brandName = input.brandName?.trim();

  return {
    title: brandName || venueName,
    subtitle: brandName ? `${venueName} · إيصال الدفع` : "إيصال الدفع",
    contacts: [input.brandPhone, input.brandAddress]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  };
}
