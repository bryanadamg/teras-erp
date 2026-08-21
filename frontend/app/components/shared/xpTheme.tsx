'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { layoutRectOf, layoutScroll } from './uiScale';

/**
 * Shared Windows XP "classic" theme primitives.
 * Single source of truth for status colors and the inline XP style helpers
 * that were previously duplicated per view.
 */

export const xpFont = 'Tahoma, "Segoe UI", Arial, sans-serif';
export const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Single monospace stack for every identifier and every aligned number. Views used
// to pick between `'Courier New', monospace` and a bare `monospace` per file, which
// resolve to different faces on Windows — the same MO code rendered two widths on
// two pages. Always import this; never hand-write a mono stack.
export const CODE_FONT = "'Courier New', Consolas, monospace";

// ── Identifier typography ─────────────────────────────────────────────────────
// Codes are UNBOXED — plain monospace text. The box the items/BOM tables used to
// draw around a code read as a control, not as data, and made a dense table look
// like a row of buttons. Weight, size and color carry the tier instead:
//   tier 1 — the code that identifies THIS row (item code on the items table, BOM
//            code on the BOM table, mo.code on the MO table). Bold, full size.
//   tier 2 — a code pointing at ANOTHER entity from inside the row (item code under
//            an item name, BOM code under a PR, a parent/contributing MO). Regular
//            weight, muted, one step smaller.
// Status is never a code — use StatusChip. And a code never gets a fill or a border:
// those are reserved for status families and interactive controls, so a boxed code
// reads as a state or a button.
// `link` is the one exception to the no-chrome rule: a code that JUMPS somewhere
// else (root MO on the WO table, contributing MOs on a PR) renders as a blue tinted
// badge. The tint is the affordance — it says "this cell is a door", which a plain
// underline in a dense table does not. It never collides with status color because
// blue-on-pale-blue is not in STATUS_FAMILY's chip set at this size, and a nav code
// always sits in its own column.
export function CodeChip({ code, classic, tier = 1, tone = 'default', link = false, title, style, className, onClick }: {
    code: React.ReactNode; classic: boolean; tier?: 1 | 2;
    tone?: 'default' | 'accent'; link?: boolean; title?: string;
    style?: React.CSSProperties; className?: string; onClick?: () => void;
}) {
    const base: React.CSSProperties = { fontFamily: CODE_FONT, whiteSpace: 'nowrap' };
    if (link) {
        return (
            <span
                className={className}
                onClick={onClick}
                title={title ?? (typeof code === 'string' ? code : undefined)}
                style={{
                    ...base,
                    fontSize: classic ? 10 : 11,
                    fontWeight: 'bold',
                    color: '#0058e6',
                    background: '#e8f0fe',
                    border: '1px solid #b0c8f8',
                    borderRadius: classic ? 2 : 4,
                    padding: '0 5px',
                    cursor: 'pointer',
                    display: 'inline-block',
                    ...style,
                }}
            >{code}</span>
        );
    }
    const s: React.CSSProperties = tier === 2
        ? { ...base, fontSize: classic ? 9 : 10.5, color: '#666' }
        : {
            ...base,
            fontSize: classic ? 11 : 12,
            fontWeight: 'bold',
            color: tone === 'accent' ? '#000055' : '#000',
        };
    return (
        <span className={className} onClick={onClick} title={title ?? (typeof code === 'string' ? code : undefined)} style={{ ...s, ...style }}>
            {code}
        </span>
    );
}

// Every domain status collapses into one of five semantic families, so a status
// means the same color everywhere regardless of which module (SO/PO/MO/sample)
// it came from. Add a new domain status here — not a new per-view color map.
export type StatusFamily = 'gray' | 'amber' | 'blue' | 'green' | 'red';

export const STATUS_FAMILY: Record<string, StatusFamily> = {
    DRAFT: 'gray', CLOSED: 'gray',
    PENDING: 'gray',
    PARTIAL: 'amber', RECEIVING: 'amber', ON_HOLD: 'amber',
    // A weaving run parked while another WO on the same loom is prioritised. Amber
    // like ON_HOLD: open work, deliberately not moving — not a failure (red) and not
    // in flight (blue).
    PAUSED: 'amber',
    CONFIRMED: 'blue', IN_PROGRESS: 'blue', READY: 'blue', SENT: 'blue',
    IN_PRODUCTION: 'blue', STAGED: 'blue',
    // Loom prep walk (weaving monitor): STAGED (warp up) → DRAW_IN → TUNING → the
    // run itself. All three are prep-in-flight, so all three read blue; IDLE falls
    // through to gray via PENDING and a live run shows RUNNING/IN_PROGRESS green-ish.
    DRAW_IN: 'blue', TUNING: 'blue', IDLE: 'gray',
    // DELIVERED is blue, not green: on an MO it means "planned qty met, order still
    // open for logging". Green is reserved for closed/terminal.
    DELIVERED: 'blue',
    // Pick list: PICKING is work in flight, PICKED means every carton is scanned
    // and the list is waiting on QC/dispatch — attention, not done.
    PICKING: 'blue', PICKED: 'amber',
    // A packed carton that still has stock at its location. Consumed cartons fall
    // through to DISPATCHED/SENT via the pick list that took them.
    IN_STOCK: 'green',
    COMPLETED: 'green', DONE: 'green', RECEIVED: 'green', APPROVED: 'green',
    ACTIVE: 'green', DISPATCHED: 'green',
    CANCELLED: 'red', REJECTED: 'red',
    // Derived display status (dashboard WO monitor): a PENDING/IN_PROGRESS order
    // past its target_end_date. Not a stored status — no backend row ever has it.
    OVERDUE: 'red',
    ARCHIVED: 'gray', INACTIVE: 'gray',
    // Audit-log action verbs (backend log_activity() call sites) — same 5-family
    // palette, not a domain status, but reuses it for one consistent chip everywhere.
    // Full set as of 2026-07: grep `log_activity(` across backend/app for the source list.
    CREATE: 'green', REACTIVATE: 'green', COMPLETE: 'green', COMPLETION: 'green', DISPATCH: 'green',
    UPDATE: 'amber',
    STATUS_CHANGE: 'blue', UPDATE_STATUS: 'blue', UPDATE_ITEM_STATUS: 'blue', UPDATE_COLOR_STATUS: 'blue',
    UPDATE_DIP_STATUS: 'blue', STAGE: 'blue', TRANSFER: 'blue', IMPORT: 'blue',
    DELETE: 'red', DEACTIVATE: 'red', REJECT: 'red', DISPOSE: 'red',
    PRINT: 'gray', SPLIT: 'gray', ARCHIVE: 'gray', REBUILD: 'gray',
    // Item.variant_type tags (Inventory table "Type" column) — not a lifecycle
    // status, but reuses the same 5-family palette for a consistent chip.
    // NONE doubles as the Quarantine Packing "not dispositioned yet" rollup.
    NONE: 'gray', COLOR: 'blue', COMBO: 'amber',
    // Quarantine dispositions (values of the `Quarantine Status` attribute — the
    // list is client-extensible, so an added value falls through to gray until
    // someone maps it here). OK is the only one that releases a lot to packing;
    // MIXED is the derived MO rollup when its lots disagree.
    OK: 'green', BULK_SAMPLE: 'blue', WAITING_APPROVAL: 'amber', MIXED: 'amber',
    // A quarantine lot already drawn by packing — terminal, its disposition is frozen.
    PACKED: 'green',
    // A released quarantine lot already claimed by an open packing order — locked
    // like PACKED, but reversible: cancelling/deleting that order frees it again.
    CLAIMED: 'amber',
    // Work-queue readiness verdicts (services/work_queue_service.py). Derived, never
    // stored. Blue = the PIC may start it (RUNNING/STAGED/READY already blue above);
    // amber = waiting on something with a known answer; red = nothing to run on.
    RUNNING: 'blue',
    WAITING_UPSTREAM: 'amber', WAITING_PRIOR: 'amber',
    SHORT: 'red', NO_MATERIALS: 'gray',
    // An open order with no work order cut for it. Amber, not red: nothing is
    // broken, someone just has to release it before the floor can touch it.
    NOT_RELEASED: 'amber',
    // Derived (MO/WO lists): a PENDING order whose earlier routing steps are not
    // finished. Gray — it is not started and not broken, just not its turn.
    BLOCKED: 'gray',
    // Lot quality_status beyond REJECTED: still usable keeps its warning colour,
    // disposed is terminal and out of every picker.
    REJECT_USABLE: 'amber', DISPOSED: 'gray',
};

const FAMILY_SOLID: Record<StatusFamily, string> = {
    gray: '#666666', amber: '#b8860b', blue: '#0058e6', green: '#2d7a2d', red: '#c00000',
};

