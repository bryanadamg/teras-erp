'use client';

import React from 'react';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { ProgressBar, xpFont } from './xpTheme';

/**
 * Determinate progress strip for the initial data load.
 *
 * This is the one place in the app where a filling bar is honest: the first
 * fetchData round fans out to a known number of requests (master data, items,
 * BOMs, MOs, PRs, samples, partners), and DataContext counts responses as they
 * land. Everywhere else a single request is in flight — nothing to measure —
 * so those keep the indeterminate marquee / skeleton rows.
 *
 * Renders nothing once the tracked round finishes, and never appears at all for
 * the small route-scoped fetches that follow.
 */
export default function AppLoadBar() {
    const { loadProgress } = useData();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const { done, total } = loadProgress;
    if (total === 0 || done >= total) return null;

    const pct = (done / total) * 100;

    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="Loading data"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: classic ? '4px 12px' : '6px 16px',
                background: classic ? '#ece9d8' : '#f8fafc',
                borderBottom: `1px solid ${classic ? '#b0aaa0' : '#e2e8f0'}`,
                fontFamily: classic ? xpFont : undefined,
                fontSize: classic ? 11 : 12,
                color: classic ? '#33393f' : '#475569',
                userSelect: 'none',
            }}
        >
            <span style={{ whiteSpace: 'nowrap' }}>Loading data…</span>
            <span style={{ flex: 1, maxWidth: 320 }}>
                <ProgressBar pct={pct} tone="blue" height={classic ? 10 : 8} />
            </span>
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {done} of {total}
            </span>
        </div>
    );
}
