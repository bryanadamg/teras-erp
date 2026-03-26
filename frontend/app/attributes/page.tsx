'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AttributesRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace('/item-metadata'); }, [router]);
    return null;
}
