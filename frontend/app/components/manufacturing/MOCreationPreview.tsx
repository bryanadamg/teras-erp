'use client';
import React from 'react';
import NettingPlanTable, { useNettingPreview } from './NettingPlanTable';

interface MOCreationPreviewProps {
    bomId: string;
    qty: number;
    locationCode: string;
    sourceLocationCode: string;
    createNested: boolean;
    // Retained for call-site compatibility; the plan is now computed server-side
    // (the old client-side explosion ignored net-free, leaf rollup, and the
    // deep-level inherited-source behaviour, so it misrepresented what creation does).
    boms?: any[];
    locations?: any[];
    stockBalance?: any[];
    depth?: number;
}

export default function MOCreationPreview({
    bomId, qty, locationCode, sourceLocationCode, createNested,
}: MOCreationPreviewProps) {
    const enabled = !!bomId && qty > 0 && !!locationCode;
    const { nodes, loading, error } = useNettingPreview(
        '/manufacturing-orders/preview',
        {
            bom_id: bomId,
            qty,
            location_code: locationCode,
            source_location_code: sourceLocationCode || null,
            create_nested: createNested,
        },
        enabled,
    );
    return <NettingPlanTable nodes={nodes} loading={loading && enabled} error={error} />;
}
