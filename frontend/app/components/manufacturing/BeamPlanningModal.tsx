'use client';
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', height: 20, padding: '0 4px', outline: 'none',
};

interface BeamRow {
    localId: string;
    work_center_id: string;
    qty: string;
    ends: string;
    notes: string;
    repeat: string;
    next_destination_work_center_id: string;
    next_destination_location_id: string;
}

interface Props {
    mo: { id: string; code: string; qty: number; item_name?: string; uom?: string; ends?: number };
    machines: Array<{ id: string; name: string }>;
    components?: Array<{ name: string; code?: string; ends: number | null }>;
    centerLabel?: string;
    locations?: Array<{ id: string; code?: string; name: string }>;
    nextWorkCenters?: Array<{ id: string; name: string }>;
    onClose: () => void;
}

let _rowId = 0;
function makeRow(defaultWcId = '', defaultEnds = ''): BeamRow {
    return { localId: `beam-${++_rowId}`, work_center_id: defaultWcId, qty: '', ends: defaultEnds, notes: '', repeat: '1', next_destination_work_center_id: '', next_destination_location_id: '' };
}

export default function BeamPlanningModal({ mo, machines, components = [], centerLabel = 'Beaming', locations = [], nextWorkCenters = [], onClose }: Props) {
    const { authFetch, fetchData } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const defaultWcId = machines[0]?.id || '';
    const defaultEnds = mo.ends != null ? String(mo.ends) : '';
    const [rows, setRows] = useState<BeamRow[]>([makeRow(defaultWcId, defaultEnds)]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const moQty = Number(mo.qty) || 0;
    const validRows = useMemo(() => rows.filter(r => parseFloat(r.qty) > 0), [rows]);
    const totalWoCount = useMemo(() => validRows.reduce((s, r) => s + Math.max(1, parseInt(r.repeat) || 1), 0), [validRows]);
    const totalAssigned = useMemo(
        () => rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * Math.max(1, parseInt(r.repeat) || 1), 0),
        [rows]
    );
    const isOver = moQty > 0 && totalAssigned > moQty + 0.001;
    const isUnder = moQty > 0 && totalAssigned < moQty - 0.001;

    const addRow = () => setRows(prev => [...prev, makeRow(defaultWcId, defaultEnds)]);
    const removeRow = (id: string) => setRows(prev => prev.filter(r => r.localId !== id));
    const update = (id: string, field: keyof BeamRow, val: string) =>
        setRows(prev => prev.map(r => r.localId === id ? { ...r, [field]: val } : r));

    const handleCreate = async () => {
        if (!validRows.length) { setError('Enter qty for at least one beam.'); return; }
        setIsSaving(true);
        setError(null);
        try {
            const payloads = validRows.flatMap(r => {
                const count = Math.max(1, parseInt(r.repeat) || 1);
                return Array.from({ length: count }, () => ({
                    manufacturing_order_id: mo.id,
                    work_center_id: r.work_center_id || undefined,
                    qty: parseFloat(r.qty),
                    ends: r.ends ? parseInt(r.ends) : undefined,
                    notes: r.notes || undefined,
                    sequence: 1,
                    next_destination_work_center_id: r.next_destination_work_center_id || undefined,
                    next_destination_location_id: r.next_destination_location_id || undefined,
                }));
            });
            const res = await authFetch(`${API_BASE}/work-orders/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloads),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                setError(body.detail || 'Failed to create work orders');
                return;
            }
            await fetchData('work-orders');
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 20100,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                width: 820, fontFamily: xpFont, fontSize: 11,
                border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                boxShadow: '3px 3px 8px rgba(0,0,0,0.45)',
                background: '#ece9d8',
            }}>
                {/* Title bar */}
                <div style={{
                    background: 'linear-gradient(to right, #0a246a, #3a6ea5)',
                    padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: 11 }}>
                        Plan {centerLabel} Work Orders
                    </span>
                    <button onClick={onClose} style={{
                        width: 21, height: 21, fontWeight: 'bold', fontSize: 11, cursor: 'pointer',
                        background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                        border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                    }}>x</button>
                </div>

                {/* Body */}
                <div style={{ padding: 10 }}>
                    {/* MO info strip */}
                    <div style={{
                        background: '#f5f3ee', border: '1px solid #c0bdb5',
                        padding: '5px 8px', marginBottom: 8,
                        display: 'flex', gap: 16, alignItems: 'center',
                    }}>
                        {[
                            { label: 'MO', value: mo.code },
                            { label: 'Item', value: mo.item_name || '—' },
                            { label: 'Total Qty', value: moQty > 0 ? `${moQty} ${mo.uom || ''}`.trim() : '—' },
                            ...(mo.ends != null ? [{ label: 'Beam Ends', value: String(mo.ends) }] : []),
                        ].map(({ label, value }, i) => (
                            <React.Fragment key={label}>
                                {i > 0 && <div style={{ width: 1, background: '#c0bdb5', height: 26 }} />}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 'bold', color: '#222' }}>{value}</span>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Yarn components — ends per yarn (read-only, from BOM) */}
                    {components.length > 0 && (
                        <div style={{ background: '#f5f3ee', border: '1px solid #c0bdb5', padding: '5px 8px', marginBottom: 8 }}>
                            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                                Yarn Components — Ends per Yarn
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {components.map((c, i) => (
                                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'white', border: '1px solid #c0bdb5', padding: '1px 6px', fontSize: 10 }}>
                                        <span style={{ color: '#222', fontWeight: 'bold' }}>{c.name}</span>
                                        <span style={{ background: '#e6f4ea', border: '1px solid #4caf50', color: '#1a6e2e', fontWeight: 'bold', padding: '0 4px' }}>
                                            {c.ends != null && c.ends > 0 ? `${Math.round(c.ends)} ends` : '— ends'}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Section label */}
                    <div style={{ fontSize: 10, fontWeight: 'bold', color: '#444', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Beam Assignment
                    </div>

                    {/* Rows table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #c0bdb5', background: 'white', marginBottom: 0 }}>
                        <thead>
                            <tr>
                                <th style={thStyle('#')}>{'#'}</th>
                                {machines.length > 1 && <th style={thStyle('Machine')}>Machine</th>}
                                <th style={{ ...thStyle('Qty'), width: 90 }}>Qty / Beam</th>
                                <th style={{ ...thStyle('Ends'), width: 100 }}>Qty / Ends (Utas)</th>
                                <th style={{ ...thStyle('Repeat'), width: 56 }}>Repeat</th>
                                <th style={thStyle('Notes / Beam ID')}>Notes / Beam ID</th>
                                <th style={{ ...thStyle('Tujuan Berikutnya'), width: 150 }}>Tujuan Berikutnya</th>
                                <th style={{ ...thStyle(''), width: 26 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr key={row.localId} style={{ background: idx % 2 === 1 ? '#f8f7f2' : 'white' }}>
                                    <td style={tdStyle({ width: 28, textAlign: 'center', color: '#666', fontWeight: 'bold' })}>{idx + 1}</td>
                                    {machines.length > 1 && (
                                        <td style={tdStyle({})}>
                                            <select
                                                style={{ ...xpInput, width: '100%' }}
                                                value={row.work_center_id}
                                                onChange={e => update(row.localId, 'work_center_id', e.target.value)}
                                            >
                                                <option value="">— machine —</option>
                                                {machines.map(m => (
                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                    )}
                                    <td style={tdStyle({ width: 90 })}>
                                        <input
                                            type="number" min="0" step="any"
                                            style={{ ...xpInput, width: '100%', background: parseFloat(row.qty) > 0 ? 'white' : '#fffff8' }}
                                            value={row.qty}
                                            placeholder="qty..."
                                            onChange={e => update(row.localId, 'qty', e.target.value)}
                                            autoFocus={idx === 0}
                                        />
                                    </td>
                                    <td style={tdStyle({ width: 100 })}>
                                        <input
                                            type="number" min="0" step="1"
                                            style={{ ...xpInput, width: '100%' }}
                                            value={row.ends}
                                            placeholder="ends..."
                                            onChange={e => update(row.localId, 'ends', e.target.value)}
                                        />
                                    </td>
                                    <td style={tdStyle({ width: 56 })}>
                                        <input
                                            type="number" min="1" step="1"
                                            style={{ ...xpInput, width: '100%', textAlign: 'center' }}
                                            value={row.repeat}
                                            onChange={e => update(row.localId, 'repeat', e.target.value)}
                                        />
                                    </td>
                                    <td style={tdStyle({})}>
                                        <input
                                            type="text"
                                            style={{ ...xpInput, width: '100%' }}
                                            value={row.notes}
                                            placeholder="e.g. Beam #A-01, 60&quot; wide"
                                            onChange={e => update(row.localId, 'notes', e.target.value)}
                                        />
                                    </td>
                                    <td style={tdStyle({ width: 150 })}>
                                        {(nextWorkCenters.length > 0 || locations.length > 0) ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                {nextWorkCenters.length > 0 && (
                                                    <select
                                                        style={{ ...xpInput, width: '100%', fontSize: 10 }}
                                                        value={row.next_destination_work_center_id}
                                                        onChange={e => update(row.localId, 'next_destination_work_center_id', e.target.value)}
                                                    >
                                                        <option value="">— Mesin —</option>
                                                        {nextWorkCenters.map(wc => (
                                                            <option key={wc.id} value={wc.id}>{wc.name}</option>
                                                        ))}
                                                    </select>
                                                )}
                                                {locations.length > 0 && (
                                                    <select
                                                        style={{ ...xpInput, width: '100%', fontSize: 10 }}
                                                        value={row.next_destination_location_id}
                                                        onChange={e => update(row.localId, 'next_destination_location_id', e.target.value)}
                                                    >
                                                        <option value="">— Lokasi —</option>
                                                        {locations.map(l => (
                                                            <option key={l.id} value={l.id}>{l.code || l.name}</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        ) : <span style={{ color: '#aaa', fontSize: 9 }}>—</span>}
                                    </td>
                                    <td style={tdStyle({ textAlign: 'center' })}>
                                        <button
                                            onClick={() => removeRow(row.localId)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aa0000', fontSize: 13, fontWeight: 'bold', padding: '0 2px' }}
                                            title="Remove"
                                        >x</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Summary bar */}
                    <div style={{
                        background: '#f0efe6', border: '1px solid #c0bdb5', borderTop: 'none',
                        padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: 10, marginBottom: 6,
                    }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                            background: isOver ? '#ff6600' : isUnder ? '#cc8800' : '#4caf50',
                        }} />
                        <span style={{ color: '#555' }}>Total assigned:</span>
                        <span style={{ fontWeight: 'bold', color: isOver ? '#c85000' : isUnder ? '#886600' : '#2e7d32' }}>
                            {totalAssigned.toFixed(2)}
                        </span>
                        <span style={{ color: '#c0bdb5' }}>|</span>
                        <span style={{ color: '#555' }}>MO qty:</span>
                        <span style={{ fontWeight: 'bold' }}>{moQty > 0 ? moQty : '—'}</span>
                        <span style={{ color: '#c0bdb5' }}>|</span>
                        <span style={{ color: '#555' }}>Beams:</span>
                        <span style={{ fontWeight: 'bold' }}>{totalWoCount}</span>
                        {isOver && <span style={{ color: '#c85000', marginLeft: 'auto', fontStyle: 'italic' }}>Over-assigned</span>}
                        {isUnder && <span style={{ color: '#886600', marginLeft: 'auto', fontStyle: 'italic' }}>Partial — unassigned qty remains on MO</span>}
                        {!isOver && !isUnder && moQty > 0 && <span style={{ color: '#2e7d32', marginLeft: 'auto' }}>Fully assigned</span>}
                    </div>

                    <button
                        onClick={addRow}
                        style={{
                            fontFamily: xpFont, fontSize: 11, padding: '2px 10px',
                            background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                            border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                            cursor: 'pointer', color: '#222',
                        }}
                    >
                        + Add Beam
                    </button>

                    {error && (
                        <div style={{
                            marginTop: 6, background: '#fff0f0', border: '1px solid #f0b8b8',
                            padding: '3px 8px', fontSize: 10, color: '#cc0000',
                        }}>
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)',
                    borderTop: '1px solid #c0bdb5',
                    padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span style={{ fontSize: 10, color: '#555' }}>
                        Will create <strong>{totalWoCount}</strong> Work Order{totalWoCount !== 1 ? 's' : ''} under <strong>{mo.code}</strong>
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            onClick={onClose}
                            style={{
                                fontFamily: xpFont, fontSize: 11, padding: '2px 12px',
                                background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                                border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={isSaving || totalWoCount === 0}
                            style={{
                                fontFamily: xpFont, fontSize: 11, padding: '2px 14px', fontWeight: 'bold',
                                background: isSaving || totalWoCount === 0
                                    ? 'linear-gradient(to bottom, #d0d0c8, #b8b8b0)'
                                    : 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                border: '1px solid', borderColor: '#dfdfdf #0a3e0a #0a3e0a #dfdfdf',
                                cursor: isSaving || totalWoCount === 0 ? 'not-allowed' : 'pointer',
                                color: '#004000',
                            }}
                        >
                            {isSaving ? '...' : `Create ${totalWoCount} Beam WO${totalWoCount !== 1 ? 's' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function thStyle(label: string): React.CSSProperties {
    return {
        background: 'linear-gradient(to bottom, #f0efe6, #e0dfd8)',
        borderBottom: '1px solid #c0bdb5', borderRight: '1px solid #c0bdb5',
        padding: '3px 6px', fontSize: 10, fontWeight: 'bold', color: '#333', textAlign: 'left',
    };
}

function tdStyle(extra: React.CSSProperties): React.CSSProperties {
    return {
        borderBottom: '1px solid #e8e5de', borderRight: '1px solid #e8e5de',
        padding: '2px 4px', verticalAlign: 'middle',
        ...extra,
    };
}
