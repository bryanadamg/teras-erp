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
