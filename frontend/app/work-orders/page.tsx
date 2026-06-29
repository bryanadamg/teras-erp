'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import WorkOrderListView from '../components/manufacturing/WorkOrderListView';
import { useData } from '../context/DataContext';

const WO_PAGE_SIZE = 50;

export default function WorkOrdersPage() {
    const { workCenters, authFetch } = useData();

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [woList, setWoList] = useState<any[]>([]);
    const [woTotal, setWoTotal] = useState(0);
    const [woPage, setWoPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterGroup, setFilterGroup] = useState('');
    const [filterWC, setFilterWC] = useState('');
    const [woSearch, setWoSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);

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
            }
        } finally {
            setLoading(false);
            setReady(true);
        }
    }, [woPage, filterStatus, filterGroup, filterWC, woSearch, authFetch, API_BASE]);

    // Initial load
    useEffect(() => { fetchWOs(1, '', '', '', ''); }, []);

    // Page change
    useEffect(() => { if (ready) fetchWOs(woPage, filterStatus, filterGroup, filterWC, woSearch); }, [woPage]);

    // Filter changes → reset to page 1
    const handleFilterStatus = (v: string) => { setFilterStatus(v); setWoPage(1); fetchWOs(1, v, filterGroup, filterWC, woSearch); };
    const handleFilterGroup = (v: string) => { setFilterGroup(v); setFilterWC(''); setWoPage(1); fetchWOs(1, filterStatus, v, '', woSearch); };
    const handleFilterWC = (v: string) => { setFilterWC(v); setWoPage(1); fetchWOs(1, filterStatus, filterGroup, v, woSearch); };

    // Search with 350ms debounce
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

    if (!ready) return null;

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
            onFilterGroup={handleFilterGroup}
            onFilterWC={handleFilterWC}
            onSearch={handleSearch}
            onClearFilters={() => { handleFilterStatus(''); handleFilterGroup(''); handleFilterWC(''); handleSearch(''); }}
            onUpdate={handleUpdateWO}
            onUpdateStatus={handleUpdateWOStatus}
            onDelete={handleDeleteWO}
            onFetchMO={fetchMO}
        />
    );
}
