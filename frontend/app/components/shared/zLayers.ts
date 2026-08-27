// Stacking order for body-portaled overlays.
//
// Everything here renders into <body>, so which one wins is decided purely by
// z-index — and the numbers were previously spread across the files that used
// them, which is how tooltips (10050) ended up *behind* modals (20000+). One
// module so the tiers can be read against each other.
//
// This file imports nothing on purpose: Tooltip is imported by xpTheme, which is
// imported by ModalWrapper, so the tiers cannot live in ModalWrapper without a
// cycle.

/** Modal windows, nested levels 1-3 (ModalWrapper, PrintModalShell). */
export const MODAL_Z = { 1: 20000, 2: 20100, 3: 20200 } as const;

/** Dropdown portals and toasts — the de-facto top tier already hardcoded as
 *  99999 in SearchableSelect, TreeSelect and Toast. Named here so anything new
 *  joins the tier rather than inventing a number next to it. */
export const OVERLAY_Z = 99999;

/** Hover surfaces: tooltips and chip popouts. Always the topmost layer — a
 *  tooltip is attached to something already on top of everything else, so
 *  anything that could cover it is a bug, not a stacking preference. */
export const TOOLTIP_Z = OVERLAY_Z + 1;
