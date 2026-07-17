'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import LabDipRequestView from '../components/lab-dips/LabDipRequestView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../context/ConfirmContext';

export default function LabDipsPage() {
    const { partners, attributes, authFetch } = useData();
    const customers = partners.filter((p: any) => p.type === 'CUSTOMER');
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [labDips, setLabDips] = useState<any[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [colors, setColors] = useState<any[]>([]);
    // Finished-good items for the picker come from a server-side typeahead so the
    // catalog can grow past any client-side cap: the backend scopes to the Finished
    // Goods subtree and matches search on code/name, returning one bounded page.
    const [items, setItems] = useState<any[]>([]);
    const itemSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchItems = useCallback(async (search = '') => {
        try {
            const q = search ? `&search=${encodeURIComponent(search)}` : '';
            const res = await authFetch(`${API_BASE}/items?finished_goods=true&limit=50${q}`);
            if (res.ok) {
                const data = await res.json();
                setItems(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch { /* silent */ }
    }, [authFetch, API_BASE]);

    // Debounced typeahead handler passed to the item picker.
    const handleItemSearch = useCallback((term: string) => {
        if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current);
        itemSearchTimer.current = setTimeout(() => fetchItems(term), 300);
    }, [fetchItems]);
    useEffect(() => () => { if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current); }, []);

    const fetchLabDips = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/lab-dips`);
            if (res.ok) {
                const data = await res.json();
                setLabDips(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch { /* silent */ }
    }, [authFetch, API_BASE]);

    const fetchRecipes = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/dye-recipes`);
            if (res.ok) {
                const data = await res.json();
                setRecipes(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch { /* silent */ }
    }, [authFetch, API_BASE]);

    const fetchColors = useCallback(async () => {
        try {
            // Active colors for the dip picker. Capped; a true 30k library needs a
            // server-side typeahead (future), but this covers current volumes.
            const res = await authFetch(`${API_BASE}/colors?status=active&size=500`);
            if (res.ok) {
                const data = await res.json();
                setColors(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch { /* silent */ }
    }, [authFetch, API_BASE]);

    useEffect(() => { fetchLabDips(); fetchRecipes(); fetchColors(); fetchItems(); }, [fetchLabDips, fetchRecipes, fetchColors, fetchItems]);

    const handleCreate = async (payload: any) => {
        const res = await authFetch(`${API_BASE}/lab-dips`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { fetchLabDips(); showToast('Lab dip request created', 'success'); }
        else showToast('Failed to create lab dip request', 'danger');
    };

    const handleEdit = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/lab-dips/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { fetchLabDips(); showToast('Lab dip request updated', 'success'); }
        else showToast('Failed to update lab dip request', 'danger');
    };

    const handleUpdateStatus = async (id: string, status: string) => {
        const res = await authFetch(`${API_BASE}/lab-dips/${id}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) fetchLabDips();
    };

    const handleUpdateDipStatus = async (reqId: string, lineId: string, status: string) => {
        const res = await authFetch(`${API_BASE}/lab-dips/${reqId}/dips/${lineId}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) fetchLabDips();
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Delete Lab Dip Request',
            message: 'Delete this lab dip request? This action cannot be undone.',
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!ok) return;
        const res = await authFetch(`${API_BASE}/lab-dips/${id}`, { method: 'DELETE' });
        if (res.ok) { fetchLabDips(); showToast('Lab dip request deleted', 'success'); }
        else showToast('Failed to delete lab dip request', 'danger');
    };

    return (
        <LabDipRequestView
            labDips={labDips}
            customers={customers}
            items={items}
            onSearchItems={handleItemSearch}
            recipes={recipes}
            attributes={attributes || []}
            colors={colors}
            onCreate={handleCreate}
            onEdit={handleEdit}
            onUpdateStatus={handleUpdateStatus}
            onUpdateDipStatus={handleUpdateDipStatus}
            onDelete={handleDelete}
        />
    );
}
