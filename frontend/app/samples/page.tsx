'use client';

import MainLayout from '../components/MainLayout';
import SampleRequestView from '../components/SampleRequestView';
import { useData } from '../context/DataContext';

export default function SamplesPage() {
    const { items, attributes, salesOrders, samples, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateSample = async (p: any) => {
        const res = await authFetch(`${API_BASE}/samples`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleUpdateSampleStatus = async (id: string, status: string) => {
        const res = await authFetch(`${API_BASE}/samples/${id}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <SampleRequestView 
                items={items} 
                attributes={attributes} 
                salesOrders={salesOrders} 
                samples={samples} 
                onCreateSample={handleCreateSample} 
                onUpdateStatus={handleUpdateSampleStatus} 
            />
        </MainLayout>
    );
}
