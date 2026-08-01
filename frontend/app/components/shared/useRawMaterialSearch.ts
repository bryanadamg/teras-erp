'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '../../context/DataContext';

// Server-side, Raw-Material-scoped item typeahead — the yarn counterpart of
// useFinishedGoodsSearch. The backend scopes to the "Raw Material" category subtree
// and matches code/name, returning one bounded page, so the picker scales past any
// client cap. Returns the current result page plus a debounced onSearch for
// SearchableSelect.
export function useRawMaterialSearch(debounceMs = 300) {
    const { authFetch } = useData();
    const [results, setResults] = useState<any[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchResults = useCallback(async (search = '') => {
        try {
            const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
            const base = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
            const q = search ? `&search=${encodeURIComponent(search)}` : '';
            const res = await authFetch(`${base}/items?raw_materials=true&limit=50${q}`);
            if (res.ok) {
                const data = await res.json();
                setResults(Array.isArray(data) ? data : (data.items ?? []));
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
