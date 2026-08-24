'use client';

import React from 'react';
import { xpFont, BUTTON_RADIUS, XP_TAB, XP_TAB_ACTIVE } from './xpTheme';

const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type TabDef<K extends string = string> = { key: K; label: string; icon?: string };

// The one edge colour of a classic tab strip: the rule under the inactive tabs,
// which the active tab breaks through into the pane. Tan-grey, matching the panel
// borders around it — a blue edge here is what made the strip look like chrome
// that had wandered in from the title bar.
const TAB_EDGE = '#a8a290';

/**
 * Shared classic/modern-themed tab strip. Renders only the row of tab
 * buttons — page chrome (title bars, bordered panels) stays with the caller
 * since different pages wrap their tabs differently.
 */
export function Tabs<K extends string>({ tabs, activeKey, onChange, classic, right }: {
    tabs: TabDef<K>[];
    activeKey: K;
    onChange: (key: K) => void;
    classic: boolean;
    /** Optional trailing control (e.g. a refresh button) pushed to the far end of the strip. */
    right?: React.ReactNode;
}) {
    const barStyle: React.CSSProperties = classic ? {
        // The strip is the pane's own material, a shade down — NOT a blue wash. It
        // used to be flat `#d6dff7`, the SIDEBAR's blue (Sidebar.tsx SIDEBAR_BG):
        // nav chrome inside a pane. That band only looked deliberate under blue
        // window chrome — over a tan panel it read as a stray stripe, and over a
        // status-coloured window (the green/amber machine monitor) as a third
        // unrelated colour. Tabs belong to the pane below them, so all three faces
        // now come from the pane's tan: strip (darkest) < inactive tab < active tab
        // (#ece9d8, the pane itself), which reads as depth instead of three tans.
        background: 'linear-gradient(to bottom, #dcd9cd, #cdcabe)',
        borderBottom: `1px solid ${TAB_EDGE}`,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '4px 8px 0',
        gap: 2,
        flexShrink: 0,
        fontFamily: xpFont,
    } : {
        background: '#fff',
        borderBottom: '1px solid #dbe1ea',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '0 10px',
        gap: 4,
        flexShrink: 0,
        fontFamily: modernFont,
    };

    const btnStyle = (key: K): React.CSSProperties => {
        const active = activeKey === key;
        if (!classic) {
            return {
                fontFamily: modernFont,
                fontSize: 12.5,
                padding: '9px 14px',
                cursor: 'pointer',
                border: 'none',
                borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                background: 'transparent',
                color: active ? '#2563eb' : '#64748b',
                fontWeight: active ? 600 : 500,
                userSelect: 'none',
            };
        }
        return {
            fontFamily: xpFont,
            fontSize: 11,
            padding: '3px 12px 4px',
            cursor: 'pointer',
            border: '1px solid',
            // Top corners only: the active tab's bottom edge is deliberately open
            // into the pane below it, and rounding it would cut that seam.
            borderRadius: `${BUTTON_RADIUS}px ${BUTTON_RADIUS}px 0 0`,
            borderBottom: active ? '1px solid #ece9d8' : `1px solid ${TAB_EDGE}`,
            background: active
                ? '#ece9d8'
                : 'linear-gradient(to bottom, #e8e6db, #d0cec4)',
            borderColor: active
                ? `${TAB_EDGE} ${TAB_EDGE} #ece9d8 ${TAB_EDGE}`
                : '#c0bdb5 #a8a290 #a8a290 #c0bdb5',
            color: active ? '#000' : '#444',
            fontWeight: active ? 'bold' : 'normal',
            marginBottom: active ? -1 : 0,
            position: 'relative',
            zIndex: active ? 1 : 0,
            userSelect: 'none',
        };
    };

    return (
        <div style={barStyle}>
            {tabs.map(tab => (
                <button
                    key={tab.key}
                    type="button"
                    className={[XP_TAB, activeKey === tab.key ? XP_TAB_ACTIVE : ''].filter(Boolean).join(' ')}
                    onClick={() => onChange(tab.key)}
                    style={btnStyle(tab.key)}
                >
                    {tab.icon && <i className={`bi ${tab.icon}`} style={{ marginRight: 5, fontSize: 11 }} />}
                    {tab.label}
                </button>
            ))}
            {right && (
                <span style={{ marginLeft: 'auto', paddingBottom: classic ? 3 : 4, alignSelf: 'center' }}>
                    {right}
                </span>
            )}
        </div>
    );
}
