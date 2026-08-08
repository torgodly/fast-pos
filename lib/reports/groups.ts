/** Cafe report / menu groups. */
export const CAFE_REPORT_GROUPS = [
  "خبز",
  "الإفطار",
  "مشروبات باردة",
  "مشروبات ساخنة",
  "معجنات",
  "ساندويتش",
  "فيينوازري",
] as const;

/** Restaurant report / menu groups. */
export const RESTAURANT_REPORT_GROUPS = [
  "شوربة",
  "السلطات",
  "الباستا",
  "اسماك",
  "مشروبات باردة",
  "مشروبات ساخنة",
] as const;

/** @deprecated use reportGroupsForVenue — kept for older imports */
export const REPORT_GROUP_NAMES = CAFE_REPORT_GROUPS;

export type CafeReportGroup = (typeof CAFE_REPORT_GROUPS)[number];
export type RestaurantReportGroup = (typeof RESTAURANT_REPORT_GROUPS)[number];
export type ReportGroupName = CafeReportGroup | RestaurantReportGroup;

export function reportGroupsForVenue(venueId: string): readonly string[] {
  return venueId === "restaurant"
    ? RESTAURANT_REPORT_GROUPS
    : CAFE_REPORT_GROUPS;
}

/** Categories that should print to display/drinks printer (not hot kitchen). */
export const DISPLAY_PRINTER_GROUPS = new Set([
  "خبز",
  "معجنات",
  "ساندويتش",
  "فيينوازري",
  "مشروبات باردة",
  "مشروبات ساخنة",
]);

/** Map legacy category names → cafe report groups. */
export const LEGACY_CATEGORY_TO_GROUP: Record<string, string> = {
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
  شوربة: "شوربة",
  السلطات: "السلطات",
  الباستا: "الباستا",
  اسماك: "اسماك",
  مشويات: "الباستا",
};

export const DEFAULT_CAFE_GROUP = "معجنات";
export const DEFAULT_RESTAURANT_GROUP = "الباستا";
/** @deprecated */
export const DEFAULT_REPORT_GROUP = DEFAULT_CAFE_GROUP;
