'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import StockOnHandView from '../components/stock/StockOnHandView';
import { useData } from '../context/DataContext';

export default function StockOnHandPage() {
    const { items, locations, stockBalance, attributes, categories, fetchData, authFetch, loading } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    // Item picker source for the New Entry modal — server-searched, falls back to the cached list.
    const [selectItems, setSelectItems] = useState<any[]>([]);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { setSelectItems(items); }, [items]);

    const handleItemSearch = useCallback((term: string) => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!term.trim()) { setSelectItems(items); return; }
        searchTimer.current = setTimeout(async () => {
            const res = await authFetch(`${API_BASE}/items?search=${encodeURIComponent(term)}&limit=50`);
            if (res.ok) {
                const data = await res.json();
                setSelectItems(data.items || []);
            }
        }, 350);
    }, [items, authFetch, API_BASE]);

    return (
        <StockOnHandView
            locations={locations}
            stockBalance={stockBalance}
            attributes={attributes}
            categories={categories}
            items={selectItems}
            onSearchItems={handleItemSearch}
            onRefresh={fetchData}
            authFetch={authFetch}
            apiBase={API_BASE}
            loading={loading.stockBalance}
        />
    );
}
