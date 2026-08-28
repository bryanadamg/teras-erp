'use client';

import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { SkeletonBar } from './xpTheme';
import { SIDEBAR_BG, M_PRIMARY, M_PRIMARY_DK } from './Sidebar';

/**
 * App chrome, painted immediately while the session is still resolving.
 *
 * Shell-first instead of a blocking splash: the sidebar/header/content frame is
 * the same in every route and needs no auth to draw, so drawing it costs
 * nothing and the shell never "arrives" — only its contents do. That removes
 * the full-screen → full-app jump, and there is no layout shift because this
 * reuses MainLayout's own class names (`app-container`, `sidebar`,
 * `main-content`, `app-header`), which is also why both themes and the <768px
 * off-canvas sidebar rules apply to it for free.
 *
 * Deliberately not interactive: nav rows are placeholders, not disabled real
 * links, because permissions aren't known yet and a nav that reshuffles once
 * they load is worse than one that fades in already correct.
 *
 * BootSplash still covers the case with no chrome to draw (login, Electron cold
 * start). This covers every authenticated route.
 */

// Deterministic label widths — a fixed cycle, not Math.random(), so nothing
// reshuffles between the SSR pass and hydration.
const NAV_WIDTHS = ['64%', '48%', '72%', '55%', '68%', '43%', '76%', '52%', '60%', '45%'];

export default function BootShell({ appName = 'Terras ERP' }: { appName?: string }) {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    return (
        <div className={`app-container ui-style-${uiStyle}`} aria-busy="true">
            <div
                className="sidebar"
                style={{ background: classic ? SIDEBAR_BG : '#ffffff' }}
            >
                {/* Same brand block as Sidebar.tsx: real height var, real colors, the
                    actual icon asset (a static file, so it needs no auth to draw). */}
                <div
                    style={classic ? {
                        background: 'var(--xp-title-flat)',
                        padding: '0 10px',
                        borderBottom: '1px solid var(--xp-title-blue-border)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                        height: 'var(--app-header-h)',
                    } : {
                        background: M_PRIMARY,
                        padding: '0 16px',
                        borderBottom: `1px solid ${M_PRIMARY_DK}`,
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                        height: 'var(--app-header-h)',
                    }}
                >
                    <img
                        className="app-brand-icon"
                        src="/icons/icon-192.png"
                        alt={appName}
                        style={{
                            width: classic ? 20 : 24,
                            height: classic ? 20 : 24,
                            flexShrink: 0,
                            borderRadius: classic ? 3 : 5,
                        }}
                    />
                </div>

                <div style={{ padding: classic ? '8px 8px' : '12px 0' }}>
                    {NAV_WIDTHS.map((w, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: classic ? '5px 6px' : '12px 24px',
                            }}
                        >
                            <SkeletonBar width={classic ? 12 : 16} height={classic ? 12 : 16} />
                            <SkeletonBar width={w} height={classic ? 8 : 10} />
                        </div>
                    ))}
                </div>
            </div>

            <div className="main-content flex-grow-1 overflow-y-auto overflow-x-hidden bg-light">
                <div
                    className={`app-header sticky-top bg-white border-bottom shadow-sm px-4 d-flex justify-content-between align-items-center no-print ${classic ? 'classic-header' : ''}`}
                >
                    <SkeletonBar width={160} height={classic ? 9 : 12} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <SkeletonBar width={28} height={classic ? 16 : 24} />
                        <SkeletonBar width={40} height={classic ? 16 : 24} />
                        <SkeletonBar width={90} height={classic ? 16 : 24} />
                    </div>
                </div>

                <div className="px-0 py-3">
                    <div style={{ padding: classic ? '0 10px' : '0 16px' }}>
                        {/* Toolbar strip: search + filters + action button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <SkeletonBar width={200} height={classic ? 18 : 26} />
                            <SkeletonBar width={110} height={classic ? 18 : 26} />
                            <span style={{ flex: 1 }} />
                            <SkeletonBar width={100} height={classic ? 18 : 26} />
                        </div>

                        {/* Table body stand-in — generic, since the route isn't known yet */}
                        <div
                            style={{
                                border: `1px solid ${classic ? '#919b9c' : '#e2e8f0'}`,
                                background: '#fff',
                            }}
                        >
                            {Array.from({ length: 10 }).map((_, r) => (
                                <div
                                    key={r}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 16,
                                        padding: classic ? '6px 8px' : '11px 12px',
                                        borderBottom: `1px solid ${classic ? '#e3e1dc' : '#eef2f7'}`,
                                    }}
                                >
                                    {['18%', '26%', '14%', '20%', '12%'].map((w, c) => (
                                        <SkeletonBar
                                            key={c}
                                            width={w}
                                            height={classic ? 8 : 10}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
