'use client';

import MainLayout from '../components/MainLayout';
import BOMView from '../components/BOMView';
import { useData } from '../context/DataContext';

export default function BOMPage() {
    const { items, attributes, boms, operations, workCenters, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateBOM = async (p: any) => {
        const res = await authFetch(`${API_BASE}/boms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <BOMView 
                items={items} 
                attributes={attributes} 
                boms={boms} 
                operations={operations} 
                workCenters={workCenters} 
                onCreateBOM={handleCreateBOM} 
            />
        </MainLayout>
    );
}
