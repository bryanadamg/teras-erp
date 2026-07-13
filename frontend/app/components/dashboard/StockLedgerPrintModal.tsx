'use client';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import PrintModalShell from '../shared/PrintModalShell';

type RefMeta = { label: string; classic: { bg: string; border: string; color: string } };
const REF_META: Record<string, RefMeta> = {
    'manual':              { label: 'Manual Adjustment', classic: { bg: '#e6e3da', border: '#a8a292', color: '#444' } },
    'Manufacturing Order': { label: 'Manufacturing',     classic: { bg: '#dde8f5', border: '#7f9db9', color: '#1a3d7a' } },
    'Work Order':          { label: 'Work Order',        classic: { bg: '#e6ddf2', border: '#9a82c0', color: '#4a2a7a' } },
    'Goods Receipt':       { label: 'Goods Receipt',     classic: { bg: '#dcefe0', border: '#7faf87', color: '#1a5e2a' } },
    'Purchase Order':      { label: 'Purchase Order',    classic: { bg: '#d6eef0', border: '#6fb0b8', color: '#15565e' } },
    'Transfer':            { label: 'Transfer',          classic: { bg: '#fbeccf', border: '#c8a23a', color: '#6a4a00' } },
};
const refMeta = (t: string): RefMeta =>
    REF_META[t] || { label: (t || '').replace(/_/g, ' '), classic: { bg: '#e0dfd8', border: '#b0a898', color: '#333' } };

const shortRef = (id: string) => {
    if (!id) return '';
    const looksUuid = id.length > 14 && /[0-9a-f-]{12,}/i.test(id);
    return looksUuid ? id.slice(0, 8) + '…' : id;
};
const fmtQty = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });

function LedgerDocument({ entries, locations, attributes, companyProfile, periodLabel, totals, filtersSummary, hiddenCount }: any) {
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '');
    const locMap: Record<string, any> = {};
    for (const l of (locations || [])) locMap[l.id] = l;
    const getWarehouseName = (e: any): string => locMap[e.location_id]?.parent_name || '';
    const getAttrName = (vid: string) => {
        for (const attr of (attributes || [])) { const v = attr.values?.find((x: any) => x.id === vid); if (v) return v.value; }
        return '';
    };

    const border = '1px solid #777';
    const th: React.CSSProperties = { border, padding: '3px 4px', background: '#e8e8e8', fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', fontSize: '8px', lineHeight: 1.2 };
    const td: React.CSSProperties = { border, padding: '3px 4px', verticalAlign: 'top', fontSize: '8px', lineHeight: 1.3 };

    return (
        <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '8px', color: '#000', lineHeight: 1.3 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 5, borderBottom: '2px solid #000' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {companyProfile?.logo_url ? (
                        <img src={`${API_BASE}${companyProfile.logo_url}`} alt="Logo" style={{ maxHeight: 40, maxWidth: 60, objectFit: 'contain' }} />
                    ) : (
                        <div style={{ width: 44, height: 32, border: '2px solid #003080', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 9, color: '#003080' }}>BIE</div>
                    )}
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: 10 }}>{companyProfile?.name || 'PT. BOLA INTAN ELASTIC'}</div>
                        {companyProfile?.address && <div style={{ fontSize: 7 }}>{companyProfile.address}</div>}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 'bold' }}>STOCK LEDGER</div>
                    <div style={{ fontSize: 8, color: '#555' }}>Period: {periodLabel}</div>
                    {filtersSummary && <div style={{ fontSize: 7, color: '#777' }}>{filtersSummary}</div>}
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 6 }}>
                <thead>
                    <tr>
                        <th style={{ ...th, width: '3%' }}>No</th>
                        <th style={{ ...th, width: '9%' }}>Date</th>
                        <th style={{ ...th, width: '16%' }}>Item</th>
                        <th style={{ ...th, width: '10%' }}>Attributes</th>
                        <th style={{ ...th, width: '13%' }}>Location</th>
                        <th style={{ ...th, width: '9%' }}>Lot</th>
                        <th style={{ ...th, width: '10%' }}>Movement</th>
                        <th style={{ ...th, width: '9%' }}>Packaging</th>
                        <th style={{ ...th, width: '11%' }}>Source</th>
                        <th style={{ ...th, width: '10%' }}>Ref #</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((e: any, idx: number) => {
                        const rm = refMeta(e.reference_type);
                        const up = e.qty_change >= 0;
                        const dt = new Date(e.created_at);
                        const c = e.qty_cones_change || 0, b = e.qty_boxes_change || 0, d = e.qty_drums_change || 0;
                        const pkg = [c ? `${c > 0 ? '+' : ''}${c} cones` : '', b ? `${b > 0 ? '+' : ''}${b} boxes` : '', d ? `${d > 0 ? '+' : ''}${d} drums` : ''].filter(Boolean).join(', ');
                        return (
                            <tr key={e.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                                <td style={{ ...td, textAlign: 'center' }}>{idx + 1}</td>
                                <td style={{ ...td, whiteSpace: 'nowrap' }}>{dt.toLocaleDateString()} {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                <td style={td}>
                                    <div style={{ fontWeight: 'bold' }}>{e.item_name}</div>
                                    <div style={{ color: '#777', fontSize: 7 }}>{e.item_code}</div>
                                </td>
                                <td style={td}>{(e.attribute_value_ids || []).map((vid: string) => getAttrName(vid)).filter(Boolean).join(', ')}</td>
                                <td style={td}>
                                    {getWarehouseName(e) && <span style={{ color: '#555' }}>{getWarehouseName(e)} / </span>}
                                    {e.location_name}
                                </td>
                                <td style={td}>{e.batch_number || '-'}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 'bold', color: up ? '#1a5e1a' : '#c00000', whiteSpace: 'nowrap' }}>
                                    {up ? '+' : ''}{fmtQty(e.qty_change)} {e.item_uom}
                                </td>
                                <td style={{ ...td, fontSize: 7 }}>{pkg || '-'}</td>
                                <td style={td}>{rm.label}</td>
                                <td style={{ ...td, fontSize: 7, wordBreak: 'break-all' }} title={e.reference_id}>{shortRef(e.reference_id)}</td>
                            </tr>
                        );
                    })}
                    {entries.length === 0 && (
                        <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: '12px', color: '#888', fontStyle: 'italic' }}>No movements match these filters.</td></tr>
                    )}
                </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 'bold', marginBottom: 4 }}>
                <span>Movements: {totals.total.toLocaleString()}</span>
                <span style={{ color: '#1a5e1a' }}>In: +{fmtQty(totals.totalIn)}</span>
                <span style={{ color: '#c00000' }}>Out: {fmtQty(totals.totalOut)}</span>
                <span>Net: {fmtQty(totals.totalIn + totals.totalOut)}</span>
            </div>
            {hiddenCount > 0 && (
                <div style={{ fontSize: 7, color: '#c00000', marginBottom: 4 }}>
                    Showing first {entries.length.toLocaleString()} of {totals.total.toLocaleString()} movements — narrow the filters to print the rest ({hiddenCount.toLocaleString()} not shown).
                </div>
            )}
            <div style={{ fontSize: '7px', color: '#555', display: 'flex', justifyContent: 'space-between' }}>
                <span>Printed: {new Date().toLocaleString()}</span>
            </div>
        </div>
    );
}

