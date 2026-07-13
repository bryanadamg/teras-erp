'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import BagLabelCard from './BagLabelCard';

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
    const { companyProfile, attributes } = useData() as any;
    const { uiStyle } = useTheme();
    const isClassic = uiStyle === 'classic';

    const [qrUrls, setQrUrls] = useState<Record<string, string>>({});

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
                bagSeq={seqStart + idx}
                companyName={companyProfile?.name}
                attributes={attributes}
            />
        </div>
    );

    const headerStyle: React.CSSProperties = isClassic
        ? { background: 'linear-gradient(to right, #0058e6, #08a5ff)', color: '#fff', font: 'bold 12px Tahoma', padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
        : {};
    const headerClass = isClassic ? '' : 'bg-primary text-white px-3 py-2 d-flex justify-content-between align-items-center';
    const xpBtnGrey: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};
    const xpBevelStyle: React.CSSProperties = isClassic ? { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf' } : {};

    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 20300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={onClose}
            >
                <div
                    style={{ background: '#fff', width: '90vw', maxWidth: '880px', height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', ...xpBevelStyle }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={headerStyle} className={headerClass}>
                        <span>Print Bag Labels — {bags.length} {bags.length === 1 ? 'bag' : 'bags'} ({parentMO?.code})</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '14px', cursor: 'pointer', lineHeight: '1', fontWeight: 'bold' }}>X</button>
                    </div>

                    <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        {bags.length === 0 && (
                            <div style={{ color: '#555', fontSize: '12px', marginTop: '40px', fontFamily: 'Tahoma, sans-serif' }}>
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
                                <button style={{ ...xpBtnGreen, opacity: bags.length ? 1 : 0.5 }} disabled={!bags.length} onClick={() => { window.addEventListener('afterprint', onClose, { once: true }); window.print(); }}>Print</button>
                            </>
                        ) : (
                            <>
                                <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                <button className="btn btn-sm btn-success" disabled={!bags.length} onClick={() => { window.addEventListener('afterprint', onClose, { once: true }); window.print(); }}>
                                    <i className="bi bi-printer me-1"></i>Print {bags.length} {bags.length === 1 ? 'Label' : 'Labels'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {createPortal(
                <div className="bag-label-print-portal" style={{ display: 'none' }}>
                    {bags.map((bag, idx) => renderLabel(bag, idx))}
                </div>,
                document.body
            )}
        </>
    );
}
