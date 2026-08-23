'use client';

import React from 'react';
import { xpFont, BUTTON_RADIUS } from './xpTheme';

const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type TabDef<K extends string = string> = { key: K; label: string; icon?: string };

/**
 * Shared classic/modern-themed tab strip. Renders only the row of tab
 * buttons — page chrome (title bars, bordered panels) stays with the caller
 * since different pages wrap their tabs differently.
 */
export function Tabs<K extends string>({ tabs, activeKey, onChange, classic }: {
    tabs: TabDef<K>[];
    activeKey: K;
    onChange: (key: K) => void;
    classic: boolean;
}) {
    const barStyle: React.CSSProperties = classic ? {
        background: '#d6dff7',
        borderBottom: '1px solid #7f9db9',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '4px 8px 0',
        gap: 2,
        fontFamily: xpFont,
    } : {
        background: '#fff',
        borderBottom: '1px solid #dbe1ea',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '0 10px',
        gap: 4,
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
            borderBottom: active ? '1px solid #ece9d8' : '1px solid #7f9db9',
            background: active
                ? '#ece9d8'
                : 'linear-gradient(to bottom, #e8e6db, #d0cec4)',
            borderColor: active
                ? '#7f9db9 #7f9db9 #ece9d8 #7f9db9'
                : '#c0bdb5 #808080 #808080 #c0bdb5',
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
                    onClick={() => onChange(tab.key)}
                    style={btnStyle(tab.key)}
                >
                    {tab.icon && <i className={`bi ${tab.icon}`} style={{ marginRight: 5, fontSize: 11 }} />}
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
