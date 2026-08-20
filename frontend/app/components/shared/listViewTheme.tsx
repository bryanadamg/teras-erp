'use client';
import React from 'react';
import { xpFont, modernFont } from './xpTheme';

// Shared dual-theme (classic XP / modern) style helpers for master-data list views
// (Color Library, Combo Library, Colors variant, …). xpTheme's xpBtn/xpInput are
// classic-only; these carry both branches so the library views don't each re-declare
// the same style objects. Prefix `lv` (list-view) avoids clashing with xpTheme exports.

// Aliases, not second definitions: these used to declare their own stacks, and
// LV_XP_FONT's ('Tahoma, "Segoe UI", sans-serif') dropped Arial, so a list view
// and a form fell back to different faces wherever Tahoma was missing.
// xpTheme owns both stacks — keep these as re-exports for the existing call sites.
export const LV_XP_FONT = xpFont;
export const LV_MODERN_FONT = modernFont;

// `extra` must be spread last — callers pass an explicit `width` to sit an input in
// a toolbar row, and the default `width: '100%'` would otherwise silently win and
// blow every field out to full width (stacking a one-line filter bar into N rows).
export const lvInput = (classic: boolean, extra: React.CSSProperties = {}): React.CSSProperties => (classic ? {
    fontFamily: LV_XP_FONT, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 6px', outline: 'none', height: 20, width: '100%', boxSizing: 'border-box',
    ...extra,
} : {
    fontFamily: LV_MODERN_FONT, fontSize: 13, border: '1px solid #cbd3df', borderRadius: 7,
    padding: '4px 8px', background: '#fff', color: '#1e293b', outline: 'none', width: '100%', boxSizing: 'border-box',
    ...extra,
});

