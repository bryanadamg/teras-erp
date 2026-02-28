'use client';

import MainLayout from '../components/MainLayout';
import PartnersView from '../components/PartnersView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';

export default function CustomersPage() {
    const { partners, fetchData, authFetch } = useData();
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const handleCreatePartner = async (p: any) => {
        try {
            const res = await authFetch(`${API_BASE}/partners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
            if (res.ok) {
                showToast('Customer created successfully', 'success');
                fetchData();
            } else {
                showToast(`Failed to create customer: ${res.status}`, 'danger');
            }
        } catch (e) {
            showToast('Network error creating customer', 'danger');
        }
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
