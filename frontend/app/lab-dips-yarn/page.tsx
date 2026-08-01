'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import LabDipRequestView from '../components/lab-dips/LabDipRequestView';
import { useData } from '../context/DataContext';
import { useRawMaterialSearch } from '../components/shared/useRawMaterialSearch';
import { useToast } from '../components/shared/Toast';
import { useConfirm } from '../context/ConfirmContext';

// Yarn (raw material) lab dips. Same view and same endpoints as /lab-dips — the only
// differences are the item scope (Raw Material subtree) and kind=YARN, which puts the
// request on its own LDY-YYYY-##### numbering book server-side.
export default function YarnLabDipsPage() {
    const { partners, attributes, authFetch } = useData();
    const customers = partners.filter((p: any) => p.type === 'CUSTOMER');
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const searchParams = useSearchParams();
    const router = useRouter();
    // Deep-link from Color Library's "From Lab Dip" cell: /lab-dips-yarn?open=<request_id>
    // expands+scrolls to that request. Cleared from the URL once consumed.
    const openRequestId = searchParams.get('open');
    useEffect(() => { if (openRequestId) router.replace('/lab-dips-yarn'); }, [openRequestId]); // eslint-disable-line react-hooks/exhaustive-deps
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [labDips, setLabDips] = useState<any[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [colors, setColors] = useState<any[]>([]);
    // Yarn item picker: raw-material-scoped server-side typeahead.
    const { results: items, onSearch: handleItemSearch } = useRawMaterialSearch();

    const fetchLabDips = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/lab-dips?kind=YARN`);
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

    useEffect(() => { fetchLabDips(); fetchRecipes(); fetchColors(); }, [fetchLabDips, fetchRecipes, fetchColors]);

    const handleCreate = async (payload: any) => {
        // kind is set once at create; it picks the sequence and is immutable afterwards.
        const res = await authFetch(`${API_BASE}/lab-dips`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, kind: 'YARN' }) });
        if (res.ok) { fetchLabDips(); showToast('Yarn lab dip request created', 'success'); }
        else showToast('Failed to create yarn lab dip request', 'danger');
    };

    const handleEdit = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/lab-dips/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { fetchLabDips(); showToast('Yarn lab dip request updated', 'success'); }
        else showToast('Failed to update yarn lab dip request', 'danger');
    };

    const handleUpdateStatus = async (id: string, status: string) => {
        const res = await authFetch(`${API_BASE}/lab-dips/${id}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) fetchLabDips();
    };

    const handleUpdateItemStatus = async (reqId: string, itemId: string, status: string, extra?: { set?: string; notes?: string; reason?: string; variant_attribute_value_id?: string }) => {
        let url = `${API_BASE}/lab-dips/${reqId}/items/${itemId}/status?status=${status}`;
        if (extra?.set) url += `&set_value=${encodeURIComponent(extra.set)}`;
        if (extra?.notes) url += `&notes=${encodeURIComponent(extra.notes)}`;
        if (extra?.reason) url += `&reason=${encodeURIComponent(extra.reason)}`;
        if (extra?.variant_attribute_value_id) url += `&variant_attribute_value_id=${encodeURIComponent(extra.variant_attribute_value_id)}`;
        const res = await authFetch(url, { method: 'PUT' });
        if (res.ok) {
            fetchLabDips();
            if (status === 'APPROVED') { fetchColors(); showToast('Variant approved · color added to library', 'success'); }
        } else {
            const err = await res.json().catch(() => null);
            showToast(err?.detail || 'Failed to update variant status', 'danger');
        }
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: 'Delete Yarn Lab Dip Request',
            message: 'Delete this yarn lab dip request? This action cannot be undone.',
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!ok) return;
        const res = await authFetch(`${API_BASE}/lab-dips/${id}`, { method: 'DELETE' });
        if (res.ok) { fetchLabDips(); showToast('Yarn lab dip request deleted', 'success'); }
        else showToast('Failed to delete yarn lab dip request', 'danger');
    };

    return (
        <LabDipRequestView
            kind="YARN"
            labDips={labDips}
            openRequestId={openRequestId}
            customers={customers}
            items={items}
            onSearchItems={handleItemSearch}
            recipes={recipes}
            attributes={attributes || []}
            colors={colors}
            onCreate={handleCreate}
            onEdit={handleEdit}
            onUpdateStatus={handleUpdateStatus}
            onUpdateItemStatus={handleUpdateItemStatus}
            onDelete={handleDelete}
        />
    );
}
