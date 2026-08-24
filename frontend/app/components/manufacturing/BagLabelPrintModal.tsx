'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import BagLabelCard from './BagLabelCard';
import PrintModalShell from '../shared/PrintModalShell';
import { xpFont, BUTTON_RADIUS } from '../shared/xpTheme';

// Code 128 (1D) so the factory's existing laser barcode scanners can read the
// lot number too — not everyone has a phone/2D imager. Rendered to a PNG data
// URL alongside the QR. Same payload as the QR: the lot number.
function makeBarcodeDataUrl(text: string): string {
    if (!text) return '';
    try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, text, { format: 'CODE128', displayValue: false, margin: 0, height: 70, width: 2 });
        return canvas.toDataURL('image/png');
    } catch {
        return '';
    }
}

/**
 * Bag label print — renders one output-bag sticker per MOCompletion (each bag
 * is one completion / one lot). Reused for a single bag (one completion) and
 * for reprinting all bags on a WO. One label per A6 sheet. The QR on each label
 * encodes that bag's LOT number, not the WO id.
 *
 * `bags` are the completion objects to print, already filtered to this WO and
 * to non-rejected rows with an output lot. `seqStart` is the sequence number of
 * the first bag (1-based) so single-bag reprints keep their real bag number.
 */
export default function BagLabelPrintModal({
    bags,
    workOrder,
    parentMO,
    seqStart = 1,
    onClose,
}: {
    bags: any[];
    workOrder: any;
    parentMO: any;
    seqStart?: number;
    onClose: () => void;
}) {
    const { companyProfile, attributes, authFetch } = useData() as any;
    const { uiStyle } = useTheme();
    const isClassic = uiStyle === 'classic';

    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';
    // Stamp labels_printed_at when the operator prints. Compared against the newest
    // bag time on the WO row so bags logged after this print re-flag as unprinted.
    const doPrint = () => {
        if (workOrder?.id) {
            try { authFetch(`${API_BASE}/work-orders/${workOrder.id}/mark-printed?kind=labels`, { method: 'POST' }).catch(() => {}); } catch { /* noop */ }
        }
        window.addEventListener('afterprint', onClose, { once: true });
        window.print();
    };

    const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
    // 1D barcodes are synchronous to generate — memoize per bag lot.
    const barcodeUrls = useMemo(() => {
        const map: Record<string, string> = {};
        bags.forEach(b => { map[b.id] = makeBarcodeDataUrl(b.output_batch_number || String(b.id)); });
        return map;
    }, [bags]);

    useEffect(() => {
        document.body.classList.add('bag-label-print-active');
        return () => { document.body.classList.remove('bag-label-print-active'); };
    }, []);

    useEffect(() => {
        Promise.all(
            bags.map(b => {
                const payload = b.output_batch_number || String(b.id);
                return QRCode.toDataURL(payload, { margin: 4, width: 280, errorCorrectionLevel: 'H' })
                    .then(url => [b.id, url] as [string, string])
                    .catch(() => [b.id, ''] as [string, string]);
            })
        ).then(entries => setQrUrls(Object.fromEntries(entries)));
    }, [bags]);

    const renderLabel = (bag: any, idx: number) => (
        <div key={bag.id} className="bag-label-card" style={{ background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column' }}>
            <BagLabelCard
                completion={bag}
                workOrder={workOrder}
                parentMO={parentMO}
                qrDataUrl={qrUrls[bag.id] || ''}
                barcodeDataUrl={barcodeUrls[bag.id] || ''}
                bagSeq={seqStart + idx}
                companyName={companyProfile?.name}
                attributes={attributes}
            />
        </div>
    );

    const xpBtnGrey: React.CSSProperties = isClassic
        ? { fontFamily: xpFont, borderRadius: BUTTON_RADIUS, fontSize: '11px', padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassic
        ? { fontFamily: xpFont, borderRadius: BUTTON_RADIUS, fontSize: '11px', padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};
    return (
        <>
            <PrintModalShell
                title={`Print Bag Labels — ${bags.length} ${bags.length === 1 ? 'bag' : 'bags'} (${parentMO?.code})`}
                onClose={onClose}
                width="calc(var(--app-vw) * 90 / 100)"
                maxWidth={880}
                height="calc(var(--app-vh) * 88 / 100)"
                modeless
            >
                    <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        {bags.length === 0 && (
                            <div style={{ color: '#555', fontSize: '12px', marginTop: '40px', fontFamily: xpFont }}>
                                No weighed bags to label yet. Log a completion (one per bag) first.
                            </div>
                        )}
                        {bags.map((bag, idx) => (
                            <div key={bag.id} className="bag-label-paper" style={{ background: '#fff', width: '378px', minHeight: '535px', padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                                {renderLabel(bag, idx)}
                            </div>
                        ))}
                    </div>

                    <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {isClassic ? (
                            <>
                                <button style={xpBtnGrey} onClick={onClose}>Close</button>
                                <button style={{ ...xpBtnGreen, opacity: bags.length ? 1 : 0.5 }} disabled={!bags.length} onClick={doPrint}>Print</button>
                            </>
                        ) : (
                            <>
                                <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                <button className="btn btn-sm btn-success" disabled={!bags.length} onClick={doPrint}>
                                    <i className="bi bi-printer me-1"></i>Print {bags.length} {bags.length === 1 ? 'Label' : 'Labels'}
                                </button>
                            </>
                        )}
                    </div>
            </PrintModalShell>

            {createPortal(
                <div className="bag-label-print-portal" style={{ display: 'none' }}>
                    {bags.map((bag, idx) => renderLabel(bag, idx))}
                </div>,
                document.body
            )}
        </>
    );
}
