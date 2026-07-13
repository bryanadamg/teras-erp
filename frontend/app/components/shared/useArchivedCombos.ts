'use client';
import { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';

// Set of attribute_value_ids belonging to ARCHIVED library combos. The combo variant
// AttributeValues mirror the Combo Library 1:1 except archive; forms that pick combos
// (Sales Order, Sample Request) subtract this set so only active combos are offered.
// Excluding the (small) archived set — rather than fetching the active list — avoids
// any list-cap truncation when active combos number in the thousands.
export function useArchivedComboValueIds(): Set<string> {
    const { authFetch } = useData();
    const [ids, setIds] = useState<Set<string>>(new Set());
    useEffect(() => {
        (async () => {
            try {
                const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
                const base = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
                const res = await authFetch(`${base}/combos?status=archived&size=500`);
                if (res.ok) {
                    const d = await res.json();
                    setIds(new Set(
                        (d.items ?? []).map((c: any) => String(c.attribute_value_id)).filter((x: string) => x && x !== 'null')
                    ));
                }
            } catch { /* silent */ }
        })();
    }, [authFetch]);
    return ids;
}
