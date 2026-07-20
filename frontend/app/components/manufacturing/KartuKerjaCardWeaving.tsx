'use client';
import React from 'react';
import type { KartuKerjaSettings } from './KartuKerjaCardBeaming';
import { useTimezone } from '../../context/TimezoneContext';

/**
 * Kartu Kerja (WO step card) body for WEAVING work centers — modeled on the
 * factory's existing paper "kartu tenun" (SPK/Artikel/Warna/Lebar/Simpan-di-Rak
 * fields, Operator + Kantong/Berat tally filled by hand). Selected by
 * ./KartuKerjaCard.
 */
export default function KartuKerjaCardWeaving({
    workOrder,
    parentMO,
    qrDataUrl,
    settings,
    companyName,
    attributes = [],
}: {
    workOrder: any;
    parentMO: any;
    qrDataUrl: string;
    settings: KartuKerjaSettings;
    companyName?: string;
    attributes?: any[];
}) {
    const { formatCustom: tzFmt } = useTimezone();
    const woQty = workOrder.qty ?? 0;
    const woEnds = workOrder.ends ?? null;
    const displayCompany = companyName || '';
    const bom = parentMO?.bom;

    // WARNA — resolve the system Colors attribute value carried by the MO.
    const colorAttr = (attributes || []).find((a: any) => (a.system_role || '').toLowerCase() === 'color');
    const moValueIds: string[] = parentMO?.attribute_value_ids || [];
    const colorValue = colorAttr?.values?.find((v: any) => moValueIds.includes(v.id));
    const colorName = colorValue?.value || null;

    // LEBAR / TARIKAN — weaving measurement spec, carried on the BOM.
    const lebar = bom?.mesin_lebar;
    const tarikanSebelum = bom?.mesin_panjang_tarikan;
    const tarikanSesudah = bom?.celup_panjang_tarikan;

    const allBomLines: any[] = parentMO?.bom?.lines || [];
    const bomOps: any[] = parentMO?.bom?.operations || [];
    const woWcId = String(workOrder.work_center_id || '');
    const stepOpIds = new Set(
        bomOps.filter((op: any) => woWcId && String(op.work_center_id || '') === woWcId).map((op: any) => String(op.id))
    );
    const stepLines = allBomLines.filter((l: any) => l.bom_operation_id && stepOpIds.has(String(l.bom_operation_id)));
    const usedAllLines = stepLines.length === 0;
    const bomLines = usedAllLines ? allBomLines : stepLines;

    const actualByItem: Record<string, number> = {};
    (parentMO?.completions || [])
        .filter((c: any) => String(c.work_order_id || '') === String(workOrder.id))
        .forEach((c: any) => (c.actual_items || []).forEach((ai: any) => {
            const k = String(ai.item_id);
            actualByItem[k] = (actualByItem[k] || 0) + Number(ai.qty_used || 0);
        }));

    const gridLbl: React.CSSProperties = { background: '#f0f0f0', border: '1px solid #bbb', padding: '3px 6px', fontSize: '9px', color: '#333', fontWeight: 'bold', whiteSpace: 'nowrap' };
    const gridVal: React.CSSProperties = { border: '1px solid #bbb', padding: '3px 6px', fontSize: '11px', color: '#000' };
    const heroLbl: React.CSSProperties = { fontSize: '8px', color: '#555', fontWeight: 'bold', letterSpacing: '0.5px' };

    return (
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', lineHeight: 1.3, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '5px', marginBottom: '6px', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}>{workOrder.code || parentMO?.code || '—'}</div>
                    {displayCompany && <div style={{ fontSize: '8px', color: '#555', fontWeight: 'bold' }}>{displayCompany}</div>}
                    <div style={{ fontSize: '8px', color: '#666' }}>
                        {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {settings.headerDepartment ? ` · ${settings.headerDepartment}` : ''}
                    </div>
                </div>
                <div style={{ border: '2px solid #000', padding: '4px', flexShrink: 0, textAlign: 'center' }}>
                    {qrDataUrl
                        ? <img src={qrDataUrl} alt="QR" style={{ width: '140px', height: '140px', display: 'block', imageRendering: 'pixelated' }} />
                        : <div style={{ width: '140px', height: '140px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#888' }}>...</div>
                    }
                    <div style={{ fontSize: '6px', color: '#555', marginTop: '1px' }}>Scan in ERP Scanner</div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', border: '2px solid #000', padding: '4px 8px', marginBottom: '6px' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={heroLbl}>TENUN / WEAVING</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', lineHeight: 1.05, wordBreak: 'break-word' }}>{workOrder.name}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={heroLbl}>NO. MESIN</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{workOrder.work_center_name || '—'}</div>
                    <div style={{ fontSize: '9px', color: '#555' }}>Step {workOrder.sequence}</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <div style={{ flex: 1, border: '1px solid #999', padding: '3px 8px' }}>
                    <div style={heroLbl}>QTY (KG)</div>
                    <div style={{ fontSize: '17px', fontWeight: 'bold' }}>
                        {woQty > 0 ? woQty : '—'}<span style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{woQty > 0 ? ' kg' : ''}</span>
                    </div>
                </div>
                <div style={{ flex: 1, border: '1px solid #999', padding: '3px 8px' }}>
                    <div style={heroLbl}>WARP ENDS</div>
                    <div style={{ fontSize: '17px', fontWeight: 'bold' }}>
                        {woEnds != null ? woEnds : '—'}<span style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{woEnds != null ? ' utas' : ''}</span>
                    </div>
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
                <tbody>
                    <tr>
                        <td style={{ ...gridLbl, width: '24%' }}>Artikel</td>
                        <td colSpan={3} style={{ ...gridVal, fontWeight: 'bold' }}>{parentMO?.item_name || workOrder.item_name || '—'}</td>
                    </tr>
                    <tr>
                        <td style={{ ...gridLbl, width: '24%' }}>Warna</td>
                        <td style={{ ...gridVal, width: '26%' }}>{colorName || '—'}</td>
                        <td style={{ ...gridLbl, width: '22%' }}>Lebar</td>
                        <td style={gridVal}>{lebar != null ? `${lebar} cm` : '—'}</td>
                    </tr>
                    {(tarikanSebelum != null || tarikanSesudah != null) && (
                        <tr>
                            <td style={gridLbl}>Tarikan Sblm Celup/Setting</td>
                            <td style={gridVal}>{tarikanSebelum != null ? tarikanSebelum : '—'}</td>
                            <td style={gridLbl}>Tarikan Ssdh Celup/Setting</td>
                            <td style={gridVal}>{tarikanSesudah != null ? tarikanSesudah : '—'}</td>
                        </tr>
                    )}
                    <tr>
                        <td style={{ ...gridLbl, width: '24%' }}>Status</td>
                        <td style={{ ...gridVal, width: '26%' }}>{workOrder.status}</td>
                        <td style={{ ...gridLbl, width: '22%' }}>Target Selesai</td>
                        <td style={gridVal}>{workOrder.target_end_date ? tzFmt(workOrder.target_end_date, { day: '2-digit', month: '2-digit', year: '2-digit' }, 'id-ID') : '—'}</td>
                    </tr>
                    {(workOrder.next_destination_work_center_name || workOrder.next_destination_location_name) && (
                        <tr>
                            <td style={gridLbl}>Tujuan</td>
                            <td colSpan={3} style={{ ...gridVal, fontWeight: 'bold' }}>
                                {[workOrder.next_destination_work_center_name, workOrder.next_destination_location_name].filter(Boolean).join(' — ')}
                            </td>
                        </tr>
                    )}
                    {parentMO?.planned_putaway_location_name && (
                        <tr>
                            <td style={gridLbl}>Simpan di Rak</td>
                            <td colSpan={3} style={{ ...gridVal, fontWeight: 'bold' }}>
                                {parentMO.planned_putaway_location_name}
                            </td>
                        </tr>
                    )}
                    <tr>
                        <td style={gridLbl}>Operator</td>
                        <td colSpan={3} style={{ ...gridVal, borderBottom: '1px solid #000' }}>&nbsp;</td>
                    </tr>
                </tbody>
            </table>

            <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>Jumlah Kantong/Box &amp; Berat</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                    <thead>
                        <tr style={{ background: '#f0f0f0' }}>
                            <th style={{ border: '1px solid #bbb', padding: '2px 5px', width: '14%' }}>No.</th>
                            <th style={{ border: '1px solid #bbb', padding: '2px 5px' }}>Berat (kg)</th>
                            <th style={{ border: '1px solid #bbb', padding: '2px 5px', width: '14%' }}>No.</th>
                            <th style={{ border: '1px solid #bbb', padding: '2px 5px' }}>Berat (kg)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[1, 2, 3].map(row => (
                            <tr key={row}>
                                <td style={{ border: '1px solid #bbb', padding: '3px 5px', textAlign: 'center', color: '#888' }}>{row * 2 - 1}</td>
                                <td style={{ border: '1px solid #bbb', padding: '3px 5px' }}>&nbsp;</td>
                                <td style={{ border: '1px solid #bbb', padding: '3px 5px', textAlign: 'center', color: '#888' }}>{row * 2}</td>
                                <td style={{ border: '1px solid #bbb', padding: '3px 5px' }}>&nbsp;</td>
                            </tr>
                        ))}
                        <tr>
                            <td style={{ border: '1px solid #bbb', padding: '3px 5px', fontWeight: 'bold', textAlign: 'right' }} colSpan={2}>Jumlah</td>
                            <td style={{ border: '1px solid #bbb', padding: '3px 5px', fontWeight: 'bold', textAlign: 'right' }}>Total</td>
                            <td style={{ border: '1px solid #bbb', padding: '3px 5px' }}>&nbsp;</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {settings.showMaterials && bomLines.length > 0 && (
                <>
                    <div style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.3px', marginBottom: '2px' }}>
                        {usedAllLines ? 'Material (berdasarkan BOM)' : 'Komponen Operasi Ini'}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginBottom: '6px' }}>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'left' }}>Komponen</th>
                                <th style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', width: '22%' }}>Perlu</th>
                                <th style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', width: '22%' }}>Aktual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bomLines.map((line: any) => {
                                const reqQty = woQty > 0
                                    ? (parseFloat(line.percentage) > 0 ? (woQty * parseFloat(line.percentage)) / 100 : woQty * parseFloat(line.qty || 0))
                                    : null;
                                const actual = actualByItem[String(line.item_id)];
                                return (
                                    <tr key={line.id}>
                                        <td style={{ border: '1px solid #bbb', padding: '2px 5px' }}>
                                            <span style={{ fontFamily: 'monospace', color: '#555', marginRight: '4px', fontSize: '8px' }}>
                                                {line.item_code || ''}
                                            </span>
                                            {line.item_name || line.item_id}
                                        </td>
                                        <td style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', fontWeight: 'bold' }}>
                                            {reqQty != null ? reqQty.toFixed(2) : '—'}
                                        </td>
                                        <td style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', fontWeight: actual != null ? 'bold' : 'normal' }}>
                                            {actual != null ? actual.toFixed(2) : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}

            <div style={{ flexGrow: 1, minHeight: '6px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #ccc', paddingTop: '6px' }}>
                <div style={{ fontSize: '6px', color: '#999', lineHeight: 1.3 }}>
                    {workOrder.code || `Step ${workOrder.sequence}`}<br />ID: {workOrder.id}
                </div>
                {settings.showSignature && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #000', height: '26px', width: '100px', marginBottom: '2px' }} />
                        <div style={{ fontSize: '8px', fontWeight: 'bold' }}>ACC TEKNISI</div>
                    </div>
                )}
            </div>
        </div>
    );
}
