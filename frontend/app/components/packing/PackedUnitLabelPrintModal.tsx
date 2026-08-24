'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import PrintModalShell, { PrintModalFooter } from '../shared/PrintModalShell';
import { xpFont, PRINT_FONT } from '../shared/xpTheme';

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

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

/**
 * Carton label — one A6 sticker per PackedUnit, laid out to match the customer-
 * facing BIE sticker: a headline of style + colour, then a CONTENT / PO. NO /
 * LOT. NO / N.W. grid with a Code 128 barcode against every line so the
 * customer's goods-in can scan any field directly off the box.
 *
 * The PU- QR is kept (small, bottom-right) because that is what our own picker
 * scans onto a pick list — the barcodes are for the receiving end, the QR for us.
 *
 * Field sources, none of them re-entered on this screen:
 *   CONTENT  carton qty ÷ SO line `uom2_factor` = pieces, in `uom2`, with the
 *            base qty in brackets; `ket_stock` rides underneath.
 *   PO. NO   the customer's own `customer_po_ref`, our SO number under it.
 *   LOT. NO  the source lot this carton was packed from (via its completion).
 *   N W      `Batch.weight_kg` — the packer's scale reading at pack time.
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

    const [qrUrls, setQrUrls] = useState<Record<string, string>>({});

    // Source lot per carton: the completion that minted it carries the lot it
    // drew from, so no extra field is needed on the carton itself.
    const lotByCompletion = useMemo(() => {
        const m: Record<string, string> = {};
        (po.completions || []).forEach((c: any) => {
            if (c.source_batch_number) m[String(c.id)] = c.source_batch_number;
        });
        return m;
    }, [po.completions]);

    const lotOf = (u: any) => lotByCompletion[String(u.packing_completion_id || '')] || '';

    // Pieces in a carton, from the ordered alt unit (e.g. 600 yd ÷ 50 yd/pc = 12 Pic).
    // No alt unit on the line -> the CONTENT line prints base qty only.
    const factor = Number(po.uom2_factor) || 0;
    const piecesOf = (u: any) => (factor > 0 ? Number(u.qty || 0) / factor : null);

    // One barcode per printed field, keyed by carton. Built once per unit list —
    // JsBarcode renders to a canvas, which is far too slow to redo on every paint.
    const barcodeUrls = useMemo(() => {
        const map: Record<string, Record<string, string>> = {};
        units.forEach(u => {
            const pcs = factor > 0 ? Number(u.qty || 0) / factor : null;
            map[u.id] = {
                unit: makeBarcodeDataUrl(u.batch_number || String(u.id)),
                content: makeBarcodeDataUrl(
                    pcs !== null ? `${pcs.toFixed(1)}` : String(Number(u.qty || 0).toFixed(2))
                ),
                po: makeBarcodeDataUrl(po.customer_po_ref || po.sales_order_code || ''),
                lot: makeBarcodeDataUrl(lotByCompletion[String(u.packing_completion_id || '')] || ''),
                nw: makeBarcodeDataUrl(u.weight_kg != null ? String(u.weight_kg) : ''),
            };
        });
        return map;
    }, [units, factor, po.customer_po_ref, po.sales_order_code, lotByCompletion]);

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

    const cell: React.CSSProperties = { border: '1px solid #000', padding: '4px 6px', verticalAlign: 'middle' };
    const lblCell: React.CSSProperties = { ...cell, fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5, whiteSpace: 'nowrap', width: 74 };
    const valCell: React.CSSProperties = { ...cell, fontSize: 13, fontWeight: 'bold' };
    const barCell: React.CSSProperties = { ...cell, width: 96, padding: '2px 4px' };

    const renderLabel = (u: any) => {
        const bc = barcodeUrls[u.id] || {};
        const pcs = piecesOf(u);
        const qty = Number(u.qty || 0);
        // "12.0 Pic ( 600 Yard )" — pieces lead because that is what the receiving
        // side counts; the base qty stays in brackets as the measured amount.
        const content = pcs !== null
            ? `${pcs.toFixed(1)}  ${po.uom2 || 'Pcs'}   ( ${qty.toLocaleString()}  ${po.item_uom || ''} )`
            : `${qty.toLocaleString()}  ${po.item_uom || ''}`;
        const barRow = (src?: string) => (
            <td style={barCell}>
                {src ? <img src={src} alt="" style={{ width: '100%', height: 26, objectFit: 'fill', display: 'block' }} /> : null}
            </td>
        );

        return (
            <div key={u.id} className="bag-label-card" style={{ background: '#fff', color: '#000', fontFamily: PRINT_FONT, display: 'flex', flexDirection: 'column' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <tbody>
                        {/* Headline: house mark + style/colour, with the carton's own
                            PU- number barcoded beside it. */}
                        <tr>
                            <td style={{ ...cell, width: 74, textAlign: 'center' }}>
                                {companyProfile?.logo_url
                                    ? <img src={`${API_BASE}${companyProfile.logo_url}`} alt="" style={{ maxHeight: 30, maxWidth: 60, objectFit: 'contain' }} />
                                    : <div style={{ fontSize: 16, fontWeight: 'bold', letterSpacing: 2 }}>BIE</div>}
                            </td>
                            <td style={{ ...cell, padding: '4px 8px' }}>
                                <div style={{ fontSize: 19, fontWeight: 'bold', lineHeight: 1.1, letterSpacing: 0.5 }}>
                                    {[u.item_code || po.item_code, po.color_name].filter(Boolean).join(' ') || u.item_name || po.item_name || ''}
                                </div>
                                <div style={{ fontSize: 10, marginTop: 2, letterSpacing: 0.5 }}>~{u.batch_number}</div>
                            </td>
                            {barRow(bc.unit)}
                        </tr>

                        <tr>
                            <td style={lblCell}>CONTENT</td>
                            <td style={valCell}>
                                {content}
                                {po.ket_stock && <div style={{ fontSize: 10, fontWeight: 'normal', marginTop: 1 }}>{po.ket_stock}</div>}
                            </td>
                            {barRow(bc.content)}
                        </tr>

                        <tr>
                            <td style={lblCell}>PO. NO</td>
                            <td style={valCell}>
                                {po.customer_po_ref || po.sales_order_code || '—'}
                                {/* Our own SO number stays under the customer's reference:
                                    the customer reads the top line, we reconcile on the bottom. */}
                                {po.customer_po_ref && po.sales_order_code && (
                                    <div style={{ fontSize: 9, fontWeight: 'normal', color: '#333', marginTop: 1 }}>{po.sales_order_code}</div>
                                )}
                            </td>
                            {barRow(bc.po)}
                        </tr>

                        <tr>
                            <td style={lblCell}>LOT. NO</td>
                            <td style={valCell}>{lotOf(u) || '—'}</td>
                            {barRow(bc.lot)}
                        </tr>

                        <tr>
                            <td style={lblCell}>N W</td>
                            <td style={valCell}>
                                {u.weight_kg != null
                                    ? `${Number(u.weight_kg).toFixed(2)}  KG`
                                    : <span style={{ fontWeight: 'normal', color: '#666' }}>__________ KG</span>}
                            </td>
                            {barRow(bc.nw)}
                        </tr>
                    </tbody>
                </table>

                {/* Our handle, not the customer's: the picker scans this onto a pick
                    list. Small and out of the way of the barcode column. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 }}>
                    <div style={{ fontSize: 9, color: '#333' }}>
                        <div>{companyProfile?.name || 'PT. BOLA INTAN ELASTIC'}</div>
                        <div>{po.code} · {(po.package_label || 'Carton').toUpperCase()} #{u.package_no ?? '—'}</div>
                        <div>{u.created_at ? tzFmt(u.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' }, 'id-ID') : ''}</div>
                    </div>
                    {qrUrls[u.id] && <img src={qrUrls[u.id]} alt="QR" style={{ width: 72, height: 72 }} />}
                </div>
            </div>
        );
    };

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

                <PrintModalFooter onClose={onClose} onPrint={doPrint} printDisabled={!units.length} />
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
