# 2026-10-31 — Report canvas editor

## What changed

- Added an additive `order` field and `header.show`, `fields.visible`,
  `footer.show` flags to the v1 `.fprep` template. No DB migration: stored
  templates without them stay valid and are normalized on the next save.
- Split `DocumentSpec`/`DOCUMENT_SPECS`/`BASE_PLACEHOLDERS` into
  `lib/print/templates/document-specs.ts` so `schema.ts` and `blocks.ts` share
  a one-way dependency graph (`document-specs ← blocks ← schema`).
- Added `lib/print/templates/blocks.ts` with pure helpers: canonical/ordered
  block ids, move, visibility, line additions, column resizing, blank sample.
- Refactored `layout.ts` into per-block renderers (`layoutHeader`,
  `layoutFields`, `layoutItems`, `layoutSection`, `layoutSummary`,
  `layoutFooter`) iterating `order`. Canonical output is unchanged.
- Replaced the tree/properties/preview designer with a 360 px paper canvas:
  draggable block cards (Pointer Events + up/down buttons), inline text
  editing, eye toggles, `+ سطر`, column resize handles, inspector, toolbar
  (save, undo/redo, sample/blank, advanced), and an advanced JSON panel.
- Added `useTemplateEditor`: 50-entry history, 500 ms coalescing for typing
  and resizing, baseline adoption only while clean, Ctrl/Cmd+Z / Shift+Z / Y.
- Document switching now uses an in-app DaisyUI modal instead of native
  `window.confirm`.
