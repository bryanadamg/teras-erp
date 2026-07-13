'use client';

import { useState, useEffect, useCallback } from 'react';
import ComboLibraryView from '../components/combos/ComboLibraryView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/shared/Toast';

const PAGE_SIZE = 50;

export default function CombosPage() {
    const { authFetch } = useData();
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [combos, setCombos] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [loading, setLoading] = useState(false);

    const fetchCombos = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
            if (search) params.set('search', search);
            if (statusFilter !== 'ALL') params.set('status', statusFilter);
            const res = await authFetch(`${API_BASE}/combos?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setCombos(data.items ?? []);
                setTotal(data.total ?? 0);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [authFetch, API_BASE, page, search, statusFilter]);

    useEffect(() => { fetchCombos(); }, [fetchCombos]);

    const handleSearchChange = (s: string) => { setPage(1); setSearch(s); };
    const handleStatusChange = (s: string) => { setPage(1); setStatusFilter(s); };

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
