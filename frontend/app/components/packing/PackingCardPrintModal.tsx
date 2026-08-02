'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useTimezone } from '../../context/TimezoneContext';
import PrintModalShell from '../shared/PrintModalShell';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

/**
 * Packing order shop card — the floor document for a packing order, in the same
 * spirit as the Kartu Kerja: header facts, a materials checklist, and a QR the
 * packer scans to log cartons.
 *
 * The QR encodes the packing order CODE (PCK-…), not the carton — a carton does
 * not exist until the packer logs it. Carton QRs live on the A6 labels printed
 * by PackedUnitLabelPrintModal.
 */
export default function PackingCardPrintModal({ po, attributes, companyProfile, authFetch, onClose }: any) {
    const { formatCustom: tzFmt } = useTimezone();
    const [qrUrl, setQrUrl] = useState('');

    useEffect(() => {
        document.body.classList.add('so-print-preview-active');
        return () => { document.body.classList.remove('so-print-preview-active'); };
    }, []);

    useEffect(() => {
        QRCode.toDataURL(po.code, { margin: 4, width: 260, errorCorrectionLevel: 'H' })
            .then(setQrUrl)
            .catch(() => setQrUrl(''));
    }, [po.code]);

    const doPrint = () => {
        // Stamp card_printed_at so the list can flag orders whose card was never
        // issued to the floor. Fire-and-forget: a failed stamp must not block print.
        try { authFetch?.(`${API_BASE}/packing/${po.id}/card-printed`, { method: 'POST' }).catch(() => {}); } catch { /* noop */ }
        window.addEventListener('afterprint', onClose, { once: true });
        window.print();
    };

    const attrName = (vid: string) => {
        for (const attr of (attributes || [])) { const v = attr.values?.find((x: any) => x.id === vid); if (v) return v.value; }
        return '';
    };
    const fmt = (d: any) => { if (!d) return ''; try { return tzFmt(d, { day: '2-digit', month: '2-digit', year: 'numeric' }, 'en-GB').replace(/\//g, '.'); } catch { return ''; } };

    const border = '1px solid #555';
    const cell: React.CSSProperties = { border, padding: '3px 5px', verticalAlign: 'top' };
    const hCell: React.CSSProperties = { ...cell, background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center' };
    const gridLbl: React.CSSProperties = { fontWeight: 'bold', paddingRight: 6, whiteSpace: 'nowrap', verticalAlign: 'top' };

    const doc = (
        <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: '#000', lineHeight: 1.45 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #000' }}>
                <div>
                    <div style={{ fontWeight: 'bold', fontSize: 12 }}>{companyProfile?.name || 'PT. BOLA INTAN ELASTIC'}</div>
                    <div style={{ fontSize: 15, fontWeight: 'bold', fontFamily: 'Georgia, serif', marginTop: 2 }}>KARTU PACKING</div>
                    <div style={{ fontSize: 9, color: '#555' }}>Packing Order Card</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    {qrUrl && <img src={qrUrl} alt="QR" style={{ width: 96, height: 96 }} />}
                    <div style={{ fontWeight: 'bold', fontSize: 12, letterSpacing: 1 }}>{po.code}</div>
                </div>
            </div>

            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 10 }}>
                <tbody>
                    {([
                        ['Barang / Item', `${po.item_name || ''} (${po.item_code || ''})`],
                        ['Warna / Colour', po.color_name || '—'],
                        ['Varian', (po.attribute_value_ids || []).map(attrName).filter(Boolean).join(', ') || '—'],
                        ['Target', `${Number(po.qty_target || 0).toLocaleString()} ${po.item_uom || ''}`],
                        ['Isi per koli', po.pack_size ? `${Number(po.pack_size).toLocaleString()} ${po.item_uom || ''}` : '—'],
                        ['Jenis kemasan', po.package_label || 'Carton'],
                        ['No. SO', po.sales_order_code || '— (pack to stock)'],
                        ['Pelanggan', po.customer_name || '—'],
                        ['Target selesai', fmt(po.target_end_date) || '—'],
                    ] as [string, string][]).map(([k, v]) => (
                        <tr key={k}>
                            <td style={gridLbl}>{k}</td>
                            <td>: {v}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {(po.materials || []).length > 0 && (
                <>
                    <div style={{ fontWeight: 'bold', marginBottom: 3 }}>Bahan Kemasan / Packaging Materials:</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                        <thead>
                            <tr>
                                <th style={{ ...hCell, width: '8%' }}>No</th>
                                <th style={{ ...hCell, width: '52%', textAlign: 'left' }}>Bahan / Material</th>
                                <th style={{ ...hCell, width: '20%' }}>Rencana</th>
                                <th style={{ ...hCell, width: '20%' }}>Dipakai</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(po.materials || []).map((m: any, i: number) => (
                                <tr key={m.id || i}>
                                    <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                                    <td style={cell}>{m.item_name || m.item_id} <span style={{ color: '#777' }}>{m.item_code}</span></td>
                                    <td style={{ ...cell, textAlign: 'right' }}>{Number(m.qty_planned || 0).toLocaleString()} {m.item_uom}</td>
                                    <td style={cell} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Blank tally grid the packer fills in by hand, then keys against the QR */}
            <div style={{ fontWeight: 'bold', marginBottom: 3 }}>Catatan Packing / Packing Log:</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                <thead>
                    <tr>
                        <th style={{ ...hCell, width: '20%' }}>Tanggal</th>
                        <th style={{ ...hCell, width: '20%' }}>Qty</th>
                        <th style={{ ...hCell, width: '20%' }}>Jml Koli</th>
                        <th style={{ ...hCell, width: '20%' }}>Lot Asal</th>
                        <th style={{ ...hCell, width: '20%' }}>Operator</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                            {Array.from({ length: 5 }).map((__, j) => <td key={j} style={{ ...cell, height: 18 }} />)}
                        </tr>
                    ))}
                </tbody>
            </table>

            {po.notes && <div style={{ marginBottom: 8 }}><strong>Catatan / Notes:</strong> {po.notes}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, textAlign: 'center' }}>
                {['Dibuat oleh / Issued by', 'Packer', 'Diperiksa / Checked by'].map((role, i) => (
                    <div key={i} style={{ width: '30%' }}>
                        <div>{role}</div>
                        <div style={{ height: 40 }} />
                        <div style={{ borderTop: '1px solid #000', paddingTop: 2 }}>(________________)</div>
                    </div>
                ))}
            </div>
        </div>
    );

    const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: 'Tahoma, "Segoe UI", sans-serif', fontSize: 11, padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom,#ffffff 0%,#d4d0c8 100%)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 0, ...extra });
    const btnGreen = xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold' });

    return (
        <>
            <PrintModalShell title={`Kartu Packing — ${po.code}`} onClose={onClose} width="92vw" maxWidth={900} height="90vh" modeless>
                <div style={{ flex: 1, background: '#808080', overflowY: 'auto', padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                    <div className="so-print-paper" style={{ background: '#fff', width: '100%', maxWidth: 680, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
                        {doc}
                    </div>
                </div>
                <div style={{ padding: '8px 12px', borderTop: '1px solid #b0a898', background: 'linear-gradient(to bottom,#f4f2ea,#e3e1d6)', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button style={xpBtn()} onClick={onClose}>Close</button>
                    <button style={btnGreen} onClick={doPrint}>Print</button>
                </div>
            </PrintModalShell>

            {createPortal(
                <div className="so-print-paper-portal" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                    <div className="so-print-paper" style={{ background: '#fff', width: '100%', padding: '20px 24px' }}>{doc}</div>
                </div>,
                document.body
            )}
        </>
    );
}