- Final-review fix wave: the canvas eye is gated by `DOCUMENT_SPECS` like the
  inspector (no items eye on documents without item columns, no summary eye
  where `summaryAllowed` is false, both with the inspector's Arabic hints).
- Final-review fix wave spec gaps: `+ سطر` shows `الحد الأقصى 6 أسطر` at the
  cap, an all-hidden design shows the empty-paper hint
  `كل المكوّنات مخفية — لن يظهر شيء في الطباعة.`, the paper container uses the
  spec's 1 px dotted neutral border, and the inspector clamps numeric column
  widths to 1..64 on write.

## Locked decisions

- Block `order` stores `header | fields | items | section:<id> | summary |
  footer`; a partial list is completed in canonical order on validation.
- `fields.visible` is separate from `fields.show` so hiding never discards the
  owner's field selection.
- Column resize stores widths whose extras are each at least one character and
  sum to the paper capacity, so `tableWidths` reproduces the target widths
  exactly. The effective minimum is `label.length + 1` because `tableWidths`
  reads a zero extra as weight 1; when the paper cannot hold one extra per
  column the helper stores label-only widths as a reproducible fallback. A
  boundary resize step is a no-op (no commit) instead of an empty history
  entry.
- The canvas renders each block through the real `layoutTemplate` with a
  single-block preview template, so the canvas and the printer never diverge.
- Blank mode is client-side only (`blankSample`), keeping titles, venue, brand
  strings, and the footer.

## Deviations and rulings

- **Logo align/max-width controls** were added to the header inspector per the
  approved design spec even though the task brief omitted them; `schema.ts`
  already accepted `align`/`maxWidth` and layout/build already consume them.
  The max-width input uses a draft value committed on blur so typing `128` is
  not clamped mid-keystroke.
- **Items-visibility gate**: on documents without item columns (`shift`,
  `items`, `sales`) the items switch would persist `items.show: true`, which
  the validator rejects, leaving an unsavable template. The items visibility
  and column controls are now disabled there with an Arabic hint.
- **In-flight save/test-print guards**: `saving`/`printing` refs make a double
  click a no-op, so a slow save cannot issue two requests; `canChangeDocument`
  keeps the same-document tab click a no-op. `reset()` itself stays unguarded
  (deferred minor).
- **Touch support**: only the up/down reorder buttons are 40 px `btn` targets;
  the grip, eye toggle, edit affordance, `+ سطر`, and resize handles stay 32 px
  `btn-sm`. `touch-none select-none` is applied to the drag grips and resize
  handles (not the whole card), and `pointercancel`/`lostpointercapture` abort
  the drag so only pointerup commits.
- **Corrected layout order-test assertion**: the brief asserted `كابتشينو`
  appeared between two markers, but `layoutTemplate` renders table cells as
  column lines and the helper dropped them, so the original assertion could
  never pass. The assertion was corrected to the items title `الأصناف` in the
  same position, and the renderer refactor was then verified against the
  corrected test; the recorded RED run used the faulty original assertion, not
  the replacement.
- **`aria-selected` retained on `role="group"`**: the design spec mandates the
  attribute. It is inert ARIA; the visual selected state is separate. Changing
  it would require a spec change, so it stays and
  `jsx-a11y/role-supports-aria-props` reports one warning.
- **Installer deferred**: by ledger ruling the EXE is built only after the
  final whole-branch review so it never ships pre-review code.

## Files

- New: `lib/print/templates/document-specs.ts`, `blocks.ts`, `blocks.test.ts`,
  `components/admin/report-design/{useTemplateEditor.ts,CanvasLines.tsx,
  CanvasBlock.tsx,ReportCanvas.tsx,BlockInspector.tsx,EditorToolbar.tsx,
  AdvancedPanel.tsx}` + tests.
- Rewritten: `ReportDesignAdmin.tsx` + test.
- Deleted: `TemplateTree.tsx`, `TemplateProperties.tsx`, `ReportPreview.tsx`.
- Modified: `types.ts`, `schema.ts`, `defaults.ts`, `layout.ts`, and their
  tests; `README.md`, `PROJECT_INDEX.md`.

## Verification

- `npx vitest run lib/print/templates components/admin/report-design` — 13
  files / 130 tests pass, exit 0 (15.2 s).
- `npx vitest run` — 65 files / 388 tests pass, exit 0 (70.0 s).
- `npx tsc --noEmit` — clean, exit 0.
- `npx eslint lib/print/templates components/admin/report-design` — exit 0,
  0 errors, only the two known warnings (`aria-selected` in `CanvasBlock.tsx`,
  `react-hooks/set-state-in-effect` in `useTemplateEditor.ts`).
- `npm run lint` — exit 1 with the single pre-existing error
  (`lib/print/windows-raw.test.ts:353`, `prefer-const`); 21 warnings, of which
  2 are in feature files: the spec-mandated `aria-selected` warning in
  `CanvasBlock.tsx` and `react-hooks/set-state-in-effect` in
  `useTemplateEditor.ts` (same rule already warns in eight pre-existing
  components). No new errors.
- `npm run build` — success, exit 0: Next.js 16.4.3 (Turbopack) compiled in
  15.6 s, TypeScript check passed, 14 static pages generated; only the
  pre-existing `Cache-Control` config warning. `/admin/reports/design` is in
  the route table.
- Browser: golden-path check handed to the owner — the route returns
  `307 → /admin/login` without an admin session and no credentials were typed;
  the exact walk-through is under "Remaining owner checks".
- Installer: built after the final review — `npm run build` succeeded, then
  `scripts/build-installer.ps1 -SkipNpm` compiled
  `release/installer/Fast-POS-Setup-0.1.0.exe` (75,669,733 bytes, 21:55,
  SHA-256 `73ef557bd888bc858c10067b3ebbcd55ff69194947468f4ee751871f914d096d`).
  No retry was needed and the EXE was not installed by the agent.

## Remaining owner checks

- Install the new build and run a real-printer test print for receipt, kitchen,
  shift, items, and sales designs.
- Confirm the installed app still prints the edited template after a restart.
- Port 3000 is held by the installed FastPOS service on the owner's machine, so
  a dev-server walk-through must use `npm run dev -- -p 3001` or stop the
  service first.
- Golden-path browser walk-through (admin login required):
  1. Open `/admin/reports/design`: the paper canvas shows the five receipt
     blocks in printed order with `REST`, `كابتشينو`, and the totals.
  2. Drag a block by its grip and use the up/down arrows; `تراجع` restores the
     previous order and `إعادة` reapplies it.
  3. Drag a column handle between item columns; widths change, and after
     `حفظ التصميم` plus reload the widths persist; the stored weights (visible
     in `متقدم`) still sum to 32.
  4. Double-click a header/footer line: Enter commits, Escape cancels.
  5. Eye buttons dim a block; `بيانات فارغة` empties the sample and
     `بيانات تجريبية` restores it.
  6. `متقدم` opens the JSON panel; invalid JSON shows an Arabic error and does
     not replace the canvas; import/export `.fprep` and `استعادة الافتراضي`
     still work.
  7. With unsaved changes, click another document tab: the in-app modal
     appears (`تغييرات غير محفوظة`), and closing the tab still triggers the
     browser warning.
  8. `طباعة تجريبية` prints the selected design on the chosen printer.
