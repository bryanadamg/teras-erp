'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../context/DataContext';
import { useTimezone } from '../../context/TimezoneContext';
import PrintModalShell from '../shared/PrintModalShell';
import { xpFont as font } from '../shared/xpTheme';
import { qtyFmt } from '../shared/format';


// Perincian spreads each group's cartons across fixed columns; a group with more
// cartons than this spills onto continuation rows rather than squeezing the grid.
const PERINCIAN_COLS = 8;

function SJDocument({ shp, lines, attributes, companyProfile, customerAddr, preparedBy, sjNoOverride }: any) {
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '');
    const { itemIndex } = useData();
    const { formatCustom: tzFmt } = useTimezone();

    const itemName = (id: string) => itemIndex?.[String(id)]?.name || id;
    const itemUOM = (id: string) => itemIndex?.[String(id)]?.uom || '';
    const attrName = (vid: string) => {
        for (const attr of attributes) { const v = attr.values?.find((x: any) => x.id === vid); if (v) return v.value; }
        return '';
    };
    const fmt = (d: any) => {
        if (!d) return '';
        try { return tzFmt(d, { day: '2-digit', month: 'short', year: 'numeric' }, 'en-GB').replace(/ /g, '-'); }
        catch { return ''; }
    };
    // Indonesian decimal comma, and no trailing ",0" on whole numbers (the
    // client's sheet reads "37" and "36,7" side by side).
    const num = qtyFmt(2, 'id-ID');

    // The client's Surat Jalan is one row per item+colour with a single total qty;
    // the per-carton breakdown lives in the Perincian band below. Our lines are
    // carton-grain, so collapse them here and keep each carton's qty for Perincian.
    // A shipment may carry several pick lists, so the customer PO is part of the
    // key — two orders for the same shade are two rows on the note, not one.
    const groups = React.useMemo(() => {
        const map = new Map<string, any>();
        for (const l of (lines || [])) {
            const name = l.item_name || itemName(l.item_id);
            const colorName = l.color_name
                || (l.attribute_value_ids || []).map((vid: string) => attrName(vid)).filter(Boolean).join(' / ');
            const key = `${l.item_id}|${colorName}|${l.color_code || ''}|${l.po_ref || ''}`;
            let g = map.get(key);
            if (!g) {
                g = {
                    key, itemName: name, colorName, colorCode: l.color_code || '',
                    poRef: l.po_ref || '',
                    uom: l.item_uom || itemUOM(l.item_id), qty: 0, cartons: [] as number[],
                };
                map.set(key, g);
            }
            const q = Number(l.qty_picked) || 0;
            g.qty += q;
            // Bulk ship lines carry no carton, so they add qty without a Dus tally.
            if (l.batch_number) g.cartons.push(q);
        }
        return Array.from(map.values());
    }, [lines, itemIndex, attributes]);

    const totalDus = groups.reduce((s, g) => s + g.cartons.length, 0);
    const warna = (g: any) => (g.colorCode ? `${g.colorName || ''} ( ${g.colorCode} )`.trim() : g.colorName || '');

    // Continuation rows for any group whose cartons overflow one grid row.
    const perincianRows = groups.flatMap((g: any) => {
        const chunks: number[][] = [];
        for (let i = 0; i < Math.max(1, g.cartons.length); i += PERINCIAN_COLS) {
            chunks.push(g.cartons.slice(i, i + PERINCIAN_COLS));
        }
        return chunks.map((c, ci) => ({ g, cartons: c, first: ci === 0 }));
    });

    const border = '1px solid #555';
    const cell: React.CSSProperties = { border, padding: '3px 5px', verticalAlign: 'top' };
    const hCell: React.CSSProperties = { ...cell, fontWeight: 'bold', textAlign: 'center' };
    const dotCell: React.CSSProperties = { borderBottom: '1px dotted #777', padding: '3px 5px', textAlign: 'center' };

    const customerName = shp.customer_name || '';
    const sjNo = (sjNoOverride || '').trim() || shp.delivery_note_number || shp.code;
    const tanggal = fmt(shp.delivery_date || shp.dispatched_at || shp.staged_at);

    const CompanyBlock = () => (
        <div style={{ display: 'flex', gap: 8 }}>
            {companyProfile?.logo_url
                ? <img src={`${API_BASE}${companyProfile.logo_url}`} alt="Logo" style={{ maxHeight: 34, maxWidth: 46, objectFit: 'contain' }} />
                : <div style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 10 }}>SJ</div>}
            <div style={{ fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5, alignSelf: 'center' }}>
                {(companyProfile?.name || 'PT. BOLA INTAN ELASTIC').toUpperCase()}
            </div>
        </div>
    );

    const KepadaBlock = () => (
        <div>
            <div>Kepada Yth :</div>
            <div style={{ fontWeight: 'bold', marginTop: 2 }}>{customerName}</div>
            <div style={{ whiteSpace: 'pre-line' }}>{customerAddr(customerName)}</div>
        </div>
    );

    // Four sign-off blocks, in the client's order.
    const SignRow = ({ showCompany }: { showCompany?: boolean }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, textAlign: 'left' }}>
            {['Tanda Terima dan Cap Perusahaan', 'Nama Supir', 'Gudang', 'Hormat Kami'].map((role, i) => (
                <div key={i} style={{ width: '24%' }}>
                    <div>{role}</div>
                    <div style={{ height: 40 }} />
                    {showCompany && i === 3 && (
                        <div style={{ fontWeight: 'bold' }}>{companyProfile?.name || 'PT. Bola Intan Elastic'}</div>
                    )}
                    {showCompany && i === 3 && preparedBy && <div>{preparedBy}</div>}
                </div>
            ))}
        </div>
    );

    return (
        <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', color: '#000', lineHeight: 1.45 }}>
            {/* ── Band A: SURAT JALAN (the legal delivery note) ───────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 'bold', letterSpacing: 2, marginBottom: 6 }}>SURAT JALAN</div>
                    <CompanyBlock />
                </div>
                <div style={{ width: '46%', paddingLeft: 12 }}>
                    <div style={{ marginBottom: 6 }}>No : <span style={{ fontWeight: 'bold' }}>{sjNo}</span></div>
                    <KepadaBlock />
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '9px' }}>
                    <tbody>
                        <tr><td style={{ paddingRight: 8 }}>Tanggal</td><td>: {tanggal}</td></tr>
                        <tr><td style={{ paddingRight: 8 }}>Kendaraan No.</td><td>: {shp.vehicle_plate || ''}</td></tr>
                        {shp.driver && <tr><td style={{ paddingRight: 8 }}>Supir</td><td>: {shp.driver}</td></tr>}
                    </tbody>
                </table>
                <div style={{ width: '46%', paddingLeft: 12 }}>Hal : 1</div>
            </div>

            <div style={{ margin: '6px 0 4px' }}>Bersama ini kami kirimkan barang-barang tersebut dibawah ini :</div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                <thead>
                    <tr>
                        <th style={{ ...hCell, width: '8%' }}>QTY</th>
                        <th style={{ ...hCell, width: '7%' }}>Unit</th>
                        <th style={{ ...hCell, width: '27%', textAlign: 'left' }}>NAMA BARANG</th>
                        <th style={{ ...hCell, width: '23%', textAlign: 'left' }}>WARNA</th>
                        <th style={{ ...hCell, width: '18%' }}>NO PO</th>
                        <th style={{ ...hCell, width: '17%' }}>NO REF</th>
                    </tr>
                </thead>
                <tbody>
                    {groups.length === 0 && <tr><td style={cell} colSpan={6}>&nbsp;</td></tr>}
                    {groups.map((g: any) => (
                        <tr key={g.key}>
                            <td style={{ ...cell, textAlign: 'right' }}>{num(g.qty)}</td>
                            <td style={{ ...cell, textAlign: 'center' }}>{g.uom}</td>
                            <td style={cell}>{g.itemName}</td>
                            <td style={cell}>{warna(g)}</td>
                            <td style={{ ...cell, textAlign: 'center' }}>{g.poRef}</td>
                            {/* NO REF is filled in by hand on receipt (over/short marks). */}
                            <td style={cell}>&nbsp;</td>
                        </tr>
                    ))}
                    {/* Breathing room so the receiver can annotate, as on the client's form. */}
                    {Array.from({ length: Math.max(0, 4 - groups.length) }).map((_, i) => (
                        <tr key={`pad-${i}`}><td style={cell} colSpan={6}>&nbsp;</td></tr>
                    ))}
                </tbody>
            </table>

            {shp.notes && <div style={{ marginTop: 6 }}>Catatan : {shp.notes}</div>}

            <SignRow showCompany />

            {/* ── Tear line ──────────────────────────────────────────────────── */}
            <div style={{ borderTop: '1px dashed #000', margin: '22px 0 14px' }} />

            {/* ── Band B: PERINCIAN (per-carton breakdown, same SJ number) ───── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 'bold', letterSpacing: 2, marginBottom: 6 }}>PERINCIAN</div>
                    <CompanyBlock />
                    <div style={{ marginTop: 4 }}>Tanggal : {tanggal}</div>
                </div>
                <div style={{ width: '46%', paddingLeft: 12 }}>
                    <div style={{ marginBottom: 6 }}>SJ No : <span style={{ fontWeight: 'bold' }}>{sjNo}</span></div>
                    <KepadaBlock />
                    <div style={{ marginTop: 4 }}>Hal : 1</div>
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginTop: 8 }}>
                <thead>
                    <tr>
                        <th style={{ ...hCell, textAlign: 'left' }}>Nama Barang :</th>
                        {Array.from({ length: PERINCIAN_COLS }).map((_, i) => (
                            <th key={i} style={{ ...hCell, width: `${44 / PERINCIAN_COLS}%` }}>&nbsp;</th>
                        ))}
                        <th style={{ ...hCell, width: '7%' }}>Dus</th>
                        <th style={{ ...hCell, width: '9%' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {perincianRows.length === 0 && <tr><td style={cell} colSpan={PERINCIAN_COLS + 3}>&nbsp;</td></tr>}
                    {perincianRows.map((r: any, i: number) => (
                        <tr key={i}>
                            <td style={cell}>
                                {r.first ? `${r.g.itemName}${r.g.colorName ? ` ${r.g.colorName}` : ''}` : ''}
                            </td>
                            {Array.from({ length: PERINCIAN_COLS }).map((_, c) => (
                                <td key={c} style={dotCell}>{r.cartons[c] != null ? num(r.cartons[c]) : ''}</td>
                            ))}
                            <td style={{ ...cell, textAlign: 'center' }}>{r.first ? (r.g.cartons.length || '') : ''}</td>
                            <td style={{ ...cell, textAlign: 'right' }}>{r.first ? num(r.g.qty) : ''}</td>
                        </tr>
                    ))}
                    {Array.from({ length: Math.max(0, 6 - perincianRows.length) }).map((_, i) => (
                        <tr key={`ppad-${i}`}>
                            <td style={cell}>&nbsp;</td>
                            {Array.from({ length: PERINCIAN_COLS }).map((_, c) => <td key={c} style={dotCell}>&nbsp;</td>)}
                            <td style={cell}>&nbsp;</td>
                            <td style={cell}>&nbsp;</td>
                        </tr>
                    ))}
                    <tr>
                        <td style={{ ...cell, border: 'none' }} colSpan={PERINCIAN_COLS} />
                        <td style={{ ...cell, fontWeight: 'bold', textAlign: 'right' }}>Total :</td>
                        <td style={{ ...cell, fontWeight: 'bold', textAlign: 'center' }}>{totalDus}</td>
                        <td style={{ ...cell, border: 'none' }} />
                    </tr>
                </tbody>
            </table>

            <SignRow showCompany />
        </div>
    );
}

export default function SuratJalanPrintModal({ shipment, attributes, companyProfile, customerAddr, onClose }: any) {
    const [preparedBy, setPreparedBy] = useState('');
    const [sjNo, setSjNo] = useState(shipment.delivery_note_number || shipment.code || '');

    // One flat carton list across every pick list on the shipment, each line
    // tagged with the customer PO it shipped against — the note's NO PO column.
    const lines = React.useMemo(
        () => (shipment.pick_lists || []).flatMap((pl: any) =>
            (pl.lines || []).map((l: any) => ({ ...l, po_ref: pl.customer_po_ref || pl.sales_order_code || '' }))),
        [shipment],
    );

    useEffect(() => {
        document.body.classList.add('so-print-preview-active');
        return () => { document.body.classList.remove('so-print-preview-active'); };
    }, []);

    const handlePrint = () => {
        const h = () => onClose();
        window.addEventListener('afterprint', h, { once: true });
        window.print();
    };

    const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontFamily: font, fontSize: 11, padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom,#ffffff 0%,#d4d0c8 100%)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 3, ...extra });
    const btnGreen = xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold' });
    const xpInput: React.CSSProperties = { fontFamily: font, fontSize: 11, border: '1px solid #7f9db9', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px', background: '#fff', color: '#000', height: 20, width: '100%', boxSizing: 'border-box', outline: 'none' };

    const doc = <SJDocument shp={shipment} lines={lines} attributes={attributes} companyProfile={companyProfile} customerAddr={customerAddr} preparedBy={preparedBy} sjNoOverride={sjNo} />;

    return (
        <>
            <PrintModalShell
                title={`Surat Jalan — ${(sjNo || '').trim() || shipment.delivery_note_number || shipment.code}`}
                onClose={onClose}
                width="calc(var(--app-vw) * 92 / 100)"
                maxWidth={900}
                height="calc(var(--app-vh) * 90 / 100)"
                modeless
            >
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div style={{ width: 200, borderRight: '1px solid #b0a898', background: '#f4f3ee', padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: '#111', marginBottom: 6 }}>Surat Jalan No</div>
                        <input style={xpInput} value={sjNo} onChange={e => setSjNo(e.target.value)} placeholder="No" />
                        <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: '#111', margin: '14px 0 6px' }}>Prepared By</div>
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
