'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '../../context/DataContext';

// Server-side, purchasing-scoped item typeahead for the PO line picker. The backend
// unions the Raw Material, Chemical, and Dye root categories (POs order all three),
// so the picker doesn't depend on whatever the shared /items page happens to have
// cached from other tabs and scales past any client-side cap.
export function usePurchasableItemSearch(debounceMs = 300) {
    const { authFetch } = useData();
    const [results, setResults] = useState<any[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchResults = useCallback(async (search = '') => {
        try {
            const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
            const base = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
            const q = search ? `&search=${encodeURIComponent(search)}` : '';
            const res = await authFetch(`${base}/items?purchasable=true&limit=50${q}`);
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
