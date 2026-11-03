# Inventory movement filters — 2026-11-03

Owner request: in the inventory movement section add a filter by item or category, and make the filter collapsible.

## Decisions

- Filter shape (owner choice): free-text **item name search** (partial match) plus a **category dropdown**; categories can only come from tracked items, because ingredients have no category.
- Filtering is server-side via `searchParams` (`item`, `category`) so results stay correct beyond the existing 200-row display cap. The component only builds the URL.
- Selecting a category hides ingredient movements entirely (they have no category); item search alone searches both ingredient and item movement name snapshots.
- Date range moved into the same collapsible card; «إعادة ضبط» returns to `/admin/inventory` (today).
- The card is a native `<details>` and starts open when a filter is active, closed otherwise; the summary badge shows the active filter count.

## Implementation

- `lib/inventory/movements.ts` — `resolveMovementFilters` trims the search and validates the category through `parseId` (non-positive, fractional and non-numeric values become `null`).
- `lib/inventory/movements.test.ts` — 3 tests written first (red on missing module), then green.
- `app/admin/(panel)/inventory/page.tsx` — optional `like(...)` on `ingredient_movements.ingredient_name` / `item_movements.item_name`; category adds `eq(items.category_id, …)` to a new `leftJoin(items, eq(itemMovements.itemId, items.id))`; ingredient query skipped when a category is set. Tracked item rows also carry `categoryId` for the dropdown. Filter values are passed to `IngredientsAdmin`.
- `components/admin/IngredientsAdmin.tsx` — prop additions `item`/`category`; `applyFilter` preserves all four params; movement header shows «N حركة معروضة»; `<details>` card with item search, category select, from/to datetime inputs, «عرض» and «إعادة ضبط».

## Verification

- TDD: movement filter suite red → green. Full suite: 85 files / 539 tests pass.
- `npx tsc --noEmit` clean; focused eslint on the changed files clean.
- Filter SQL checked against a copy of the production DB: `%مشروب%` → 196 item movements (0 ingredients), category `مشروبات باردة` (id 7) → 224 item movements, combined → 190; the 7 item movements with a null `item_id` are correctly excluded from category results.
- `npm run build` succeeded; BUILD_ID `zuJIwNm46uCs_AfNwxHu9`.
- Installer built with `-SkipNpm`: `release/installer/Fast-POS-Setup-0.1.0.exe`, 75,700,917 bytes, SHA-256 `dade49e6464e9e24f3b527dacf581094451900209e1c1db6ab215bde27890ddd`.
- Installed silently over `C:\Program Files\Fast POS` (owner approved UAC). Post-install: installed BUILD_ID matches, `FastPOS` service Running, `http://127.0.0.1:3000/` → 200, `deployment.json` SHA-256 unchanged (`1d5d296f…`), DB schema fingerprint unchanged (42 objects, `6e4d7334…`).
- Owner login and in-app acceptance (open the card, search, pick a category, reset) still pending — the agent must not enter credentials.
