'use client';
import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import WOStepPrintModal from './WOStepPrintModal';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', height: 20, padding: '0 4px', outline: 'none',
};

const STATUS_COLORS: Record<string, string> = {
    PENDING: '#888',
    IN_PROGRESS: '#0058e6',
    COMPLETED: '#008000',
    CANCELLED: '#a00',
};

const fmtDate = (v: any) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (v: any) => {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

interface WO {
    id: string;
    sequence: number;
    name: string;
    work_center_name?: string;
    work_center_id?: string;
    status: string;
    planned_duration_hours?: number;
    actual_duration_hours?: number;
    qty?: number;
    qty_completed_total?: number;
    notes?: string;
    target_start_date?: string;
    target_end_date?: string;
    actual_start_date?: string;
    actual_end_date?: string;
    completions?: any[];
}

interface Props {
    manufacturingOrderId: string;
    workOrders: WO[];
    workCenters: any[];
    onAdd: (payload: any) => Promise<any>;
    onUpdate: (id: string, payload: any) => Promise<any>;
    onUpdateStatus: (id: string, status: string) => Promise<any>;
    onDelete: (id: string) => Promise<any>;
    onLogWO?: (wo: WO) => void;
    parentMO?: any;
}

export default function WorkOrderPanel({
    manufacturingOrderId, workOrders, workCenters,
    onAdd, onUpdate, onUpdateStatus, onDelete, onLogWO, parentMO,
}: Props) {
    const [addingRow, setAddingRow] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ sequence: '', name: '', work_center_id: '', planned_duration_hours: '', qty: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [printWO, setPrintWO] = useState<WO | null>(null);
    const [expandedWOId, setExpandedWOId] = useState<string | null>(null);
    const [woQrUrls, setWoQrUrls] = useState<Record<string, string>>({});

    // Generate QR for expanded WO
    useEffect(() => {
        if (!expandedWOId || woQrUrls[expandedWOId]) return;
        QRCode.toDataURL(expandedWOId, { margin: 1, width: 200 })
            .then(url => setWoQrUrls(prev => ({ ...prev, [expandedWOId]: url })))
            .catch(() => {});
    }, [expandedWOId]);

    const bomItemIds = new Set<string>((parentMO?.bom?.lines || []).map((l: any) => l.item_id));

    const resetForm = () => {
        setForm({ sequence: '', name: '', work_center_id: '', planned_duration_hours: '', qty: '' });
        setAddingRow(false);
        setEditId(null);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setIsSaving(true);
        try {
            const payload = {
                manufacturing_order_id: manufacturingOrderId,
                sequence: parseInt(form.sequence) || (workOrders.length + 1),
                name: form.name.trim(),
                work_center_id: form.work_center_id || undefined,
                planned_duration_hours: form.planned_duration_hours ? parseFloat(form.planned_duration_hours) : undefined,
                qty: form.qty ? parseFloat(form.qty) : undefined,
            };
            if (editId) {
                await onUpdate(editId, payload);
            } else {
                await onAdd(payload);
            }
            resetForm();
        } finally {
            setIsSaving(false);
        }
    };

    const startEdit = (wo: WO) => {
        setEditId(wo.id);
        setForm({
            sequence: String(wo.sequence),
            name: wo.name,
            work_center_id: wo.work_center_id || '',
            planned_duration_hours: wo.planned_duration_hours ? String(wo.planned_duration_hours) : '',
            qty: wo.qty != null ? String(wo.qty) : '',
        });
        setAddingRow(false);
    };

    const renderDetailPanel = (wo: WO) => {
        const completions: any[] = wo.completions ? [...wo.completions].reverse() : [];

        return (
            <tr key={`${wo.id}-detail`}>
                <td colSpan={8} style={{ padding: '0 4px 8px', background: '#eef2ff' }}>
                    <div style={{
                        display: 'grid', gridTemplateColumns: '130px 1fr 1fr',
                        border: '1px solid #7f9db9', fontFamily: xpFont, fontSize: 10,
                    }}>
                        {/* Column 1: QR Code */}
                        <div style={{ borderRight: '1px solid #c0bdb5', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: '#f5f4ef' }}>
                            <div style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: 0.5, alignSelf: 'flex-start', borderBottom: '1px solid #c0bdb5', paddingBottom: 3, marginBottom: 4, width: '100%' }}>
                                QR Code
                            </div>
                            {woQrUrls[wo.id]
                                ? <img src={woQrUrls[wo.id]} alt="QR" style={{ width: 90, height: 90, border: '1px solid #ccc' }} />
                                : <div style={{ width: 90, height: 90, background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#888' }}>Loading...</div>
                            }
                            <div style={{ fontFamily: 'monospace', fontSize: 7, color: '#aaa', wordBreak: 'break-all', textAlign: 'center', maxWidth: 110 }}>
                                {wo.id}
                            </div>
                        </div>

                        {/* Column 2: Timeline & Info */}
                        <div style={{ borderRight: '1px solid #c0bdb5', padding: '8px', background: '#f5f4ef' }}>
                            <div style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: 0.5, borderBottom: '1px solid #c0bdb5', paddingBottom: 3, marginBottom: 6 }}>
                                Timeline &amp; Info
                            </div>
                            {([
                                { label: 'Target Start', val: fmtDate(wo.target_start_date) },
                                { label: 'Target End',   val: fmtDate(wo.target_end_date) },
                                { label: 'Actual Start', val: fmtDateTime(wo.actual_start_date) },
                                { label: 'Actual End',   val: fmtDateTime(wo.actual_end_date) },
                                { label: 'Planned hrs',  val: wo.planned_duration_hours != null ? `${wo.planned_duration_hours}h` : '—' },
                                { label: 'Actual hrs',   val: wo.actual_duration_hours != null ? `${wo.actual_duration_hours}h` : '—' },
                                { label: 'Work Center',  val: wo.work_center_name || '—' },
                            ] as {label: string; val: string}[]).map(({ label, val }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <span style={{ color: '#666' }}>{label}:</span>
                                    <span style={{ fontWeight: 'bold', color: '#000' }}>{val}</span>
                                </div>
                            ))}
                            {wo.notes && (
                                <div style={{ marginTop: 6, padding: '4px 6px', background: '#fffbe6', border: '1px solid #e0d080', fontSize: 10, fontStyle: 'italic', color: '#555' }}>
                                    {wo.notes}
                                </div>
                            )}
                        </div>

                        {/* Column 3: Completion Log */}
                        <div style={{ padding: '8px', background: '#f5f4ef' }}>
                            <div style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: 0.5, borderBottom: '1px solid #c0bdb5', paddingBottom: 3, marginBottom: 6 }}>
                                Completion Log ({completions.length})
                            </div>
                            {completions.length === 0 ? (
                                <div style={{ color: '#999', fontStyle: 'italic', fontSize: 10 }}>No entries yet.</div>
                            ) : (
                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    {completions.map((c: any, ci: number) => {
                                        const substitutes = (c.actual_items || []).filter((ai: any) => !bomItemIds.has(ai.item_id));
                                        const bomItems = (c.actual_items || []).filter((ai: any) => bomItemIds.has(ai.item_id));
                                        return (
                                            <div key={c.id || ci} style={{ borderBottom: ci < completions.length - 1 ? '1px solid #dddbd0' : 'none', paddingBottom: 6, marginBottom: 6 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 'bold', fontSize: 11, color: '#000080' }}>
                                                        +{parseFloat(c.qty_completed).toFixed(2)}
                                                    </span>
                                                    <span style={{ fontSize: 9, color: '#888' }}>{fmtDateTime(c.created_at)}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10, color: '#444' }}>
                                                    {c.operator_name && <span>Op: <strong>{c.operator_name}</strong></span>}
                                                    {c.work_center_name && <span>Machine: <strong>{c.work_center_name}</strong></span>}
                                                </div>
                                                {bomItems.length > 0 && (
                                                    <div style={{ marginTop: 2, fontSize: 9, color: '#555' }}>
                                                        {bomItems.map((ai: any) => (
                                                            <span key={ai.item_id} style={{ marginRight: 6 }}>
                                                                {ai.item_code || ai.item_id} &times;{parseFloat(ai.qty_used).toFixed(2)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {substitutes.length > 0 && (
                                                    <div style={{ marginTop: 2 }}>
                                                        {substitutes.map((ai: any) => (
                                                            <span key={ai.item_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 6, fontSize: 9 }}>
                                                                <span style={{ background: '#fff3cd', border: '1px solid #b8860b', color: '#7a5000', padding: '0 3px', fontWeight: 'bold' }}>SUB</span>
                                                                <span>{ai.item_code || ai.item_id} &times;{parseFloat(ai.qty_used).toFixed(2)}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {c.notes && (
                                                    <div style={{ marginTop: 2, fontSize: 9, color: '#777', fontStyle: 'italic' }}>{c.notes}</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div style={{ fontFamily: xpFont, fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontWeight: 'bold', fontSize: 11, color: '#000080' }}>Work Orders (Operation Steps)</span>
                {!addingRow && !editId && (
                    <button
                        onClick={() => { setAddingRow(true); setEditId(null); }}
                        style={{ fontFamily: xpFont, fontSize: 10, padding: '1px 8px', background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }}
                    >
                        + Add Step
                    </button>
                )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                    <tr style={{ background: 'linear-gradient(to bottom, #ece9d8, #d4d0c8)', borderBottom: '1px solid #aca899' }}>
                        <th style={{ padding: '2px 4px', width: 16 }} />
                        <th style={{ padding: '2px 6px', textAlign: 'left', width: 40 }}>#</th>
                        <th style={{ padding: '2px 6px', textAlign: 'left' }}>Name</th>
                        <th style={{ padding: '2px 6px', textAlign: 'left', width: 110 }}>Work Center</th>
                        <th style={{ padding: '2px 6px', textAlign: 'left', width: 80 }}>Planned hrs</th>
                        <th style={{ padding: '2px 6px', textAlign: 'right', width: 90 }}>Target / Done</th>
                        <th style={{ padding: '2px 6px', textAlign: 'left', width: 80 }}>Status</th>
                        <th style={{ padding: '2px 6px', width: 90 }} />
                    </tr>
                </thead>
                <tbody>
                    {workOrders.map(wo => (
                        <React.Fragment key={wo.id}>
                            {editId === wo.id ? (
                                <tr style={{ background: '#fffbe6' }}>
                                    <td />
                                    <td style={{ padding: '2px 4px' }}>
                                        <input style={{ ...xpInput, width: 32 }} value={form.sequence} onChange={e => setForm(f => ({ ...f, sequence: e.target.value }))} />
                                    </td>
                                    <td style={{ padding: '2px 4px' }}>
                                        <input style={{ ...xpInput, width: '100%' }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                                    </td>
                                    <td style={{ padding: '2px 4px' }}>
                                        <select style={{ ...xpInput, width: '100%' }} value={form.work_center_id} onChange={e => setForm(f => ({ ...f, work_center_id: e.target.value }))}>
                                            <option value="">—</option>
                                            {workCenters.map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '2px 4px' }}>
                                        <input type="number" min="0" step="0.5" style={{ ...xpInput, width: 56 }} value={form.planned_duration_hours} onChange={e => setForm(f => ({ ...f, planned_duration_hours: e.target.value }))} />
                                    </td>
                                    <td style={{ padding: '2px 4px' }}>
                                        <input type="number" min="0" step="any" style={{ ...xpInput, width: 70 }} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="Target qty" />
                                    </td>
                                    <td />
                                    <td style={{ padding: '2px 4px', whiteSpace: 'nowrap' }}>
                                        <button onClick={handleSave} disabled={isSaving} style={{ fontFamily: xpFont, fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom, #b0e8b0, #70c870)', border: '1px solid #0a3e0a', cursor: 'pointer', marginRight: 2 }}>Save</button>
                                        <button onClick={resetForm} style={{ fontFamily: xpFont, fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '1px solid #808080', cursor: 'pointer' }}>Cancel</button>
                                    </td>
                                </tr>
                            ) : (
                                <tr style={{ borderBottom: '1px solid #e4e1d8', background: expandedWOId === wo.id ? '#eef2ff' : undefined }}>
                                    <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => setExpandedWOId(prev => prev === wo.id ? null : wo.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#555', padding: 0, lineHeight: 1 }}
                                            title={expandedWOId === wo.id ? 'Collapse' : 'Expand details'}
                                        >
                                            {expandedWOId === wo.id ? '▼' : '►'}
                                        </button>
                                    </td>
                                    <td style={{ padding: '2px 6px', color: '#888' }}>{wo.sequence}</td>
                                    <td style={{ padding: '2px 6px', fontWeight: 500 }}>{wo.name}</td>
                                    <td style={{ padding: '2px 6px', color: '#555', fontSize: 10 }}>{wo.work_center_name || '—'}</td>
                                    <td style={{ padding: '2px 6px', fontSize: 10 }}>
                                        {wo.planned_duration_hours != null ? `${wo.planned_duration_hours}h` : '—'}
                                        {wo.actual_duration_hours != null ? ` / ${wo.actual_duration_hours}h actual` : ''}
                                    </td>
                                    <td style={{ padding: '2px 6px', textAlign: 'right', fontSize: 10 }}>
                                        {wo.qty != null ? (
                                            <span>
                                                <span style={{ color: (wo.qty_completed_total ?? 0) >= wo.qty ? '#007000' : '#555' }}>
                                                    {(wo.qty_completed_total ?? 0).toFixed(2)}
                                                </span>
                                                <span style={{ color: '#999' }}> / {wo.qty}</span>
                                            </span>
                                        ) : '—'}
                                    </td>
                                    <td style={{ padding: '2px 6px' }}>
                                        <select
                                            value={wo.status}
                                            onChange={e => {
                                                const s = e.target.value;
                                                if (s === 'COMPLETED' && wo.qty && (wo.qty_completed_total ?? 0) < wo.qty) {
                                                    alert(`Target not reached: ${(wo.qty_completed_total ?? 0).toFixed(2)} of ${wo.qty} produced. Log more output first.`);
                                                    return;
                                                }
                                                onUpdateStatus(wo.id, s);
                                            }}
                                            style={{ fontFamily: xpFont, fontSize: 10, border: '1px solid #aca899', background: '#ece9d8', color: STATUS_COLORS[wo.status] || '#000', height: 18, padding: '0 2px' }}
                                        >
                                            {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => (
                                                <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td style={{ padding: '2px 4px', whiteSpace: 'nowrap' }}>
                                        {onLogWO && wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED' && (
                                            <button
                                                onClick={() => onLogWO(wo)}
                                                style={{ fontFamily: xpFont, fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom, #b0e8b0, #70c870)', border: '1px solid #0a3e0a', cursor: 'pointer', color: '#004000', marginRight: 4 }}
                                            >
                                                Log
                                            </button>
                                        )}
                                        {parentMO && (
                                            <button onClick={() => setPrintWO(wo)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#555', marginRight: 4 }} title="Print Kartu Kerja">
                                                <i className="bi bi-printer" />
                                            </button>
                                        )}
                                        <button onClick={() => startEdit(wo)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0058e6', marginRight: 4 }}>
                                            <i className="bi bi-pencil" />
                                        </button>
                                        <button onClick={() => onDelete(wo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#a00' }}>
                                            <i className="bi bi-trash" />
                                        </button>
                                    </td>
                                </tr>
                            )}
                            {expandedWOId === wo.id && editId !== wo.id && renderDetailPanel(wo)}
                        </React.Fragment>
                    ))}

                    {addingRow && (
                        <tr style={{ background: '#fffbe6' }}>
                            <td />
                            <td style={{ padding: '2px 4px' }}>
                                <input style={{ ...xpInput, width: 32 }} value={form.sequence} onChange={e => setForm(f => ({ ...f, sequence: e.target.value }))} placeholder={String(workOrders.length + 1)} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                                <input style={{ ...xpInput, width: '100%' }} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Operation name" autoFocus />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                                <select style={{ ...xpInput, width: '100%' }} value={form.work_center_id} onChange={e => setForm(f => ({ ...f, work_center_id: e.target.value }))}>
                                    <option value="">—</option>
                                    {workCenters.map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                                </select>
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                                <input type="number" min="0" step="0.5" style={{ ...xpInput, width: 56 }} value={form.planned_duration_hours} onChange={e => setForm(f => ({ ...f, planned_duration_hours: e.target.value }))} placeholder="0" />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                                <input type="number" min="0" step="any" style={{ ...xpInput, width: 70 }} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} placeholder="Target qty" />
                            </td>
                            <td />
                            <td style={{ padding: '2px 4px', whiteSpace: 'nowrap' }}>
                                <button onClick={handleSave} disabled={isSaving} style={{ fontFamily: xpFont, fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom, #b0e8b0, #70c870)', border: '1px solid #0a3e0a', cursor: 'pointer', marginRight: 2 }}>Add</button>
                                <button onClick={resetForm} style={{ fontFamily: xpFont, fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '1px solid #808080', cursor: 'pointer' }}>Cancel</button>
                            </td>
                        </tr>
                    )}

                    {workOrders.length === 0 && !addingRow && (
                        <tr>
                            <td colSpan={8} style={{ padding: '6px 8px', color: '#888', fontStyle: 'italic', textAlign: 'center' }}>
                                No operation steps yet. Click + Add Step to add one.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {printWO && parentMO && (
                <WOStepPrintModal
                    workOrder={printWO}
                    parentMO={parentMO}
                    onClose={() => setPrintWO(null)}
                />
            )}
        </div>
    );
}
