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
