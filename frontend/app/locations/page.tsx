'use client';

import LocationsView from '../components/LocationsView';
import { useData } from '../context/DataContext';

export default function LocationsPage() {
    const { locations, fetchData, authFetch } = useData();
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/$/, '') + '/api';

    const handleCreateLocation = async (p: any) => {
        const res = await authFetch(`${API_BASE}/locations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) fetchData();
    };

    return (
            <LocationsView locations={locations} onCreate={handleCreateLocation} />
    );
}
