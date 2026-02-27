'use client';

import MainLayout from '../components/MainLayout';
import InventoryView from '../components/InventoryView';
import { useData } from '../context/DataContext';

export default function SampleMastersPage() {
    const { 
        items, attributes, categories, uoms, fetchData, pagination, filters, authFetch
    } = useData();

    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateItem = async (p: any) => {
        const res = await authFetch(`${API_BASE}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleUpdateItem = async (id: string, p: any) => {
        const res = await authFetch(`${API_BASE}/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleDeleteItem = async (id: string) => {
        if (!confirm('Delete item?')) return;
        const res = await authFetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    const handleAddVariant = async (itemId: string, p: any) => {
        const res = await authFetch(`${API_BASE}/items/${itemId}/variants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleDeleteVariant = async (id: string) => {
        if (!confirm('Delete variant?')) return;
        const res = await authFetch(`${API_BASE}/variants/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
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
        </MainLayout>
    );
}
