'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface ThemeContextType {
    uiStyle: string;
    setUiStyle: (style: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Only two interface styles are supported. Legacy values ('default', 'compact')
// from older builds collapse onto 'modern' so no one gets stranded on a dead style.
const VALID_STYLES = ['classic', 'modern'];
const normalizeStyle = (s: string | null): string =>
    s && VALID_STYLES.includes(s) ? s : (s ? 'modern' : 'classic');

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [uiStyle, setUiStyleState] = useState('classic');

    useEffect(() => {
        const saved = localStorage.getItem('ui_style');
        const normalized = normalizeStyle(saved);
        setUiStyleState(normalized);
        // Heal a stale stored value so it stops re-applying on every load.
        if (saved && saved !== normalized) localStorage.setItem('ui_style', normalized);
    }, []);

    const setUiStyle = (style: string) => {
        const normalized = normalizeStyle(style);
        setUiStyleState(normalized);
        localStorage.setItem('ui_style', normalized);
    };

    return (
        <ThemeContext.Provider value={{ uiStyle, setUiStyle }}>
            {children}
        </ThemeContext.Provider>
    );
}

const defaultTheme: ThemeContextType = {
    uiStyle: 'classic',
    setUiStyle: () => {},
};

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    return context ?? defaultTheme;
};
