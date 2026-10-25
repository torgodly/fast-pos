# Brand details on customer receipts — worklog

Date: 2026-10-25
Status: done, verified in browser, tests + production build green

## Request

Add brand details to the admin settings page, in the same section as the receipt
footer message. Approved design:

- Collect **brand name**, **phone**, **address** (phone and address optional).
- One set of values shared by both venues (restaurant + cafe).
- The customer **checkout** receipt shows the brand block; the venue name is kept as a
  small subtitle so the receipt still identifies the branch.
- No schema migration — stored in `app_settings` like the footer message.

## Decisions

- Brand name replaces the venue name as the receipt title. If no brand name is saved,
  the receipt falls back to the venue name and the old “إيصال الدفع” subtitle.
- When a brand name is set, subtitle becomes `<venueName> · إيصال الدفع`.
- Phone then address print under the title (centered in ESC/POS, right-aligned in HTML).
- Length bounds live in a client-safe module: name 60, phone 30, address 120.
  `lib/brand.ts` must stay free of DB imports — a client component importing limits from
  `lib/settings.ts` would pull better-sqlite3 into the client bundle.
- “إعادة للافتراضي” now clears brand details **and** the footer message together, since
  they share one form/section.

## Files

- `lib/brand.ts` (new) — `BrandDetails`, `BRAND_LIMITS`, `validateBrandDetails`.
- `lib/print/brand.ts` (new) — `receiptBrandBlock()` shared title/subtitle/contacts
  builder used by both printers.
- `lib/settings.ts` — `brand_name`, `brand_phone`, `brand_address` keys;
  `getBrandDetails()`, `setBrandDetails()` (empty values delete the row),
  `clearBrandDetails()`.
- `lib/print/receipts.ts` — checkout HTML title/subtitle/contact rows; `.brand-contact`
  style; escapes all brand values.
- `lib/print/escpos.ts` — `headerBlock()` accepts contacts and prints them centered at
  fontSize 26 below the subtitle.
- `lib/print/checkout-bytes.ts` — loads brand details for network ESC/POS checkout.
- `app/actions/orders.ts` — passes brand details into the local (Chrome dialog) HTML.
- `app/actions/admin.ts` — `saveReceiptSettings` now takes message + brand object,
  validates bounds, saves both; `resetReceiptSettings` clears both.
- `components/admin/ReceiptSettingsForm.tsx` — brand fields (name/tel/address with
  maxLength), single save/reset.
- `app/admin/(panel)/settings/page.tsx` — section renamed
  “بيانات العلامة ورسالة الفاتورة”, loads `getBrandDetails()`.

## Tests

- `lib/print/receipts.test.ts` — brand details printed, fallback to venue name, HTML
  escaping (6 tests in file).
- `lib/print/escpos.brand.test.ts` (new) — win1256 decode assertions for brand name,
  venue subtitle, phone, address (raster disabled via `PRINTER_ARABIC_RASTER=0`).
- Full suite: 21 files / 97 tests passing; `npx tsc --noEmit` clean.

## Verification

- `npm run build` succeeded (Next 16.3.0 / Turbopack).
- Browser at `/admin/settings`: saved “مطعم الأصيل”, “0911234567”,
  “طرابلس — شارع الجمهورية” → success toast; values persisted after reload.
- Reset → fields cleared, footer restored to default; persisted after reload.
- Reset removed the test brand values from `app_settings`, so no cleanup needed.

## Notes

- The setup was rebuilt later on 2026-10-25 (14:21) and includes this feature together
  with the receipt-timezone fix: `release/installer/Fast-POS-Setup-0.1.0.exe`.
- Previous verification attempt failed once with `ENOTEMPTY` while deleting `.next`;
  retrying the build succeeded (transient Windows lock left over from the dev server).
