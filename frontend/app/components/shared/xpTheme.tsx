'use client';

import React, { useMemo, useState, useEffect } from 'react';

/**
 * Shared Windows XP "classic" theme primitives.
 * Single source of truth for status colors and the inline XP style helpers
 * that were previously duplicated per view.
 */

export const xpFont = 'Tahoma, "Segoe UI", Arial, sans-serif';

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
    COMPLETED: 'green', DONE: 'green', DELIVERED: 'green', RECEIVED: 'green', APPROVED: 'green',
    ACTIVE: 'green',
    CANCELLED: 'red', REJECTED: 'red',
    ARCHIVED: 'gray',
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

// Recessed track + filled bar for at-a-glance completion (receiving progress,
// MO/WO progress, lineage). Tone defaults by fill level so callers don't have
// to compute it themselves; pass one explicitly to override (e.g. red = short).
export function ProgressBar({ pct, tone, width, height, title }: { pct: number; tone?: StatusFamily; width?: number | string; height?: number; title?: string }) {
    const t: StatusFamily = tone || (pct >= 100 ? 'green' : pct > 0 ? 'amber' : 'gray');
    const fillDk: Record<StatusFamily, string> = { gray: '#c8c3b6', amber: '#c77800', blue: '#0058e6', green: '#2d7a2d', red: '#c00000' };
    const fillLt: Record<StatusFamily, string> = { gray: '#c8c3b6', amber: '#f5d060', blue: '#4a8fe8', green: '#6fce6f', red: '#e88a8a' };
    return (
        <div title={title} style={{ background: '#e2ddd0', border: '1px solid #a89f8c', height: height ?? 10, width: width ?? '100%' }}>
            <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: `linear-gradient(to bottom, ${fillLt[t]}, ${fillDk[t]})` }} />
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

// Groups related fields in a create/edit form under a labeled section.
// Classic: recessed panel with an Explorer-taskpane-style gradient header bar
// (distinct fill + inset shadow so it reads as a surface, not just a divider).
// Modern: matching light-blue header bar over a bordered card.
export function FormSection({ title, classic, children }: { title: React.ReactNode; classic: boolean; children: React.ReactNode }) {
    if (classic) {
        return (
            <div style={{
                border: '1px solid #a89f8c', borderRadius: 2,
                marginTop: 12, marginBottom: 16,
                background: '#f6f4ec',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.10)',
                overflow: 'hidden',
            }}>
                <div style={{
                    background: 'linear-gradient(to bottom, #eef3fc 0%, #d3ddf0 100%)',
                    borderBottom: '1px solid #a9b8d4',
                    padding: '4px 10px',
                    fontFamily: xpFont, fontSize: 10, fontWeight: 'bold',
                    color: '#1a3d6e', textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                }}>
                    {title}
                </div>
                <div style={{ padding: '12px 12px 2px' }}>
                    {children}
                </div>
            </div>
        );
    }
    return (
        <div className="mb-4 rounded-2 border overflow-hidden">
            <div className="px-3 py-2 border-bottom" style={{ background: 'linear-gradient(to bottom, #eef4ff, #dce8fb)' }}>
                <h6 className="text-uppercase mb-0 fw-bold" style={{ fontSize: 11, letterSpacing: '0.5px', color: '#1a4a8a' }}>{title}</h6>
            </div>
            <div className="p-3 pb-1">
                {children}
            </div>
        </div>
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

export function XPStatusBar({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
            background: 'linear-gradient(to bottom, #f4f2ea, #e3e1d6)',
            border: '1px solid', borderColor: '#808080 #ffffff #ffffff #808080',
            padding: '2px 8px', marginTop: 4,
            fontFamily: xpFont, fontSize: 10, color: '#333333',
            userSelect: 'none',
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
