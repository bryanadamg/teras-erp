'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import WorkOrderListView from '../components/manufacturing/WorkOrderListView';
import { useData } from '../context/DataContext';

const WO_PAGE_SIZE = 50;
const CACHE_KEY = 'wo_page_cache';

function readCache() {
    try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}
function writeCache(items: any[], total: number) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ items, total })); } catch {}
}

export default function WorkOrdersPage() {
    const { workCenters, authFetch, subscribeLiveEvents } = useData();

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const cached = readCache();
    const [woList, setWoList] = useState<any[]>(cached?.items || []);
    const [woTotal, setWoTotal] = useState<number>(cached?.total || 0);
    const [woPage, setWoPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterGroup, setFilterGroup] = useState('');
    const [filterWC, setFilterWC] = useState('');
    const [woSearch, setWoSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchWOs = useCallback(async (
        page = woPage,
        status = filterStatus,
        groupId = filterGroup,
        wcId = filterWC,
        search = woSearch,
    ) => {
        setLoading(true);
        try {
            const skip = (page - 1) * WO_PAGE_SIZE;
            const params = new URLSearchParams({ skip: String(skip), limit: String(WO_PAGE_SIZE) });
            if (status) params.set('status', status);
            if (groupId) params.set('group_id', groupId);
            if (wcId) params.set('work_center_id', wcId);
            if (search) params.set('search', search);
            const res = await authFetch(`${API_BASE}/work-orders?${params}`);
            if (res.ok) {
                const data = await res.json();
                setWoList(data.items);
                setWoTotal(data.total);
                // Only cache default view (page 1, no filters) so return navigation is instant
                if (page === 1 && !status && !groupId && !wcId && !search) {
                    writeCache(data.items, data.total);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [woPage, filterStatus, filterGroup, filterWC, woSearch, authFetch, API_BASE]);

    // Initial load — always refetch fresh in background (cache already shown)
    useEffect(() => { fetchWOs(1, '', '', '', ''); }, []);

    // Live updates: refetch the list when a debounced batch of production events
    // arrives over the WebSocket (this page owns its list; context can't update it).
    useEffect(() => subscribeLiveEvents((kind) => {
        if (kind === 'production') fetchWOs();
    }), [subscribeLiveEvents, fetchWOs]);

    // Page change
    useEffect(() => { fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch); }, [woPage]);

    const handleFilterStatus = (v: string) => { setFilterStatus(v); setWoPage(1); fetchWOs(1, v, filterGroup, filterWC, woSearch); };
    const handleFilterWCChange = (groupId: string, wcId: string) => {
        setFilterGroup(groupId); setFilterWC(wcId); setWoPage(1);
        fetchWOs(1, filterStatus, groupId, wcId, woSearch);
    };

    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSearch = useCallback((term: string) => {
        setWoSearch(term);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setWoPage(1);
            fetchWOs(1, filterStatus, filterGroup, filterWC, term);
        }, 350);
    }, [filterStatus, filterGroup, filterWC, fetchWOs]);
    useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

    const handleUpdateWO = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (res.ok) fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch);
        return res;
    };

    const handleUpdateWOStatus = async (id: string, status: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' });
        if (res.ok) fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch);
        return res;
    };

    const handleDeleteWO = async (id: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}`, { method: 'DELETE' });
        if (res.ok) fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch);
    };

    const fetchMO = useCallback(async (moId: string) => {
        const res = await authFetch(`${API_BASE}/manufacturing-orders/${moId}`);
        if (!res.ok) return null;
        return res.json();
    }, [authFetch, API_BASE]);

    return (
        <WorkOrderListView
            workOrders={woList}
            total={woTotal}
            page={woPage}
            pageSize={WO_PAGE_SIZE}
            onPageChange={setWoPage}
            workCenters={workCenters || []}
            filterStatus={filterStatus}
            filterGroup={filterGroup}
            filterWC={filterWC}
            woSearch={woSearch}
            onFilterStatus={handleFilterStatus}
            onFilterWCChange={handleFilterWCChange}
            onSearch={handleSearch}
            onClearFilters={() => {
                setFilterStatus(''); setFilterGroup(''); setFilterWC(''); setWoSearch(''); setWoPage(1);
                fetchWOs(1, '', '', '', '');
            }}
            onUpdate={handleUpdateWO}
            onUpdateStatus={handleUpdateWOStatus}
            onDelete={handleDeleteWO}
            onFetchMO={fetchMO}
            onRefresh={() => fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch)}
            loading={loading}
        />
    );
}
