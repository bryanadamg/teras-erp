'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../context/DataContext';

const font = 'Tahoma, "Segoe UI", sans-serif';

function SJDocument({ po, so, items, attributes, companyProfile, customerAddr, preparedBy }: any) {
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '');
    const { itemIndex } = useData();

    const itemName = (id: string) => items.find((i: any) => i.id === id)?.name || itemIndex?.[String(id)]?.name || id;
    const itemUOM = (id: string) => items.find((i: any) => i.id === id)?.uom || '';
    const attrName = (vid: string) => {
        for (const attr of attributes) { const v = attr.values?.find((x: any) => x.id === vid); if (v) return v.value; }
        return '';
    };
    const fmt = (d: any) => { if (!d) return ''; try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`; } catch { return ''; } };

    const lines: any[] = po.lines || [];
    // Resolve carton-content keys against whichever id shape the line carries
    const lineByPackingId: Record<string, any> = {};
    const lineBySolId: Record<string, any> = {};
    lines.forEach(l => { if (l.id) lineByPackingId[String(l.id)] = l; if (l.sales_order_line_id) lineBySolId[String(l.sales_order_line_id)] = l; });
    const contentLine = (ci: any) => lineByPackingId[String(ci.packing_line_id)] || lineBySolId[String(ci.sales_order_line_id)] || null;

    const border = '1px solid #555';
    const cell: React.CSSProperties = { border, padding: '3px 5px', verticalAlign: 'top' };
    const hCell: React.CSSProperties = { ...cell, background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center' };

    const customerName = po.customer_name || so?.customer_name || '';

    return (
        <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', color: '#000', lineHeight: 1.4 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, paddingBottom: 5, borderBottom: '2px solid #000' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    {companyProfile?.logo_url
                        ? <img src={`${API_BASE}${companyProfile.logo_url}`} alt="Logo" style={{ maxHeight: 52, maxWidth: 72, objectFit: 'contain' }} />
                        : <div style={{ width: 56, height: 44, border: '2px solid #003080', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#003080' }}>BIE</div>}
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: 11 }}>{companyProfile?.name || 'PT. BOLA INTAN ELASTIC'}</div>
                        {companyProfile?.address && <div>{companyProfile.address}</div>}
                        <div>
                            {companyProfile?.phone && <span>Telp: {companyProfile.phone}</span>}
                            {companyProfile?.phone && companyProfile?.fax && <span> - </span>}
                            {companyProfile?.fax && <span>Fax: {companyProfile.fax}</span>}
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 'bold', fontFamily: 'Georgia, serif' }}>SURAT JALAN</div>
                    <div style={{ fontSize: 9 }}>Delivery Note</div>
                </div>
            </div>

            {/* Info block */}
            <div style={{ display: 'flex', marginBottom: 6, paddingBottom: 5, borderBottom: border }}>
                <div style={{ flex: 1, paddingRight: 10 }}>
                    <div style={{ fontWeight: 'bold' }}>Kepada / To:</div>
                    <div style={{ fontWeight: 'bold', marginTop: 4 }}>{customerName}</div>
                    <div style={{ whiteSpace: 'pre-line' }}>{customerAddr(customerName)}</div>
                </div>
                <div style={{ width: '40%' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '9px' }}>
                        <tbody>
                            {([
                                ['No. Surat Jalan', po.delivery_note_number || po.code],
                                ['Tanggal / Date', fmt(po.delivery_date || po.dispatched_at)],
                                ['No. SO', po.sales_order_code || so?.po_number || ''],
                                ['Pengangkut / Carrier', po.carrier || ''],
                                ['No. Kendaraan', po.vehicle_plate || ''],
                                ['Sopir / Driver', po.driver || ''],
                            ] as [string, string][]).map(([k, v]) => (
                                <tr key={k}>
                                    <td style={{ fontWeight: 'bold', paddingRight: 4, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                                    <td style={{ verticalAlign: 'top' }}>: {v}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginBottom: 8 }}>
                <thead>
                    <tr>
                        <th style={{ ...hCell, width: '5%' }}>No</th>
                        <th style={{ ...hCell, width: '45%', textAlign: 'left' }}>Barang / Description</th>
                        <th style={{ ...hCell, width: '20%' }}>Lot</th>
                        <th style={{ ...hCell, width: '15%' }}>Qty</th>
                        <th style={{ ...hCell, width: '15%' }}>Sat / UoM</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.length === 0 && <tr><td style={cell} colSpan={5}>&nbsp;</td></tr>}
                    {lines.map((l, i) => (
                        <tr key={i}>
                            <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                            <td style={cell}>
                                <div style={{ fontWeight: 'bold' }}>{l.item_name || itemName(l.item_id)}</div>
                                {(l.attribute_value_ids || []).map((vid: string) => <div key={vid}>{attrName(vid)}</div>)}
                            </td>
                            <td style={{ ...cell, textAlign: 'center' }}>{l.batch_number || '-'}</td>
                            <td style={{ ...cell, textAlign: 'right' }}>{Number(l.qty_packed).toLocaleString()}</td>
                            <td style={{ ...cell, textAlign: 'center' }}>{l.item_uom || itemUOM(l.item_id)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Packing list */}
            {(po.packages || []).length > 0 && (
                <>
                    <div style={{ fontWeight: 'bold', marginBottom: 3 }}>Packing List:</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginBottom: 8 }}>
                        <thead>
                            <tr>
                                <th style={{ ...hCell, width: '10%' }}>Pkg</th>
                                <th style={{ ...hCell, width: '15%' }}>Type</th>
                                <th style={{ ...hCell, width: '15%' }}>Berat (kg)</th>
                                <th style={{ ...hCell, width: '60%', textAlign: 'left' }}>Isi / Contents</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(po.packages || []).map((p: any, i: number) => (
                                <tr key={i}>
                                    <td style={{ ...cell, textAlign: 'center' }}>{p.package_no}</td>
                                    <td style={{ ...cell, textAlign: 'center' }}>{p.label || 'Carton'}</td>
                                    <td style={{ ...cell, textAlign: 'right' }}>{p.weight_kg != null && p.weight_kg !== '' ? Number(p.weight_kg).toLocaleString() : '-'}</td>
                                    <td style={cell}>
                                        {(p.contents || []).map((ci: any, j: number) => {
                                            const cl = contentLine(ci);
                                            const nm = cl ? (cl.item_name || itemName(cl.item_id)) : '';
                                            const uom = cl ? (cl.item_uom || itemUOM(cl.item_id)) : '';
                                            return <div key={j}>{nm} — {Number(ci.qty).toLocaleString()} {uom}</div>;
                                        })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {po.notes && <div style={{ marginBottom: 8 }}><strong>Catatan / Notes:</strong> {po.notes}</div>}

            {/* Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, fontSize: '9px', textAlign: 'center' }}>
                {['Hormat Kami / Prepared by', 'Pengangkut / Driver', 'Penerima / Received by'].map((role, i) => (
                    <div key={i} style={{ width: '30%' }}>
                        <div>{role}</div>
                        <div style={{ height: 46 }} />
                        <div style={{ borderTop: '1px solid #000', paddingTop: 2 }}>
                            {i === 0 ? (preparedBy || '(________________)') : '(________________)'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SuratJalanPrintModal({ po, salesOrders, items, attributes, companyProfile, customerAddr, currentStyle, onClose }: any) {
    const so = (salesOrders || []).find((s: any) => String(s.id) === String(po.sales_order_id));
    const [preparedBy, setPreparedBy] = useState('');

    useEffect(() => {
        document.body.classList.add('so-print-preview-active');
        return () => { document.body.classList.remove('so-print-preview-active'); };
    }, []);

    const handlePrint = () => {
        const h = () => onClose();
        window.addEventListener('afterprint', h, { once: true });
        window.print();
    };

    const btnGrey: React.CSSProperties = { fontFamily: font, fontSize: 11, padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer', color: '#000' };
    const btnGreen: React.CSSProperties = { fontFamily: font, fontSize: 11, padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' };

    const doc = <SJDocument po={po} so={so} items={items} attributes={attributes} companyProfile={companyProfile} customerAddr={customerAddr} preparedBy={preparedBy} />;

    return (
        <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
                <div style={{ background: '#fff', width: '92vw', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                    <div style={{ background: 'linear-gradient(to right,#0058e6,#08a5ff)', color: '#fff', fontFamily: font, fontWeight: 'bold', fontSize: 12, padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Surat Jalan — {po.code}</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 15, cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                    </div>
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        <div style={{ width: 200, borderRight: '1px solid #dee2e6', background: '#f8f9fa', padding: 14 }}>
                            <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: '#111', marginBottom: 6 }}>Prepared By</div>
                            <input style={{ width: '100%', fontSize: 11, padding: '3px 6px', border: '1px solid #ced4da', boxSizing: 'border-box' }} value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Name" />
                            <div style={{ fontSize: 10, color: '#555', marginTop: 14 }}>Paper size &amp; margins set in browser print dialog.</div>
                        </div>
                        <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                            <div className="so-print-paper" style={{ background: '#fff', width: '100%', maxWidth: 680, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
                                {doc}
                            </div>
                        </div>
                    </div>
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button style={btnGrey} onClick={onClose}>Close</button>
                        <button style={btnGreen} onClick={handlePrint}>Print</button>
                    </div>
                </div>
            </div>

            {createPortal(
                <div className="so-print-paper-portal" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                    <div className="so-print-paper" style={{ background: '#fff', width: '100%', padding: '20px 24px' }}>{doc}</div>
                </div>,
                document.body
            )}
        </>
    );
}
