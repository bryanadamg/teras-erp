'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '../../context/DataContext';

// Server-side, active-only Combo Library typeahead for the line-item Combo picker.
// Combos number in the thousands, so this searches /combos directly instead of
// filtering the client-cached Attribute.values list (which would need every combo
// rendered as a DOM <option> and can't be searched past what's already loaded).
export function useComboSearch(debounceMs = 300) {
    const { authFetch } = useData();
    const [results, setResults] = useState<any[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchResults = useCallback(async (search = '') => {
        try {
            const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
            const base = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
            const q = search ? `&search=${encodeURIComponent(search)}` : '';
            const res = await authFetch(`${base}/combos?status=active&size=50${q}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.items ?? []);
            }
        } catch { /* silent */ }
    }, [authFetch]);

    const onSearch = useCallback((term: string) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fetchResults(term), debounceMs);
    }, [fetchResults, debounceMs]);

    // Prime the first page on mount; clean up the debounce timer on unmount.
    useEffect(() => {
        fetchResults();
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [fetchResults]);

    return { results, onSearch };
}
