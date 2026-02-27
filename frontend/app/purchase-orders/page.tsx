'use client';

import MainLayout from '../components/MainLayout';
import PurchaseOrderView from '../components/PurchaseOrderView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';

export default function PurchaseOrdersPage() {
    const { items, attributes, purchaseOrders, partners, locations, fetchData, authFetch } = useData();
    const { showToast } = useToast();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreatePO = async (p: any) => {
        const res = await authFetch(`${API_BASE}/purchase-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleReceivePO = async (id: string) => {
        const res = await authFetch(`${API_BASE}/purchase-orders/${id}/receive`, { method: 'PUT' });
        if (res.ok) { showToast('PO Received into Stock', 'success'); fetchData(); }
    };

    const handleDeletePO = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        const res = await authFetch(`${API_BASE}/purchase-orders/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <PurchaseOrderView 
                items={items} 
                attributes={attributes} 
                purchaseOrders={purchaseOrders} 
                partners={partners} 
                locations={locations} 
                onCreatePO={handleCreatePO} 
                onReceivePO={handleReceivePO} 
                onDeletePO={handleDeletePO} 
            />
        </MainLayout>
    );
}