const FAMILY_CHIP: Record<StatusFamily, { background: string; borderColor: string; color: string }> = {
    gray:  { background: '#d4d0c8', borderColor: '#808080', color: '#333333' },
    amber: { background: '#c77800', borderColor: '#7a4a00', color: '#ffffff' },
    blue:  { background: '#0058e6', borderColor: '#003080', color: '#ffffff' },
    green: { background: '#2d7a2d', borderColor: '#1a5e1a', color: '#ffffff' },
    red:   { background: '#c00000', borderColor: '#800000', color: '#ffffff' },
};

// Pastel/tinted chip — same family hues, light background + dark text. Use in
// dense contexts (expanded rows, secondary lists) where a solid chip is too loud.
const FAMILY_TINT: Record<StatusFamily, { background: string; borderColor: string; color: string }> = {
    gray:  { background: '#e8e8e8', borderColor: '#7a7a7a', color: '#222222' },
    amber: { background: '#fff3cd', borderColor: '#b8860b', color: '#5d3800' },
    blue:  { background: '#dce4f5', borderColor: '#3a5faa', color: '#0d2a6e' },
    green: { background: '#d4edda', borderColor: '#27713a', color: '#0c3a1a' },
    red:   { background: '#f8d7da', borderColor: '#a01a1a', color: '#4a0000' },
};

const familyOf = (status?: string): StatusFamily => STATUS_FAMILY[(status || '').toUpperCase()] || 'gray';

// Solid accent color per status — for text, border-left strips, progress bars.
// Computed from STATUS_FAMILY so every known status resolves consistently;
// an unlisted status is absent here (callers already fall back via `??`/`||`).
export const STATUS_COLORS: Record<string, string> = Object.fromEntries(
    Object.keys(STATUS_FAMILY).map((status) => [status, FAMILY_SOLID[STATUS_FAMILY[status]]])
);

// Chip (badge) palette per status — background / border / text. Solid variant.
export const STATUS_CHIP: Record<string, { background: string; borderColor: string; color: string }> = Object.fromEntries(
    Object.keys(STATUS_FAMILY).map((status) => [status, FAMILY_CHIP[STATUS_FAMILY[status]]])
);

export const statusColor = (status?: string): string => FAMILY_SOLID[familyOf(status)];

// Same five accents, addressed by family instead of by status — for the places
// where the thing being colored is a *measurement*, not a status: on-target vs
// below-target numbers, an accent stat, a chart series. Use this rather than
// re-declaring `const GREEN = '#2d7a2d'` in a view; the palette stays in one place
// and stays inside DESIGN.md's semantic layer.
export const familyColor = (family: StatusFamily): string => FAMILY_SOLID[family];

// Pale wash of the same five accents, by family — for panel/row backgrounds that
// carry a health signal (dashboard health panels, alert rows). Same reason as
// familyColor: don't re-declare `const OK_BG = '#e8f5e9'` per view.
export const familyTint = (family: StatusFamily) => FAMILY_TINT[family];

// Tint colors only (no layout/border-radius opinions) — for call sites that
// render their own badge shape but want the shared per-status palette.
export const statusTint = (status?: string) => FAMILY_TINT[familyOf(status)];

export const statusChipStyle = (status?: string, extra: React.CSSProperties = {}, tint = false): React.CSSProperties => {
    const c = tint ? FAMILY_TINT[familyOf(status)] : FAMILY_CHIP[familyOf(status)];
    return {
        display: 'inline-block', fontSize: 9, fontWeight: 'bold',
        padding: '1px 6px', borderRadius: 0, border: '1px solid',
        fontFamily: xpFont, whiteSpace: 'nowrap',
        background: c.background, borderColor: c.borderColor, color: c.color,
        ...extra,
    };
};

export function StatusChip({ status, label, style, tint, title }: { status: string; label?: string; style?: React.CSSProperties; tint?: boolean; title?: string }) {
    return (
        <span style={statusChipStyle(status, style, tint)} title={title}>
            {(label ?? status).replace(/_/g, ' ').toUpperCase()}
        </span>
    );
}

// Count pill — "<n> approved" as one tinted, bounded unit instead of loose numbers
// separated by "|". For status-bar tallies where the reader scans for a status and
// wants its number, not a sentence. Uses the same 5-family tint palette as
// StatusChip, so a status reads the same color wherever it appears.
export function StatusCountPill({ status, count, label, classic, title }: {
    status: string; count: number; label?: string; classic?: boolean; title?: string;
}) {
    const c = statusTint(status);
    return (
        <span
            title={title}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: classic ? '0 6px' : '1px 9px',
                // Squared-off in classic to sit right against XP chrome; fully rounded
                // in modern. Both still read as one bounded pill.
                borderRadius: classic ? 2 : 999,
                border: '1px solid', borderColor: c.borderColor,
                background: c.background, color: c.color,
                fontFamily: classic ? xpFont : modernFont,
                fontSize: classic ? 10 : 11,
                lineHeight: classic ? '15px' : '17px',
                whiteSpace: 'nowrap',
            }}
        >
            <strong style={{ fontWeight: 700 }}>{count}</strong>
            <span style={{ opacity: 0.85 }}>{(label ?? status).replace(/_/g, ' ').toLowerCase()}</span>
        </span>
    );
}

// Work-center chip palette keyed on center_type (case-insensitive). Falls back
// to sniffing the work-center *name* for a process word when the type is
// GENERAL/blank, then to a neutral gray. Single source for the WO panel/list
// and the BOM list — do not hand-copy this palette per view.
const WC_CHIP: Record<string, { background: string; color: string; borderColor: string }> = {
    BEAMING:   { background: '#fce8ff', color: '#660088', borderColor: '#dda8f0' },
    WARPING:   { background: '#fff3cc', color: '#664400', borderColor: '#f0d888' },
    DYEING:    { background: '#cce4ff', color: '#004b99', borderColor: '#99c4ee' },
    SETTING:   { background: '#ffeacc', color: '#994d00', borderColor: '#e8c488' },
    WEAVING:   { background: '#e8d8ff', color: '#440099', borderColor: '#c4a8ee' },
    FINISHING: { background: '#d4f0d4', color: '#005500', borderColor: '#99cc99' },
    CUTTING:   { background: '#fff0cc', color: '#886600', borderColor: '#ddcc88' },
};
// Process synonyms (incl. Indonesian) aliased onto the canonical keys above.
const WC_ALIAS: Record<string, keyof typeof WC_CHIP> = {
    CELUP: 'DYEING', TENUN: 'WEAVING', FINISH: 'FINISHING', POTONG: 'CUTTING',
};
const WC_NEUTRAL = { background: '#e4e2dc', color: '#444444', borderColor: '#c4c2ba' };

// AttributeValue has no stored hex, so variant color swatches are derived
// from the value text via this EN+ID name map (display aid only; the text
// label always stays for unmapped values). Single source — do not re-copy
// this map into individual views (was duplicated in BOMView before).
export const COLOR_HEX: Record<string, string> = {
    red: '#d32f2f', merah: '#d32f2f',
    blue: '#1565c0', biru: '#1565c0',
    green: '#2e7d32', hijau: '#2e7d32',
    yellow: '#f9a825', kuning: '#f9a825',
    black: '#111111', hitam: '#111111',
    white: '#fbfbf7', putih: '#fbfbf7',
    grey: '#757575', gray: '#757575', abu: '#757575',
    orange: '#ef6c00', oranye: '#ef6c00', jingga: '#ef6c00',
    purple: '#6a1b9a', ungu: '#6a1b9a',
    pink: '#ec407a',
    brown: '#5d4037', coklat: '#5d4037', cokelat: '#5d4037',
    navy: '#1a237e', dongker: '#1a237e',
    gold: '#c9a227', emas: '#c9a227',
    silver: '#b0bec5', perak: '#b0bec5',
    cream: '#efe7d2', krem: '#efe7d2',
    maroon: '#7b1f2b', marun: '#7b1f2b',
    tosca: '#12a4a4', toska: '#12a4a4',
    tan: '#d2b48c', beige: '#e8dcc0',
};
export function colorHexFor(name?: string): string | null {
    if (!name) return null;
    const k = name.trim().toLowerCase();
    if (COLOR_HEX[k]) return COLOR_HEX[k];
    for (const tok of k.split(/[\s\-_/]+/)) if (COLOR_HEX[tok]) return COLOR_HEX[tok];
    return null;
}

