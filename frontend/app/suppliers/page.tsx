'use client';

import MainLayout from '../components/MainLayout';
import PartnersView from '../components/PartnersView';
import { useData } from '../context/DataContext';

export default function SuppliersPage() {
    const { partners, fetchData, authFetch } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

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
                type="SUPPLIER" 
                onCreate={handleCreatePartner} 
                onUpdate={handleUpdatePartner} 
                onDelete={handleDeletePartner} 
            />
        </MainLayout>
    );
}
