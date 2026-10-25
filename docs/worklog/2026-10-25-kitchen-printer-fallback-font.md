# Kitchen ticket fallback + larger font — worklog

Date: 2026-10-25
Status: implemented, tested, installer built, installed on production

## Reported issue

Categories with no assigned kitchen printer did not print on the kitchen ticket.
Kitchen ticket text was also too small.

## Root cause

`lib/print/resolve-kitchen-printer.ts` returned `null` whenever a category had
a per-venue printer field set (`managed`) but the active venue's link was
missing, inactive, or pointed at a deleted printer:

```ts
if (managed) return null; // before the active-kitchen-printer fallback
```

`sendPendingKitchenTickets` aborts the whole ticket when any pending line has
no resolved printer (`app/actions/orders.ts`), so one unassigned category
blocked every item from printing. A shared category that only had the other
venue's printer set failed the same way for the venue with no printer.

## Fix

- Removed the hard `null` return. When the linked printer cannot be resolved,
  the resolver now falls back to the active kitchen/display printers.
- The other venue's dedicated printer is excluded from the fallback so a cafe
  ticket never goes to the restaurant's dedicated kitchen printer (and vice
  versa). If only that printer exists, the resolver still returns `null`.
- Display-group routing (`DISPLAY_PRINTER_GROUPS`) and the category/item
  precedence are unchanged.
- Kitchen Arabic raster font sizes: emphasized lines `30 → 34 px`, normal
  lines/notes `26 → 30 px` (`lib/print/escpos.ts`, `kitchenLine`). Cut feed and
  ticket chunking are unchanged.

## Tests

- New `lib/print/resolve-kitchen-printer.test.ts` (8 tests, in-memory Drizzle
  DB): unassigned fallback, other-venue-only link, inactive link, removed
  link, active link wins, display routing, other-venue exclusion, no printer.
- New `lib/print/kitchen-font.test.ts`: item lines use 34 px (bold), notes and
  metadata use 30 px.
- `npm test`: 43 files / 208 tests passed.
- `npx tsc --noEmit`: clean.
- `eslint` on changed files: clean; pre-existing repo-wide errors remain
  (including the `useArabicRaster` React-hook false positive in `escpos.ts`).

## Build and deployment

- `npm run build` → BUILD_ID `UFsBLtif5EapLoiEafIFB`.
- Installer: `release/installer/Fast-POS-Setup-0.1.0.exe` (built with
  `scripts/build-installer.ps1 -SkipNpm` from the verified build).
- Installed silently over `C:\Program Files\Fast POS`; UAC approved.
- Verified: installed BUILD_ID matches the local build, FastPOS service
  running, `http://localhost:3000/` returns 200.
- Production data unchanged: 1 order, 10 categories, 3 audit events,
  2 printers; `مشروبات باردة` (category 7) still has no printer and now
  resolves to the active `kitchen` printer (192.168.1.56).

## Not verified

A physical kitchen ticket was not printed during this session (requires a
staff login; no credentials were entered). Test one sale containing a category
with no printer assigned and confirm it arrives on the main kitchen printer.