const LV_MODERN_PRIMARY: React.CSSProperties = { fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none' };

export const lvBtn = (classic: boolean, extra: React.CSSProperties = {}): React.CSSProperties => (classic ? {
    fontFamily: LV_XP_FONT, fontSize: 11, padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', ...extra,
} : {
    fontFamily: LV_MODERN_FONT, fontSize: 12.5, fontWeight: 500, padding: '5px 12px', cursor: 'pointer',
    background: '#fff', color: '#334155', border: '1px solid #cbd3df', borderRadius: 7, ...extra,
});

// Emphasised primary button (blue), dual-theme.
export const lvPrimaryBtn = (classic: boolean): React.CSSProperties => (classic
    ? lvBtn(true, { background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', fontWeight: 'bold' })
    : lvBtn(false, LV_MODERN_PRIMARY));

export const lvLabel = (classic: boolean): React.CSSProperties => (classic
    ? { fontFamily: LV_XP_FONT, fontSize: 11, color: '#000', display: 'block', marginBottom: 2 }
    : { fontFamily: LV_MODERN_FONT, fontSize: 12, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 3 });

export const lvTh = (classic: boolean): React.CSSProperties => (classic ? {
    padding: '3px 6px', borderRight: '1px solid #b0aaa0', textAlign: 'left', whiteSpace: 'nowrap',
    fontFamily: LV_XP_FONT, fontSize: 10, fontWeight: 'bold', color: '#000',
} : {
    padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap',
    fontFamily: LV_MODERN_FONT, fontSize: 11, fontWeight: 700, color: '#475569',
    textTransform: 'uppercase', background: '#eef1f6', borderBottom: '1.5px solid #cbd3df',
});

// Table header-row style. The classic bevel gradient + modern flat band were being
// hand-written at every `<thead>`; `sticky` keeps the header pinned when the table
// body is its own scroll region.
export const lvThead = (classic: boolean, sticky = false): React.CSSProperties => ({
    ...(classic
        ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }
        : { background: '#eef1f6', borderBottom: '1.5px solid #cbd3df' }),
    ...(sticky ? { position: 'sticky' as const, top: 0, zIndex: 1 } : {}),
});

export const lvTd = (classic: boolean): React.CSSProperties => (classic ? {
    padding: '4px 6px', borderRight: '1px solid #c0bdb5', verticalAlign: 'middle', fontFamily: LV_XP_FONT, fontSize: 11,
} : {
    padding: '6px 10px', verticalAlign: 'middle', fontFamily: LV_MODERN_FONT, fontSize: 13, color: '#334155',
});

// ── Sub-tables (mini-tables inside an expanded row) ───────────────────────────
// A different job from lvTh/lvTd, which dress the *main* list. A table nested
// inside an already-striped list needs to read as subordinate to it: flatter,
// tighter, and with NO zebra — two stripe patterns one inside the other read as
// two competing grids. Row separation is a hairline rule instead.
//
// ~13 expanded-row panels nest a table like this and each used to hand-write the
// same chrome, which had already drifted (four files repeating one XP gradient
// string, one of them with different literals). Pair `lvSubTable` on the
// `<table>` with `lvSubTh`/`lvSubTd` on the cells.

// `dense` is a genuinely second size, not a tuning knob: a few panels put the
// sub-table in one column of a multi-column grid (pick list cartons, pack log,
// dye recipe chemical lines) where the default would force truncation. Use it
// only for a table sharing its row with other panes — a full-width sub-table
// should stay at the default size.
export const lvSubTh = (classic: boolean, dense = false): React.CSSProperties => (classic ? {
    padding: dense ? '2px 5px' : '3px 8px', fontSize: dense ? 9 : 10,
    fontWeight: 'bold', color: '#1a3d6b',
    background: '#e4e0d4', borderBottom: '1px solid #b0a898',
    textAlign: 'left', whiteSpace: 'nowrap', fontFamily: LV_XP_FONT,
} : {
    padding: dense ? '3px 6px' : '5px 10px', fontSize: dense ? 10 : 11,
    fontWeight: 600, color: '#334155',
    background: '#f1f5f9', borderBottom: '1px solid #cbd5e1',
    textAlign: 'left', whiteSpace: 'nowrap', fontFamily: LV_MODERN_FONT,
});

// Vertical padding is 3px rather than the 2px some call sites used, because
// several of these tables carry chips, selects and checkboxes rather than plain
// text. On a text-only row the extra pixel is imperceptible.
export const lvSubTd = (classic: boolean, dense = false): React.CSSProperties => (classic ? {
    padding: dense ? '2px 5px' : '3px 8px', fontSize: dense ? 9 : 10, color: '#333',
    borderTop: '1px solid #e6e3da', fontFamily: LV_XP_FONT,
} : {
    padding: dense ? '3px 6px' : '5px 10px', fontSize: dense ? 10.5 : 11.5, color: '#1e293b',
    borderTop: '1px solid #eef2f7', fontFamily: LV_MODERN_FONT,
});

/**
 * Sub-table row fill. Two decisions in one place, because they interact:
 *
 * - `zebra` is opt-IN. A striped sub-table nested in a striped list reads as two
 *   competing grids, so most of these are flat and separated by the cell rule in
 *   lvSubTd. Turn it on where the table is wide and scan-heavy enough to earn it
 *   (the Production Run material grid is 10 columns — stripes help there).
 * - `fill` is a semantic row colour: rejected, picked, packed, selected. It
 *   always wins over the stripe, so a meaningful row never gets overpainted by
 *   decoration and callers don't have to hand-write that precedence each time.
 *
 * The stripe is deliberately lighter than lvRow's, so an inner table never
 * out-contrasts the list it sits inside.
 */
export const lvSubRow = (
    classic: boolean,
    idx: number,
    { zebra = false, fill }: { zebra?: boolean; fill?: string } = {},
): React.CSSProperties | undefined => {
    if (fill) return { background: fill };
    if (zebra) return { background: idx % 2 === 0 ? '#fff' : (classic ? '#f7f5f0' : '#fafbfd') };
    return undefined;
};

export const lvSubTable = (classic: boolean): React.CSSProperties => ({
    width: '100%', borderCollapse: 'collapse', background: '#fff',
    border: `1px solid ${classic ? '#c0bdb5' : '#dee2e6'}`,
});

// Small uppercase title above a sub-table. Distinct from LvSectionCaption, which
// is a full-bleed band for stacked top-level sections; this is a quiet label for
// a mini-table, and is what makes a panel holding two of them legible.
export const lvSubCaption = (classic: boolean): React.CSSProperties => ({
    fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT,
    fontSize: classic ? 10 : 11, fontWeight: 'bold', color: '#444',
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3,
});

export const lvSep = (classic: boolean): React.CSSProperties =>
    ({ width: 1, height: 20, background: classic ? '#a0988c' : '#dbe1ea', margin: '0 2px' });

// Row background stripe (zebra), dual-theme + border.
export const lvRow = (classic: boolean, idx: number): React.CSSProperties => (classic
    ? { background: idx % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' }
    : { background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e6eaf1' });

// ── Row multi-select ──────────────────────────────────────────────────────────
// The checkbox half of a bulk-action list. Six views grew their own copy of this
// and drifted on all three axes: the state shape (`Set<id>` / `Record<key,row>`),
// the "all selected" test (`size === rows.length`, which is wrong the moment a
// selection outlives a page), and the checkbox chrome (bare input vs
// `form-check-input`, 28/32/40px columns).
//
// `useRowSelection` keeps the ROW OBJECT, not just its id, because every bulk
// action downstream needs the row (print a WO card, move a stock line) and a
// selection that survives paging can no longer look it up in the visible page.
// Select-all is deliberately page-scoped — ticking 4000 filtered rows in one
// click is never what the user meant — while individually selected rows on other
// pages stay selected.
export const LV_CHECK_COL_W = 28;

export const lvCheckTd = (classic: boolean, base: React.CSSProperties = {}): React.CSSProperties => ({
    ...lvTd(classic),
    ...base,
    width: LV_CHECK_COL_W, textAlign: 'center', padding: '3px 4px', verticalAlign: 'middle',
});

export interface RowSelection<T> {
    /** key → row, for the bulk action and the row's own `checked` test. */
    selected: Record<string, T>;
    keys: string[];
    items: T[];
    entries: [string, T][];
    count: number;
    isSelected: (row: T) => boolean;
    isSelectedKey: (key: string) => boolean;
    toggle: (row: T) => void;
    /** For rows handed to a memoised child that only knows the id. */
    toggleKey: (key: string) => void;
    deselectKey: (key: string) => void;
    /** Header checkbox: adds/removes every eligible row on the current page. */
    togglePage: () => void;
    allPageSelected: boolean;
    /** Some — but not all — of this page is selected: the indeterminate state. */
    someSelected: boolean;
    /** Eligible rows on this page; 0 means the header checkbox has nothing to do. */
    pageEligibleCount: number;
    clear: () => void;
}

export function useRowSelection<T>(
    rows: T[],
    keyOf: (row: T) => string,
    opts: { selectable?: (row: T) => boolean } = {},
): RowSelection<T> {
    const [selected, setSelected] = React.useState<Record<string, T>>({});
    const { selectable } = opts;
    const eligible = selectable ? rows.filter(selectable) : rows;

    const isSelectedKey = (key: string) => !!selected[key];
    const isSelected = (row: T) => isSelectedKey(keyOf(row));

    const setRow = (row: T, on: boolean) => setSelected(prev => {
        const next = { ...prev };
        const k = keyOf(row);
        if (on) next[k] = row; else delete next[k];
        return next;
    });

    const allPageSelected = eligible.length > 0 && eligible.every(r => !!selected[keyOf(r)]);
    const anyPageSelected = eligible.some(r => !!selected[keyOf(r)]);

    return {
        selected,
        keys: Object.keys(selected),
        items: Object.values(selected),
        entries: Object.entries(selected) as [string, T][],
        count: Object.keys(selected).length,
        isSelected,
        isSelectedKey,
        toggle: (row: T) => setRow(row, !isSelected(row)),
        toggleKey: (key: string) => {
            const row = rows.find(r => keyOf(r) === key);
            if (row) setRow(row, !isSelectedKey(key));
        },
        deselectKey: (key: string) => setSelected(prev => { const n = { ...prev }; delete n[key]; return n; }),
        togglePage: () => setSelected(prev => {
            const next = { ...prev };
            if (allPageSelected) { for (const r of eligible) delete next[keyOf(r)]; }
            else { for (const r of eligible) next[keyOf(r)] = r; }
            return next;
        }),
        allPageSelected,
        someSelected: anyPageSelected && !allPageSelected,
        pageEligibleCount: eligible.length,
        clear: () => setSelected({}),
    };
}

const checkboxStyle = (classic: boolean, enabled: boolean): React.CSSProperties =>
    ({ margin: 0, cursor: enabled ? 'pointer' : 'not-allowed', verticalAlign: 'middle' });

export function RowCheckbox({ classic, checked, onChange, disabled, title, label }: {
    classic: boolean; checked: boolean; onChange: () => void;
    disabled?: boolean; title?: string; label?: string;
}) {
    return (
        <input
            type="checkbox"
            className={classic ? undefined : 'form-check-input'}
            style={checkboxStyle(classic, !disabled)}
            checked={checked}
            disabled={disabled}
            title={title}
            aria-label={label ? `Select ${label}` : 'Select row'}
            onChange={onChange}
            // The row around it is usually clickable (expand / open): a tick must
            // never also fire that.
            onClick={e => e.stopPropagation()}
        />
    );
}

/** Header checkbox. Owns the `indeterminate` ref-poke that every call site
 *  hand-wrote (and two of them wrote wrongly, leaving it lit when all rows
 *  were selected). */
export function SelectAllCheckbox({ classic, allSelected, someSelected, onChange, disabled, title }: {
    classic: boolean; allSelected: boolean; someSelected: boolean; onChange: () => void;
    disabled?: boolean; title?: string;
}) {
    return (
        <input
            type="checkbox"
            className={classic ? undefined : 'form-check-input'}
            style={checkboxStyle(classic, !disabled)}
            checked={allSelected}
            disabled={disabled}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
            onChange={onChange}
            title={title ?? (allSelected ? 'Clear selection on this page' : 'Select every row on this page')}
            aria-label={allSelected ? 'Clear selection on this page' : 'Select every row on this page'}
        />
    );
}

/** `<td>` + row checkbox, geometry fixed like ExpanderCell. */
export function RowCheckboxCell({ tdStyle, tdClassName, ...cb }: React.ComponentProps<typeof RowCheckbox> & { tdStyle?: React.CSSProperties; tdClassName?: string }) {
    return (
        <td style={lvCheckTd(cb.classic, tdStyle)} className={tdClassName}>
            <RowCheckbox {...cb} />
        </td>
    );
}

/** `<th>` + select-all checkbox. */
export function SelectAllCell({ tdStyle, tdClassName, ...cb }: React.ComponentProps<typeof SelectAllCheckbox> & { tdStyle?: React.CSSProperties; tdClassName?: string }) {
    return (
        <th style={lvCheckTd(cb.classic, tdStyle)} className={tdClassName}>
            <SelectAllCheckbox {...cb} />
        </th>
    );
}

// ── Row-detail disclosure ─────────────────────────────────────────────────────
// One expander for every list row that opens a detail panel below itself. This
// used to be hand-written at ~17 call sites in five different glyphs (thin
// chevron, solid caret, and the literals `►`, `▶`, `▼`) at 8–11px in five
// colours, so no two lists disclosed a row the same way and none of them was
// keyboard-reachable or announced its state.
//
// Chevron-right/down ONLY. The solid `bi-caret-*-fill` is deliberately NOT
// used here: it means *tree hierarchy* (RoutingView, PermissionsPicker,
// CategoriesView, TreeSelect), which is a different affordance from "this row
// has a detail panel". Up/down chevrons mean a card/section fold, also not this.
//
// Pair `ExpanderCell` (dedicated first column) or a bare `ExpandToggle` (glyph
// sitting inline beside a code chip) with `rowStateBg('expanded', classic)` on
// the row — the two halves of the same convention.
export const LV_EXPANDER_COL_W = 22;

// `base` is the caller's own cell style (their `tdBase`/`xpTd` with its borders
// and font). It is spread BEFORE the column geometry so the width/alignment of
// the expander column can never drift, while the table keeps its own gridlines.
export const lvExpanderTd = (classic: boolean, base: React.CSSProperties = {}): React.CSSProperties => ({
    ...lvTd(classic),
    ...base,
    width: LV_EXPANDER_COL_W, textAlign: 'center', padding: '3px 4px', verticalAlign: 'middle',
});

export interface ExpandToggleProps {
    expanded: boolean;
    classic: boolean;
    /** Same handler the row's onClick uses. Always pass it: the button stops
     *  propagation, so a row-clickable table does not toggle twice, and the
     *  expander becomes tab-reachable instead of mouse-only. */
    onToggle: () => void;
    /** What is being disclosed, for the screen-reader label ("Show lot lineage"). */
    label?: string;
    /** id of the panel element, for aria-controls. */
    panelId?: string;
    /** `alert` recolours the open glyph when the panel holds a problem
     *  (a Production Run with a material shortfall). */
    tone?: 'default' | 'alert';
    style?: React.CSSProperties;
}

export function ExpandToggle({ expanded, classic, onToggle, label = 'details', panelId, tone = 'default', style }: ExpandToggleProps) {
    const color = tone === 'alert' && expanded ? '#c00000' : (classic ? '#0058e6' : '#64748b');
    return (
        <button
            type="button"
            // The row itself is usually clickable too; without this the click
            // would toggle twice and land back where it started.
            onClick={e => { e.stopPropagation(); onToggle(); }}
            aria-expanded={expanded}
            aria-controls={panelId}
            title={`${expanded ? 'Hide' : 'Show'} ${label}`}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${label}`}
            style={{
                background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, color, flexShrink: 0, ...style,
            }}
        >
            <i className={`bi bi-chevron-${expanded ? 'down' : 'right'}`} style={{ fontSize: 9 }} aria-hidden="true" />
        </button>
    );
}

/** The dedicated first column: geometry + toggle in one, so a list only ever
 *  writes `<ExpanderCell … />` instead of a `<td>` wrapping an `<i>`. */
export function ExpanderCell({ tdStyle, tdClassName, ...toggle }: ExpandToggleProps & { tdStyle?: React.CSSProperties; tdClassName?: string }) {
    return (
        <td style={lvExpanderTd(toggle.classic, tdStyle)} className={tdClassName}>
            <ExpandToggle {...toggle} />
        </td>
    );
}

// ── Section caption ───────────────────────────────────────────────────────────
// Small uppercase band that names a table/panel inside a view that stacks more
// than one of them, with optional right-aligned meta (row counts, hints). Keeps
// stacked sections visually parallel instead of one captioned and one bare.
export function LvSectionCaption({ classic, icon, children, right, style }: {
    classic: boolean; icon?: string; children: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties;
}) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT,
            fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.4,
            padding: classic ? '4px 8px' : '6px 12px',
            ...(classic
                ? { color: '#2b2822', background: '#e6e2d6', borderTop: '1px solid #c0bdb5', borderBottom: '1px solid #c0bdb5' }
                : { color: '#475569', background: '#f4f6fa', borderTop: '1px solid #e6eaf1', borderBottom: '1px solid #e6eaf1' }),
            ...style,
        }}>
            {icon && <i className={`bi ${icon}`} />}
            {children}
            {right && (
                <span style={{ marginLeft: 'auto', fontWeight: 'normal', textTransform: 'none', letterSpacing: 0, opacity: 0.8 }}>
                    {right}
                </span>
            )}
        </div>
    );
}

// ── Shared tab bar ────────────────────────────────────────────────────────────
export interface LvTab { key: string; label: string; icon?: string; }

export function LvTabBar({ classic, tabs, active, onChange, right }: {
    classic: boolean; tabs: LvTab[]; active: string; onChange: (key: string) => void; right?: React.ReactNode;
}) {
    return (
        <div style={classic
            ? { display: 'flex', alignItems: 'center', gap: 2, padding: '4px 8px 0', borderBottom: '2px solid #c0bdb5', background: '#ece9d8', flexShrink: 0 }
            : { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px 0', borderBottom: '1px solid #dbe1ea', background: '#fff', flexShrink: 0 }}>
            {tabs.map(t => {
                const on = active === t.key;
                return (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => onChange(t.key)}
                        style={classic ? {
                            fontFamily: LV_XP_FONT, fontSize: 11, padding: '3px 14px', cursor: 'pointer',
                            border: '1px solid', borderBottom: on ? '2px solid #fff' : '1px solid #c0bdb5',
                            marginBottom: on ? -2 : 0,
                            borderColor: on ? '#808080 #c0bdb5 transparent #808080' : '#d0cfc8',
                            background: on ? '#fff' : 'linear-gradient(to bottom, #f5f3ee, #e0dfd8)',
                            color: on ? '#000' : '#555', fontWeight: on ? 'bold' : 'normal',
                        } : {
                            fontFamily: LV_MODERN_FONT, fontSize: 13, padding: '6px 16px', cursor: 'pointer',
                            border: 'none', borderBottom: on ? '2px solid #2563eb' : '2px solid transparent',
                            background: 'transparent', color: on ? '#2563eb' : '#64748b', fontWeight: on ? 700 : 500,
                        }}
                    >{t.icon && <i className={`bi ${t.icon}`} style={{ marginRight: 5 }} />}{t.label}</button>
                );
            })}
            {right && <span style={{ marginLeft: 'auto', paddingBottom: classic ? 2 : 4 }}>{right}</span>}
        </div>
    );
}
