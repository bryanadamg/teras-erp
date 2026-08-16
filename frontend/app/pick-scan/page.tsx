'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useData } from '../context/DataContext';

// Wraps html5-qrcode (camera access) — client-only.
const PickScanView = dynamic(() => import('../components/mobile/PickScanView'), { ssr: false });

export default function PickScanPage() {
    const { authFetch } = useData() as any;
    const router = useRouter();
    return <PickScanView authFetch={authFetch} onClose={() => router.push('/pick-lists')} />;
}
