'use client';

import InventoryView from '../components/InventoryView';
import { useData } from '../context/DataContext';
import { useConfirm } from '../context/ConfirmContext';

export default function SampleMastersPage() {
    const { 
        items, attributes, categories, uoms, fetchData, pagination, filters, authFetch
    } = useData();
    const { confirm } = useConfirm();

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const handleCreateItem = async (p: any) => {
        const res = await authFetch(`${API_BASE}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleUpdateItem = async (id: string, p: any) => {
        const res = await authFetch(`${API_BASE}/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleDeleteItem = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete Sample Master',
            message: 'Are you sure you want to delete this sample master item?',
            confirmText: 'Delete',
            variant: 'danger'
        });
        if (!confirmed) return;
        const res = await authFetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    const handleAddVariant = async (itemId: string, p: any) => {
        const res = await authFetch(`${API_BASE}/items/${itemId}/variants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleDeleteVariant = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete Variant',
            message: 'Are you sure you want to delete this variant?',
            confirmText: 'Delete',
            variant: 'danger'
        });
        if (!confirmed) return;
        const res = await authFetch(`${API_BASE}/variants/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    return (
            <InventoryView 
                items={items} 
                attributes={attributes} 
                categories={categories} 
                uoms={uoms}
                onCreateItem={handleCreateItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddVariant={handleAddVariant}
                onDeleteVariant={handleDeleteVariant}
                onRefresh={fetchData}
                currentPage={pagination.itemPage}
                totalItems={pagination.itemTotal}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setItemPage}
                searchTerm={filters.itemSearch}
                onSearchChange={filters.setItemSearch}
                forcedCategory="Sample"
            />
    );
}
