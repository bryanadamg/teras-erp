'use client';

import StockOnHandView from '../components/stock/StockOnHandView';
import { useData } from '../context/DataContext';
import { useItemSearch } from '../components/shared/useEntitySearch';

export default function StockOnHandPage() {
    // No `stockBalance` here on purpose: the grid is server-paginated against
    // /stock/balance/paginated. DataContext's `stockBalance` stays the unpaginated
    // plant-wide lookup feed (manufacturing material availability, dashboards).
    const { items, locations, attributes, categories, fetchData, authFetch } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    // Item picker source for the New Entry modal — server typeahead, so it reaches
    // past the 50-row page DataContext holds.
    const { results: selectItems, onSearch: handleItemSearch } = useItemSearch({ seed: items });

    return (
        <StockOnHandView
            locations={locations}
            attributes={attributes}
            categories={categories}
            items={selectItems}
            onSearchItems={handleItemSearch}
            onRefresh={fetchData}
            authFetch={authFetch}
            apiBase={API_BASE}
        />
    );
}
