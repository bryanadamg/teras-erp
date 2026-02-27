'use client';

import MainLayout from '../components/MainLayout';
import SalesOrderView from '../components/SalesOrderView';
import { useData } from '../context/DataContext';

export default function SalesOrdersPage() {
    const { items, attributes, salesOrders, partners, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateSO = async (p: any) => {
        const res = await authFetch(`${API_BASE}/sales-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleDeleteSO = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        const res = await authFetch(`${API_BASE}/sales-orders/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <SalesOrderView 
                items={items} 
                attributes={attributes} 
                salesOrders={salesOrders} 
                partners={partners} 
                onCreateSO={handleCreateSO} 
                onDeleteSO={handleDeleteSO} 
            />
        </MainLayout>
    );
}