// Swatch + label chip for a color-attribute value (e.g. "ABU", "HITAM").
// `hex` overrides the derived lookup with a stored AttributeValue.hex, when known.
// `onRemove` renders a small "x" for removable pick-lists (e.g. lab dip request colors).
export function ColorSwatchChip({ label, classic, hex: hexOverride, onRemove }: { label: string; classic: boolean; hex?: string | null; onRemove?: () => void }) {
    const hex = hexOverride ?? colorHexFor(label);
    return (
        <span style={classic
            ? { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e8e4d8', border: '1px solid #b0aaa0', color: '#333', fontSize: 10, padding: '1px 5px', fontFamily: xpFont, whiteSpace: 'nowrap' }
            : { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eef1f6', border: '1px solid #cbd3df', color: '#334155', fontSize: 12, borderRadius: 5, padding: '2px 8px', fontFamily: modernFont, whiteSpace: 'nowrap' }}>
            {hex && <span style={{ width: 10, height: 10, background: hex, border: '1px solid rgba(0,0,0,0.35)', flexShrink: 0, display: 'inline-block' }} />}
            {label}
            {onRemove && (
                <button type="button" onClick={onRemove} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: classic ? '#a00' : '#dc2626', fontWeight: 'bold', lineHeight: 1, padding: 0, marginLeft: 1, fontSize: classic ? 11 : 13 }}>×</button>
            )}
        </span>
    );
}

export function workCenterChipStyle(centerType?: string | null, name?: string | null): React.CSSProperties {
    const t = (centerType || '').toUpperCase();
    const hit = WC_CHIP[t] || (WC_ALIAS[t] && WC_CHIP[WC_ALIAS[t]]);
    if (hit) return { ...hit };
    // type gave nothing (GENERAL/blank) — sniff the name for a known process word
    const n = (name || '').toUpperCase();
    for (const key of Object.keys(WC_CHIP)) if (n.includes(key)) return { ...WC_CHIP[key] };
    for (const alias of Object.keys(WC_ALIAS)) if (n.includes(alias)) return { ...WC_CHIP[WC_ALIAS[alias]] };
    return { ...WC_NEUTRAL };
}

// Fully-decorated work-center type chip. `workCenterChipStyle` only returns the
// palette (background/color/borderColor) — callers used to hand-roll the border,
// padding and font on top, and one that forgot rendered as bare colored text.
// Use this component for any work-center type badge.
export function WorkCenterChip({ type, name, label }: { type?: string | null; name?: string | null; label?: string }) {
    const text = label ?? type ?? '';
    if (!text) return null;
    return (
        <span style={{
            ...workCenterChipStyle(type, name),
            display: 'inline-block', borderWidth: 1, borderStyle: 'solid',
            fontSize: 9, padding: '1px 6px', whiteSpace: 'nowrap',
            fontFamily: xpFont, fontWeight: 'bold', lineHeight: 1.5,
        }}>{text}</span>
    );
}

// Rounded, bordered track + filled bar for at-a-glance completion (receiving
// progress, MO/WO progress, lineage) — the ONE progress bar shape for the
// whole app; new progress UI should use this instead of hand-rolling a
// track/fill pair. Tone defaults by fill level so callers don't have to
// compute it themselves (gray = 0%, amber = partial, green = 100%); pass one
// explicitly to override — e.g. `blue` for a generic "in progress" bar (per
// STATUS_FAMILY's IN_PROGRESS mapping), `red` for a shortfall bar.
// `hatched` gives the diagonal-stripe fill (MO Production Progress look);
// `secondaryPct`/`secondaryTone` stacks a second segment after the first
// (e.g. "planned" after "done"). `label`: 'outside' = trailing "NN%" text,
// 'inside' = centered overlay text, 'none' (default) = bar only.
const PROGRESS_FILL_DK: Record<StatusFamily, string> = { gray: '#c8c3b6', amber: '#c77800', blue: '#0058e6', green: '#2d7a2d', red: '#c00000' };
const PROGRESS_FILL_LT: Record<StatusFamily, string> = { gray: '#e2ddd0', amber: '#f5d060', blue: '#4a8fe8', green: '#6fce6f', red: '#e88a8a' };

function progressBarFill(tone: StatusFamily, hatched: boolean): string {
    if (!hatched) return PROGRESS_FILL_DK[tone];
    return `repeating-linear-gradient(45deg,${PROGRESS_FILL_DK[tone]},${PROGRESS_FILL_DK[tone]} 3px,${PROGRESS_FILL_LT[tone]} 3px,${PROGRESS_FILL_LT[tone]} 6px)`;
}

export function ProgressBar({
    pct, tone, hatched = false, height = 10, width, title,
    secondaryPct, secondaryTone = 'gray',
    tertiaryPct, tertiaryTone = 'gray',
    markerPct, markerTitle,
    label = 'none',
}: {
    pct: number;
    tone?: StatusFamily;
    hatched?: boolean;
    height?: number;
    width?: number | string;
    title?: string;
    /** Second segment stacked after the primary fill (e.g. "planned" after "done"). */
    secondaryPct?: number;
    secondaryTone?: StatusFamily;
    /** Third segment stacked after the secondary fill (e.g. a 3-stage pipeline —
     *  shipped -> packed -> made). Ignored unless secondaryPct is also set. */
    tertiaryPct?: number;
    tertiaryTone?: StatusFamily;
    /** Threshold tick drawn over the track (e.g. a target efficiency the fill is
     *  measured against). Not a second fill — it marks a line, not an amount. */
    markerPct?: number;
    markerTitle?: string;
    /** 'outside' = bar + trailing "NN%" text (flex row); 'inside' = centered overlay label; 'none' (default) = bar only. */
    label?: 'outside' | 'inside' | 'none';
}) {
    const t: StatusFamily = tone || (pct >= 100 ? 'green' : pct > 0 ? 'amber' : 'gray');
    const clamped = Math.max(0, Math.min(100, pct));
    const secClamped = secondaryPct != null ? Math.max(0, Math.min(100 - clamped, secondaryPct)) : 0;
    const terClamped = tertiaryPct != null ? Math.max(0, Math.min(100 - clamped - secClamped, tertiaryPct)) : 0;
    const pctLabel = Math.round(clamped);

    const track = (
        <div title={title} style={{ flex: label === 'outside' ? 1 : undefined, border: '1px solid #7f9db9', borderRadius: 3, height, width: label === 'outside' ? undefined : (width ?? '100%'), background: '#e9e9e9', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${clamped}%`, background: progressBarFill(t, hatched), transition: 'width 0.2s' }} />
            {secondaryPct != null && (
                <div style={{ position: 'absolute', top: 0, left: `${clamped}%`, height: '100%', width: `${secClamped}%`, background: progressBarFill(secondaryTone, hatched), transition: 'width 0.2s, left 0.2s' }} />
            )}
            {tertiaryPct != null && (
                <div style={{ position: 'absolute', top: 0, left: `${clamped + secClamped}%`, height: '100%', width: `${terClamped}%`, background: progressBarFill(tertiaryTone, hatched), transition: 'width 0.2s, left 0.2s' }} />
            )}
            {markerPct != null && (
                <div
                    title={markerTitle}
                    style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${Math.max(0, Math.min(100, markerPct))}%`,
                        width: 2, background: '#000',
                    }}
                />
            )}
            {label === 'inside' && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{
                        fontSize: Math.max(8, height - 7), fontWeight: 'bold', color: '#fff',
                        background: 'rgba(0,0,0,0.45)', borderRadius: 3, padding: '0 5px', lineHeight: `${height - 4}px`,
                    }}>
                        {pctLabel}%
                    </span>
                </span>
            )}
        </div>
    );

    if (label !== 'outside') return track;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {track}
            <span style={{ fontSize: 10, fontFamily: CODE_FONT, minWidth: 32 }}>{pctLabel}%</span>
        </div>
    );
}

// ── Inline style helpers (XP widgets) ────────────────────────────────────────

export const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: xpFont, fontSize: '11px', padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000000', borderRadius: 0,
    ...extra,
});

export const xpInput = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: xpFont, fontSize: '11px', border: '1px solid #7f9db9',
    padding: '1px 6px', background: '#ffffff', color: '#000000', height: '20px', outline: 'none',
    ...extra,
});

export const xpLabel = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: xpFont, fontSize: '11px', display: 'block', marginBottom: 2,
    ...extra,
});

export const xpSelect = (extra: React.CSSProperties = {}): React.CSSProperties =>
    xpInput({ height: '22px', ...extra });

export const xpSep: React.CSSProperties = {
    width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0,
};

export const xpPanel = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: '#f0f0e8', border: '1px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff', borderRadius: 0,
    ...extra,
});

