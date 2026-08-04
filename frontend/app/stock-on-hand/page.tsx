'use client';

import StockOnHandView from '../components/stock/StockOnHandView';
import { useData } from '../context/DataContext';
import { useItemSearch } from '../components/shared/useEntitySearch';

export default function StockOnHandPage() {
    const { items, locations, stockBalance, attributes, categories, fetchData, authFetch, loading } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    // Item picker source for the New Entry modal — server typeahead, so it reaches
    // past the 50-row page DataContext holds.
    const { results: selectItems, onSearch: handleItemSearch } = useItemSearch({ seed: items });

    return (
        <StockOnHandView
            locations={locations}
            stockBalance={stockBalance}
            attributes={attributes}
            categories={categories}
            items={selectItems}
            onSearchItems={handleItemSearch}
            onRefresh={fetchData}
            authFetch={authFetch}
            apiBase={API_BASE}
            loading={loading.stockBalance}
        />
    );
}
