'use client';

import MainLayout from '../components/MainLayout';
import CategoriesView from '../components/CategoriesView';
import { useData } from '../context/DataContext';

export default function CategoriesPage() {
    const { categories, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateCategory = async (p: any) => {
        const res = await authFetch(`${API_BASE}/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    return (
        <MainLayout>
            <CategoriesView categories={categories} onCreate={handleCreateCategory} />
        </MainLayout>
    );
}
