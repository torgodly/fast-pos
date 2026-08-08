/** Fixed report / menu groups (Arabic), same order for every venue. */
export const REPORT_GROUP_NAMES = [
  "خبز",
  "الإفطار",
  "مشروبات باردة",
  "مشروبات ساخنة",
  "معجنات",
  "ساندويتش",
  "فيينوازري",
] as const;

export type ReportGroupName = (typeof REPORT_GROUP_NAMES)[number];

/** Map legacy category names → new report groups. */
export const LEGACY_CATEGORY_TO_GROUP: Record<string, ReportGroupName> = {
  خبز: "خبز",
  الإفطار: "الإفطار",
  القهوة: "مشروبات ساخنة",
  الشاي: "مشروبات ساخنة",
  الموهيتو: "مشروبات باردة",
  العصائر: "مشروبات باردة",
  "ميلك شيك": "مشروبات باردة",
  "مشروبات غازية و مياه": "مشروبات باردة",
  "مشروبات باردة": "مشروبات باردة",
  "مشروبات ساخنة": "مشروبات ساخنة",
  إكلير: "معجنات",
  التارت: "معجنات",
  "كيك شوكولاتة": "معجنات",
  "تشيز كيك": "معجنات",
  كوكيز: "فيينوازري",
  ميلفاي: "معجنات",
  "إنجلش كيك": "معجنات",
  "حلويات خاصة": "معجنات",
  معجنات: "معجنات",
  ساندويتش: "ساندويتش",
  فيينوازري: "فيينوازري",
};

export const DEFAULT_REPORT_GROUP: ReportGroupName = "معجنات";
