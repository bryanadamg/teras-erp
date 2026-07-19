'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface TimezoneContextType {
    timezone: string;
    setTimezone: (tz: string) => void;
    // All three treat a naive (tz-less) timestamp as UTC — the backend stores
    // created_at via datetime.utcnow() with no offset — then renders in `timezone`.
    formatDate: (value: string | Date) => string;
    formatTime: (value: string | Date) => string;
    formatDateTime: (value: string | Date) => string;
}

const STORAGE_KEY = 'display_timezone';
const DEFAULT_TZ = 'Asia/Jakarta';

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

// Curated fallback for the rare runtime without Intl.supportedValuesOf. The full
// IANA list is preferred (see AVAILABLE_TIMEZONES) so users can pick anything.
const FALLBACK_TIMEZONES = [
    'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura',
    'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok', 'Asia/Shanghai',
    'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Dubai',
    'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'UTC',
];

export const AVAILABLE_TIMEZONES: string[] = (() => {
    try {
        // @ts-ignore - supportedValuesOf is not yet in all TS lib versions
        if (typeof Intl.supportedValuesOf === 'function') {
            // @ts-ignore
            return Intl.supportedValuesOf('timeZone');
        }
    } catch { /* fall through */ }
    return FALLBACK_TIMEZONES;
})();

// Backend timestamps arrive as naive UTC ("2026-07-19T10:30:00"). Without an
// explicit designator, new Date() would read them as browser-local — wrong.
// Append 'Z' when a datetime carries no timezone so it parses as UTC.
const parseUTC = (value: string | Date): Date => {
    if (value instanceof Date) return value;
    const s = String(value);
    const hasTime = s.includes('T') || s.includes(' ');
    const hasTz = /([zZ])|([+-]\d{2}:?\d{2})$/.test(s);
    if (hasTime && !hasTz) return new Date(s.replace(' ', 'T') + 'Z');
    return new Date(s);
};

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
    const [timezone, setTimezoneState] = useState<string>(() => {
        if (typeof window === 'undefined') return DEFAULT_TZ;
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_TZ;
    });

    const setTimezone = useCallback((tz: string) => {
        setTimezoneState(tz);
        if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, tz);
    }, []);

    // Guard against an invalid stored tz crashing toLocale*; fall back to no tz.
    const safeOpts = useCallback((opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => {
        try {
            new Intl.DateTimeFormat(undefined, { timeZone: timezone });
            return { ...opts, timeZone: timezone };
        } catch {
            return opts;
        }
    }, [timezone]);

    const formatDate = useCallback((value: string | Date) =>
        parseUTC(value).toLocaleDateString(undefined, safeOpts({})), [safeOpts]);

    const formatTime = useCallback((value: string | Date) =>
        parseUTC(value).toLocaleTimeString([], safeOpts({ hour: '2-digit', minute: '2-digit' })), [safeOpts]);

    const formatDateTime = useCallback((value: string | Date) => {
        const d = parseUTC(value);
        return `${d.toLocaleDateString(undefined, safeOpts({}))} ${d.toLocaleTimeString([], safeOpts({ hour: '2-digit', minute: '2-digit' }))}`;
    }, [safeOpts]);

    return (
        <TimezoneContext.Provider value={{ timezone, setTimezone, formatDate, formatTime, formatDateTime }}>
            {children}
        </TimezoneContext.Provider>
    );
}

const defaultCtx: TimezoneContextType = {
    timezone: DEFAULT_TZ,
    setTimezone: () => {},
    formatDate: (v) => parseUTC(v).toLocaleDateString(),
    formatTime: (v) => parseUTC(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    formatDateTime: (v) => { const d = parseUTC(v); return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; },
};

export const useTimezone = (): TimezoneContextType => {
    const ctx = useContext(TimezoneContext);
    return ctx ?? defaultCtx;
};
