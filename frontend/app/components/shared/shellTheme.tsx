'use client';
import React from 'react';
import { xpFont } from './xpTheme';

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

export const xpTitleBar = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#ffffff',
    fontFamily: xpFont, fontSize: 12, fontWeight: 'bold', padding: '4px 8px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)', borderBottom: '1px solid #003080',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 26,
    ...extra,
});

export const xpToolbar = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898',
    padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const,
    ...extra,
});

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
export function ShellTitleBar({ classic, icon, title, subtitle, right }: {
    classic: boolean;
    icon: string;                 // bootstrap-icons class, e.g. "bi-people-fill"
    title: React.ReactNode;
    subtitle?: React.ReactNode;   // modern-only caption line under the title
    right?: React.ReactNode;      // action button(s) — e.g. "+ Add"
}) {
    if (classic) {
        return (
            <div style={xpTitleBar()}>
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
