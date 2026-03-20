---
title: BOM Table UI/UX Redesign
date: 2026-03-21
status: approved
---

# BOM Table UI/UX Redesign

## Overview

Apply the Windows XP visual treatment from `ManufacturingView` to `BOMView`, improving contrast and readability throughout the existing table structure. Add a live search/filter bar to the toolbar. No new columns, no new expand panels — this is a styling and usability pass.

## Scope

**File:** `frontend/app/components/BOMView.tsx`

**In scope:**
- XP window chrome (outer shell, title bar, bevel borders)
- Toolbar redesign (XP-style buttons, search/filter input)
- Table header styling (XP gradient, column dividers)
- Row styling (alternating backgrounds, selected state, column dividers)
- Materials tree contrast improvements (qty, item code, item name, sub-BOM badge, nested indent)
- Classic vs default mode parity (classic = XP, default = existing Bootstrap)

**Out of scope:**
- New columns
- Expand-in-place detail panels
- Pagination
- Any backend changes

## Design

### Mode Awareness

`BOMView` already reads `ui_style` from `localStorage` and stores it in `currentStyle`. All new styling branches on `currentStyle === 'classic'` — identical pattern to `ManufacturingView`.

### Window Chrome

**Classic mode only:**
```
border: 2px solid
border-color: #dfdfdf #808080 #808080 #dfdfdf   (XP bevel)
box-shadow: 2px 2px 4px rgba(0,0,0,0.3)
background: #ece9d8
border-radius: 0
```

**Default mode:** existing `card h-100 border-0 shadow-sm` — no change.

### Title Bar

**Classic:**
```
background: linear-gradient(to right, #0058e6 0%, #08a5ff 100%)
color: #fff
font: bold 12px Tahoma, Arial, sans-serif
padding: 4px 8px
box-shadow: inset 0 1px 0 rgba(255,255,255,0.3)
```

**Default:** existing `card-header bg-white` — no change.

### Toolbar Layout

Both modes — toolbar contains (left to right):
1. Title / icon
2. Search input (live filter)
3. Selected-count label (conditional)
4. Delete Selected button (conditional — only when `selectedIds.size > 0`)
5. New BOM button

**Search behaviour:** filters `boms` array in-component by matching the search string against `bom.code` and the item name (case-insensitive). Filtered list is used for rendering and for select-all logic. Search state is local (`useState`, not persisted).

**Classic search input:**
```
font-family: Tahoma, Arial, sans-serif
font-size: 11px
border: 1px solid #808080 (inset bevel: #808080 #dfdfdf #dfdfdf #808080)
padding: 2px 6px
background: #fff
```

**Classic buttons:**

New BOM:
```
background: linear-gradient(to bottom, #5ec85e, #2d7a2d)
border-color: #1a5e1a #0a3e0a #0a3e0a #1a5e1a
color: #fff
font: bold 11px Tahoma
padding: 2px 10px
```

Delete Selected:
```
background: linear-gradient(to bottom, #fff, #d4d0c8)
border-color: #dfdfdf #808080 #808080 #dfdfdf
color: #000
font: 11px Tahoma
padding: 2px 10px
```

**Default mode:** `btn-primary btn-sm` for New BOM, `btn-danger btn-sm` for Delete Selected — unchanged from today.

### Table Header

**Classic:**
```
background: linear-gradient(to bottom, #ffffff, #d4d0c8)
border-bottom: 2px solid #808080
font: bold 10px Tahoma
color: #000
letter-spacing: 0.2px
```
Column cells separated by `border-right: 1px solid #b0aaa0`.

**Default:** existing `thead.table-light` — no change.

### Row Styling

**Classic:**

| State    | Background  | Border-bottom        |
|----------|-------------|----------------------|
| Normal   | `#ffffff`   | `1px solid #c0bdb5`  |
| Alt row  | `#f5f3ee`   | `1px solid #c0bdb5`  |
| Selected | `#d8e4f8`   | `1px solid #c0bdb5`  |

Column cells separated by `border-right: 1px solid #c0bdb5`.

**Default:** Bootstrap `table-hover` + `table-active` for selected — unchanged.

### Materials Tree (in-cell)

Applied in both modes for improved readability:

| Element       | Style                                                           |
|---------------|-----------------------------------------------------------------|
| Qty           | `color: #0058e6; font-weight: bold; min-width: 22px`           |
| Item code     | `font-family: Courier New, monospace; font-size: 9px; color: #555` |
| Item name     | `color: #000`                                                   |
| Sub-BOM badge | `background: #fff3cd; border: 1px solid #b8860b; color: #6b4e00; font-size: 8px; font-weight: bold` — preserved |
| Nested indent | `border-left: 2px solid #b0aaa0; margin-left: 14px; padding-left: 6px` |
| Expand caret  | Existing `bi-caret-right-fill` / `bi-caret-down-fill` toggle — kept, colour `#0058e6` in classic |

## Implementation Notes

- `filteredBOMs` derived from `boms` prop using `useMemo` (search string dependency). Pass `filteredBOMs` to the table render and to `toggleSelectAll` / `allSelected` / `someSelected` calculations.
- No changes to `BOMDesigner`, `BOMForm`, `BOMAutomatorModal`, or any backend files.
- `currentStyle` already loaded from `localStorage` on mount — no new state needed.

## Acceptance Criteria

- [ ] Classic mode renders XP window chrome matching `ManufacturingView` style
- [ ] Title bar gradient, bevel border, and outer shell appear in classic mode
- [ ] Toolbar has search input that live-filters the BOM list by code or item name
- [ ] New BOM and Delete Selected buttons are XP-styled in classic mode
- [ ] Table header has XP gradient in classic mode
- [ ] Rows alternate `#fff` / `#f5f3ee` in classic mode; selected rows are `#d8e4f8`
- [ ] Column dividers visible in classic mode
- [ ] Materials tree: qty blue, item code monospace grey, item name black — in both modes
- [ ] Sub-BOM badge styling unchanged
- [ ] Nested indent uses `border-left: 2px solid #b0aaa0`
- [ ] Default (non-classic) mode is visually unchanged except materials tree contrast
- [ ] Select-all checkbox respects filtered list
