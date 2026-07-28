'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ColorLibraryView from '../components/colors/ColorLibraryView';
import ColorsVariantView from '../components/colors/ColorsVariantView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/shared/Toast';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { LvTabBar } from '../components/shared/listViewTheme';

const PAGE_SIZE = 50;

export default function ColorsPage() {
    const { partners, attributes, authFetch, refreshItemMetadata } = useData();
    const customers = (partners || []).filter((p: any) => p.type === 'CUSTOMER');
    const { showToast } = useToast();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { hasPermission } = useUser();
    const searchParams = useSearchParams();
    const router = useRouter();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    // Two panels under one "Colors" home (discoverability): the Color Code catalog
    // (~30k library rows) and the small `Colors` variant list. Different data models —
    // tabbed together only for a single management surface. A LabDip "+ Color" deep-link
    // always targets the catalog tab.
    const [tab, setTab] = useState<'codes' | 'variant'>('codes');

    // ── Color Code catalog (library) ────────────────────────────────────────────
    const sourceLineId = searchParams.get('source_lab_dip_line_id');
    const prefill = useMemo(() => sourceLineId ? {
        source_lab_dip_line_id: sourceLineId,
        values: {
            code: searchParams.get('suggested_code') || '',
            name: searchParams.get('name') || '',
            pantone_ref: searchParams.get('pantone') || '',
            substrate: searchParams.get('substrate') || '',
            customer_id: searchParams.get('customer_id') || '',
            customer_color_code: searchParams.get('customer_color_code') || '',
            notes: searchParams.get('notes') || '',
        },
    } : null, [sourceLineId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { if (sourceLineId) setTab('codes'); }, [sourceLineId]);

    const [colors, setColors] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [customerFilter, setCustomerFilter] = useState('');
    const [variantFilter, setVariantFilter] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [loading, setLoading] = useState(false);

    // Deep-link from LabDip approved-color button: /colors?search=<code> focuses the catalog on that code.
    useEffect(() => {
        const s = searchParams.get('search');
        if (s) { setTab('codes'); setStatusFilter('ALL'); setSearch(s); setPage(1); }
    }, [searchParams]);

    const fetchColors = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE), include_meta: 'true' });
            if (search) params.set('search', search);
            if (statusFilter !== 'ALL') params.set('status', statusFilter);
            if (customerFilter) params.set('customer_id', customerFilter);
            if (variantFilter) params.set('variant_attribute_value_id', variantFilter);
            if (itemSearch) params.set('item_search', itemSearch);
            const res = await authFetch(`${API_BASE}/colors?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setColors(data.items ?? []);
                setTotal(data.total ?? 0);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [authFetch, API_BASE, page, search, statusFilter, customerFilter, variantFilter, itemSearch]);

    useEffect(() => { fetchColors(); }, [fetchColors]);

    const handleSearchChange = (s: string) => { setPage(1); setSearch(s); };
    const handleStatusChange = (s: string) => { setPage(1); setStatusFilter(s); };
    const handleCustomerFilterChange = (v: string) => { setPage(1); setCustomerFilter(v); };
    const handleVariantFilterChange = (v: string) => { setPage(1); setVariantFilter(v); };
    const handleItemSearchChange = (s: string) => { setPage(1); setItemSearch(s); };

    const handleCreate = async (payload: any) => {
        const res = await authFetch(`${API_BASE}/colors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            fetchColors();
            showToast(payload.source_lab_dip_line_id ? 'Color created from lab dip' : 'Color created', 'success');
            if (sourceLineId) router.replace('/colors');
        }
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

    // ── Colors variant (system_role='color' attribute values) ────────────────────
    const canManageVariant = hasPermission('inventory.manage');
    const colorAttr = (attributes || []).find((a: any) => a.system_role === 'color');
    const colorValues = colorAttr?.values ?? [];

    const handleAddColorValue = async (value: string, hex?: string | null) => {
        if (!colorAttr) return;
        const res = await authFetch(`${API_BASE}/attributes/${colorAttr.id}/values`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value, hex: hex || null }),
        });
        if (res.ok) { refreshItemMetadata(); showToast('Color added', 'success'); }
        else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to add color', 'danger'); }
    };

    const handleRenameColorValue = async (valueId: string, value: string, hex?: string | null) => {
        const res = await authFetch(`${API_BASE}/attributes/values/${valueId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value, hex: hex || null }),
        });
        if (res.ok) { refreshItemMetadata(); showToast('Color renamed', 'success'); }
        else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to rename color', 'danger'); }
    };

    const handleDeleteColorValue = async (valueId: string) => {
        const res = await authFetch(`${API_BASE}/attributes/values/${valueId}`, { method: 'DELETE' });
        if (res.ok) { refreshItemMetadata(); showToast('Color deleted', 'success'); }
        else { const e = await res.json().catch(() => ({})); showToast(e.detail || 'Failed to delete color', 'danger'); }
    };

    return (
        <div style={classic
            ? { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', minHeight: 0, border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#ece9d8' }
            : { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', minHeight: 0, border: '1px solid #dbe1ea', borderRadius: 9, background: '#f8fafc', overflow: 'hidden' }}>

            <div style={classic
                ? { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', padding: '6px 12px', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }
                : { background: '#f7f9fc', color: '#1e293b', borderBottom: '1px solid #dbe1ea', padding: '8px 12px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <i className="bi bi-palette2" style={classic ? { fontSize: 14 } : { fontSize: 14, color: '#2563eb' }} />
                Colors
            </div>

            <LvTabBar
                classic={classic}
                active={tab}
                onChange={(k) => setTab(k as 'codes' | 'variant')}
                tabs={[{ key: 'codes', label: 'Color Codes' }, { key: 'variant', label: 'Colors (Variant)' }]}
            />

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {tab === 'codes' ? (
                    <ColorLibraryView
                        colors={colors}
                        total={total}
                        page={page}
                        size={PAGE_SIZE}
                        search={search}
                        statusFilter={statusFilter}
                        customerFilter={customerFilter}
                        variantFilter={variantFilter}
                        itemSearch={itemSearch}
                        customers={customers}
                        loading={loading}
                        onSearchChange={handleSearchChange}
                        onStatusChange={handleStatusChange}
                        onCustomerFilterChange={handleCustomerFilterChange}
                        onVariantFilterChange={handleVariantFilterChange}
                        onItemSearchChange={handleItemSearchChange}
                        onPageChange={setPage}
                        onCreate={handleCreate}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        prefill={prefill}
                        colorVariantValues={colorValues}
                        embedded
                    />
                ) : (
                    <ColorsVariantView
                        values={colorValues}
                        canManage={canManageVariant}
                        onAdd={handleAddColorValue}
                        onRename={handleRenameColorValue}
                        onDelete={handleDeleteColorValue}
                    />
                )}
            </div>
        </div>
    );
}