const MODAL_FOOTER_CLASSIC_TONES: Record<'success' | 'primary' | 'danger', React.CSSProperties> = {
    success: { background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#8fe08f #0a3e0a #0a3e0a #8fe08f', color: '#fff' },
    primary: { background: 'linear-gradient(to bottom, #6090e0, #2050c0)', borderColor: '#90b8f0 #102060 #102060 #90b8f0', color: '#fff' },
    danger:  { background: 'linear-gradient(to bottom, #e08080, #c03030)', borderColor: '#f0b0b0 #801010 #801010 #f0b0b0', color: '#fff' },
};

// THE standard footer for create/edit modals (PR, MO, and similar full-form
// modals): a muted Cancel + a solid bevel-gradient submit button. Classic
// theme needs the same manual bevel branch as XPActionButton/ConfirmModal —
// the global .btn-success/.btn-primary CSS override flattens color to plain
// gray, which is why a Bootstrap-only button looks unstyled in Classic.
// Don't hand-roll Cancel/Create buttons per modal — use this.
export function ModalFooterActions({
    classic,
    onCancel, cancelLabel = 'Cancel',
    onSubmit, submitLabel, submittingLabel = 'Saving...', submitting = false,
    variant = 'success', disabled = false,
}: {
    classic: boolean;
    onCancel: () => void;
    cancelLabel?: string;
    onSubmit: () => void;
    submitLabel: string;
    submittingLabel?: string;
    submitting?: boolean;
    variant?: 'success' | 'primary' | 'danger';
    disabled?: boolean;
}) {
    if (classic) {
        const tone = MODAL_FOOTER_CLASSIC_TONES[variant];
        return (
            <>
                <button
                    type="button"
                    onClick={onCancel}
                    style={{
                        fontFamily: xpFont, fontSize: 11, padding: '3px 16px', cursor: 'pointer',
                        borderRadius: 0, border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                        background: 'linear-gradient(to bottom, #fff, #d4d0c8)', color: '#000',
                    }}
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitting || disabled}
                    style={{
                        fontFamily: xpFont, fontSize: 11, fontWeight: 'bold', padding: '3px 20px', cursor: submitting || disabled ? 'default' : 'pointer',
                        borderRadius: 0, border: '1px solid', opacity: submitting || disabled ? 0.6 : 1,
                        ...tone,
                    }}
                >
                    {(submitting ? submittingLabel : submitLabel).toUpperCase()}
                </button>
            </>
        );
    }
    return (
        <>
            <button type="button" className="btn btn-sm btn-link text-muted text-decoration-none" onClick={onCancel}>
                {cancelLabel}
            </button>
            <button type="button" className={`btn btn-sm btn-${variant} px-4 fw-bold shadow-sm`} onClick={onSubmit} disabled={submitting || disabled}>
                {submitting ? submittingLabel : submitLabel}
            </button>
        </>
    );
}

// Groups related fields in a create/edit form under a labeled section.
// THE standard section chrome for every sectioned create/edit panel (Colors, Lab Dip,
// Sample Request, Inventory, …). Classic: raised bevel box with a solid-blue gradient
// header bar (white text). Modern: neutral header bar over a bordered white card.
// Do not hand-roll per-page group boxes — use this so all forms stay identical.
// `style` / `bodyStyle` exist for callers that own their own vertical rhythm
// (a gap-spaced stack passes `marginBottom: 0`) or that put a full-bleed table
// where the 10px form padding would inset it (`bodyStyle={{ padding: 0 }}`).
// They are overrides on this one chrome — not a licence to re-declare the box.
export function FormSection({ title, classic, children, style, bodyStyle }: {
    title: React.ReactNode;
    classic: boolean;
    children: React.ReactNode;
    style?: React.CSSProperties;
    bodyStyle?: React.CSSProperties;
}) {
    const box: React.CSSProperties = classic
        ? { border: '1px solid #c0bdb5', boxShadow: 'inset 1px 1px 0 #fff, 1px 1px 0 #c0bdb5', marginBottom: 10, ...style }
        : { background: '#fff', border: '1px solid #dbe1ea', borderRadius: 9, marginBottom: 10, overflow: 'hidden', ...style };
    // Blue header in BOTH themes so every sectioned form reads the same:
    // classic = XP solid-blue gradient, modern = flat blue gradient. White text both.
    const header: React.CSSProperties = classic
        ? { background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)', color: '#fff', fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', padding: '3px 8px', letterSpacing: '0.5px', textTransform: 'uppercase' as const }
        : { background: 'linear-gradient(to right, #2a5fbe, #4a8fd8)', color: '#fff', fontFamily: modernFont, fontSize: 11, fontWeight: 700, padding: '6px 12px', letterSpacing: '0.04em', textTransform: 'uppercase' as const };
    return (
        <div style={box}>
            <div style={header}>{title}</div>
            <div style={{ background: '#fff', padding: '10px', ...bodyStyle }}>{children}</div>
        </div>
    );
}

// Fieldset-style panel with a floating legend notched into its top border — the
// grouping chrome used inside *operator log modals* (WO completion, packing),
// where FormSection's solid blue header bar would read as a page-level section
// and compete with the modal's own title bar. Was hand-rolled three times inside
// WOCompletionModal before this; `right` holds an optional action (e.g. "Print
// All Bag Labels") pinned to the legend line.
export function LegendPanel({ title, right, children, style }: {
    title: React.ReactNode;
    right?: React.ReactNode;
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    return (
        <div style={{ border: '1px solid #aca899', background: '#f5f4ee', position: 'relative', paddingTop: 10, ...style }}>
            <span style={{
                position: 'absolute', top: -7, left: 8, background: '#f5f4ee', padding: '0 4px',
                fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#000080',
            }}>
                {title}
            </span>
            {right && <span style={{ position: 'absolute', top: -9, right: 6 }}>{right}</span>}
            {children}
        </div>
    );
}

// Selected-chip tones. Blue is the default; the others exist for filters whose
// value carries its own semantics (ledger In/Out). Same five families as
// STATUS_FAMILY — don't add a sixth hue.
export type ChipTone = 'blue' | 'green' | 'red' | 'amber';

const CHIP_TONES: Record<ChipTone, { bg: string; border: string; cls: string }> = {
    blue:  { bg: '#0058e6', border: '#003080', cls: 'btn-primary' },
    green: { bg: '#1a7a1a', border: '#0a4a0a', cls: 'btn-success' },
    red:   { bg: '#a52020', border: '#5e0000', cls: 'btn-danger' },
    amber: { bg: '#c07000', border: '#804000', cls: 'btn-warning' },
};

/** Position inside a segmented (flush) group — see `FilterChipBar`/`SegmentedBar`. */
export type ChipSeg = 'first' | 'mid' | 'last' | 'only';

// Pressed/unpressed button — THE on-off chip shape (weekday pickers, filter chips,
// segmented pickers). Classic is the raised XP button with a solid tone fill when
// selected; modern is the bootstrap solid/outline pair. Use this instead of styling
// a selected state per view, so "this one is selected" always looks the same.
// Pass `seg` to make it a member of a flush segmented group (borders collapse).
export function ToggleChip({ on, onClick, classic, disabled = false, minWidth, title, seg, tone = 'blue', flat = false, children }: {
    on: boolean;
    onClick: () => void;
    classic: boolean;
    disabled?: boolean;
    minWidth?: number;
    title?: string;
    seg?: ChipSeg;
    tone?: ChipTone;
    // Idle (unselected) classic face: a flat panel instead of the raised XP
    // gradient. Segmented status bars (quarantine/sample/lab-dip) read as a flat
    // data control rather than a strip of buttons; weekday/filter chips keep the
    // raised default since those are genuinely toolbar buttons.
    flat?: boolean;
    children: React.ReactNode;
}) {
    const c = CHIP_TONES[tone];
    // Hover (and, in flat mode, press) are tracked in state, not CSS: the
    // classic chip is inline-styled (no class to hang a :hover on) and the
    // highlight has to know `on`/`tone` to pick between "tint the raised face"
    // and "brighten the solid fill".
    const [hover, setHover] = React.useState(false);
    const [pressed, setPressed] = React.useState(false);
    const lit = hover && !disabled;
    const down = pressed && !disabled;
    // Flat mode doesn't tint the face on hover — it brightens whatever colour
    // is already there and lifts the button 1px, then settles back down on
    // press. Same feedback the segmented status bars (quarantine/sample/lab-dip)
    // used before they moved onto this shared chip.
    const flatFilter = down ? 'brightness(0.96)' : lit ? 'brightness(1.08)' : 'none';
    const flatLift = lit && !down ? 'translateY(-1px)' : 'translateY(0)';
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={title}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => { setHover(false); setPressed(false); }}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onBlur={() => { setHover(false); setPressed(false); }}
            className={classic ? '' : `btn btn-sm ${on ? c.cls : 'btn-outline-secondary'}`}
            style={classic ? {
                fontFamily: xpFont, fontSize: 11, fontWeight: on ? 'bold' : 'normal',
                minWidth, padding: '2px 9px', borderRadius: 0,
                cursor: disabled ? 'default' : 'pointer',
                border: '1px solid',
                borderColor: on ? c.border
                    : (!flat && lit) ? '#7f9db9 #4a7ab5 #4a7ab5 #7f9db9'
                    : '#dfdfdf #808080 #808080 #dfdfdf',
                background: on ? c.bg
                    : flat ? '#eceae0'
                    : lit ? 'linear-gradient(to bottom,#ffffff,#d6e6fb)'
                    : 'linear-gradient(to bottom,#ffffff,#d4d0c8)',
                color: on ? '#fff' : (!flat && lit) ? '#00006e' : '#000',
                // Selected chips are already filled, so hover brightens the fill
                // instead of tinting it — same feedback, tone-agnostic.
                filter: flat ? flatFilter : (lit && on ? 'brightness(1.18)' : 'none'),
                transform: flat ? flatLift : undefined,
                boxShadow: (!flat && lit && !on) ? 'inset 0 0 0 1px rgba(255,255,255,0.75)' : 'none',
                transition: 'background 120ms ease, border-color 120ms ease, filter 120ms ease, box-shadow 120ms ease, color 120ms ease, transform 120ms ease',
                whiteSpace: 'nowrap',
                // Segment members share one border line; the selected (or hovered)
                // one sits on top so its darker edge isn't clipped by the neighbour
                // drawn after it.
                ...(seg && seg !== 'first' && seg !== 'only' ? { marginLeft: -1 } : {}),
                ...(seg ? { position: 'relative', zIndex: lit ? 2 : on ? 1 : 0 } : {}),
            } : {
                minWidth, whiteSpace: 'nowrap',
                // Bootstrap owns the modern hover colours; this only keeps the
                // hovered segment's border above its neighbours and eases the swap.
                transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease, filter 120ms ease, transform 120ms ease',
                ...(flat ? { filter: flatFilter, transform: flatLift } : {}),
                ...(seg ? { position: 'relative', zIndex: lit ? 2 : on ? 1 : 0 } : {}),
            }}
        >
            {children}
        </button>
    );
}

