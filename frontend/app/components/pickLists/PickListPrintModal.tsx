'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useTimezone } from '../../context/TimezoneContext';
import PrintModalShell from '../shared/PrintModalShell';
import { xpFont } from '../shared/xpTheme';

/**
 * Pick list shop card — the floor document for a pick list, sibling of the
 * Kartu Packing and in the same spirit as the Kartu Kerja.
 *
 * The QR encodes the pick list CODE (PL-…), which the picker scans at /scanner
 * to open the list. Carton QRs are already printed on the A6 labels
 * from PackedUnitLabelPrintModal — this card lists them as a paper checklist so
 * the pick can still be walked when a phone is flat, and keyed afterwards.
 *
 * Deliberately not the Surat Jalan: that is the delivery note, printed at
 * dispatch, after picking, and carries no QR.
 */
export default function PickListPrintModal({ pl, companyProfile, onClose }: any) {
    const { formatCustom: tzFmt } = useTimezone();
    const [qrUrl, setQrUrl] = useState('');

    useEffect(() => {
        document.body.classList.add('so-print-preview-active');
        return () => { document.body.classList.remove('so-print-preview-active'); };
    }, []);

    useEffect(() => {
        QRCode.toDataURL(pl.code, { margin: 4, width: 260, errorCorrectionLevel: 'H' })
            .then(setQrUrl)
            .catch(() => setQrUrl(''));
    }, [pl.code]);

    const doPrint = () => {
        window.addEventListener('afterprint', onClose, { once: true });
        window.print();
    };

    const fmt = (d: any) => { if (!d) return ''; try { return tzFmt(d, { day: '2-digit', month: '2-digit', year: 'numeric' }, 'en-GB').replace(/\//g, '.'); } catch { return ''; } };
    const n = (v: any) => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };

    const border = '1px solid #555';
    const cell: React.CSSProperties = { border, padding: '3px 5px', verticalAlign: 'top' };
    const hCell: React.CSSProperties = { ...cell, background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center' };
    const gridLbl: React.CSSProperties = { fontWeight: 'bold', paddingRight: 6, whiteSpace: 'nowrap', verticalAlign: 'top' };

    const lines: any[] = pl.lines || [];
    const cartons = lines.filter((l: any) => l.batch_id);

    // What actually ships, per item — the same roll-up the desktop expand panel
    // shows, so the card and the screen never disagree on the shipping total.
    const byItem: Record<string, { code: string; name: string; qty: number; cartons: number; uom: string }> = {};
    for (const l of lines) {
        const key = String(l.item_id);
        const row = byItem[key] || (byItem[key] = {
            code: l.item_code || key, name: l.item_name || '', qty: 0, cartons: 0, uom: l.item_uom || '',
        });
        row.qty += n(l.qty_picked);
        if (l.batch_id) row.cartons += 1;
    }
    const itemRows = Object.values(byItem);

    const doc = (
        <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', color: '#000', lineHeight: 1.45 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #000' }}>
                <div>
                    <div style={{ fontWeight: 'bold', fontSize: 12 }}>{companyProfile?.name || 'PT. BOLA INTAN ELASTIC'}</div>
                    <div style={{ fontSize: 15, fontWeight: 'bold', fontFamily: 'Georgia, serif', marginTop: 2 }}>KARTU PICKING</div>
                    <div style={{ fontSize: 9, color: '#555' }}>Pick List Card</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    {qrUrl && <img src={qrUrl} alt="QR" style={{ width: 96, height: 96 }} />}
                    <div style={{ fontWeight: 'bold', fontSize: 12, letterSpacing: 1 }}>{pl.code}</div>
                </div>
            </div>

            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 10 }}>
                <tbody>
                    {([
                        ['No. SO', pl.sales_order_code || '—'],
                        ['Pelanggan / Customer', pl.customer_name || '—'],
                        ['Jml koli / Cartons', String(cartons.length)],
                        ['Tgl kirim / Delivery date', fmt(pl.delivery_date) || '—'],
                        ['Ekspedisi / Carrier', pl.carrier || '—'],
                        ['No. Polisi / Vehicle', pl.vehicle_plate || '—'],
                        ['Sopir / Driver', pl.driver || '—'],
                    ] as [string, string][]).map(([k, v]) => (
                        <tr key={k}>
                            <td style={gridLbl}>{k}</td>
                            <td>: {v}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {itemRows.length > 0 && (
                <>
                    <div style={{ fontWeight: 'bold', marginBottom: 3 }}>Ringkasan Kirim / Shipping Summary:</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                        <thead>
                            <tr>
                                <th style={{ ...hCell, width: '8%' }}>No</th>
                                <th style={{ ...hCell, width: '56%', textAlign: 'left' }}>Barang / Item</th>
                                <th style={{ ...hCell, width: '18%' }}>Koli</th>
                                <th style={{ ...hCell, width: '18%' }}>Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemRows.map((r, i) => (
                                <tr key={r.code}>
                                    <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                                    <td style={cell}>{r.name} <span style={{ color: '#777' }}>{r.code}</span></td>
                                    <td style={{ ...cell, textAlign: 'right' }}>{r.cartons}</td>
                                    <td style={{ ...cell, textAlign: 'right' }}>{r.qty.toLocaleString()} {r.uom}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Paper fallback for the scan loop: the picker ticks boxes here when a
                phone is unavailable, then keys the list from the desktop. */}
            <div style={{ fontWeight: 'bold', marginBottom: 3 }}>Daftar Koli / Carton Checklist:</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                <thead>
                    <tr>
                        <th style={{ ...hCell, width: '8%' }}>No</th>
                        <th style={{ ...hCell, width: '34%', textAlign: 'left' }}>No. Koli / Carton</th>
                        <th style={{ ...hCell, width: '30%', textAlign: 'left' }}>Barang / Item</th>
                        <th style={{ ...hCell, width: '18%' }}>Qty</th>
                        <th style={{ ...hCell, width: '10%' }}>✓</th>
                    </tr>
                </thead>
                <tbody>
                    {cartons.length === 0 ? (
                        <tr><td style={{ ...cell, textAlign: 'center' }} colSpan={5}>Belum ada koli / no cartons allocated</td></tr>
                    ) : cartons.map((l: any, i: number) => (
                        <tr key={l.id}>
                            <td style={{ ...cell, textAlign: 'center' }}>{l.package_no ?? i + 1}</td>
                            <td style={{ ...cell, fontFamily: 'Consolas, monospace' }}>{l.batch_number || '—'}</td>
                            <td style={cell}>{l.item_code || '—'}</td>
                            <td style={{ ...cell, textAlign: 'right' }}>{n(l.qty_picked).toLocaleString()} {l.item_uom || ''}</td>
                            <td style={{ ...cell, height: 18 }} />
                        </tr>
                    ))}
                </tbody>
            </table>

            {pl.notes && <div style={{ marginBottom: 8 }}><strong>Catatan / Notes:</strong> {pl.notes}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, textAlign: 'center' }}>
                {['Dibuat oleh / Issued by', 'Picker', 'QC / Checked by'].map((role, i) => (
                    <div key={i} style={{ width: '30%' }}>
                        <div>{role}</div>
                        <div style={{ height: 40 }} />
                        <div style={{ borderTop: '1px solid #000', paddingTop: 2 }}>(________________)</div>
                    </div>
                ))}
            </div>
        </div>
    );

    const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: xpFont, fontSize: 11, padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom,#ffffff 0%,#d4d0c8 100%)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 3, ...extra });
    const btnGreen = xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold' });

    return (
        <>
            <PrintModalShell title={`Kartu Picking — ${pl.code}`} onClose={onClose} width="calc(var(--app-vw) * 92 / 100)" maxWidth={900} height="calc(var(--app-vh) * 90 / 100)" modeless>
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
