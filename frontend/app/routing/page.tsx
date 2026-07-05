'use client';

import RoutingView from '../components/settings/RoutingView';
import { useData } from '../context/DataContext';

export default function RoutingPage() {
    const { workCenters, operations, locations, refreshRouting, authFetch } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const handleCreateWorkCenter = async (p: any) => {
        const res = await authFetch(`${API_BASE}/work-centers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) refreshRouting();
    };

    const handleUpdateWorkCenter = async (id: string, p: any) => {
        const res = await authFetch(`${API_BASE}/work-centers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) refreshRouting();
    };

    const handleDeleteWorkCenter = async (id: string) => {
        const res = await authFetch(`${API_BASE}/work-centers/${id}`, { method: 'DELETE' });
        if (res.ok) refreshRouting();
    };

    const handleCreateOperation = async (p: any) => {
        const res = await authFetch(`${API_BASE}/operations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        if (res.ok) refreshRouting();
    };

    const handleDeleteOperation = async (id: string) => {
        const res = await authFetch(`${API_BASE}/operations/${id}`, { method: 'DELETE' });
        if (res.ok) refreshRouting();
    };

    return (
        <RoutingView
            workCenters={workCenters}
            operations={operations}
            locations={locations}
            onCreateWorkCenter={handleCreateWorkCenter}
            onUpdateWorkCenter={handleUpdateWorkCenter}
            onDeleteWorkCenter={handleDeleteWorkCenter}
            onCreateOperation={handleCreateOperation}
            onDeleteOperation={handleDeleteOperation}
        />
    );
}
