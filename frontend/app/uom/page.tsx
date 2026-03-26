'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UOMRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace('/item-metadata'); }, [router]);
    return null;
}