export default function StockLedgerPrintModal({
    entries, locations, attributes, companyProfile, currentStyle, periodLabel, totals, filtersSummary, onClose,
}: {
    entries: any[];
    locations: any[];
    attributes: any[];
    companyProfile: any;
    currentStyle: string;
    periodLabel: string;
    totals: { total: number; totalIn: number; totalOut: number };
    filtersSummary: string;
    onClose: () => void;
}) {
    const isClassic = currentStyle === 'classic';
    const hiddenCount = Math.max(0, totals.total - entries.length);

    useEffect(() => {
        document.body.classList.add('stock-ledger-print-active');
        return () => { document.body.classList.remove('stock-ledger-print-active'); };
    }, []);

    const handlePrint = () => {
        const pageStyle = document.createElement('style');
        pageStyle.id = '__stock-ledger-page';
        pageStyle.textContent = [
            '@page { size: landscape; margin: 10mm; }',
            'html, body { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }',
        ].join(' ');
        document.head.appendChild(pageStyle);
        const handler = () => {
            onClose();
            document.getElementById('__stock-ledger-page')?.remove();
        };
        window.addEventListener('afterprint', handler, { once: true });
        window.print();
    };

    const xpBtnGrey: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: 11, padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer', color: '#000' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: 11, padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};

    const docContent = (
        <LedgerDocument
            entries={entries}
            locations={locations}
            attributes={attributes}
            companyProfile={companyProfile}
            periodLabel={periodLabel}
            totals={totals}
            filtersSummary={filtersSummary}
            hiddenCount={hiddenCount}
        />
    );

    return (
        <>
            <PrintModalShell
                title={`Print Stock Ledger — ${entries.length.toLocaleString()} movement(s)${hiddenCount > 0 ? ` of ${totals.total.toLocaleString()}` : ''}`}
                onClose={onClose}
                width="96vw"
                maxWidth={1300}
                height="90vh"
                bevel={false}
            >
                    <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', overflowX: 'auto', padding: 16 }}>
                        <div className="stock-ledger-print-paper" style={{ background: '#fff', width: 1090, minWidth: 1090, padding: '12px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', fontSize: '8px', lineHeight: 1.4, color: '#000', fontFamily: 'Arial, sans-serif' }}>
                            {docContent}
                        </div>
                    </div>

                    <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#555' }}>Landscape orientation is set automatically — no need to change the browser print dialog.</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {isClassic ? (
                                <>
                                    <button style={xpBtnGrey} onClick={onClose}>Close</button>
                                    <button style={xpBtnGreen} onClick={handlePrint}>Print</button>
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                    <button className="btn btn-sm btn-success" onClick={handlePrint}><i className="bi bi-printer me-1"></i>Print</button>
                                </>
                            )}
                        </div>
                    </div>
            </PrintModalShell>

            {createPortal(
                <div className="stock-ledger-print-portal" style={{ display: 'none' }}>
                    <div className="stock-ledger-print-paper" style={{ background: '#fff', width: '100%', boxSizing: 'border-box', padding: '0', fontSize: '8px', lineHeight: 1.4, color: '#000', fontFamily: 'Arial, sans-serif' }}>
                        {docContent}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
