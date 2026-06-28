'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../context/DataContext';
import { useToast } from '../shared/Toast';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', height: 20, padding: '0 4px', outline: 'none', boxSizing: 'border-box',
};
const xpBtn = (primary?: boolean): React.CSSProperties => primary ? {
    fontFamily: xpFont, fontSize: 11, padding: '2px 14px',
    background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
    border: '1px solid', borderColor: '#d0f0d0 #0a3e0a #0a3e0a #1a5e1a',
    cursor: 'pointer', fontWeight: 'bold', color: '#004000',
} : {
    fontFamily: xpFont, fontSize: 11, padding: '2px 10px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
};

interface RequiredMaterial {
    item_id: string;
    item_code: string | null;
    item_name: string | null;
    attribute_value_ids: string[];
    required_qty: number;
    source_location_id: string | null;
    source_location_name: string | null;
    on_hand: number;
    staged: number;
    shortfall: number;
    lot_tracked: boolean;
}

interface Props {
    wo: any;
    onClose: () => void;
    onStaged: (updatedWO: any) => void;
}

export default function WOStagingModal({ wo, onClose, onStaged }: Props) {
    const { authFetch } = useData() as any;
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [rows, setRows] = useState<RequiredMaterial[]>([]);
    const [qtyToStage, setQtyToStage] = useState<Record<string, string>>({});
    const [batchByItem, setBatchByItem] = useState<Record<string, string>>({});
    const [batchesByItem, setBatchesByItem] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await authFetch(`${API_BASE}/work-orders/${wo.id}/required-materials`);
                const data: RequiredMaterial[] = res.ok ? await res.json() : [];
                if (!alive) return;
                setRows(data);
                // default qty-to-stage = remaining shortfall
                const q: Record<string, string> = {};
                data.forEach(r => { q[r.item_id] = r.shortfall > 0 ? String(r.shortfall) : ''; });
                setQtyToStage(q);
                // fetch lots for lot-tracked rows at their source location
                const lotRows = data.filter(r => r.lot_tracked && r.source_location_id);
                const entries = await Promise.all(lotRows.map(async r => {
                    const b = await authFetch(`${API_BASE}/batches?item_id=${r.item_id}&location_id=${r.source_location_id}&limit=200`);
                    const list = b.ok ? await b.json() : [];
                    return [r.item_id, (list || []).filter((x: any) => (x.remaining ?? 0) > 0)] as const;
                }));
                if (!alive) return;
                setBatchesByItem(Object.fromEntries(entries));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [wo.id]);

    const submit = async () => {
        const lines = rows
            .map(r => ({ r, qty: parseFloat(qtyToStage[r.item_id] || '0') }))
            .filter(({ qty }) => qty > 0)
            .map(({ r, qty }) => ({
                item_id: r.item_id,
                qty,
                source_location_id: r.source_location_id,
                batch_id: batchByItem[r.item_id] || null,
                attribute_value_ids: r.attribute_value_ids || [],
            }));
        if (!lines.length) { showToast('Enter a quantity to stage.', 'danger'); return; }
        // lot-tracked rows being staged must have a lot selected
        const missingLot = rows.find(r =>
            r.lot_tracked && parseFloat(qtyToStage[r.item_id] || '0') > 0 && !batchByItem[r.item_id]
        );
        if (missingLot) { showToast(`Select a lot for ${missingLot.item_code || missingLot.item_name}.`, 'danger'); return; }

        setSubmitting(true);
        try {
            const res = await authFetch(`${API_BASE}/work-orders/${wo.id}/stage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lines }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                showToast(err?.detail || 'Staging failed', 'danger');
                return;
            }
            const updated = await res.json().catch(() => null);
            showToast('Materials staged to line.', 'success');
            onStaged(updated);
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 4000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={onClose}>
            <div style={{
                background: '#ece9d8', border: '2px solid #0a246a', width: 720, maxWidth: '95vw',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column', fontFamily: xpFont,
            }} onClick={e => e.stopPropagation()}>
                <div style={{
                    background: 'linear-gradient(to right, #0a246a, #3a6ea5)', color: 'white',
                    padding: '4px 8px', fontSize: 12, fontWeight: 'bold',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span>Stage Materials — {wo.code || wo.name}</span>
                    <span style={{ cursor: 'pointer', padding: '0 4px' }} onClick={onClose}>x</span>
                </div>

                <div style={{ padding: 10, overflowY: 'auto', fontSize: 11 }}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>
                        Moves each material from its source store into this work order&apos;s input location
                        ({wo.input_location?.code || wo.input_location_id || 'no input location'}).
                    </div>

                    {loading ? (
                        <div style={{ color: '#888', padding: 12 }}>Loading required materials...</div>
                    ) : rows.length === 0 ? (
                        <div style={{ color: '#888', padding: 12 }}>
                            No materials for this step. Assign a routing step with materials on the WO/BOM.
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                <thead>
                                    <tr style={{ background: '#d4d0c8', textAlign: 'left' }}>
                                        <th style={{ padding: '3px 5px' }}>Material</th>
                                        <th style={{ padding: '3px 5px' }}>Source</th>
                                        <th style={{ padding: '3px 5px', textAlign: 'right' }}>Required</th>
                                        <th style={{ padding: '3px 5px', textAlign: 'right' }}>On hand</th>
                                        <th style={{ padding: '3px 5px', textAlign: 'right' }}>Staged</th>
                                        <th style={{ padding: '3px 5px', textAlign: 'right' }}>Stage now</th>
                                        <th style={{ padding: '3px 5px' }}>Lot</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => {
                                        const short = r.on_hand + 1e-9 < parseFloat(qtyToStage[r.item_id] || '0');
                                        return (
                                            <tr key={r.item_id} style={{ borderBottom: '1px solid #cfccc4' }}>
                                                <td style={{ padding: '3px 5px' }}>
                                                    <div style={{ fontWeight: 'bold' }}>{r.item_code || '—'}</div>
                                                    <div style={{ color: '#777' }}>{r.item_name}</div>
                                                </td>
                                                <td style={{ padding: '3px 5px' }}>{r.source_location_name || '—'}</td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right' }}>{r.required_qty.toFixed(2)}</td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right', color: short ? '#b00' : '#333' }}>
                                                    {r.on_hand.toFixed(2)}
                                                </td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right' }}>{r.staged.toFixed(2)}</td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right' }}>
                                                    <input
                                                        type="number" min="0" step="any"
                                                        style={{ ...xpInput, width: 70, textAlign: 'right' }}
                                                        value={qtyToStage[r.item_id] || ''}
                                                        onChange={e => setQtyToStage(p => ({ ...p, [r.item_id]: e.target.value }))}
                                                    />
                                                </td>
                                                <td style={{ padding: '3px 5px' }}>
                                                    {r.lot_tracked ? (
                                                        <select
                                                            style={{ ...xpInput, minWidth: 110 }}
                                                            value={batchByItem[r.item_id] || ''}
                                                            onChange={e => setBatchByItem(p => ({ ...p, [r.item_id]: e.target.value }))}
                                                        >
                                                            <option value="">— Lot —</option>
                                                            {(batchesByItem[r.item_id] || []).map((b: any) => (
                                                                <option key={b.id} value={b.id}>
                                                                    {b.batch_number} ({(b.remaining ?? 0).toFixed(1)})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : <span style={{ color: '#bbb' }}>—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{
                    borderTop: '1px solid #aca899', padding: '6px 10px',
                    display: 'flex', justifyContent: 'flex-end', gap: 6,
                }}>
                    <button style={xpBtn(false)} onClick={onClose} disabled={submitting}>Cancel</button>
                    <button style={xpBtn(true)} onClick={submit} disabled={submitting || loading || rows.length === 0}>
                        {submitting ? 'Staging...' : 'Stage Materials'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
