'use client';

import MainLayout from '../components/MainLayout';
import PartnersView from '../components/PartnersView';
import { useData } from '../context/DataContext';

export default function CustomersPage() {
    const { partners, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreatePartner = async (p: any) => {
        const res = await authFetch(`${API_BASE}/partners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleUpdatePartner = async (id: string, p: any) => {
        const res = await authFetch(`${API_BASE}/partners/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    const handleDeletePartner = async (id: string) => {
        const res = await authFetch(`${API_BASE}/partners/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <PartnersView 
                partners={partners} 
                type="CUSTOMER" 
                onCreate={handleCreatePartner} 
                onUpdate={handleUpdatePartner} 
                onDelete={handleDeletePartner} 
            />
        </MainLayout>
    );
}