// Mon-first weekday picker (0=Mon … 6=Sun) — the working-days control on every
// production calendar. Both the per-machine monitor and the group batch-apply form
// had their own copy with different chrome (XP gradient buttons vs list-view
// buttons), so the same setting looked like two different controls; this is the
// one shape. Labels are fixed English abbreviations, matching the backend's
// weekday indexes.
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WeekdayToggle({ value, onToggle, classic, disabled = false }: {
    value: number[];
    onToggle: (day: number) => void;
    classic: boolean;
    disabled?: boolean;
}) {
    return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {WEEKDAY_LABELS.map((label, idx) => (
                <ToggleChip
                    key={label}
                    on={value.includes(idx)}
                    onClick={() => onToggle(idx)}
                    classic={classic}
                    disabled={disabled}
                    minWidth={classic ? 48 : 52}
                >
                    {label}
                </ToggleChip>
            ))}
        </div>
    );
}

// Icon + text (+ optional right-aligned trailing content) for a FormSection `title`.
// Pass as `title` so every group box shares the one header layout instead of each
// call site re-inventing the flex row.
export function SectionTitle({ icon, children, right }: { icon: string; children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <span style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 6 }}>
            <i className={`bi ${icon}`} />{children}
            {right && <span style={{ marginLeft: 'auto', fontWeight: 'normal', textTransform: 'none', letterSpacing: 0 }}>{right}</span>}
        </span>
    );
}

// Field label with optional muted/italic helper caption below it — keeps the
// instruction text visually lighter than the label so a form of many fields
// doesn't read as one dense block of same-weight text.
export function FieldLabel({ children, hint, classic, right }: { children: React.ReactNode; hint?: string; classic: boolean; right?: React.ReactNode }) {
    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <label
                    style={classic ? { fontFamily: xpFont, fontSize: 11, fontWeight: 'bold', color: '#2b2822', margin: 0 } : undefined}
                    className={classic ? '' : 'form-label small fw-semibold mb-0'}
                >
                    {children}
                </label>
                {right}
            </div>
            {hint && (
                <div
                    style={classic ? { fontFamily: xpFont, fontSize: 10, color: '#938c76', fontStyle: 'italic', marginBottom: 3 } : undefined}
                    className={classic ? '' : 'text-muted small fst-italic mb-1'}
                >
                    {hint}
                </div>
            )}
        </>
    );
}

// ── Loading / empty states ───────────────────────────────────────────────────

/**
 * XP-boot-style loading indicator: three blue blocks sliding across a track.
 * Keyframes + classes live in globals.css (.xp-loading-*).
 */
