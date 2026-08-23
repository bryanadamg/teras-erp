'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { Tabs, TabDef } from '../shared/Tabs';
import DyeRecipeTab from './DyeRecipeTab';
import DyeingOrdersTab from './DyeingOrdersTab';
import SettingOrdersTab from './SettingOrdersTab';
import { xpFont } from '../shared/xpTheme';
import { pageFillStyle } from '../shared/shellTheme';

// ── XP Style Constants ────────────────────────────────────────────────────────
const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 4px', outline: 'none', height: 20,
};
const xpBtn: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
    borderRadius: 3,
};
const xpSectionHeader: React.CSSProperties = {
    background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)',
    color: 'white', padding: '3px 8px',
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
};
const xpPanel: React.CSSProperties = {
    border: '1px solid #7f9db9', background: 'white',
};

// ── Tab definitions ───────────────────────────────────────────────────────────
type TabKey = 'recipes' | 'dyeing' | 'setting';

const TABS: TabDef<TabKey>[] = [
    { key: 'recipes', label: 'Dye Recipes',     icon: 'bi-journal-text' },
    { key: 'dyeing',  label: 'Dyeing Orders',   icon: 'bi-droplet-half' },
    { key: 'setting', label: 'Setting Orders',  icon: 'bi-thermometer-half' },
];

export default function DyeingSettingView() {
    const { authFetch, items, attributes } = useData();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const searchParams = useSearchParams();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabKey>('recipes');
    const [recipes, setRecipes] = useState<any[]>([]);

    // Deep-link from Color Library "create recipe for this color": force the recipes
    // tab and hand the color id to DyeRecipeTab, which opens its create panel on it.
    const recipeColorId = searchParams.get('recipe_color_id');
    useEffect(() => { if (recipeColorId) setActiveTab('recipes'); }, [recipeColorId]);

    // ── Fetch recipes ─────────────────────────────────────────────────────────
    // Lookup feed, NOT a list: DyeingOrdersTab resolves each run's recipe_id out of
    // this array (and offers it as a picker), so it must be the whole set. `size=0`
    // is the uncapped contract on /dye-recipes — the paged window belongs to the
    // Dye Recipes list view only.
    const fetchRecipes = useCallback(async () => {
        try {
            const res = await authFetch('/api/dye-recipes?size=0');
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

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={classic ? {
            ...pageFillStyle,
            fontFamily: xpFont,
            border: '2px solid',
            borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
            background: '#ece9d8',
        } : {
            ...pageFillStyle,
            fontFamily: modernFont,
            border: '1px solid #dbe1ea',
            borderRadius: 9,
            background: '#fff',
            overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
        }}>
            {/* Title bar */}
            <div style={classic ? {
                background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
                color: 'white',
                padding: '6px 12px',
                fontFamily: xpFont,
                fontSize: 13,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
            } : {
                background: '#f7f9fc',
                color: '#1e293b',
                padding: '11px 14px',
                fontFamily: modernFont,
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
                borderBottom: '1px solid #dbe1ea',
            }}>
                <i className="bi bi-droplet-fill" style={{ fontSize: 14, color: classic ? undefined : '#2563eb' }} />
                Dyeing &amp; Setting
            </div>

            {/* Tabs bar */}
            <Tabs tabs={TABS} activeKey={activeTab} onChange={handleTabChange} classic={classic} />

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
                        initialColorId={recipeColorId}
                        onColorConsumed={() => router.replace('/dyeing-setting')}
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
