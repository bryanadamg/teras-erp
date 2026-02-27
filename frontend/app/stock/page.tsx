'use client';

import MainLayout from '../components/MainLayout';
import StockEntryView from '../components/StockEntryView';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';

export default function StockEntryPage() {
    const { items, locations, attributes, stockBalance, fetchData, authFetch } = useData();
    const { showToast } = useToast();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleAddStock = async (p: any) => {
        const res = await authFetch(`${API_BASE}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) { showToast('Stock Entry recorded', 'success'); fetchData(); }
    };

    return (
        <MainLayout>
            <StockEntryView 
                items={items} 
                locations={locations} 
                attributes={attributes} 
                stockBalance={stockBalance} 
                onAddStock={handleAddStock} 
            />
        </MainLayout>
    );
}
