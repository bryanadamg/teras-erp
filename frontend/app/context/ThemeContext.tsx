'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface ThemeContextType {
    uiStyle: string;
    setUiStyle: (style: string) => void;
    /** Interface scale as a percentage: 70 | 75 | 80 | 90 | 100 | 110. */
    uiScale: number;
    setUiScale: (scale: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Only two interface styles are supported. Legacy values ('default', 'compact')
// from older builds collapse onto 'modern' so no one gets stranded on a dead style.
const VALID_STYLES = ['classic', 'modern'];
const normalizeStyle = (s: string | null): string =>
    s && VALID_STYLES.includes(s) ? s : (s ? 'modern' : 'classic');

// Interface scale. The app's tables and toolbars were drawn dense, so the
// browser's 100% leaves them looking oversized on a desktop monitor — 80% is
// the default everyone was reaching for manually with Ctrl+minus.
// Applied as data-ui-scale on <html>; globals.css turns that into a root zoom.
// The same list is duplicated in the pre-paint boot script in app/layout.tsx —
// keep them in sync (that script has to run before React to avoid a flash of
// full-size UI, so it cannot import from here).
export const UI_SCALES = [70, 75, 80, 90, 100, 110];
export const DEFAULT_UI_SCALE = 80;
const normalizeScale = (s: string | null): number => {
    const n = Number(s);
    return UI_SCALES.includes(n) ? n : DEFAULT_UI_SCALE;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [uiStyle, setUiStyleState] = useState(() => {
        if (typeof window === 'undefined') return 'classic';
        const saved = localStorage.getItem('ui_style');
        return normalizeStyle(saved);
    });
    const [uiScale, setUiScaleState] = useState(() => {
        if (typeof window === 'undefined') return DEFAULT_UI_SCALE;
        return normalizeScale(localStorage.getItem('ui_scale'));
    });

    useEffect(() => {
        // Heal a stale stored value so it stops re-applying on every load.
        const saved = localStorage.getItem('ui_style');
        const normalized = normalizeStyle(saved);
        if (saved && saved !== normalized) localStorage.setItem('ui_style', normalized);
    }, []);

    // Re-assert the attribute the boot script already set: covers a stored value
    // that failed to parse there and keeps the DOM in step after setUiScale.
    useEffect(() => {
        document.documentElement.setAttribute('data-ui-scale', String(uiScale));
    }, [uiScale]);

    const setUiStyle = (style: string) => {
        const normalized = normalizeStyle(style);
        setUiStyleState(normalized);
        localStorage.setItem('ui_style', normalized);
    };

    const setUiScale = (scale: number) => {
        const normalized = UI_SCALES.includes(scale) ? scale : DEFAULT_UI_SCALE;
        setUiScaleState(normalized);
        localStorage.setItem('ui_scale', String(normalized));
    };

    return (
        <ThemeContext.Provider value={{ uiStyle, setUiStyle, uiScale, setUiScale }}>
            {children}
        </ThemeContext.Provider>
    );
}

const defaultTheme: ThemeContextType = {
    uiStyle: 'classic',
    setUiStyle: () => {},
    uiScale: DEFAULT_UI_SCALE,
    setUiScale: () => {},
};

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    return context ?? defaultTheme;
};
