# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

Version bumps are derived from [Conventional Commits](https://www.conventionalcommits.org/)
on `main`:
- `fix:` → PATCH
- `feat:` → MINOR
- `feat!:` / `fix!:` / a `BREAKING CHANGE:` footer → MAJOR
- `chore:` / `refactor:` / `style:` / `perf:` / `docs:` / `test:` → no bump (unless the diff it
  describes is user-facing, in which case use `feat`/`fix` instead)

## [Unreleased]

## [0.9.0] - 2026-08-24

### Added
- Color variants — the values of the `Colors` system attribute — have their own endpoints (`POST`/`PUT`/`DELETE /colors/variant-values`), scoped to that one attribute, which is what makes `color_variant.create/edit/delete` a real grant. The tab used to post straight at `/attributes/{id}/values`, so a role ticked Color Variant Create saw an enabled button and got "Missing permission: attribute.create" on submit; the only way to unblock it was plant-wide attribute power over Materials, Combo, Wash Bath and every other value list
- A `docker-compose.dev.yml` overlay runs the stack with hot reload — `uvicorn --reload` over a bind-mounted `backend/app` and `next dev` Fast Refresh — so a code change no longer needs `up -d --build`. Dev images tag `:dev` and the deploy workflow passes no `-f`, so production is untouched

### Changed
- Every page, dialog and print frame wears one shared title bar. Seven page shells each hand-declared the same classic/modern pair and four more kept inline copies, so the blue gradient lived in eleven places; with it in one place, opening a dialog can dim the page chrome behind it the way a real window loses focus, while dialogs keep a literal gradient so they never dim themselves
- Buttons and inputs render from one shared face with four tones, dropping 70+ local `xpBtn`/`xpInput` copies, and all 16 print modals share one footer and one window close button
- Tab strips are all the shared `Tabs` component — the manufacturing page and the MO expanded row had a second style of their own — and the active tab's underline now animates in on hover
- Corner radii are concentric: `WINDOW_RADIUS` for window and dialog frames, `SECTION_RADIUS` inside them, `BUTTON_RADIUS` for controls. Form sections were rounder than the dialogs containing them, which reads as a section escaping its frame. Scrollbar thumbs, the searchable-select trigger and the view shell itself follow the same tokens
- Form section headers are flat blue with the label alone; the circled step numbers implied an order the fields don't have
- Form errors render through one shared `FormError` banner instead of three hand-rolled copies, and the user form modal is `xl` with its fields paired two-up instead of one long column
- The Colors page is reachable by a role holding only `color_variant.*`. Both the section and the tab gate on any of the page's grants, and the page hides whichever tab the user has no grant for — a variant-only role could previously reach `/colors` by URL but never see it in the nav
- Adding a color variant shows the color picker up front rather than behind a checkbox

### Fixed
- The app header runs full-bleed instead of being inset by the page gutter
- Adding a color variant that already exists says which one it collided with, matched case-insensitively, instead of silently doing nothing — variant matching is by label, so two rows differing only in case are two variants the floor reads as one
- Deleting a color variant still referenced by items, stock, orders or BOMs explains that instead of failing on a database constraint

## [0.8.0] - 2026-08-23

### Added
- Hovering anything with a `title` shows the app's own tooltip instead of the OS one — XP pale yellow in classic, a dark bubble in modern, with `role="tooltip"` and `aria-describedby` wired up. `GlobalTooltip` delegates from `document`, so the next `title=` anyone types is themed without them knowing the file exists. Rich or multi-line content uses `<Tooltip content>` directly
- Text clipped to an ellipsis with no `title` of its own gets a hover showing it in full, which is the only affordance an ellipsis ever had
- A `Chip` too narrow for its cell re-renders itself unclipped, in place, on hover — a badge does something better than a tooltip, so chips opt out of the global layer and own their popout

### Changed
- Colour chips show the colour code alone; the name moves to the tooltip, and only when it says something the code does not. In real data the two are near-identical ("318" / "318"), so the `{code} — {name}` label every view built was duplicated text that overflowed narrow cells
- The MO progress bar on the sales-order table is itself the link to the MO. The code chip above it ate the column's width and truncated the code to noise ("PR-2026-08-00010-00…"); the code now lives in the hover and a multi-MO line carries its count on the steps line
- Classic buttons, tab tops and toolbar controls all take one shared `BUTTON_RADIUS`, and every classic button carries the same `XP_BTN` hover/press motion instead of hand-rolled mouse-enter state per call site

### Fixed
- Long variant chips clip to the sales-order table's Item column instead of pushing it wider
- The PR chip on the sales-order table is a shared `Chip`, so it pops out when clipped like every other badge — a hand-rolled span had no popout

## [0.7.0] - 2026-08-23

### Added
- Work orders list has a Setting tab alongside Beaming / Weaving / Dyeing. `Others` is now derived from the tab list itself instead of a second hardcoded set of centre types, so adding a tab can't leave a type counted on two tabs at once
- The Surat Jalan number can be typed in the print preview before printing. It overrides the shipment's delivery-note number on the printed sheet and the modal title only — nothing is written back to the shipment, so a one-off manual number doesn't rewrite the record

### Changed
- Mobile views wear the same classic chrome as the desktop app: blue-gradient window bar, a toolbar strip carrying the current page title, and a tab bar in the sidebar palette. The old navy bar over grey tabs belonged to no other screen in the app. Shared primitives live in `mobileTheme.tsx`, so the phone views stop re-inventing their panels and cards per screen
- Variant identity chips (size / shade / combo) take their colour from one `VARIANT_TONE` map and a shared `VariantChip`. Seven views were each re-colouring them, so the same shade read pink on the work-order list, slate on the netting plan and beige on the BOM list. Shade chips are now the neutral slate ones and size takes the pink — a shade often carries its own colour swatch, and a swatch sitting on a tinted fill reads as a colour clash rather than as the colour of the goods
- SO/PO/PR/MO/WO references hanging off a row render as `OriginChip` badges with one tone per document type, so several origins side by side stay tellable apart and a PR is the same purple on every page
- Every control in a classic page header takes the same rounded XP chrome; a generic `.btn-light` rule was squaring off only some of them

## [0.6.1] - 2026-08-23

### Changed
- Every small tinted badge — status chip, count pill, variant/colour/combo chip, qty chip, tag chip, permission chip, lot chip — takes its corner radius from one `CHIP_RADIUS` token and a shared `<Chip>` primitive. Seven modern radii and two classic ones were in use across ~60 chips, so two chips in the same table cell could render one square and one pill
- Sidebar labels drop the `(SO)`/`(PO)` abbreviations

### Fixed
- The production-run netting preview splits component rows per size the same way MO creation splits component MOs: a size-differentiated sub-BOM now gets one row per size (matched to the parent's size row by Size master, else by label), while an unsized or free sub-BOM still pools across every parent size. The preview was pooling all sizes into one component row, so it showed a different tree than the run it was previewing

## [0.6.0] - 2026-08-22

### Added
- Sales Orders list shows how far production has actually got on each line: a per-line work-order step column (`3/5 · DYEING`) next to the fulfilment bar, expandable to the individual steps with their work-center stage and status. Root MOs are pegged to a line the same way `qty_made` already was, so the two columns can never disagree, and several MOs answering one line pool their counts

### Changed
- Dispatch is one table instead of a Deck tab and a Shipments tab. The Deck tab was a picker wearing a list's clothes — un-staged pick lists and the shipments they became were the same work seen twice, and the loader was flipping tabs to reconstruct it. Both grains now share nine columns under one status chip bar (`On Deck` is a client-side pseudo-status), with deck rows marked by a left tick and closed off by a divider

### Fixed
- Sales-order table columns hold their pinned widths and the table scrolls horizontally, instead of the new MO-progress column squeezing every other column narrower

## [0.5.0] - 2026-08-21

### Added
- Weaving runs can be paused and resumed: a loom carries several work orders at once, and parking one no longer charges its idle days against that run's efficiency. Each pause is stored as an interval (`weaving_run_pauses`) with reason and actor, so the floor can answer "which day did this WO slip, and why"
- Mounted beams in the work-center monitor carry their own item column and identity chips (size / combo / shade), so a beam is identifiable without opening it
- The browser tab is named after the current page (`<page> · <app name>`), so several open Terras tabs stay tellable apart

### Changed
- A weaving run closes with the work it tracks: completing or cancelling its work order, closing its MO, or deleting the WO now stops the run instead of leaving it accruing elapsed days against work nobody is doing. `DELIVERED` deliberately does not close a run (planned qty met, order still open)
- App icons redesigned on the XP blue theme — hexagon outline with an inset cube depth facet behind the T — and all PWA/apple icon assets regenerated to match

### Fixed
- Sales-order fulfilment is measured in the item's stock UoM instead of the ordered yardage. Most finished goods stock in kg while the SO form authors yards, so an 11 kg dispatch against a 10,000 yd order read as 0.1% shipped and the order could never reach READY or SENT. Lines with no honest conversion report "unknown" rather than silently reading as satisfied
- Production Run quantities seed from the server-derived base UoM instead of the SO's yardage, matching the fulfilment fix above
- Production Runs and Manufacturing Orders fetch their lists on mount, so arriving via `router.push` no longer leaves the page stuck on a skeleton
- Added the standard `mobile-web-app-capable` meta tag alongside the apple-prefixed one, silencing the install warning on non-iOS browsers

## [0.4.0] - 2026-08-20

### Added
- Sales Orders list serves its Production Run chips inline from the server (new SO response fields + an index on `production_runs.sales_order_id`)
- List tables now keep their header row pinned while the body scrolls

### Changed
- One shared table vocabulary across every list route: sortable column headers (`SortableTh`), header/cell styling (`lvTh`/`lvTd`), zebra striping, empty-state row, code chips, checkboxes and picker rows, and the row-expand chevron (`ExpandToggle`/`ExpanderCell`)
- Bulk-select lists share one `useRowSelection` hook instead of per-page selection state
- Every domain status renders through `StatusChip`; every number through one formatting module where views declare precision once; every blank value as the same em-dash placeholder
- Expandable lists use one control-column order — checkbox, chevron, then code
- One page-fill and scroll-area convention for list routes, and the last hand-rolled toolbars moved onto shared `SearchField`/`ToolbarCount`
- List loading shows a shape-matched skeleton instead of a bare loading line
- Row chevron rotates on hover and multi-select checkboxes show a hover ring, instead of swapping glyphs/flat states

### Fixed
- Dates and date-input seeds render in the configured display timezone rather than the browser's
- Sales Orders sort server-side, so page 1 shows the real first rows
- Work Queue columns have locked widths and truncate long codes instead of overlapping

### Performance
- Sales Orders page no longer pulls a ~1.3 MB production-runs payload or primes idle pickers on load

## [0.3.1] - 2026-08-19

### Fixed
- Sales Orders page no longer pulls the full eager-loaded Manufacturing Order tree on first load — it never read that data (leftover from a shared fetch condition)
- Sales Orders page now resolves its BOM auto-match/size lookup via a new slim `GET /boms/lookup` (id/code/item/attributes/sizes only) instead of the full nested `/boms` payload (every BOM's materials + routing); full `/boms` still serves manufacturing/production-runs where the nested tree is needed for MRP

## [0.3.0] - 2026-08-19

### Added
- Server-side pagination for the remaining long lists: Sales Orders, Purchase Orders, dyeing and setting work-order tabs, Lab Dip Requests, Dye Recipes, Partners (customers/suppliers) and Stock On-Hand
- `GET /partners/lookup` and `GET /stock/balance/paginated`, so pages that scan the whole set (purchase-order printing, material availability) keep getting every row while the list views take a page window
- Print and CSV export on paginated lists now fetch every matching row rather than the page on screen

### Changed
- One page-window contract across the backend: `PageParams`/`PageWindow` in `core/pagination.py` replaces the `(page - 1) * size` arithmetic that was duplicated at 19 call sites; `skip`/`limit` stays accepted as a legacy alias
- One page-window contract on the frontend: `usePaginatedFetch`/`usePageState`/`useDebouncedSearch` replace ~19 hand-rolled copies, and add the stale-response race guard nearly all of them were missing
- Samples, Items, Manufacturing Orders, Production Runs, audit logs and the stock ledger now resolve their window through the shared dependency
- Lab dip list sorting moved server-side (`COALESCE(updated_at, created_at) DESC, id DESC`) so page 1 shows the newest requests

### Fixed
- Paginated lists snap back into range when the set shrinks under the current offset — deleting the last rows on a page no longer leaves an empty table with the pager reading "Page 5 / 4"
- Sales Orders no longer re-filters the server page against the un-debounced search box, which blanked the table for the length of each keystroke pause
- Paging or searching during an in-flight load is no longer swallowed by the fetch de-duplicator, which keyed on the route alone and so returned the previous page's request

## [0.2.0] - 2026-08-19

### Added
- Terras Systems module suite teaser on the login page (SCM, WMS, HRIS, PSA, PIM, CMS tiles) with hover-enlarge custom tooltip
- System status, version, and last-update time shown on the login page
- Colors (Variant) list pagination with shared Pager
- Create/print/import buttons moved from title bars into table toolbars across BOM, Sales Orders, and procurement/inventory/engineering views, for consistency

### Changed
- Rebranded "Teras" to "Terras" across UI, docs, and README
- Standardized library-page toolbar create buttons to the shared green ToolbarButton

### Fixed
- PDF approval/rejection attachments now render correctly in the lab dip view
- Hover-enlarged suite tile and tooltip no longer clip at the container edge
- Classic-theme logout button hover darkens instead of washing white
- CodeConfigModal now stacks above its parent create/edit panel
- Remaining toolbar button styling drift (StockOnHand green, LabDipRequest, dual-styled CSV export, Attributes button position)

## [0.1.0] - 2026-08-18

Baseline release. Commit history prior to this tag (1300+ commits) is not itemized here —
this tag marks the point CHANGELOG tracking starts. Full history remains in `git log`.
