'use client';

import StockOnHandView from '../components/stock/StockOnHandView';
import { useData } from '../context/DataContext';

export default function StockOnHandPage() {
    const { locations, locationCategories, stockBalance, attributes, fetchData, authFetch } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    return (
        <StockOnHandView
            locations={locations}
            locationCategories={locationCategories}
            stockBalance={stockBalance}
            attributes={attributes}
            onRefresh={fetchData}
            authFetch={authFetch}
            apiBase={API_BASE}
        />
    );
}
