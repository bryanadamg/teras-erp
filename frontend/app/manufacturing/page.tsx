'use client';

import MainLayout from '../components/MainLayout';
import ManufacturingView from '../components/ManufacturingView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ManufacturingPage() {
    const { 
        items, boms, locations, attributes, workOrders, stockBalance, 
        workCenters, operations, fetchData, pagination, authFetch
    } = useData();
    const { showToast } = useToast();
    const searchParams = useSearchParams();
    const [initialCreateState, setInitialCreateState] = useState<any>(null);

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    useEffect(() => {
        if (searchParams.get('action') === 'create_wo') {
            setInitialCreateState({
                sales_order_id: searchParams.get('sales_order_id'),
                item_id: searchParams.get('item_id'),
                qty: parseFloat(searchParams.get('qty') || '0')
            });
        }
    }, [searchParams]);

    const handleCreateWO = async (payload: any) => {
        const res = await authFetch(`${API_BASE}/work-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        fetchData();
        return res;
    };

    const handleUpdateWOStatus = async (woId: string, status: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) { fetchData(); return true; } 
        else { const err = await res.json(); showToast(`Error: ${err.detail}`, 'danger'); return false; }
    };

    const handleDeleteWO = async (woId: string) => {
        if (!confirm('Are you sure?')) return;
        const res = await authFetch(`${API_BASE}/work-orders/${woId}`, { method: 'DELETE' });
        if (res.ok) { showToast('Work Order deleted', 'success'); fetchData(); }
    };

    return (
        <MainLayout>
            <ManufacturingView 
                items={items} 
                boms={boms} 
                locations={locations} 
                attributes={attributes}
                workOrders={workOrders} 
                stockBalance={stockBalance} 
                workCenters={workCenters} 
                operations={operations}
                onCreateWO={handleCreateWO}
                onUpdateStatus={handleUpdateWOStatus}
                onDeleteWO={handleDeleteWO}
                currentPage={pagination.woPage}
                totalItems={pagination.woTotal}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setWoPage}
                initialCreateState={initialCreateState}
            />
        </MainLayout>
    );
}
