'use client';
import React, { useState, useEffect } from 'react';

const XP_FONT = 'Tahoma, "Segoe UI", Arial, sans-serif';
const XP_BEIGE = '#ece9d8';

interface MaterialRow {
    item_id: string;
    item_name: string;
    item_code: string;
    planned_pct: number;
    is_percentage: boolean;
    line_qty: number;
    actual_qty: string;
    is_custom: boolean;
}

interface Props {
    workOrder: any;
    parentMO: any;
    authFetch: (url: string, options?: any) => Promise<Response>;
    onLogged?: (updatedMO: any) => void;
}

export default function WOLogView({ workOrder, parentMO, authFetch, onLogged }: Props) {
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [qtyCompleted, setQtyCompleted] = useState('');
    const [operatorName, setOperatorName] = useState('');
    const [notes, setNotes] = useState('');
    const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Build material rows from BOM lines
    useEffect(() => {
        const bomLines: any[] = parentMO?.bom?.lines || [];
        setMaterialRows(bomLines.map((line: any) => ({
            item_id: line.item_id,
            item_name: line.item_name || '',
            item_code: line.item_code || '',
            planned_pct: parseFloat(line.qty) ?? 0,
            is_percentage: !!line.is_percentage,
            line_qty: parseFloat(line.qty) ?? 0,
            actual_qty: '',
            is_custom: false,
        })));
    }, [parentMO?.id]);

    // Recalculate planned actuals when qty changes
    useEffect(() => {
        const qty = parseFloat(qtyCompleted);
        if (!qty || qty <= 0) return;
        setMaterialRows(prev => prev.map(row => {
            if (row.is_custom) return row;
            const planned = row.is_percentage
                ? (qty * row.line_qty) / 100
                : qty * row.line_qty;
            return { ...row, actual_qty: planned.toFixed(4) };
        }));
    }, [qtyCompleted]);

    const woQty = workOrder.qty ?? 0;
    const doneQty = workOrder.qty_completed_total ?? 0;
    const pct = woQty > 0 ? Math.min(100, Math.round((doneQty / woQty) * 100)) : 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        const qty = parseFloat(qtyCompleted);
        if (!qty || qty <= 0) { setErrorMsg('Enter a positive quantity'); return; }

        for (const row of materialRows) {
            const v = parseFloat(row.actual_qty);
            if (row.actual_qty !== '' && (isNaN(v) || v < 0)) {
                setErrorMsg(`Invalid quantity for ${row.item_code || row.item_name}`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const actualItems = materialRows
                .filter(row => parseFloat(row.actual_qty) > 0)
                .map(row => ({ item_id: row.item_id, qty_used: parseFloat(row.actual_qty) }));

            const res = await authFetch(`${API_BASE}/manufacturing-orders/${parentMO.id}/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qty_completed: qty,
                    operator_name: operatorName || null,
                    notes: notes || null,
                    work_order_id: workOrder.id,
                    actual_items: actualItems,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to log');
            }

            const updated = await res.json();
            const newTotal = (updated.qty_completed_total ?? 0).toFixed(2);
            setSuccessMsg(`Logged ${qty} — total ${newTotal} / ${woQty}`);
            setQtyCompleted('');
            setNotes('');
            setMaterialRows(prev => prev.map(r => ({ ...r, actual_qty: '', is_custom: false })));
            onLogged?.(updated);
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ fontFamily: XP_FONT, background: XP_BEIGE, minHeight: '100vh', padding: '12px' }}>

            {/* WO Info Banner */}
            <div style={{ border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#fff', marginBottom: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: '#000080', marginBottom: 4 }}>
                    Step {workOrder.sequence}: {workOrder.name}
                </div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
                    {parentMO?.code} — {parentMO?.item_name || ''}
                    {workOrder.work_center_name && <span style={{ marginLeft: 8 }}>| {workOrder.work_center_name}</span>}
                </div>

                {woQty > 0 && (
                    <>
                        <div style={{ border: '1px solid #7f9db9', height: 18, background: '#fff', position: 'relative', overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{
                                height: '100%',
                                width: `${pct}%`,
                                background: pct >= 100
                                    ? 'repeating-linear-gradient(45deg, #2e7d32, #2e7d32 4px, #4caf50 4px, #4caf50 8px)'
                                    : 'repeating-linear-gradient(45deg, #000080, #000080 4px, #1565c0 4px, #1565c0 8px)',
                                transition: 'width 0.2s',
                            }} />
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 'bold', color: pct > 50 ? '#fff' : '#000080', textShadow: pct > 50 ? '0 0 3px rgba(0,0,0,0.8)' : 'none' }}>
                                {doneQty.toFixed(2)} / {woQty} ({pct}%)
                            </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#555' }}>
                            Status: <strong>{workOrder.status}</strong>
                            {woQty > doneQty && <span style={{ marginLeft: 8 }}>Remaining: <strong>{(woQty - doneQty).toFixed(2)}</strong></span>}
                        </div>
                    </>
                )}
            </div>

            {/* Feedback */}
            {successMsg && (
                <div style={{ background: '#d4edda', border: '1px solid #28a745', color: '#155724', padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
                    {successMsg}
                </div>
            )}
            {errorMsg && (
                <div style={{ background: '#f8d7da', border: '1px solid #dc3545', color: '#721c24', padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
                    {errorMsg}
                </div>
            )}

            {/* Log form */}
            <form onSubmit={handleSubmit}>
                <div style={{ border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#fff', padding: '12px', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000080', borderBottom: '1px solid #d4d0c8', paddingBottom: 6, marginBottom: 10 }}>
                        Log Hasil Produksi
                    </div>

                    {/* Actual qty */}
                    <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 'bold', display: 'block', marginBottom: 4 }}>
                            Qty Aktual Diproduksi <span style={{ color: '#c00' }}>*</span>
                        </label>
                        <input
                            type="number"
                            inputMode="decimal"
                            min="0.0001"
                            step="any"
                            required
                            autoFocus
                            value={qtyCompleted}
                            onChange={e => setQtyCompleted(e.target.value)}
                            placeholder="Masukkan qty aktual..."
                            style={{ width: '100%', fontSize: 18, padding: '8px 10px', border: '2px solid #7f9db9', boxSizing: 'border-box', fontFamily: XP_FONT }}
                        />
                    </div>

                    {/* Operator + Notes */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>Operator</label>
                            <input
                                type="text"
                                value={operatorName}
                                onChange={e => setOperatorName(e.target.value)}
                                placeholder="Nama (opsional)"
                                style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #7f9db9', boxSizing: 'border-box', fontFamily: XP_FONT }}
                            />
                        </div>
                        <div style={{ flex: 2 }}>
                            <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>Catatan</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Batch, shift, keterangan..."
                                style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #7f9db9', boxSizing: 'border-box', fontFamily: XP_FONT }}
                            />
                        </div>
                    </div>
                </div>

                {/* Material consumption */}
                {materialRows.length > 0 && (
                    <div style={{ border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#fff', padding: '12px', marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 'bold', color: '#000080', borderBottom: '1px solid #d4d0c8', paddingBottom: 6, marginBottom: 10 }}>
                            Material Terpakai
                        </div>
                        <div style={{ fontSize: 10, color: '#888', marginBottom: 8 }}>
                            Qty planned dihitung otomatis dari BOM%. Edit jika ada perbedaan aktual.
                        </div>
                        {materialRows.map((row, idx) => {
                            const qty = parseFloat(qtyCompleted) || 0;
                            const planned = qty > 0
                                ? (row.is_percentage ? (qty * row.line_qty) / 100 : qty * row.line_qty)
                                : null;
                            const actual = parseFloat(row.actual_qty) || 0;
                            const variance = planned != null && row.actual_qty ? actual - planned : null;

                            return (
                                <div key={row.item_id} style={{ borderBottom: idx < materialRows.length - 1 ? '1px solid #e4e1d8' : 'none', paddingBottom: 8, marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, fontWeight: 500 }}>
                                            {row.item_code && <span style={{ color: '#888', marginRight: 4, fontSize: 10 }}>{row.item_code}</span>}
                                            {row.item_name || row.item_id}
                                        </span>
                                        {planned != null && (
                                            <span style={{ fontSize: 10, color: '#555' }}>Planned: {planned.toFixed(3)}</span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            step="any"
                                            value={row.actual_qty}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setMaterialRows(prev => prev.map((r, i) =>
                                                    i === idx ? { ...r, actual_qty: val, is_custom: true } : r
                                                ));
                                            }}
                                            placeholder="0"
                                            style={{ flex: 1, fontSize: 14, padding: '6px 8px', border: '1px solid #7f9db9', boxSizing: 'border-box', fontFamily: XP_FONT }}
                                        />
                                        {variance != null && (
                                            <span style={{ fontSize: 11, color: variance > 0.001 ? '#900' : variance < -0.001 ? '#007000' : '#888', minWidth: 60, textAlign: 'right' }}>
                                                {variance > 0 ? '+' : ''}{variance.toFixed(3)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={submitting}
                    style={{
                        width: '100%',
                        padding: '14px',
                        fontSize: 15,
                        fontWeight: 'bold',
                        fontFamily: XP_FONT,
                        background: submitting ? '#aaa' : 'linear-gradient(to bottom, #5ec85e, #2d7a2d)',
                        border: '2px solid',
                        borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a',
                        color: '#fff',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        letterSpacing: 0.5,
                    }}
                >
                    {submitting ? 'Menyimpan...' : 'Simpan Log'}
                </button>
            </form>
        </div>
    );
}
