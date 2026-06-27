'use client';

import { useState, useEffect, useCallback } from 'react';
import ColorLibraryView from '../components/colors/ColorLibraryView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/shared/Toast';

const PAGE_SIZE = 50;

export default function ColorsPage() {
    const { partners, authFetch } = useData();
    const customers = (partners || []).filter((p: any) => p.type === 'CUSTOMER');
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [colors, setColors] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [loading, setLoading] = useState(false);

    const fetchColors = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
            if (search) params.set('search', search);
            if (statusFilter !== 'ALL') params.set('status', statusFilter);
            const res = await authFetch(`${API_BASE}/colors?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setColors(data.items ?? []);
                setTotal(data.total ?? 0);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [authFetch, API_BASE, page, search, statusFilter]);

    useEffect(() => { fetchColors(); }, [fetchColors]);

    // Reset to page 1 whenever a filter narrows the result set.
    const handleSearchChange = (s: string) => { setPage(1); setSearch(s); };
    const handleStatusChange = (s: string) => { setPage(1); setStatusFilter(s); };

    const handleCreate = async (payload: any) => {
        const res = await authFetch(`${API_BASE}/colors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { fetchColors(); showToast('Color created', 'success'); }
        else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to create color', 'danger'); }
    };

    const handleEdit = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/colors/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { fetchColors(); showToast('Color updated', 'success'); }
        else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to update color', 'danger'); }
    };

    const handleDelete = async (id: string) => {
        const res = await authFetch(`${API_BASE}/colors/${id}`, { method: 'DELETE' });
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            fetchColors();
            showToast(data.action === 'archive' ? 'Color archived' : 'Color deleted', 'success');
        } else showToast('Failed to remove color', 'danger');
    };

    return (
        <ColorLibraryView
            colors={colors}
            total={total}
            page={page}
            size={PAGE_SIZE}
            search={search}
            statusFilter={statusFilter}
            customers={customers}
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
