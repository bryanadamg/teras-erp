'use client';
import React from 'react';
import type { KartuKerjaSettings } from './KartuKerjaCardBeaming';

/**
 * Kartu Kerja (WO step card) body for DYEING work centers — placeholder pass,
 * layout/fields to be refined later. Selected by ./KartuKerjaCard.
 */
export default function KartuKerjaCardDyeing({
    workOrder,
    parentMO,
    qrDataUrl,
    settings,
    companyName,
}: {
    workOrder: any;
    parentMO: any;
    qrDataUrl: string;
    settings: KartuKerjaSettings;
    companyName?: string;
}) {
    const woQty = workOrder.qty ?? 0;
    const displayCompany = companyName || '';

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
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}>{parentMO?.code || workOrder.mo_code || '—'}</div>
                    {displayCompany && <div style={{ fontSize: '8px', color: '#555', fontWeight: 'bold' }}>{displayCompany}</div>}
                    <div style={{ fontSize: '8px', color: '#666' }}>
                        {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {settings.headerDepartment ? ` · ${settings.headerDepartment}` : ''}
                    </div>
                </div>
                <div style={{ border: '2px solid #000', padding: '2px', flexShrink: 0, textAlign: 'center' }}>
                    {qrDataUrl
                        ? <img src={qrDataUrl} alt="QR" style={{ width: '84px', height: '84px', display: 'block' }} />
                        : <div style={{ width: '84px', height: '84px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#888' }}>...</div>
                    }
                    <div style={{ fontSize: '6px', color: '#555', marginTop: '1px' }}>Scan in ERP Scanner</div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', border: '2px solid #000', padding: '4px 8px', marginBottom: '6px' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={heroLbl}>CELUP / DYEING</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', lineHeight: 1.05, wordBreak: 'break-word' }}>{workOrder.name}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={heroLbl}>MESIN CELUP</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{workOrder.work_center_name || '—'}</div>
                    <div style={{ fontSize: '9px', color: '#555' }}>Step {workOrder.sequence}</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <div style={{ flex: 1, border: '1px solid #999', padding: '3px 8px' }}>
                    <div style={heroLbl}>SUBSTRATE QTY (KG)</div>
                    <div style={{ fontSize: '17px', fontWeight: 'bold' }}>
                        {woQty > 0 ? woQty : '—'}<span style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{woQty > 0 ? ' kg' : ''}</span>
                    </div>
                </div>
                <div style={{ flex: 1, border: '1px solid #999', padding: '3px 8px' }}>
                    <div style={heroLbl}>RECIPE</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                        {workOrder.planned_recipe_id ? 'Assigned' : '—'}
                    </div>
                </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
                <tbody>
                    <tr>
                        <td style={{ ...gridLbl, width: '24%' }}>Produk</td>
                        <td colSpan={3} style={{ ...gridVal, fontWeight: 'bold' }}>{parentMO?.item_name || workOrder.item_name || '—'}</td>
                    </tr>
                    <tr>
                        <td style={{ ...gridLbl, width: '24%' }}>Status</td>
                        <td style={{ ...gridVal, width: '26%' }}>{workOrder.status}</td>
                        <td style={{ ...gridLbl, width: '22%' }}>Target Selesai</td>
                        <td style={gridVal}>{workOrder.target_end_date ? new Date(workOrder.target_end_date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</td>
                    </tr>
                    {(workOrder.next_destination_work_center_name || workOrder.next_destination_location_name) && (
                        <tr>
                            <td style={gridLbl}>Tujuan</td>
                            <td colSpan={3} style={{ ...gridVal, fontWeight: 'bold' }}>
                                {[workOrder.next_destination_work_center_name, workOrder.next_destination_location_name].filter(Boolean).join(' — ')}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>Cek / 10 mnt</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '2px' }}>
                    {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} style={{ border: '1px solid #aaa', padding: '3px 4px', fontSize: '8px', color: '#555', minHeight: '22px' }}>
                            {i + 1}:
                        </div>
                    ))}
                </div>
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
