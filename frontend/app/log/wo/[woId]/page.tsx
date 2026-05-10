'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '../../../context/UserContext';
import { useData } from '../../../context/DataContext';
import WOLogView from '../../../components/mobile/WOLogView';

export default function WOLogPage() {
    const { woId } = useParams<{ woId: string }>();
    const { currentUser, loading: authLoading } = useUser();
    const { authFetch } = useData() as any;
    const router = useRouter();

    const [workOrder, setWorkOrder] = useState<any>(null);
    const [parentMO, setParentMO] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    useEffect(() => {
        if (!authLoading && !currentUser) {
            router.push('/login');
            return;
        }
        if (!woId || !currentUser) return;

        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const woRes = await authFetch(`${API_BASE}/work-orders/${woId}`);
                if (!woRes.ok) throw new Error('Work Order not found');
                const wo = await woRes.json();
                setWorkOrder(wo);

                const moRes = await authFetch(`${API_BASE}/manufacturing-orders/${wo.manufacturing_order_id}`);
                if (!moRes.ok) throw new Error('Manufacturing Order not found');
                const mo = await moRes.json();
                setParentMO(mo);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [woId, currentUser, authLoading]);

    const handleLogged = async () => {
        // Refetch WO to get updated qty_completed_total
        try {
            const woRes = await authFetch(`${API_BASE}/work-orders/${woId}`);
            if (woRes.ok) setWorkOrder(await woRes.json());
        } catch { /* best effort */ }
    };

    if (loading) {
        return (
            <div style={{ fontFamily: 'Tahoma, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 32, height: 32, border: '3px solid #0058e6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ color: '#555', fontSize: 12 }}>Loading work order...</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ fontFamily: 'Tahoma, sans-serif', padding: 24 }}>
                <div style={{ background: '#f8d7da', border: '1px solid #dc3545', color: '#721c24', padding: '12px 16px', fontSize: 13 }}>
                    {error}
                </div>
            </div>
        );
    }

    if (!workOrder || !parentMO) return null;

    return (
        <WOLogView
            workOrder={workOrder}
            parentMO={parentMO}
            authFetch={authFetch}
            onLogged={handleLogged}
        />
    );
}
