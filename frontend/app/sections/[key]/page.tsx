'use client';

import { useParams } from 'next/navigation';
import SectionHomeView from '../../components/sections/SectionHomeView';

export default function SectionHomePage() {
    const params = useParams();
    const key = String(params?.key || '');
    return <SectionHomeView sectionKey={key} />;
}
