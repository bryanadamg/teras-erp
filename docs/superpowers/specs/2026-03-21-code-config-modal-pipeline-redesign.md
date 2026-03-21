# CodeConfigModal — Pipeline Builder Redesign

**Date:** 2026-03-21
**Status:** Approved for implementation
**Scope:** `frontend/app/components/CodeConfigModal.tsx` only

---

## Background

The CodeConfigModal lets users configure how IDs are auto-generated for any record type (BOM, WO, PO, SO, SAMPLE, ITEM). It is used by **anyone creating a record**, not just admins — making clarity and speed the top priorities. The current UI presents toggles in a flat list with a static fixed segment order. Users cannot reorder segments.

---

## Goal

Replace the toggle-list interaction with a **drag-and-drop pipeline builder**: an ordered track of segment chips the user assembles from a palette. Segment order directly determines the generated code structure.

Both the **default (modern)** and **XP classic** visual themes must be supported with full fidelity to their respective aesthetics.

---

## Interaction Model

### Two Zones

| Zone | Description |
|------|-------------|
| **Active Track** | Segments currently included in the code, in order. Drag to reorder. Click × to remove (returns to palette). |
| **Palette** | Segments not currently in use. Drag onto track to add. Clicking a palette chip also adds it to the end of the track. |

### Segment Types

| Type | Preview Value | Editable | Tint (default) | Tint (classic) |
|------|--------------|----------|----------------|----------------|
| `prefix` | User-typed value | Inline text input on chip | Blue `#2563eb` | XP blue bevel |
| `item` | `ITEM001` | No | Green `#059669` | XP green bevel |
| `attribute` | First attribute value or `VAR` | No (attribute name shown as label) | Purple `#7c3aed` | XP purple bevel |
| `year` | `2026` | No | Amber `#b45309` | XP amber bevel |
| `month` | `03` | No | Rose `#be185d` | XP rose bevel |
| `suffix` | User-typed value | Inline text input on chip | Teal `#0e7490` | XP teal bevel |
| `counter` | `001` | No — fixed, always last | Gray `#475569` | XP gray bevel |

Each attribute in `attributes[]` is its own draggable chip (e.g. "Color", "Size" are separate). `variantAttributeNames` order in the saved config matches the order attribute chips appear in the track.

The **counter chip is always pinned to the end** of the track. It has no drag handle and no remove button.

### Separator

A single dropdown at the top of the modal body, unchanged from current. Applies between all segments uniformly.

### Prefix / Suffix Inline Editing

When a prefix or suffix chip is on the track, it shows an inline `<input>` inside the chip body. The input auto-upcases. If suffix is removed from the track, its value is discarded.

---

## Internal State Model

Replace the flat `config` booleans with an ordered `segments` array. `separator` remains unchanged.

```ts
type Segment =
  | { type: 'prefix';    value: string }
  | { type: 'item' }
  | { type: 'attribute'; name: string }
  | { type: 'year' }
  | { type: 'month' }
  | { type: 'suffix';    value: string }
  | { type: 'counter' }               // always last, not draggable

interface InternalState {
  segments: Segment[];
  separator: string;
}
```

### Deriving from `initialConfig` (load)

| `initialConfig` field | → Segment |
|-----------------------|-----------|
| `prefix` (non-empty) | `{ type: 'prefix', value }` |
| `includeItemCode` | `{ type: 'item' }` |
| `includeVariant && variantAttributeNames[]` | one `{ type: 'attribute', name }` per entry |
| `includeYear` | `{ type: 'year' }` |
| `includeMonth` | `{ type: 'month' }` |
| `suffix` (non-empty) | `{ type: 'suffix', value }` |
| always | `{ type: 'counter' }` at end |

Default initial order when no `initialConfig`: `[prefix, item?, year?, counter]` based on document type defaults.

### Deriving `CodeConfig` on save (backward compatibility)

The `onSave(config: CodeConfig)` signature is **unchanged**. Before calling it, derive:

```ts
{
  prefix:                segments.find(s => s.type === 'prefix')?.value ?? '',
  suffix:                segments.find(s => s.type === 'suffix')?.value ?? '',
  separator,
  includeItemCode:       segments.some(s => s.type === 'item'),
  includeVariant:        segments.some(s => s.type === 'attribute'),
  variantAttributeNames: segments.filter(s => s.type === 'attribute').map(s => s.name),
  includeYear:           segments.some(s => s.type === 'year'),
  includeMonth:          segments.some(s => s.type === 'month'),
}
```

---

## Drag-and-Drop Implementation

Use the **HTML5 native drag-and-drop API** — no external dependencies.

