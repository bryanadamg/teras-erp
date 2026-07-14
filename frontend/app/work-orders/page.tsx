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
    const { workCenters, itemIndex, authFetch, subscribeLiveEvents } = useData();

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const cached = readCache();
    const [woList, setWoList] = useState<any[]>(cached?.items || []);
    const [woTotal, setWoTotal] = useState<number>(cached?.total || 0);
    const [woPage, setWoPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterGroup, setFilterGroup] = useState('');
    const [filterWC, setFilterWC] = useState('');
    const [filterComponentId, setFilterComponentId] = useState('');
    const [filterUnprinted, setFilterUnprinted] = useState(false);
    const [woSearch, setWoSearch] = useState('');
    const [activeTab, setActiveTab] = useState('ALL');
    const [loading, setLoading] = useState(false);

    const fetchWOs = useCallback(async (
        page = woPage,
        status = filterStatus,
        groupId = filterGroup,
        wcId = filterWC,
        search = woSearch,
        tab = activeTab,
        componentId = filterComponentId,
        unprinted = filterUnprinted,
    ) => {
        setLoading(true);
        try {
            const skip = (page - 1) * WO_PAGE_SIZE;
            const params = new URLSearchParams({ skip: String(skip), limit: String(WO_PAGE_SIZE) });
            if (status) params.set('status', status);
            if (groupId) params.set('group_id', groupId);
            if (wcId) params.set('work_center_id', wcId);
            if (search) params.set('search', search);
            if (tab && tab !== 'ALL') params.set('center_type', tab);
            if (componentId) params.set('component_item_id', componentId);
            if (unprinted) params.set('unprinted', 'true');
            const res = await authFetch(`${API_BASE}/work-orders?${params}`);
            if (res.ok) {
                const data = await res.json();
                setWoList(data.items);
                setWoTotal(data.total);
                // Only cache default view (page 1, no filters) so return navigation is instant
                if (page === 1 && !status && !groupId && !wcId && !search && (!tab || tab === 'ALL') && !componentId && !unprinted) {
                    writeCache(data.items, data.total);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [woPage, filterStatus, filterGroup, filterWC, woSearch, activeTab, filterComponentId, filterUnprinted, authFetch, API_BASE]);

    // Initial load — always refetch fresh in background (cache already shown)
    useEffect(() => { fetchWOs(1, '', '', '', '', 'ALL', ''); }, []);

    // Live updates: refetch the list when a debounced batch of production events
    // arrives over the WebSocket (this page owns its list; context can't update it).
    useEffect(() => subscribeLiveEvents((kind) => {
        if (kind === 'production') fetchWOs();
    }), [subscribeLiveEvents, fetchWOs]);

    // Page change
    useEffect(() => { fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch, activeTab, filterComponentId); }, [woPage]);

    const handleFilterStatus = (v: string) => { setFilterStatus(v); setWoPage(1); fetchWOs(1, v, filterGroup, filterWC, woSearch, activeTab, filterComponentId); };
    const handleFilterWCChange = (groupId: string, wcId: string) => {
        setFilterGroup(groupId); setFilterWC(wcId); setWoPage(1);
        fetchWOs(1, filterStatus, groupId, wcId, woSearch, activeTab, filterComponentId);
    };
    const handleFilterComponent = (itemId: string) => {
        setFilterComponentId(itemId); setWoPage(1);
        fetchWOs(1, filterStatus, filterGroup, filterWC, woSearch, activeTab, itemId);
    };
    const handleFilterUnprinted = (v: boolean) => {
        setFilterUnprinted(v); setWoPage(1);
        fetchWOs(1, filterStatus, filterGroup, filterWC, woSearch, activeTab, filterComponentId, v);
    };
    const handleTabChange = (tab: string) => {
        setActiveTab(tab); setWoPage(1);
        fetchWOs(1, filterStatus, filterGroup, filterWC, woSearch, tab, filterComponentId);
    };

    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSearch = useCallback((term: string) => {
        setWoSearch(term);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setWoPage(1);
            fetchWOs(1, filterStatus, filterGroup, filterWC, term, activeTab, filterComponentId);
        }, 350);
    }, [filterStatus, filterGroup, filterWC, activeTab, filterComponentId, fetchWOs]);
    useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

    const handleUpdateWO = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (res.ok) fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch, activeTab);
        return res;
    };

    const handleUpdateWOStatus = async (id: string, status: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' });
        if (res.ok) fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch, activeTab);
        return res;
    };

    const handleDeleteWO = async (id: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}`, { method: 'DELETE' });
        if (res.ok) fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch, activeTab);
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
            activeTab={activeTab}
            itemIndex={itemIndex}
            filterComponentId={filterComponentId}
            filterUnprinted={filterUnprinted}
            onTabChange={handleTabChange}
            onFilterStatus={handleFilterStatus}
            onFilterWCChange={handleFilterWCChange}
            onFilterComponent={handleFilterComponent}
            onFilterUnprinted={handleFilterUnprinted}
            onSearch={handleSearch}
            onClearFilters={() => {
                setFilterStatus(''); setFilterGroup(''); setFilterWC(''); setWoSearch(''); setFilterComponentId(''); setFilterUnprinted(false); setWoPage(1);
                fetchWOs(1, '', '', '', '', activeTab, '', false);
            }}
            onUpdate={handleUpdateWO}
            onUpdateStatus={handleUpdateWOStatus}
            onDelete={handleDeleteWO}
            onFetchMO={fetchMO}
            onRefresh={() => fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch, activeTab)}
            loading={loading}
        />
    );
}
