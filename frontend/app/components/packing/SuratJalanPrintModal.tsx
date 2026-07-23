'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../context/DataContext';
import { useTimezone } from '../../context/TimezoneContext';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar } from '../shared/shellTheme';

const font = 'Tahoma, "Segoe UI", sans-serif';

function SJDocument({ po, so, attributes, companyProfile, customerAddr, preparedBy }: any) {
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '');
    const { itemIndex } = useData();
    const { formatCustom: tzFmt } = useTimezone();

    const itemName = (id: string) => itemIndex?.[String(id)]?.name || id;
    const itemUOM = (id: string) => itemIndex?.[String(id)]?.uom || '';
    const attrName = (vid: string) => {
        for (const attr of attributes) { const v = attr.values?.find((x: any) => x.id === vid); if (v) return v.value; }
        return '';
    };
    const fmt = (d: any) => { if (!d) return ''; try { return tzFmt(d, { day: '2-digit', month: '2-digit', year: 'numeric' }, 'en-GB').replace(/\//g, '.'); } catch { return ''; } };

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

export default function SuratJalanPrintModal({ po, attributes, companyProfile, customerAddr, currentStyle, onClose }: any) {
    // po already carries sales_order_code/customer_name denormalized server-side —
    // no need to hold the full salesOrders list in memory just to print one.
    const so = { po_number: po.sales_order_code, customer_name: po.customer_name };
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

    const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: font, fontSize: 11, padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom,#ffffff 0%,#d4d0c8 100%)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 0, ...extra });
    const btnGreen = xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold' });
    const xpBevel: React.CSSProperties = sharedXpBevel();
    const xpTitleBar: React.CSSProperties = sharedXpTitleBar();
    const xpInput: React.CSSProperties = { fontFamily: font, fontSize: 11, border: '1px solid #7f9db9', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px', background: '#fff', color: '#000', height: 20, width: '100%', boxSizing: 'border-box', outline: 'none' };

    const doc = <SJDocument po={po} so={so} attributes={attributes} companyProfile={companyProfile} customerAddr={customerAddr} preparedBy={preparedBy} />;

    return (
        <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
                <div style={{ ...xpBevel, width: '92vw', maxWidth: 900, height: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                    <div style={xpTitleBar}>
                        <span>Surat Jalan — {po.code}</span>
                        <button onClick={onClose} style={xpBtn({ padding: '0 6px', fontWeight: 'bold' })}>X</button>
                    </div>
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        <div style={{ width: 200, borderRight: '1px solid #b0a898', background: '#f4f3ee', padding: 14 }}>
                            <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: '#111', marginBottom: 6 }}>Prepared By</div>
                            <input style={xpInput} value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="Name" />
                            <div style={{ fontSize: 10, color: '#555', marginTop: 14 }}>Paper size &amp; margins set in browser print dialog.</div>
                        </div>
                        <div style={{ flex: 1, background: '#808080', overflowY: 'auto', padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                            <div className="so-print-paper" style={{ background: '#fff', width: '100%', maxWidth: 680, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
                                {doc}
                            </div>
                        </div>
                    </div>
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #b0a898', background: 'linear-gradient(to bottom,#f4f2ea,#e3e1d6)', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button style={xpBtn()} onClick={onClose}>Close</button>
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
