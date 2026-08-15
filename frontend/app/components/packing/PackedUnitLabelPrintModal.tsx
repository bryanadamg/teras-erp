'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import PrintModalShell from '../shared/PrintModalShell';
import { xpFont } from '../shared/xpTheme';

// Code 128 (1D) alongside the QR so the factory's existing laser scanners can
// read the carton number too — same payload as the QR, matching the bag label.
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
 * Carton label — one A6 sticker per PackedUnit. The QR encodes the carton's
 * PU- number, which is exactly what the picker scans onto a pick list, so the
 * label is the physical handle for the whole outbound flow.
 *
 * Reuses the bag-label print CSS (`bag-label-*` in globals.css): same A6
 * one-per-sheet geometry, so there is no second set of print rules to keep in
 * sync with it.
 */
export default function PackedUnitLabelPrintModal({
    po,
    units,
    companyProfile,
    onClose,
}: {
    po: any;
    units: any[];
    companyProfile?: any;
    onClose: () => void;
}) {
    const { uiStyle } = useTheme();
    const { formatCustom: tzFmt } = useTimezone();
    const isClassic = uiStyle === 'classic';

    const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
    const barcodeUrls = useMemo(() => {
        const map: Record<string, string> = {};
        units.forEach(u => { map[u.id] = makeBarcodeDataUrl(u.batch_number || String(u.id)); });
        return map;
    }, [units]);

    useEffect(() => {
        document.body.classList.add('bag-label-print-active');
        return () => { document.body.classList.remove('bag-label-print-active'); };
    }, []);

    useEffect(() => {
        Promise.all(
            units.map(u => {
                const payload = u.batch_number || String(u.id);
                return QRCode.toDataURL(payload, { margin: 4, width: 280, errorCorrectionLevel: 'H' })
                    .then(url => [u.id, url] as [string, string])
                    .catch(() => [u.id, ''] as [string, string]);
            })
        ).then(entries => setQrUrls(Object.fromEntries(entries)));
    }, [units]);

    const doPrint = () => {
        window.addEventListener('afterprint', onClose, { once: true });
        window.print();
    };

    const gridLbl: React.CSSProperties = { background: '#f0f0f0', border: '1px solid #bbb', padding: '3px 6px', fontSize: '9px', color: '#333', fontWeight: 'bold', whiteSpace: 'nowrap' };
    const gridVal: React.CSSProperties = { border: '1px solid #bbb', padding: '3px 6px', fontSize: '11px', color: '#000' };

    const renderLabel = (u: any) => {
        const created = u.created_at
            ? tzFmt(u.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' }, 'id-ID')
            : '';
        return (
            <div key={u.id} className="bag-label-card" style={{ background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 6 }}>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: 12 }}>{companyProfile?.name || 'PT. BOLA INTAN ELASTIC'}</div>
                        <div style={{ fontSize: 9, color: '#555' }}>{(po.package_label || 'Carton').toUpperCase()} LABEL</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 8, color: '#555', fontWeight: 'bold' }}>NO. KOLI</div>
                        <div style={{ fontSize: 22, fontWeight: 'bold', lineHeight: 1 }}>{u.package_no ?? '—'}</div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 6 }}>
                    {qrUrls[u.id] && <img src={qrUrls[u.id]} alt="QR" style={{ width: 150, height: 150 }} />}
                    <div style={{ fontSize: 14, fontWeight: 'bold', letterSpacing: 1 }}>{u.batch_number}</div>
                    {barcodeUrls[u.id] && <img src={barcodeUrls[u.id]} alt="Barcode" style={{ width: '100%', height: 40, objectFit: 'contain' }} />}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                        {([
                            ['BARANG', u.item_name || po.item_name || ''],
                            ['KODE', u.item_code || po.item_code || ''],
                            ['WARNA', po.color_name || '—'],
                            ['ISI / QTY', `${Number(u.qty || 0).toLocaleString()} ${po.item_uom || ''}`],
                            ['NO. PACKING', po.code],
                            ['NO. SO', po.sales_order_code || '—'],
                            ['TANGGAL', created],
                        ] as [string, string][]).map(([k, v]) => (
                            <tr key={k}>
                                <td style={gridLbl}>{k}</td>
                                <td style={gridVal}>{v}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const xpBtnGrey: React.CSSProperties = isClassic
        ? { fontFamily: xpFont, fontSize: '11px', padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassic
        ? { fontFamily: xpFont, fontSize: '11px', padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};

    return (
        <>
            <PrintModalShell
                title={`Print Carton Labels — ${units.length} ${units.length === 1 ? 'carton' : 'cartons'} (${po.code})`}
                onClose={onClose}
                width="calc(var(--app-vw) * 90 / 100)"
                maxWidth={880}
                height="calc(var(--app-vh) * 88 / 100)"
                modeless
            >
                <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    {units.length === 0 && (
                        <div style={{ color: '#555', fontSize: '12px', marginTop: '40px', fontFamily: xpFont }}>
                            No cartons packed yet. Log a packing event first.
                        </div>
                    )}
                    {units.map(u => (
                        <div key={u.id} className="bag-label-paper" style={{ background: '#fff', width: '378px', minHeight: '535px', padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                            {renderLabel(u)}
                        </div>
                    ))}
                </div>

                <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    {isClassic ? (
                        <>
                            <button style={xpBtnGrey} onClick={onClose}>Close</button>
                            <button style={{ ...xpBtnGreen, opacity: units.length ? 1 : 0.5 }} disabled={!units.length} onClick={doPrint}>Print</button>
                        </>
                    ) : (
                        <>
                            <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                            <button className="btn btn-sm btn-success" disabled={!units.length} onClick={doPrint}>
                                <i className="bi bi-printer me-1"></i>Print {units.length} {units.length === 1 ? 'Label' : 'Labels'}
                            </button>
                        </>
                    )}
                </div>
            </PrintModalShell>

            {createPortal(
                <div className="bag-label-print-portal" style={{ display: 'none' }}>
                    {units.map(u => renderLabel(u))}
                </div>,
                document.body
            )}
        </>
    );
}
