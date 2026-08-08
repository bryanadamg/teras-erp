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

export const lvSep = (classic: boolean): React.CSSProperties =>
    ({ width: 1, height: 20, background: classic ? '#a0988c' : '#dbe1ea', margin: '0 2px' });

// Row background stripe (zebra), dual-theme + border.
export const lvRow = (classic: boolean, idx: number): React.CSSProperties => (classic
    ? { background: idx % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' }
    : { background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e6eaf1' });

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
