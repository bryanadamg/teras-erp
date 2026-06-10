'use client';

import React from 'react';

/**
 * Shared Windows XP "classic" theme primitives.
 * Single source of truth for status colors and the inline XP style helpers
 * that were previously duplicated per view.
 */

export const xpFont = 'Tahoma, "Segoe UI", Arial, sans-serif';

// Solid accent color per status — for text, border-left strips, progress bars.
export const STATUS_COLORS: Record<string, string> = {
    DRAFT: '#666666',
    PENDING: '#b8860b',
    CONFIRMED: '#0058e6',
    IN_PROGRESS: '#0058e6',
    COMPLETED: '#2d7a2d',
    DONE: '#2d7a2d',
    CANCELLED: '#c00000',
    CLOSED: '#666666',
};

// Chip (badge) palette per status — background / border / text.
export const STATUS_CHIP: Record<string, { background: string; borderColor: string; color: string }> = {
    DRAFT: { background: '#d4d0c8', borderColor: '#808080', color: '#333333' },
    PENDING: { background: '#d4d0c8', borderColor: '#808080', color: '#333333' },
    CONFIRMED: { background: '#0058e6', borderColor: '#003080', color: '#ffffff' },
    IN_PROGRESS: { background: '#0058e6', borderColor: '#003080', color: '#ffffff' },
    COMPLETED: { background: '#2d7a2d', borderColor: '#1a5e1a', color: '#ffffff' },
    DONE: { background: '#2d7a2d', borderColor: '#1a5e1a', color: '#ffffff' },
    CANCELLED: { background: '#c00000', borderColor: '#800000', color: '#ffffff' },
    CLOSED: { background: '#d4d0c8', borderColor: '#808080', color: '#333333' },
};

export const statusColor = (status?: string): string =>
    STATUS_COLORS[(status || '').toUpperCase()] || '#666666';

export const statusChipStyle = (status?: string, extra: React.CSSProperties = {}): React.CSSProperties => {
    const c = STATUS_CHIP[(status || '').toUpperCase()] || STATUS_CHIP.PENDING;
    return {
        display: 'inline-block', fontSize: 9, fontWeight: 'bold',
        padding: '1px 6px', borderRadius: 0, border: '1px solid',
        fontFamily: xpFont, whiteSpace: 'nowrap',
        background: c.background, borderColor: c.borderColor, color: c.color,
        ...extra,
    };
};

export function StatusChip({ status, label, style }: { status: string; label?: string; style?: React.CSSProperties }) {
    return (
        <span style={statusChipStyle(status, style)}>
            {(label ?? status).replace(/_/g, ' ').toUpperCase()}
        </span>
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