export function XPLoading({ label = 'Loading...', fullScreen = false }: { label?: string; fullScreen?: boolean }) {
    const inner = (
        <div style={{ textAlign: 'center', fontFamily: xpFont, userSelect: 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#1a3d90', marginBottom: 8 }}>{label}</div>
            <div className="xp-loading-track">
                <div className="xp-loading-blocks">
                    <span /><span /><span />
                </div>
            </div>
        </div>
    );
    if (!fullScreen) return <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>{inner}</div>;
    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#ece9d8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {inner}
        </div>
    );
}

// ── Skeleton placeholders ───────────────────────────────────────────────────
//
// A shimmering stand-in that carries the shape of what is coming beats a centred
// marquee that says only "something is happening". Not list-only: see the
// non-list skeletons further down (CardGridSkeleton / TableBlockSkeleton /
// PanelSkeleton) for grids, whole-table swaps and detail panes.
//
// XPLoading survives only where there is genuinely no shape to promise — a
// transient wait inside a flow whose next screen depends on what comes back
// (ScanDispatcher resolving a scanned code) — and for in-button spinners, which
// are Bootstrap's and stay as they are. Shimmer keyframes: globals.css .xp-skel.

/** One shimmering placeholder bar. */
export function SkeletonBar({ width = '100%', height = 9 }: { width?: number | string; height?: number }) {
    return <span className="xp-skel" style={{ display: 'block', width, height, borderRadius: 2 }} />;
}

// Deterministic width pattern — a fixed cycle, not Math.random(), so the
// skeleton doesn't reshuffle on every re-render while the fetch is in flight.
const SKEL_WIDTHS = ['72%', '46%', '61%', '38%', '83%', '54%', '67%', '43%'];
const skelWidth = (row: number, col: number) => SKEL_WIDTHS[(row * 3 + col * 5) % SKEL_WIDTHS.length];

/**
 * Placeholder rows for a table body. Emits real <tr>/<td> so the bars land in
 * the table's own columns — drop it straight into <tbody> in place of the
 * empty-state row.
 *
 * Pass the view's OWN cell style as `tdStyle` (its `tdBase`, `lvTd(classic)`,
 * …) rather than letting this re-derive one: padding, borders and font size
 * then match the real rows by construction, not by a copied guess that drifts
 * when the view is restyled.
 *
 * `cols` and `rowHeight` both come from `useTableSkeletonMetrics`, which reads
 * them off the real table. Hand-counted column numbers go stale the moment
 * anyone adds a column — and a skeleton one column short leaves a blank strip
 * where the last column should be.
 */
export function TableSkeleton({ rows = 6, cols, classic = false, tdStyle, rowHeight, fillHeight }: {
    /** Row count when `fillHeight` is unknown. */
    rows?: number;
    /** Column count — measure it with `useTableSkeletonMetrics`, don't count by hand. */
    cols: number;
    classic?: boolean;
    /** The view's real cell style. */
    tdStyle?: React.CSSProperties;
    /** Measured height of a real row, in px. */
    rowHeight?: number;
    /** Free height below the header, in px — rows are generated to fill it. */
    fillHeight?: number;
}) {
    const base: React.CSSProperties = tdStyle ?? {
        padding: classic ? '4px 6px' : '8px 10px',
        borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #e6eaf1',
        fontSize: classic ? 11 : 13,
    };
    // Falls back to a typical row before any measurement exists (first-ever view
    // of a table), so even that load is close rather than text-height thin.
    const h = rowHeight ?? (typeof base.height === 'number' ? base.height : (classic ? 26 : 38));
    // Bar tracks the row's text size, so a dense classic table doesn't get
    // modern-sized bars (and vice versa).
    const fontPx = parseFloat(String(base.fontSize ?? (classic ? 11 : 13))) || (classic ? 11 : 13);
    const barHeight = Math.max(8, Math.round(fontPx * 0.8));
    // Fill the visible body rather than stopping mid-panel: a fixed row count
    // leaves dead space under the skeleton on a tall screen, which reads as "the
    // table ends here". Capped so a very tall viewport can't spawn hundreds.
    const rowCount = fillHeight && h > 0
        ? Math.min(40, Math.max(3, Math.ceil(fillHeight / h)))
        : rows;

    return (
        <>
            {Array.from({ length: rowCount }, (_, r) => (
                <tr key={`skel-${r}`} style={{ background: classic ? (r % 2 === 0 ? '#ffffff' : '#f5f3ee') : undefined }}>
                    {Array.from({ length: cols }, (_, c) => (
                        <td key={c} style={{ ...base, height: h, boxSizing: 'border-box', verticalAlign: 'middle' }}>
                            <SkeletonBar width={skelWidth(r, c)} height={barHeight} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

// ── Skeletons for non-list shapes ───────────────────────────────────────────
//
// TableSkeleton above only fits a <tbody>. The views that aren't lists — the
// loom grid, the report tables that are swapped out header and all, the drill-in
// detail panes — used to fall back to XPLoading's centred marquee, which says
// only "something is happening" and then jumps to a full page of content.
//
// Same rule as TableSkeleton: the stand-in must carry the shape of what is
// coming. Pass the real geometry (column count, card min-width, gaps) from the
// view — a skeleton that doesn't line up with the thing that replaces it is
// worse than no skeleton, because the shift reads as a bug. Where a view has no
// stable shape to promise, keep XPLoading.

/**
 * Stand-in for a card grid — same `auto-fill / minmax` track as the real grid,
 * so cards land in the same columns at every viewport width.
 *
 * `count` is how many placeholder cards to draw: enough to fill the fold, not
 * the real count (unknown while loading).
 */
export function CardGridSkeleton({
    count = 8, minWidth = 250, gap = 12, classic = false,
    headerStrip = true, bodyLines = 3, bar = true, bodyHeight,
}: {
    count?: number;
    /** Must match the real grid's minmax() floor. */
    minWidth?: number;
    gap?: number;
    classic?: boolean;
    /** Draw the coloured title strip cards carry across their top. */
    headerStrip?: boolean;
    bodyLines?: number;
    /** Draw a progress-bar-shaped block under the lines. */
    bar?: boolean;
    /** Force a card body height when the real card is taller than the lines imply. */
    bodyHeight?: number;
}) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap }}>
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    style={classic
                        ? { border: '2px solid', borderColor: '#ffffff #808080 #808080 #ffffff', background: '#ece9d8' }
                        : { border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', overflow: 'hidden' }}
                >
                    {headerStrip && (
                        <div
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                                padding: classic ? '4px 7px' : '8px 12px',
                                background: classic ? '#a6a6a6' : '#f1f5f9',
                                borderBottom: `1px solid ${classic ? '#00000033' : '#e2e8f0'}`,
                            }}
                        >
                            <SkeletonBar width={skelWidth(i, 0)} height={classic ? 9 : 11} />
                            <SkeletonBar width={44} height={classic ? 9 : 11} />
                        </div>
                    )}
                    <div
                        style={{
                            padding: classic ? '7px 8px' : '12px',
                            background: '#fff',
                            display: 'flex', flexDirection: 'column', gap: classic ? 6 : 8,
                            minHeight: bodyHeight,
                        }}
                    >
                        {Array.from({ length: bodyLines }, (_, l) => (
                            <SkeletonBar key={l} width={skelWidth(i, l + 1)} height={classic ? 8 : 10} />
                        ))}
                        {bar && <SkeletonBar width="100%" height={classic ? 10 : 12} />}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Stand-in for a whole table *including* its header — for the views where the
 * loader replaces the `<table>` element itself, so there is no live `<thead>`
 * for TableSkeleton to sit under.
 *
 * Prefer TableSkeleton wherever the real header does render: it measures the
 * live table, this one is told. Pass the same `cols` the view is about to
 * render, and bump it for any leading spacer/expander column.
 */
export function TableBlockSkeleton({
    cols = 6, rows = 10, classic = false, header = true, rowHeight,
}: {
    cols?: number;
    rows?: number;
    classic?: boolean;
    header?: boolean;
    rowHeight?: number;
}) {
    const h = rowHeight ?? (classic ? 22 : 38);
    const pad = classic ? '4px 6px' : '8px 10px';
    const cellWidths = ['62%', '78%', '45%', '70%', '52%', '84%', '58%', '40%'];

    return (
        <div style={{ width: '100%' }}>
            {header && (
                <div
                    style={{
                        display: 'flex', gap: 0,
                        background: classic ? '#ece9d8' : '#f8fafc',
                        borderBottom: `1px solid ${classic ? '#b0a898' : '#e2e8f0'}`,
                    }}
                >
                    {Array.from({ length: cols }, (_, c) => (
                        <div key={c} style={{ flex: 1, padding: pad, minWidth: 0 }}>
                            <SkeletonBar width={cellWidths[(c * 3) % cellWidths.length]} height={classic ? 8 : 10} />
                        </div>
                    ))}
                </div>
            )}
            {Array.from({ length: rows }, (_, r) => (
                <div
                    key={r}
                    style={{
                        display: 'flex',
                        height: h, alignItems: 'center',
                        background: classic ? (r % 2 === 0 ? '#ffffff' : '#f5f3ee') : '#fff',
                        borderBottom: `1px solid ${classic ? '#e3e1dc' : '#eef2f7'}`,
                    }}
                >
                    {Array.from({ length: cols }, (_, c) => (
                        <div key={c} style={{ flex: 1, padding: pad, minWidth: 0 }}>
                            <SkeletonBar width={skelWidth(r, c)} height={classic ? 8 : 10} />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

/**
 * Stand-in for a detail pane: an optional section caption over label/value
 * rows. For drill-in panels and modal tabs, where what arrives is a block of
 * fields rather than rows or cards.
 */
export function PanelSkeleton({
    sections = 2, rows = 4, classic = false, caption = true,
}: {
    sections?: number;
    /** Label/value rows per section. */
    rows?: number;
    classic?: boolean;
    caption?: boolean;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: classic ? 12 : 18, padding: classic ? 8 : 12 }}>
            {Array.from({ length: sections }, (_, s) => (
                <div key={s}>
                    {caption && (
                        <div
                            style={{
                                padding: classic ? '3px 6px' : '0 0 8px',
                                background: classic ? '#ece9d8' : undefined,
                                borderBottom: `1px solid ${classic ? '#b0a898' : '#e2e8f0'}`,
                                marginBottom: classic ? 8 : 10,
                            }}
                        >
                            <SkeletonBar width={s % 2 ? 120 : 150} height={classic ? 9 : 11} />
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: classic ? 7 : 10 }}>
                        {Array.from({ length: rows }, (_, r) => (
                            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <SkeletonBar width={classic ? 92 : 120} height={classic ? 8 : 10} />
                                <SkeletonBar width={skelWidth(s + r, r)} height={classic ? 8 : 10} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Measured row heights, keyed by table. Module-level so a remount reuses the
// value; sessionStorage so a reload does too. Column counts are NOT cached —
// they are read straight off the live <thead>, which is always rendered.
const rowHeightCache = new Map<string, number>();

export interface TableSkeletonMetrics {
    /** Height of a real row in px — undefined until one has been measured. */
    rowHeight?: number;
    /** Column count read from the table's own <thead>. */
    cols?: number;
    /** Free height under the header inside the scroll container, in px. */
    fillHeight?: number;
}

/** Nearest scrollable ancestor — the box the skeleton has to fill. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement;
    while (node) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return node;
        node = node.parentElement;
    }
    return null;
}

/**
 * Reads a table's real geometry so its skeleton matches it.
 *
 * Two measurements, with different timing:
 *
 * - **cols** comes from the live `<thead>`, which renders whether or not there
 *   is data — so it is correct on the very first paint, including the first
 *   ever. This is the point: a hand-counted `cols` silently goes stale when
 *   someone adds a column, and the skeleton then leaves a blank strip where the
 *   new column sits.
 * - **rowHeight** needs a real row to exist, so the first-ever view of a table
 *   falls back to TableSkeleton's static estimate. It is cached (module Map +
 *   sessionStorage), so every later load — repeat navigation, reload, filter
 *   change — is pixel-exact.
 * - **fillHeight** is the free space under the header inside the scroll
 *   container, re-measured on resize. Without it a fixed row count leaves dead
 *   space under the skeleton on a tall screen, which reads as a table that
 *   simply ends early.
 *
 *   const bodyRef = useRef<HTMLTableSectionElement>(null);
 *   const skel = useTableSkeletonMetrics('sales-orders', bodyRef, rows.length > 0);
 *   …
 *   <tbody ref={bodyRef}>
 *       {rows.length === 0 && (loading
 *           ? <TableSkeleton cols={skel.cols ?? 12} classic={classic} tdStyle={tdBase} rowHeight={skel.rowHeight} />
 *           : <tr>…</tr>)}
 *
 * `key` must be stable per table, and distinct between two tables whose rows
 * are shaped differently (the classic and modern branches of one view share a
 * key only when their rows are the same height).
 */
export function useTableSkeletonMetrics(
    key: string,
    bodyRef: React.RefObject<HTMLElement | null>,
    hasRows: boolean,
): TableSkeletonMetrics {
    // Both start undefined on server and client alike — reading the cache during
    // render would make the first client paint disagree with the SSR markup.
    const [height, setHeight] = useState<number | undefined>(undefined);
    const [cols, setCols] = useState<number | undefined>(undefined);
    const [fillHeight, setFillHeight] = useState<number | undefined>(undefined);

    useEffect(() => {
        const cached = rowHeightCache.get(key) ?? (() => {
            try {
                const stored = Number(window.sessionStorage.getItem(`skel-row-h:${key}`));
                return Number.isFinite(stored) && stored > 0 ? stored : undefined;
            } catch { return undefined; }
        })();
        if (cached) {
            rowHeightCache.set(key, cached);
            setHeight(prev => prev ?? cached);
        }
    }, [key]);

    useEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        const table = body.closest('table');

        // Column count: the header row of this tbody's own table. Summing colSpan
        // rather than counting cells keeps grouped headers honest.
        const headRow = table?.querySelector('thead tr:last-of-type');
        if (headRow) {
            const measuredCols = Array.from(headRow.children)
                .reduce((n, th) => n + ((th as HTMLTableCellElement).colSpan || 1), 0);
            if (measuredCols > 0) setCols(prev => (prev === measuredCols ? prev : measuredCols));
        }

        // Free height under the header, tracked across viewport/panel resizes.
        const scroller = scrollParentOf(body);
        let observer: ResizeObserver | undefined;
        if (scroller) {
            const measureFill = () => {
                // clientHeight is layout px but getBoundingClientRect is screen px —
                // subtracting one from the other only agrees at 100% scale. Convert
                // the rect side. See uiScale.ts.
                const head = table?.querySelector('thead');
                const headH = head ? layoutRectOf(head).height : 0;
                const free = Math.round(scroller.clientHeight - headH);
                setFillHeight(prev => (prev === free ? prev : (free > 0 ? free : undefined)));
            };
            measureFill();
            observer = new ResizeObserver(measureFill);
            observer.observe(scroller);
        }

        // Row height, once there is a real row to measure. Every exit below runs
        // through the one cleanup so the observer is never left attached.
        const row = hasRows ? body.querySelector('tr') : null;
        if (row) {
            // Layout px, so the cached value stays valid across scale changes.
            const measured = Math.round(layoutRectOf(row).height);
            // 0 while the tab/table is display:none — don't cache that.
            if (measured > 0 && rowHeightCache.get(key) !== measured) {
                rowHeightCache.set(key, measured);
                try { window.sessionStorage.setItem(`skel-row-h:${key}`, String(measured)); } catch { /* private mode */ }
                setHeight(measured);
            }
        }

        return () => observer?.disconnect();
    }, [hasRows, key, bodyRef]);

    return { rowHeight: height, cols, fillHeight };
}

/** Placeholder rows for a non-table list pane (the dyeing/setting WO rails). */
export function ListSkeleton({ rows = 5, padding = '6px 8px' }: { rows?: number; padding?: string }) {
    return (
        <div>
            {Array.from({ length: rows }, (_, r) => (
                <div key={`skel-${r}`} style={{ padding, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <SkeletonBar width={skelWidth(r, 0)} />
                    <SkeletonBar width={skelWidth(r, 1)} height={7} />
                </div>
            ))}
        </div>
    );
}

// ── Status bar (classic Windows bottom strip) ───────────────────────────────

export function XPStatusBar({ children, right, style }: { children: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            background: 'linear-gradient(to bottom, #f4f2ea, #e3e1d6)',
            border: '1px solid', borderColor: '#808080 #ffffff #ffffff #808080',
            padding: '2px 8px', marginTop: 4,
            fontFamily: xpFont, fontSize: 10, color: '#333333',
            userSelect: 'none',
            ...style,
        }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
            {right && <span style={{ flexShrink: 0 }}>{right}</span>}
        </div>
    );
}

// ── Client-side table sorting ────────────────────────────────────────────────

export type SortState = { key: string; dir: 1 | -1 } | null;

const isNil = (v: any) => v === null || v === undefined || v === '';

function compareValues(a: any, b: any): number {
    if (isNil(a) && isNil(b)) return 0;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na - nb;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * The header-click transition, shared by client-side and server-side sorting:
 * unsorted -> asc -> desc -> unsorted, and a click on a different column starts
 * that column at asc. Pure, so a view whose sort state lives somewhere other than
 * local state (DataContext, a URL param) gets the same behaviour as useSortable.
 */
export function nextSortState(prev: SortState, key: string): SortState {
    if (prev?.key !== key) return { key, dir: 1 };
    return prev.dir === 1 ? { key, dir: -1 } : null;
}

/**
 * Sort state for a list the SERVER sorts — the view holds one page, so a column
 * header has to change a query param rather than reorder the rows in memory.
 * Sorting a page client-side puts the wrong rows on page 1 entirely, so reach for
 * this (not useSortable) whenever the rows arrive windowed.
 */
export function useServerSort(initial: SortState = null) {
    const [sort, setSort] = useState<SortState>(initial);
    const toggleSort = useCallback((key: string) => setSort(prev => nextSortState(prev, key)), []);
    return { sort, setSort, toggleSort };
}

/**
 * Sort rows client-side by a column key. `columns` maps key -> accessor.
 * toggle() cycles asc -> desc -> off per column. Empty values sort last in both directions.
 * Only correct when the view holds the WHOLE set — for a windowed list use useServerSort.
 */
export function useSortable<T>(rows: T[], columns: Record<string, (row: T) => any>, initialSort: SortState = null) {
    const [sort, setSort] = useState<SortState>(initialSort);

    const sorted = useMemo(() => {
        if (!sort || !columns[sort.key]) return rows;
        const acc = columns[sort.key];
        return [...rows].sort((ra, rb) => {
            const a = acc(ra), b = acc(rb);
            if (isNil(a) !== isNil(b)) return isNil(a) ? 1 : -1;
            return compareValues(a, b) * sort.dir;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sort]);

    const toggle = (key: string) => setSort(prev => nextSortState(prev, key));

    return { sorted, sort, toggle };
}

/** Arrow indicator for a sortable column header. */
export function SortMark({ sort, colKey }: { sort: SortState; colKey: string }) {
    if (sort?.key !== colKey) return null;
    return <span style={{ marginLeft: 3, fontSize: 8 }}>{sort.dir === 1 ? '▲' : '▼'}</span>;
}

export function XPEmptyState({ message, icon = 'bi-inbox', children }: { message: string; icon?: string; children?: React.ReactNode }) {
    return (
        <div style={{
            background: '#ffffff', border: '1px solid',
            borderColor: '#808080 #ffffff #ffffff #808080',
            padding: '28px 16px', textAlign: 'center',
            fontFamily: xpFont, color: '#666666',
        }}>
            <i className={`bi ${icon}`} style={{ fontSize: 22, color: '#a0a0a0', display: 'block', marginBottom: 6 }} />
            <div style={{ fontSize: 11, fontStyle: 'italic' }}>{message}</div>
            {children}
        </div>
    );
}

// ── Row-actions "more" menu (⋯) ─────────────────────────────────────────────
// Fixed-position dropdown, keyed by row id, closed on outside click/scroll.
// One id open at a time — fits table rows where only one menu should ever
// be open. Was duplicated per-view (Samples' action dropdown, PO's ⋯ menu)
// before being pulled out here; migrate a view's local copy when you touch it.

export function useFloatingMenu(menuWidth = 175) {
    const [openId, setOpenId] = useState<string | null>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const handleGlobalClick = (event: any) => {
            if (!event.target.closest('.xp-menu-trigger') && !event.target.closest('.xp-floating-menu')) {
                setOpenId(null);
            }
        };
        const handleScroll = () => setOpenId(null);
        document.addEventListener('click', handleGlobalClick);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('click', handleGlobalClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, []);

    const toggle = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (openId === id) { setOpenId(null); return; }
        // Measured in screen px, written back as CSS px — convert, or the menu
        // drifts by the interface-scale factor. See uiScale.ts.
        const rect = layoutRectOf(e.currentTarget as HTMLElement);
        const scroll = layoutScroll();
        setPos({ top: rect.bottom + scroll.y + 2, left: rect.right + scroll.x - menuWidth });
        setOpenId(id);
    };

    return { openId, pos, toggle, close: () => setOpenId(null) };
}

/** "⋯" trigger button — square icon button in classic, link-style in modern. Always tagged .xp-menu-trigger so useFloatingMenu's outside-click check sees it. */
export function MenuTriggerButton({ classic, onClick, title = 'More actions' }: { classic: boolean; onClick: (e: React.MouseEvent) => void; title?: string }) {
    if (classic) {
        return (
            <button
                className="xp-menu-trigger"
                title={title}
                onClick={onClick}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', color: '#555', fontSize: '12px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
            >
                <i className="bi bi-three-dots"></i>
            </button>
        );
    }
    return (
        <button className="btn btn-sm btn-link text-muted p-0 d-inline-flex align-items-center justify-content-center xp-menu-trigger" style={{ width: 26, height: 26 }} title={title} onClick={onClick}>
            <i className="bi bi-three-dots fs-6"></i>
        </button>
    );
}

// ── Flat table-row action button ────────────────────────────────────────────
// The compact, flat (non-beveled) icon/label button used in table action
// columns — WO table, Lot Management, dyeing Stage/Log. Classic renders a
// single-border flat button (NOT the raised 4-color XP bevel, which reads as
// chunky/glossy at this size); modern maps the tone onto btn-outline-*.
// Pair with MenuTriggerButton for the "⋯" overflow in the same column.
export type XPActionTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const XP_ACTION_TONES: Record<XPActionTone, { bg: string; border: string; fg: string }> = {
    neutral: { bg: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '#909090', fg: '#333333' },
    primary: { bg: 'linear-gradient(to bottom, #cfe0ff, #8fb3e8)', border: '#335599', fg: '#0a2a66' },
    success: { bg: 'linear-gradient(to bottom, #b0e8b0, #70c870)', border: '#0a3e0a', fg: '#004000' },
    warning: { bg: 'linear-gradient(to bottom, #ffe0b0, #e8b060)', border: '#99631a', fg: '#663300' },
    danger:  { bg: 'linear-gradient(to bottom, #f0c0c0, #d07070)', border: '#992222', fg: '#600000' },
};

const XP_ACTION_MODERN: Record<XPActionTone, string> = {
    neutral: 'btn-outline-secondary',
    primary: 'btn-outline-primary',
    success: 'btn-outline-success',
    warning: 'btn-outline-warning',
    danger:  'btn-outline-danger',
};

export function XPActionButton({
    classic, tone = 'neutral', icon, label, title, onClick, disabled = false, className,
}: {
    classic: boolean;
    tone?: XPActionTone;
    icon?: string;               // bootstrap-icon class, e.g. 'bi-box-seam'
    label?: React.ReactNode;     // optional text; icon-only when omitted
    title?: string;
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    className?: string;          // extra classes — pass 'xp-menu-trigger' when this button opens a FloatingMenu
}) {
    const iconEl = icon ? <i className={`bi ${icon}`} /> : null;
    if (classic) {
        const t = XP_ACTION_TONES[tone];
        return (
            <button
                onClick={onClick}
                title={title}
                disabled={disabled}
                className={className}
                style={{
                    fontFamily: xpFont, fontSize: 11, lineHeight: 1, padding: '2px 4px',
                    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
                    background: t.bg, border: `1px solid ${t.border}`, color: t.fg,
                    display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 0,
                }}
            >
                {iconEl}{label}
            </button>
        );
    }
    return (
        <button
            className={`btn ${XP_ACTION_MODERN[tone]} d-inline-flex align-items-center py-0 px-1`}
            style={{ fontSize: 11, gap: 4 }}
            onClick={onClick}
            title={title}
            disabled={disabled}
        >
            {iconEl}{label}
        </button>
    );
}

export type FloatingMenuItem = {
    key: string;
    label: React.ReactNode;
    icon?: string;
    onClick: () => void;
    danger?: boolean;
    title?: string;
    hidden?: boolean;
};

/** Renders at `pos` (from useFloatingMenu) — pair with a `.xp-menu-trigger`-tagged button. */
export function FloatingMenu({ pos, items, minWidth = 175 }: { pos: { top: number; left: number }; items: FloatingMenuItem[]; minWidth?: number }) {
    const visible = items.filter(i => !i.hidden);
    if (!visible.length) return null;
    return (
        <div
            className="xp-floating-menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth, background: '#fff', border: '1px solid #808080', boxShadow: '2px 2px 4px rgba(0,0,0,.25)' }}
        >
            {visible.map(item => (
                <button
                    key={item.key}
                    title={item.title}
                    onClick={item.onClick}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left' as const,
                        background: 'none', border: 'none', padding: '6px 10px', fontSize: 11,
                        fontFamily: xpFont, cursor: 'pointer', color: item.danger ? '#aa0000' : '#222',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = item.danger ? '#fff0f0' : '#e8f0f8'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                    {item.icon && <i className={`bi ${item.icon}`}></i>} {item.label}
                </button>
            ))}
        </div>
    );
}

// ── Expanded-row panel ──────────────────────────────────────────────────────
// Standard shape for any "expand this table row" detail panel (WO tree/detail,
// PR material requirements, and any future one). Two cues, no depth:
//   • a saturated left rail in the row-selection blue — pegs the panel to the
//     highlighted row it dropped out of, so the two read as one unit;
//   • heavy top/bottom rules — bracket the expansion as a break in the list.
// The body stays the same flat white as the rows, so wide content gets the full
// row width instead of a nested frame eating padding on both sides. This
// replaced an inset/recessed frame whose stacked shadows read as muddy rather
// than deep, especially against Classic's beige — no depth shadows here.
//
// The frame is painted with `inset` box-shadow, NOT `border`, and that is load-
// bearing: this panel lives in a `<td colSpan>` spanning every column, so any
// border or padding it declares feeds into that cell's min-content width, which
// auto table layout then distributes back across all the columns — the row above
// visibly jumps sideways on expand. Shadows never participate in layout, so the
// panel costs zero width. A call site that overrides `padding` must keep its left
// value >= RAIL_W — the rail paints inside the padding box, so with less reserve
// it sits on top of the content's first few pixels.
// Always pair the two: ExpandedRowPanel is the frame, ExpandedRowPanelBody the
// padded content box.
const RAIL_W = { classic: 4, modern: 3 };
const RULE_W = 2;

/** The rail + edge rules as a paint-only frame. Exported for the two views whose panel can't be a component (absolutely positioned, or a two-pane workspace keeping its own grounds) — they apply this to the `<td>` and must stay in sync with the component. `railColor` overrides the selection blue where the rail carries meaning (e.g. health on Booking Stock). */
export function expandedRowFrame(classic: boolean, railColor?: string): React.CSSProperties {
    const rail = classic ? RAIL_W.classic : RAIL_W.modern;
    const rule = classic ? '#808080' : '#adb5bd';
    return {
        boxShadow: [
            `inset ${rail}px 0 0 0 ${railColor || (classic ? '#316ac5' : '#2f6feb')}`,
            `inset 0 ${RULE_W}px 0 0 ${rule}`,
            `inset 0 -${RULE_W}px 0 0 ${rule}`,
        ].join(', '),
    };
}

// ---------------------------------------------------------------------------
// Row state backgrounds
// ---------------------------------------------------------------------------
// Three states a list row can be in, three grounds — never mix them up:
//   expanded    this row's detail panel is open below it. Selection blue, light.
//   selected    checked for a bulk action. Same hue, darker, so a selected row
//               that is also expanded still reads as selected.
//   highlighted transient attention only — scroll target, search hit. Amber.
// Blue is the expand convention app-wide (matches the ExpandedRowPanel rail);
// amber never means "open". Every list that expands a row must paint
// rowStateBg('expanded', classic) and nothing hand-rolled.
export type RowState = 'expanded' | 'selected' | 'highlighted';

const ROW_STATE_BG: Record<RowState, { classic: string; modern: string }> = {
    expanded: { classic: '#d6e4f7', modern: '#eef2ff' },
    selected: { classic: '#b8d0ef', modern: '#dbe4ff' },
    highlighted: { classic: '#fff8c4', modern: '#fef9c3' },
};

export const rowStateBg = (state: RowState, classic: boolean): string =>
    classic ? ROW_STATE_BG[state].classic : ROW_STATE_BG[state].modern;

export function ExpandedRowPanel({ classic, children, style }: { classic: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            ...expandedRowFrame(classic),
            background: '#fff',
            padding: classic ? 5 : 6,
            ...style,
        }}>
            {children}
        </div>
    );
}

/** Padded, transparent content box inside an ExpandedRowPanel — the panel already supplies the ground, so this adds no second background or frame. Pass `style` to override padding/border for layouts that need their own (e.g. a fixed-height two-pane body). */
export function ExpandedRowPanelBody({ classic, children, style }: { classic: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            padding: classic ? '4px 8px' : '6px 12px',
            ...style,
        }}>
            {children}
        </div>
    );
}

