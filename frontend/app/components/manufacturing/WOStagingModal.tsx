'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../shared/Toast';
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';
import ModalWrapper from '../shared/ModalWrapper';

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
    suggested_batch_id: string | null;
}

interface Props {
    wo: any;
    onClose: () => void;
    onStaged: (updatedWO: any) => void;
}

export default function WOStagingModal({ wo, onClose, onStaged }: Props) {
    const { authFetch, locations } = useData() as any;
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [rows, setRows] = useState<RequiredMaterial[]>([]);
    const [qtyToStage, setQtyToStage] = useState<Record<string, string>>({});
    const [sourceByItem, setSourceByItem] = useState<Record<string, string>>({});
    const [batchByItem, setBatchByItem] = useState<Record<string, string[]>>({});
    const [batchesByItem, setBatchesByItem] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);

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
                    return [r.item_id, (list || []).filter((x: any) => (x.remaining ?? 0) > 0 && x.quality_status !== 'REJECTED')] as const;
                }));
                if (!alive) return;
                const byItem = Object.fromEntries(entries);
                setBatchesByItem(byItem);
                // Default-select the traced beam batch when it's still available; still overridable.
                const defaults: Record<string, string[]> = {};
                lotRows.forEach(r => {
                    const available = (byItem[r.item_id] || []) as any[];
                    if (r.suggested_batch_id && available.some(b => b.id === r.suggested_batch_id)) {
                        defaults[r.item_id] = [r.suggested_batch_id];
                    }
                });
                if (Object.keys(defaults).length) setBatchByItem(prev => ({ ...defaults, ...prev }));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [wo.id]);

    // Sum of remaining qty across the beams/lots selected for this item.
    const selectedLotQty = (itemId: string) => {
        const selected = new Set(batchByItem[itemId] || []);
        return (batchesByItem[itemId] || [])
            .filter((b: any) => selected.has(b.id))
            .reduce((sum: number, b: any) => sum + (b.remaining ?? 0), 0);
    };

    const submit = async () => {
        const lotLines = rows
            .filter(r => r.lot_tracked)
            .flatMap(r => {
                const selected = new Set(batchByItem[r.item_id] || []);
                return (batchesByItem[r.item_id] || [])
                    .filter((b: any) => selected.has(b.id))
                    .map((b: any) => ({
                        item_id: r.item_id,
                        qty: b.remaining ?? 0,
                        source_location_id: r.source_location_id || sourceByItem[r.item_id] || null,
                        batch_id: b.id,
                        attribute_value_ids: r.attribute_value_ids || [],
                    }));
            });
        const plainLines = rows
            .filter(r => !r.lot_tracked)
            .map(r => ({ r, qty: parseFloat(qtyToStage[r.item_id] || '0') }))
            .filter(({ qty }) => qty > 0)
            .map(({ r, qty }) => ({
                item_id: r.item_id,
                qty,
                source_location_id: r.source_location_id || sourceByItem[r.item_id] || null,
                batch_id: null,
                attribute_value_ids: r.attribute_value_ids || [],
            }));
        const lines = [...lotLines, ...plainLines];
        if (!lines.length) { showToast('Select beams/lots or enter a quantity to stage.', 'danger'); return; }
        const missingSrc = lines.find(l => !l.source_location_id);
        if (missingSrc) {
            const r = rows.find(x => x.item_id === missingSrc.item_id);
            showToast(`Pick a source location for ${r?.item_code || r?.item_name}.`, 'danger'); return;
        }
        // lot-tracked rows with a shortfall must have at least one beam/lot selected
        const missingLot = rows.find(r => r.lot_tracked && r.shortfall > 0 && !(batchByItem[r.item_id] || []).length);
        if (missingLot) { showToast(`Select a beam/lot for ${missingLot.item_code || missingLot.item_name}.`, 'danger'); return; }

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

    return (
        <ModalWrapper
            isOpen
            onClose={onClose}
            title={`Stage Materials — ${wo.code || wo.name}`}
            modeless
            size="xl"
            footer={
                <>
                    <button style={xpBtn(false)} onClick={onClose} disabled={submitting}>Cancel</button>
                    <button style={xpBtn(true)} onClick={submit} disabled={submitting || loading || rows.length === 0}>
                        {submitting ? 'Staging...' : 'Stage Materials'}
                    </button>
                </>
            }
        >
            <div style={{ fontFamily: xpFont, fontSize: 11 }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>
                    Moves each material from its source store into this work order&apos;s input location
                    (<b>{wo.input_location?.code || wo.input_location_id || 'no input location'}</b>).
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
                                        const stageQty = r.lot_tracked ? selectedLotQty(r.item_id) : parseFloat(qtyToStage[r.item_id] || '0');
                                        const short = r.on_hand + 1e-9 < stageQty;
                                        return (
                                            <tr key={r.item_id} style={{ borderBottom: '1px solid #cfccc4' }}>
                                                <td style={{ padding: '3px 5px' }}>
                                                    <div style={{ fontWeight: 'bold' }}>{r.item_code || '—'}</div>
                                                    <div style={{ color: '#777' }}>{r.item_name}</div>
                                                </td>
                                                <td style={{ padding: '3px 5px' }}>
                                                    {r.source_location_id ? (r.source_location_name || '—') : (
                                                        <TreeSelect
                                                            options={locPickerTreeOptions}
                                                            value={sourceByItem[r.item_id] || ''}
                                                            onChange={id => setSourceByItem(p => ({ ...p, [r.item_id]: id }))}
                                                            placeholder="— pick source —"
                                                            style={{ minWidth: 140 }}
                                                            size="sm"
                                                        />
                                                    )}
                                                </td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right' }}>{r.required_qty.toFixed(2)}</td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right', color: short ? '#b00' : '#333' }}>
                                                    {r.on_hand.toFixed(2)}
                                                </td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right' }}>{r.staged.toFixed(2)}</td>
                                                <td style={{ padding: '3px 5px', textAlign: 'right' }}>
                                                    {r.lot_tracked ? (
                                                        <span style={{ fontWeight: 'bold' }}>{stageQty.toFixed(2)}</span>
                                                    ) : (
                                                        <input
                                                            type="number" min="0" step="any"
                                                            style={{ ...xpInput, width: 70, textAlign: 'right' }}
                                                            value={qtyToStage[r.item_id] || ''}
                                                            onChange={e => setQtyToStage(p => ({ ...p, [r.item_id]: e.target.value }))}
                                                        />
                                                    )}
                                                </td>
                                                <td style={{ padding: '3px 5px' }}>
                                                    {r.lot_tracked ? (
                                                        <div style={{
                                                            border: '1px solid #7f9db9', background: 'white',
                                                            maxHeight: 220, overflowY: 'auto', minWidth: 150,
                                                        }}>
                                                            {(batchesByItem[r.item_id] || []).length === 0 ? (
                                                                <div style={{ color: '#aaa', padding: '2px 4px' }}>— no beams/lots available —</div>
                                                            ) : (batchesByItem[r.item_id] || []).map((b: any) => {
                                                                const checked = (batchByItem[r.item_id] || []).includes(b.id);
                                                                return (
                                                                    <label key={b.id} style={{
                                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                                        padding: '1px 4px', cursor: 'pointer',
                                                                        background: checked ? '#e6f0ff' : 'transparent',
                                                                    }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={checked}
                                                                            onChange={e => setBatchByItem(p => {
                                                                                const cur = p[r.item_id] || [];
                                                                                const next = e.target.checked
                                                                                    ? [...cur, b.id]
                                                                                    : cur.filter(id => id !== b.id);
                                                                                return { ...p, [r.item_id]: next };
                                                                            })}
                                                                        />
                                                                        {b.batch_number}
                                                        {b.wo_code ? <span style={{ color: '#777' }}> — {b.wo_code}</span> : null}
                                                        {' '}({(b.remaining ?? 0).toFixed(1)})
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
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
        </ModalWrapper>
    );
}
