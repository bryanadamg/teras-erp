'use client';

import dynamic from 'next/dynamic';
import { useData } from '../context/DataContext';
import { useRouter } from 'next/navigation';
import { useToast } from '../components/shared/Toast';
import { useIsMobile } from '../hooks/useIsMobile';
import { useEffect, useState, useCallback } from 'react';
import { XPLoading } from '../components/shared/xpTheme';

// Both wrap html5-qrcode (camera access); only one renders per session
// (isMobile), so load only the one actually needed instead of bundling both.
const QRScannerView = dynamic(() => import('../components/shared/QRScannerView'), { ssr: false });
const MobileScannerView = dynamic(() => import('../components/mobile/ScannerView'), { ssr: false });

export default function ScannerPage() {
    const { items, boms, locations, attributes, stockBalance, workCenters, fetchData, authFetch } = useData() as any;
    const router = useRouter();
    const { showToast } = useToast();
    const isMobile = useIsMobile();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [localMOs, setLocalMOs] = useState<any[]>([]);
    const [localBoms, setLocalBoms] = useState<any[]>(boms);
    const [localStockBalance, setLocalStockBalance] = useState<any[]>(stockBalance);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        const [moRes, bomsRes, balanceRes] = await Promise.all([
            // all_levels=true so consolidated shared-component MOs (parent_mo_id=None,
            // is_shared_component=True, linked via MODependency) are returned too — their
            // WO QR codes are scanned on the floor but they're absent from the root tree.
            authFetch(`${API_BASE}/manufacturing-orders?skip=0&limit=9999&all_levels=true`),
            authFetch(`${API_BASE}/boms`),
            authFetch(`${API_BASE}/stock/balance`),
        ]);
        if (moRes.ok) { const d = await moRes.json(); setLocalMOs(Array.isArray(d) ? d : (d.items || [])); }
        if (bomsRes.ok) { setLocalBoms(await bomsRes.json()); }
        if (balanceRes.ok) { setLocalStockBalance(await balanceRes.json()); }
    }, [authFetch, API_BASE]);

    useEffect(() => {
        const load = async () => {
            try { await reload(); }
            finally { setLoading(false); }
        };
        load();
    }, []);

    // Legacy desktop scanner still uses work-orders via onUpdateStatus
    const handleUpdateWOStatus = async (woId: string, status: string) => {
        const res = await authFetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, { method: 'PUT' });
        if (res.ok) { fetchData(); return true; }
        else { const err = await res.json(); showToast(`Error: ${err.detail}`, 'danger'); return false; }
    };

    if (loading) {
        return <XPLoading label="Loading orders..." />;
    }

    if (isMobile) {
        return (
            <MobileScannerView
                manufacturingOrders={localMOs}
                workCenters={workCenters}
                items={items || []}
                authFetch={authFetch}
                onRefresh={reload}
                onClose={() => router.push('/manufacturing-orders')}
            />
        );
    }

    return (
        // ui-scale-exempt: html5-qrcode sizes the camera viewfinder and its scan
        // overlay from its own element measurements, which the interface zoom
        // would skew. A camera view wants 1:1 anyway.
        <div className="container-fluid py-2 h-100 ui-scale-exempt">
            <div className="row justify-content-center">
                <div className="col-md-8 col-lg-6">
                    <QRScannerView
                        workOrders={localMOs}
                        items={items}
                        boms={localBoms}
                        locations={locations}
                        attributes={attributes}
                        stockBalance={localStockBalance}
                        onUpdateStatus={handleUpdateWOStatus}
                        onClose={() => router.push('/manufacturing-orders')}
                    />
                </div>
            </div>
        </div>
    );
}
