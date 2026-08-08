'use client';

import React, { useMemo, useState, useEffect } from 'react';

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
    const pctLabel = Math.round(clamped);

    const track = (
        <div title={title} style={{ flex: label === 'outside' ? 1 : undefined, border: '1px solid #7f9db9', borderRadius: 3, height, width: label === 'outside' ? undefined : (width ?? '100%'), background: '#e9e9e9', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${clamped}%`, background: progressBarFill(t, hatched), transition: 'width 0.2s' }} />
            {secondaryPct != null && (
                <div style={{ position: 'absolute', top: 0, left: `${clamped}%`, height: '100%', width: `${secClamped}%`, background: progressBarFill(secondaryTone, hatched), transition: 'width 0.2s, left 0.2s' }} />
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
            <span style={{ fontSize: 10, fontFamily: 'monospace', minWidth: 32 }}>{pctLabel}%</span>
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
export function FormSection({ title, classic, children }: { title: React.ReactNode; classic: boolean; children: React.ReactNode }) {
    const box: React.CSSProperties = classic
        ? { border: '1px solid #c0bdb5', boxShadow: 'inset 1px 1px 0 #fff, 1px 1px 0 #c0bdb5', marginBottom: 10 }
        : { background: '#fff', border: '1px solid #dbe1ea', borderRadius: 9, marginBottom: 10, overflow: 'hidden' };
    // Blue header in BOTH themes so every sectioned form reads the same:
    // classic = XP solid-blue gradient, modern = flat blue gradient. White text both.
    const header: React.CSSProperties = classic
        ? { background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)', color: '#fff', fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', padding: '3px 8px', letterSpacing: '0.5px', textTransform: 'uppercase' as const }
        : { background: 'linear-gradient(to right, #2a5fbe, #4a8fd8)', color: '#fff', fontFamily: modernFont, fontSize: 11, fontWeight: 700, padding: '6px 12px', letterSpacing: '0.04em', textTransform: 'uppercase' as const };
    return (
        <div style={box}>
            <div style={header}>{title}</div>
            <div style={{ background: '#fff', padding: '10px' }}>{children}</div>
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

// Pressed/unpressed button — THE on-off chip shape (weekday pickers, filter chips,
// segmented pickers). Classic gets the XP pressed-blue gradient, modern the
// bootstrap primary/outline pair. Use this instead of styling a selected state per
// view, so "this one is selected" always looks the same.
export function ToggleChip({ on, onClick, classic, disabled = false, minWidth, title, children }: {
    on: boolean;
    onClick: () => void;
    classic: boolean;
    disabled?: boolean;
    minWidth?: number;
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={title}
            className={classic ? '' : `btn btn-sm ${on ? 'btn-primary' : 'btn-outline-secondary'}`}
            style={classic ? {
                fontFamily: xpFont, fontSize: 11, fontWeight: on ? 'bold' : 'normal',
                minWidth, padding: '3px 8px', borderRadius: 0,
                cursor: disabled ? 'default' : 'pointer',
                border: '1px solid',
                borderColor: on ? '#003080 #6ea8ff #6ea8ff #003080' : '#dfdfdf #808080 #808080 #dfdfdf',
                background: on ? 'linear-gradient(to bottom,#3a8dff,#0058e6)' : 'linear-gradient(to bottom,#ffffff,#d4d0c8)',
                color: on ? '#fff' : '#444',
            } : { minWidth }}
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
 * Sort rows client-side by a column key. `columns` maps key -> accessor.
 * toggle() cycles asc -> desc -> off per column. Empty values sort last in both directions.
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

    const toggle = (key: string) => setSort(prev =>
        prev?.key !== key ? { key, dir: 1 }
        : prev.dir === 1 ? { key, dir: -1 }
        : null
    );

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
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ top: rect.bottom + window.scrollY + 2, left: rect.right + window.scrollX - menuWidth });
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

// ── Sunken expanded-row panel ───────────────────────────────────────────────
// Standard shape for any "expand this table row" detail panel (WO tree/detail,
// PR material requirements, and any future one): an inset/recessed outer frame
// — reads as "this dropped out of the row above it" — holding a lighter inner
// content box so the two layers stay visually distinct instead of the content
// floating directly on the recessed background. Always pair the two: SunkenPanel
// is just the frame, SunkenPanelBody is the content box; a frame with no body
// (or a body used standalone) loses the contrast this is built for.
export function SunkenPanel({ classic, children, style }: { classic: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            border: classic ? '1px solid #808080' : '1px solid #ced4da',
            background: classic ? '#d8d3c8' : '#e9edf1',
            boxShadow: classic
                ? 'inset 0 2px 5px rgba(0,0,0,0.28), inset 0 -2px 5px rgba(0,0,0,0.16)'
                : 'inset 0 2px 6px rgba(0,0,0,0.18), inset 0 -2px 6px rgba(0,0,0,0.10)',
            padding: 5,
            ...style,
        }}>
            {children}
        </div>
    );
}

/** Lighter content box that sits inside a SunkenPanel. Pass `style` to override background/border/padding for layouts that need their own (e.g. a fixed-height two-pane body). */
export function SunkenPanelBody({ classic, children, style }: { classic: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            background: classic ? '#f5f3ee' : '#f8f9fa',
            border: classic ? '1px solid #808080' : '1px solid #dee2e6',
            padding: classic ? '6px 12px' : '8px 16px',
            ...style,
        }}>
            {children}
        </div>
    );
}

