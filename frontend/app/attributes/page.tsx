'use client';

import MainLayout from '../components/MainLayout';
import AttributesView from '../components/AttributesView';
import { useData } from '../context/DataContext';

export default function AttributesPage() {
    const { attributes, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateAttribute = async (p: any) => {
        const res = await authFetch(`${API_BASE}/attributes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleUpdateAttribute = async (id: string, p: any) => {
        const res = await authFetch(`${API_BASE}/attributes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleDeleteAttribute = async (id: string) => {
        if (!confirm('Delete attribute?')) return;
        const res = await authFetch(`${API_BASE}/attributes/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <AttributesView 
                attributes={attributes} 
                onCreate={handleCreateAttribute} 
                onUpdate={handleUpdateAttribute} 
                onDelete={handleDeleteAttribute} 
            />
        </MainLayout>
    );
}