- `draggable="true"` on each non-counter track chip and each palette chip
- `onDragStart`: record dragged segment index/type and source zone (`'track'` or `'palette'`)
- Track: renders drop-gap indicators between chips during drag-over
- `onDrop` on a gap indicator: insert segment at that position (remove from source if it was on track)
- `onDrop` on the palette zone: remove segment from track
- Clicking a palette chip (no drag): append to track before counter
- Clicking × on a track chip: remove from track, return to palette

The counter chip has no `draggable` and no × button, and is always rendered last in the track.

---

## Visual Design

### Default (Modern) Mode

**Track panel**
- Background: `#f8fafc`, border: `1.5px solid #e2e8f0`, border-radius: `8px`
- Empty state: dashed border `#cbd5e1`, placeholder text "Drag segments here"

**Segment chips (on track)**
- Background: solid chip color (e.g. `#2563eb` for prefix)
- Text: **white** — high contrast on all chip colors ✓
- Drag handle: `⠿` in `rgba(255,255,255,0.55)` — white on color ✓
- Label below chip: chip color at full opacity (e.g. `#2563eb`) on `#f8fafc` background — AA compliant ✓
- Remove button: `×` inline at chip end, `rgba(255,255,255,0.7)` — white on color ✓
- Inline input (prefix/suffix): white text, transparent background, `1px solid rgba(255,255,255,0.4)` border

**Separator between chips**
- Character: `color: #4b5563` (not light gray `#94a3b8`) on `#f8fafc` — AA compliant ✓

**Palette panel**
- Background: `#f1f5f9`, border: `1px solid #e2e8f0`
- Palette chips: outlined style — `border: 1.5px solid <chip-color>`, background white, text `<chip-color>`
- All palette chip text uses the full-saturation chip color on white — AA compliant ✓

**Preview bar**
- Background: `#1e293b`, text: `#f1f5f9` monospace — high contrast ✓

### XP Classic Mode

**Track panel**
- White background, inset border `#808080 #dfdfdf #dfdfdf #808080`, inner shadow

**Segment chips (on track)**
- Per-category tinted XP raised-button gradient (light tint → mid tint)
- Text: **dark color** (e.g. `#00327a` for blue prefix, `#003a00` for green item, `#320070` for purple) — dark on light ✓
- Drag handle: `⠿` in `#666666` — dark gray on light chip bg ✓
- Label below chip: `#333333` — dark on `#ece9d8` ✓
- Remove button: `×` as a small XP button with bevel border
- Inline input (prefix/suffix): standard XP inset input field styling

**Separator between chips**
- `#555555` bold — dark on light ✓

**Palette panel**
- `#f5f3ee` background with XP inset border
- Palette chips: XP raised-button style, category tint, dark text ✓

**Preview**
- Deeply inset 2px bevel box, white bg, black Courier New text ✓

**Counter chip (both modes)**
- Visually distinct: muted/grayed, no drag handle glyph, no × button
- Default: `#64748b` bg, white text ✓
- Classic: `linear-gradient(#e0e0e0, #c0c0c0)`, `#333` text ✓

---

## Contrast Checklist

All text elements must meet WCAG AA (4.5:1 for normal text, 3:1 for large/bold):

| Element | Foreground | Background | Status |
|---------|-----------|-----------|--------|
| Chip text (default) | `#ffffff` | chip color (min luminance ~0.2) | ✓ |
| Chip drag handle (default) | `rgba(255,255,255,0.55)` | chip color | ✓ |
| Segment label below chip (default) | chip color (full opacity) | `#f8fafc` | ✓ |
| Separator char (default) | `#4b5563` | `#f8fafc` | ✓ |
| Palette chip text (default) | chip color (full) | `#ffffff` | ✓ |
| Preview text (default) | `#f1f5f9` | `#1e293b` | ✓ |
| Chip text (classic) | `#00327a` / `#003a00` / `#320070` etc. | light gradient (~`#f0ecff`) | ✓ |
| Drag handle (classic) | `#666666` | light chip bg | ✓ |
| Label below chip (classic) | `#333333` | `#ece9d8` | ✓ |
| Preview text (classic) | `#000000` | `#ffffff` | ✓ |

---

## Scope & Non-Goals

**In scope:**
- `CodeConfigModal.tsx` — full rewrite of render logic and state
- Both visual modes (default + XP classic)
- Backward-compatible `CodeConfig` interface for `onSave`
- Migration from old `initialConfig` format

**Not in scope:**
- No new API endpoints
- No changes to callers of `CodeConfigModal`
- No changes to the `CodeConfig` type exported by the module
- No drag-and-drop library additions — native HTML5 DnD only
