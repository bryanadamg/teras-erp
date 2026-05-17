'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import DyeRecipeTab from './DyeRecipeTab';
import DyeingOrdersTab from './DyeingOrdersTab';
import SettingOrdersTab from './SettingOrdersTab';

// ── XP Style Constants ────────────────────────────────────────────────────────
const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 4px', outline: 'none', height: 20,
};
const xpBtn: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
};
const xpSectionHeader: React.CSSProperties = {
    background: 'linear-gradient(to right, #3060b8, #1a3d90)',
    color: 'white', padding: '3px 8px',
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
};
const xpPanel: React.CSSProperties = {
    border: '1px solid #7f9db9', background: 'white',
};

// ── Tab definitions ───────────────────────────────────────────────────────────
type TabKey = 'recipes' | 'dyeing' | 'setting';

const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'recipes', label: 'Dye Recipes',     icon: 'bi-journal-text' },
    { key: 'dyeing',  label: 'Dyeing Orders',   icon: 'bi-droplet-half' },
    { key: 'setting', label: 'Setting Orders',  icon: 'bi-thermometer-half' },
];

export default function DyeingSettingView() {
    const { authFetch, items, attributes } = useData();
    const [activeTab, setActiveTab] = useState<TabKey>('recipes');
    const [recipes, setRecipes] = useState<any[]>([]);

    // ── Fetch recipes ─────────────────────────────────────────────────────────
    const fetchRecipes = useCallback(async () => {
        try {
            const res = await authFetch('/api/dye-recipes');
            if (res.ok) {
                const data = await res.json();
                setRecipes(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch {
            // silent
        }
    }, [authFetch]);

    // Load recipes on mount
    useEffect(() => { fetchRecipes(); }, [fetchRecipes]);

    // Refresh recipes when switching to dyeing tab
    const handleTabChange = (tab: TabKey) => {
        setActiveTab(tab);
        if (tab === 'dyeing') {
            fetchRecipes();
        }
    };

    // ── Tab button styles ─────────────────────────────────────────────────────
    const tabBarStyle: React.CSSProperties = {
        background: '#d6dff7',
        borderBottom: '1px solid #7f9db9',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '4px 8px 0',
        gap: 2,
        fontFamily: xpFont,
    };

    const tabBtnStyle = (key: TabKey): React.CSSProperties => {
        const active = activeTab === key;
        return {
            fontFamily: xpFont,
            fontSize: 11,
            padding: '3px 12px 4px',
            cursor: 'pointer',
            border: '1px solid',
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

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            fontFamily: xpFont,
            border: '2px solid',
            borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
            background: '#ece9d8',
        }}>
            {/* Title bar */}
            <div style={{
                background: 'linear-gradient(to right, #001060, #111133)',
                color: 'white',
                padding: '6px 12px',
                fontFamily: xpFont,
                fontSize: 13,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
            }}>
                <i className="bi bi-droplet-fill" style={{ fontSize: 14 }} />
                Dyeing &amp; Setting
            </div>

            {/* Tabs bar */}
            <div style={tabBarStyle}>
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        style={tabBtnStyle(tab.key)}
                    >
                        <i className={`bi ${tab.icon}`} style={{ marginRight: 5, fontSize: 11 }} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content area */}
            <div style={{
                flex: 1,
                background: '#fff',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {activeTab === 'recipes' && (
                    <DyeRecipeTab
                        items={items}
                        attributes={attributes || []}
                        authFetch={authFetch}
                    />
                )}
                {activeTab === 'dyeing' && (
                    <DyeingOrdersTab
                        items={items}
                        recipes={recipes}
                        authFetch={authFetch}
                    />
                )}
                {activeTab === 'setting' && (
                    <SettingOrdersTab
                        items={items}
                        authFetch={authFetch}
                    />
                )}
            </div>
        </div>
    );
}
