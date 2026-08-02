'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useData } from '../context/DataContext';

// Wraps html5-qrcode (camera access) — client-only.
const PackingScanView = dynamic(() => import('../components/mobile/PackingScanView'), { ssr: false });

export default function PackingScanPage() {
    const { authFetch } = useData() as any;
    const router = useRouter();
    return <PackingScanView authFetch={authFetch} onClose={() => router.push('/packing')} />;
}
