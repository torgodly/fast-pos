export const BRAND_LIMITS = { name: 60, phone: 30, address: 120 } as const;

export type BrandDetails = {
  name: string;
  phone: string;
  address: string;
};

export function validateBrandDetails(details: BrandDetails): string | null {
  if (details.name.trim().length > BRAND_LIMITS.name) {
    return `اسم العلامة أطول من ${BRAND_LIMITS.name} حرفاً`;
  }
  if (details.phone.trim().length > BRAND_LIMITS.phone) {
    return `رقم الهاتف أطول من ${BRAND_LIMITS.phone} حرفاً`;
  }
  if (details.address.trim().length > BRAND_LIMITS.address) {
    return `العنوان أطول من ${BRAND_LIMITS.address} حرفاً`;
  }
  return null;
}
