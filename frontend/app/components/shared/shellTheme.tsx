'use client';
import React from 'react';
import { xpFont, modernFont, ToggleChip } from './xpTheme';

// Shared "classic outer window" chrome — bevel container + colored title bar +
// toolbar strip. Every dual-theme table/detail view (Sales Orders, Packing,
// Partners, Sample Requests, BOM, Inventory, Purchase Orders, Stock On-Hand,
// Settings tabs, …) hand-declared near-identical copies of these three style
// objects (same `boxShadow: '2px 2px 4px rgba(0,0,0,0.3)'` bevel, same blue
// title-bar gradient, same toolbar strip) — this is the single source now.
// Migrate a view's local copy when you touch it; don't hand-roll a new one.

export const xpBevel = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0,
    ...extra,
});

// Title-bar tones. Blue is the default window chrome; the others exist for
// dashboard-style panel stacks where the bar itself carries the severity of what
// it heads (alerts = red, production = amber, informational = grey). Same five
// semantic families as STATUS_FAMILY — don't add a sixth hue here.
export type ShellTone = 'blue' | 'red' | 'amber' | 'green' | 'grey';

const TITLE_TONES: Record<ShellTone, { background: string; border: string }> = {
    blue:  { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', border: '#003080' },
    red:   { background: 'linear-gradient(to right, #990000 0%, #cc2222 100%)', border: '#550000' },
    amber: { background: 'linear-gradient(to right, #c07000 0%, #e09830 100%)', border: '#804000' },
    green: { background: 'linear-gradient(to right, #1a7a1a 0%, #2ea42e 100%)', border: '#0a4a0a' },
    grey:  { background: 'linear-gradient(to bottom, #6a6a6a, #4a4a4a)',        border: '#222222' },
};

export const xpTitleBar = (extra: React.CSSProperties = {}, tone: ShellTone = 'blue'): React.CSSProperties => ({
    background: TITLE_TONES[tone].background, color: '#ffffff',
    fontFamily: xpFont, fontSize: 12, fontWeight: 'bold', padding: '4px 8px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)', borderBottom: `1px solid ${TITLE_TONES[tone].border}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 26,
    ...extra,
});

export const xpToolbar = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898',
    padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const,
    ...extra,
});

// ── Toolbar contents ─────────────────────────────────────────────────────────
// `xpToolbar` above is the strip; these three are what goes IN it. Every list
// view was hand-rolling the same three things with a different look each time:
// a search box (5 distinct shapes across ~17 views — loose icon + xpInput,
// bootstrap `input-group`, absolutely-positioned icon + `paddingLeft: 24`, a
// bordered mobile flex row, and ManufacturingSearchBar's own copy), a status
// filter chip row (3 shapes), and a "N orders" count (4 font/color combos, two
// of which used a `'Tahoma, Arial, sans-serif'` stack that isn't `xpFont`).
// Use these; don't re-declare the shapes per view.

/**
 * Search box for a list toolbar. One shape in both themes: icon inset on the
 * left, clear "x" on the right once there's a value (previously only
 * ManufacturingSearchBar offered it). `grow` makes it flex to fill the toolbar
 * row up to `width`; otherwise `width` is fixed.
 */
export function SearchField({
    classic, value, onChange, placeholder = 'Search...', width = 200, grow = false,
    icon = 'bi-search', title, autoFocus = false, style,
}: {
    classic: boolean;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    /** Fixed width, or the max width when `grow`. */
    width?: number;
    grow?: boolean;
    /** bootstrap-icons class — `bi-person`, `bi-upc-scan`, … for a non-generic field. */
    icon?: string;
    title?: string;
    autoFocus?: boolean;
    style?: React.CSSProperties;
}) {
    return (
        <div
            style={{
                position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                ...(grow ? { flex: `1 1 ${Math.min(width, 160)}px`, maxWidth: width } : { width }),
                ...style,
            }}
        >
            <i
                className={`bi ${icon}`}
                style={{
                    position: 'absolute', left: classic ? 5 : 8, top: '50%', transform: 'translateY(-50%)',
                    fontSize: classic ? 11 : 12, color: classic ? '#666666' : '#94a3b8',
                    pointerEvents: 'none',
                }}
            />
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                title={title}
                autoFocus={autoFocus}
                style={classic ? {
                    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9', borderRadius: 0,
                    background: '#ffffff', color: '#000000', height: 20, outline: 'none',
                    width: '100%', boxSizing: 'border-box', padding: '1px 20px 1px 20px',
                } : {
                    fontFamily: modernFont, fontSize: 13, border: '1px solid #cbd3df', borderRadius: 7,
                    background: '#ffffff', color: '#1e293b', outline: 'none',
                    width: '100%', boxSizing: 'border-box', padding: '4px 24px 4px 26px',
                }}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    title="Clear search"
                    style={{
                        position: 'absolute', right: classic ? 3 : 5, top: '50%', transform: 'translateY(-50%)',
                        border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 3px',
                        color: '#888888', fontSize: classic ? 12 : 14, lineHeight: 1,
                        fontFamily: classic ? xpFont : modernFont,
                    }}
                >&times;</button>
            )}
        </div>
    );
}

/**
 * The "N orders" / "N stations" tally that sits at the end of a list toolbar.
 * `right` pushes it to the far end of the flex row (the common case).
 */
export function ToolbarCount({ classic, children, right = false, style }: {
    classic: boolean;
    children: React.ReactNode;
    right?: boolean;
    style?: React.CSSProperties;
}) {
    return (
        <span style={{
            flexShrink: 0, whiteSpace: 'nowrap',
            ...(right ? { marginLeft: 'auto' } : {}),
            ...(classic
                ? { fontFamily: xpFont, fontSize: 11, color: '#333333' }
                : { fontFamily: modernFont, fontSize: 12, color: '#64748b' }),
            ...style,
        }}>
            {children}
        </span>
    );
}

export type FilterChipOption = { value: string; label?: React.ReactNode; count?: number };

/**
 * Status-filter chip row for a list toolbar. Built on `ToggleChip` so a selected
 * filter looks like every other selected thing in the app — the three views that
 * hand-rolled this (SO/PO/Samples inline XP gradient, Lab Dips' own
 * `primaryToolbarBtn`, the libraries' `lvPrimaryBtn`) each had a different
 * "selected" blue. Pass `counts` to render "PENDING (4)".
 */
export function FilterChipBar({ classic, options, value, onChange, style }: {
    classic: boolean;
    /** Plain strings, or `{ value, label, count }` when a chip needs a tally. */
    options: (string | FilterChipOption)[];
    value: string;
    onChange: (v: string) => void;
    style?: React.CSSProperties;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', ...style }}>
            {options.map(opt => {
                const o: FilterChipOption = typeof opt === 'string' ? { value: opt } : opt;
                return (
                    <ToggleChip key={o.value} on={value === o.value} onClick={() => onChange(o.value)} classic={classic}>
                        {o.label ?? o.value}
                        {o.count !== undefined && (
                            <span style={{ opacity: 0.75, fontWeight: 'normal', marginLeft: 4 }}>({o.count})</span>
                        )}
                    </ToggleChip>
                );
            })}
        </div>
    );
}

export type ShellFill = 'page' | 'flex' | false;

const fillStyleFor = (fill: ShellFill): React.CSSProperties =>
    fill === 'page' ? { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', minHeight: 0 }
    : fill === 'flex' ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }
    : {};

/**
 * Outer-window shell: classic bevel or modern bootstrap card, sized per the
 * standing height convention. Replaces the
 * `style={classic ? xpBevel : undefined} className={classic ? '' : 'card border-0 shadow-sm'}`
 * block hand-copied at the top of ~20 views.
 */
export function ShellWindow({ classic, fill = 'page', className, style, children }: {
    classic: boolean;
    /** 'page' = calc(100vh - 80px) for a top-level route. 'flex' = flex:1 when nested
     *  under an already-sized parent. false = caller manages its own sizing. */
    fill?: ShellFill;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}) {
    const fillStyle = fillStyleFor(fill);
    return (
        <div
            style={classic ? { ...xpBevel(), ...fillStyle, ...style } : { ...fillStyle, ...style }}
            className={classic ? className : `card border-0 shadow-sm ${className || ''}`.trim()}
        >
            {children}
        </div>
    );
}

/**
 * Title bar: icon + title (+ optional modern-only subtitle caption) + right-side
 * actions. Classic renders the blue-gradient bar; modern renders a bootstrap
 * card-header with an h5 + optional caption — matches SalesOrderView, PartnersView,
 * SampleRequestView, PackingView, BOMView, and the Settings tabs.
 */
export function ShellTitleBar({ classic, icon, title, subtitle, right, tone = 'blue' }: {
    classic: boolean;
    icon: string;                 // bootstrap-icons class, e.g. "bi-people-fill"
    title: React.ReactNode;
    subtitle?: React.ReactNode;   // modern-only caption line under the title
    right?: React.ReactNode;      // action button(s) — e.g. "+ Add"
    tone?: ShellTone;             // classic-only bar color; modern keeps the white card-header
}) {
    if (classic) {
        return (
            <div style={xpTitleBar({}, tone)}>
                <span><i className={`bi ${icon}`} style={{ marginRight: 6 }} />{title}</span>
                {right}
            </div>
        );
    }
    return (
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <div>
                <h5 className="card-title mb-0"><i className={`bi ${icon} me-2`}></i>{title}</h5>
                {subtitle && <p className="text-muted small mb-0 mt-1">{subtitle}</p>}
            </div>
            {right}
        </div>
    );
}
