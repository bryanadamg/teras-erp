'use client';

import { useMemo, Suspense } from 'react';
import WorkOrderListView from '../components/manufacturing/WorkOrderListView';
import { useData } from '../context/DataContext';

export default function WorkOrdersPage() {
    const {
        manufacturingOrders,
        productionRuns,
        workCenters,
        fetchData, authFetch,
    } = useData();

    // Include shared component MOs (is_shared_component=true) that are filtered out of
    // the root manufacturingOrders list but appear under productionRuns.
    const allMOs = useMemo(() => {
        const moIds = new Set((manufacturingOrders || []).map((m: any) => m.id));
        const extra: any[] = [];
        for (const pr of (productionRuns || [])) {
            for (const mo of (pr.manufacturing_orders || [])) {
                if (!moIds.has(mo.id)) extra.push(mo);
            }
        }
        return [...(manufacturingOrders || []), ...extra];
    }, [manufacturingOrders, productionRuns]);

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const handleUpdateWO = async (id: string, payload: any) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (res.ok) fetchData();
        return res;
    };

    const handleUpdateWOStatus = async (id: string, status: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' });
        if (res.ok) fetchData();
        return res;
    };

    const handleDeleteWO = async (id: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    return (
        <Suspense>
            <WorkOrderListView
                manufacturingOrders={allMOs}
                workCenters={workCenters}
                onUpdate={handleUpdateWO}
                onUpdateStatus={handleUpdateWOStatus}
                onDelete={handleDeleteWO}
            />
        </Suspense>
    );
}
