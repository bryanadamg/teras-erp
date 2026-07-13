'use client';
import React from 'react';
import KartuKerjaCardBeaming, { type KartuKerjaSettings } from './KartuKerjaCardBeaming';
import KartuKerjaCardGeneral from './KartuKerjaCardGeneral';
import KartuKerjaCardWeaving from './KartuKerjaCardWeaving';
import KartuKerjaCardDyeing from './KartuKerjaCardDyeing';

export type { KartuKerjaSettings };

/**
 * Kartu Kerja (WO step card) type dispatcher — picks the card body for the WO's
 * work center type. Used by both the single print (WOStepPrintModal, one card
 * per A6 sheet) and the bulk print (WOBulkPrintModal, four cards per A4). The
 * outer paper / grid cell wrapper is supplied by the caller; this renders only
 * the card content, filling its parent via flex.
 *
 * Add a new machine type: create KartuKerjaCard<Type>.tsx and add a case below.
 */
export default function KartuKerjaCard(props: {
    workOrder: any;
    parentMO: any;
    qrDataUrl: string;
    settings: KartuKerjaSettings;
    companyName?: string;
    attributes?: any[];
}) {
    const rawType = String(props.workOrder?.work_center_type || '').toUpperCase();
    // TENUN/CELUP are Indonesian aliases for WEAVING/DYEING work centers — see
    // alias_map in api/manufacturing.py list_work_orders_flat.
    const aliasMap: Record<string, string> = { TENUN: 'WEAVING', CELUP: 'DYEING' };
    const centerType = aliasMap[rawType] || rawType;

    switch (centerType) {
        case 'BEAMING':
            return <KartuKerjaCardBeaming {...props} />;
        case 'WEAVING':
            return <KartuKerjaCardWeaving {...props} attributes={props.attributes || []} />;
        case 'DYEING':
            return <KartuKerjaCardDyeing {...props} />;
        // WARPING, SETTING, FINISHING: printout specifics TBD — use general layout for now.
        default:
            return <KartuKerjaCardGeneral {...props} />;
    }
}
