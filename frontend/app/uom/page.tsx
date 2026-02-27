'use client';

import MainLayout from '../components/MainLayout';
import UOMView from '../components/UOMView';
import { useData } from '../context/DataContext';

export default function UOMPage() {
    const { uoms, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateUOM = async (p: any) => {
        const res = await authFetch(`${API_BASE}/uoms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <UOMView uoms={uoms} onCreate={handleCreateUOM} />
        </MainLayout>
    );
}
