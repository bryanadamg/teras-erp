'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

// Wraps html5-qrcode (camera access) — client-only. Every branch screen it can
// open is itself dynamically imported inside, so only the one actually scanned
// into is downloaded.
const ScanDispatcher = dynamic(() => import('../components/shared/ScanDispatcher'), { ssr: false });

/**
 * The one scan route. Work order QRs, pick lists, cartons and packing orders all
 * enter here; ScanDispatcher decodes the code and hands it to whichever screen
 * owns it. /pick-scan and /packing-scan redirect here (next.config.js).
 */
export default function ScannerPage() {
    const router = useRouter();
    return <ScanDispatcher onClose={() => router.push('/dashboard')} />;
}
