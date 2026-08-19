'use client';

import { useState } from 'react';
import ComboLibraryView from '../components/combos/ComboLibraryView';
import { useData } from '../context/DataContext';
import { usePaginatedFetch } from '../context/usePaginatedList';
import { useToast } from '../components/shared/Toast';

const PAGE_SIZE = 50;

export default function CombosPage() {
    const { authFetch } = useData();
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Page window, fetch, loading flag and stale-response race guard all come from
    // the shared hook (context/usePaginatedList.ts). ComboLibraryView debounces its
    // search box itself, so `search` arrives already settled and rides in as a
    // plain param rather than through the hook's own search box.
    const {
        rows: combos, total, loading, page, setPage, refetch: fetchCombos,
    } = usePaginatedFetch<any>({
        endpoint: `${API_BASE}/combos`,
        authFetch,
        pageSize: PAGE_SIZE,
        params: {
            search,
            status: statusFilter === 'ALL' ? '' : statusFilter,
        },
    });

    // No setPage(1) here any more — the hook restarts at page 1 whenever a param
    // changes, which is also what keeps the two from drifting out of step.
    const handleSearchChange = setSearch;
    const handleStatusChange = setStatusFilter;

    const handleCreate = async (payload: any) => {
        const res = await authFetch(`${API_BASE}/combos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { fetchCombos(); showToast('Combo created', 'success'); }
        else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to create combo', 'danger'); }
    };

    const handleEdit = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/combos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { fetchCombos(); showToast('Combo updated', 'success'); }
        else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to update combo', 'danger'); }
    };

    const handleDelete = async (id: string) => {
        const res = await authFetch(`${API_BASE}/combos/${id}`, { method: 'DELETE' });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            fetchCombos();
            showToast(data.action === 'archive' ? 'Combo archived' : 'Combo deleted', 'success');
        } else showToast('Failed to remove combo', 'danger');
    };

    return (
        <ComboLibraryView
            combos={combos}
            total={total}
            page={page}
            size={PAGE_SIZE}
            search={search}
            statusFilter={statusFilter}
            loading={loading}
            onSearchChange={handleSearchChange}
            onStatusChange={handleStatusChange}
            onPageChange={setPage}
            onCreate={handleCreate}
            onEdit={handleEdit}
            onDelete={handleDelete}
        />
    );
}
