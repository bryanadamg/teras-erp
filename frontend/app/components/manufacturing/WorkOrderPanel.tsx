'use client';
import React, { useState } from 'react';
import WOStepPrintModal from './WOStepPrintModal';
import { useToast } from '../shared/Toast';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', height: 20, padding: '0 4px', outline: 'none',
};

const STATUS_LED: Record<string, string> = {
    PENDING: '#aaaaaa',
    IN_PROGRESS: '#0058e6',
    COMPLETED: '#008000',
    CANCELLED: '#bb0000',
};

const STATUS_BORDER: Record<string, string> = {
    PENDING: '#c8c6be',
    IN_PROGRESS: '#6699dd',
    COMPLETED: '#44aa44',
    CANCELLED: '#cc4444',
};

// Work center type chip colors keyed on center_type string (case-insensitive match)
function getChipStyle(centerType?: string | null): React.CSSProperties {
    const t = (centerType || '').toUpperCase();
    if (t === 'DYEING' || t === 'CELUP')
        return { background: '#cce4ff', color: '#004b99', borderColor: '#99c4ee' };
    if (t === 'SETTING')
        return { background: '#ffeacc', color: '#994d00', borderColor: '#e8c488' };
    if (t === 'WEAVING' || t === 'TENUN')
        return { background: '#e8d8ff', color: '#440099', borderColor: '#c4a8ee' };
    if (t === 'FINISHING' || t === 'FINISH')
        return { background: '#d4f0d4', color: '#005500', borderColor: '#99cc99' };
    if (t === 'CUTTING' || t === 'POTONG')
        return { background: '#fff0cc', color: '#886600', borderColor: '#ddcc88' };
    return { background: '#e4e2dc', color: '#444444', borderColor: '#c4c2ba' };
}

interface WO {
    id: string;
    sequence: number;
    code?: string;
    name: string;
    work_center_name?: string;
    work_center_id?: string;
    work_center_type?: string;
    status: string;
    planned_duration_hours?: number;
    actual_duration_hours?: number;
    qty?: number;
    qty_completed_total?: number;
    notes?: string;
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
    const { showToast } = useToast();
    const [addingRow, setAddingRow] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ work_center_id: '', planned_duration_hours: '', qty: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [printWO, setPrintWO] = useState<WO | null>(null);

    const resetForm = () => {
        setForm({ work_center_id: '', planned_duration_hours: '', qty: '' });
        setAddingRow(false);
        setEditId(null);
    };

    const handleAdd = async () => {
        setIsSaving(true);
        try {
            await onAdd({
                manufacturing_order_id: manufacturingOrderId,
                work_center_id: form.work_center_id || undefined,
                planned_duration_hours: form.planned_duration_hours ? parseFloat(form.planned_duration_hours) : undefined,
                qty: form.qty ? parseFloat(form.qty) : undefined,
            });
            resetForm();
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdate = async (wo: WO) => {
        setIsSaving(true);
        try {
            await onUpdate(wo.id, {
                manufacturing_order_id: manufacturingOrderId,
                sequence: wo.sequence,
                name: wo.name,
                work_center_id: form.work_center_id || undefined,
                planned_duration_hours: form.planned_duration_hours ? parseFloat(form.planned_duration_hours) : undefined,
                qty: form.qty ? parseFloat(form.qty) : undefined,
            });
            resetForm();
        } finally {
            setIsSaving(false);
        }
    };

    const startEdit = (wo: WO) => {
        setEditId(wo.id);
        setAddingRow(false);
        setForm({
            work_center_id: wo.work_center_id || '',
            planned_duration_hours: wo.planned_duration_hours != null ? String(wo.planned_duration_hours) : '',
            qty: wo.qty != null ? String(wo.qty) : '',
        });
    };

    const handleStatusChange = (wo: WO, s: string) => {
        if (s === 'COMPLETED' && wo.qty && (wo.qty_completed_total ?? 0) < wo.qty) {
            showToast(`Target not reached: ${(wo.qty_completed_total ?? 0).toFixed(2)} of ${wo.qty} produced. Log more output first.`, 'warning');
            return;
        }
        onUpdateStatus(wo.id, s);
    };

    const sorted = [...workOrders].sort((a, b) => a.sequence - b.sequence);

    return (
        <div style={{ fontFamily: xpFont, fontSize: 11 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: 11, color: '#000080' }}>
                    Operation Steps
                </span>
                {!addingRow && !editId && (
                    <button
                        onClick={() => { setAddingRow(true); setEditId(null); }}
                        style={{
                            fontFamily: xpFont, fontSize: 10, padding: '1px 10px',
                            background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                            border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                            cursor: 'pointer',
                        }}
                    >
                        + Add Step
                    </button>
                )}
            </div>

            {/* Pipeline */}
            <div style={{ position: 'relative', paddingLeft: 22 }}>
                {/* Vertical connector line */}
                {sorted.length > 0 && (
                    <div style={{
                        position: 'absolute', left: 8, top: 10,
                        bottom: addingRow ? 0 : 10,
                        borderLeft: '2px solid #aca899',
                        zIndex: 0,
                    }} />
                )}

                {sorted.length === 0 && !addingRow && (
                    <div style={{ color: '#888', fontStyle: 'italic', fontSize: 11, padding: '4px 0' }}>
                        No steps yet. Click + Add Step.
                    </div>
                )}

                {sorted.map((wo) => {
                    const pct = wo.qty ? Math.min(100, ((wo.qty_completed_total ?? 0) / wo.qty) * 100) : 0;
                    const done = wo.qty != null && (wo.qty_completed_total ?? 0) >= wo.qty;
                    const chipStyle = getChipStyle(wo.work_center_type);
                    const isEditing = editId === wo.id;

                    return (
                        <div key={wo.id} style={{ position: 'relative', marginBottom: 5 }}>
                            {/* Status LED circle */}
                            <div style={{
                                position: 'absolute', left: -14, top: 7,
                                width: 12, height: 12, borderRadius: '50%',
                                background: STATUS_LED[wo.status] || '#aaa',
                                border: '1px solid rgba(0,0,0,0.25)',
                                boxShadow: wo.status === 'IN_PROGRESS' ? '0 0 4px #0058e6' : undefined,
                                zIndex: 1,
                            }} />

                            {isEditing ? (
                                /* ── Edit row ── */
                                <div style={{
                                    border: '1px solid #7f9db9', background: '#fffbe6',
                                    padding: '5px 8px',
                                    borderLeft: `3px solid ${STATUS_BORDER[wo.status] || '#aaa'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#666', minWidth: 90 }}>
                                            {wo.code || `Step ${wo.sequence}`}
                                        </span>
                                        <select
                                            style={{ ...xpInput, flex: 1, minWidth: 130 }}
                                            value={form.work_center_id}
                                            onChange={e => setForm(f => ({ ...f, work_center_id: e.target.value }))}
                                            autoFocus
                                        >
                                            <option value="">— No work center —</option>
                                            {workCenters.map((wc: any) => (
                                                <option key={wc.id} value={wc.id}>{wc.name}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number" min="0" step="0.5"
                                            style={{ ...xpInput, width: 52 }}
                                            value={form.planned_duration_hours}
                                            onChange={e => setForm(f => ({ ...f, planned_duration_hours: e.target.value }))}
                                            placeholder="Hrs"
                                        />
                                        <input
                                            type="number" min="0" step="any"
                                            style={{ ...xpInput, width: 64 }}
                                            value={form.qty}
                                            onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                                            placeholder="Target qty"
                                        />
                                        <button
                                            onClick={() => handleUpdate(wo)}
                                            disabled={isSaving}
                                            style={{
                                                fontFamily: xpFont, fontSize: 10, padding: '1px 8px',
                                                background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                                border: '1px solid #0a3e0a', cursor: 'pointer',
                                            }}
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={resetForm}
                                            style={{
                                                fontFamily: xpFont, fontSize: 10, padding: '1px 6px',
                                                background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                                                border: '1px solid #808080', cursor: 'pointer',
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* ── Display row ── */
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '3px 7px',
                                    background: '#f8f7f2',
                                    border: '1px solid #d4d0c8',
                                    borderLeft: `3px solid ${STATUS_BORDER[wo.status] || '#c8c6be'}`,
                                }}>
                                    {/* WO Code */}
                                    <span style={{
                                        fontFamily: 'monospace', fontWeight: 'bold', fontSize: 10,
                                        color: '#000080', minWidth: 90, whiteSpace: 'nowrap',
                                    }}>
                                        {wo.code || `Step ${wo.sequence}`}
                                    </span>

                                    {/* Work center type chip */}
                                    {wo.work_center_type && (
                                        <span style={{
                                            padding: '0 5px', fontSize: 9, fontWeight: 'bold',
                                            border: `1px solid ${chipStyle.borderColor}`,
                                            background: chipStyle.background,
                                            color: chipStyle.color,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {wo.work_center_type.toUpperCase()}
                                        </span>
                                    )}

                                    {/* Work center name */}
                                    <span style={{ flex: 1, fontSize: 11, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {wo.work_center_name || <span style={{ color: '#aaa' }}>— no work center —</span>}
                                    </span>

                                    {/* Progress bar */}
                                    {wo.qty != null ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                            <div style={{
                                                width: 68, height: 10,
                                                border: '1px solid #7f9db9', background: '#fff',
                                                position: 'relative', overflow: 'hidden',
                                            }}>
                                                {pct > 0 && (
                                                    <div style={{
                                                        height: '100%', width: `${pct}%`,
                                                        background: done
                                                            ? 'repeating-linear-gradient(45deg,#2e7d32,#2e7d32 3px,#4caf50 3px,#4caf50 6px)'
                                                            : 'repeating-linear-gradient(45deg,#000080,#000080 3px,#1565c0 3px,#1565c0 6px)',
                                                    }} />
                                                )}
                                            </div>
                                            <span style={{ fontSize: 9, color: done ? '#007000' : '#555', whiteSpace: 'nowrap' }}>
                                                {(wo.qty_completed_total ?? 0).toFixed(1)}/{wo.qty}
                                            </span>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: 9, color: '#bbb', width: 100, textAlign: 'right', flexShrink: 0 }}>—</span>
                                    )}

                                    {/* Planned hours */}
                                    <span style={{ fontSize: 9, color: '#666', minWidth: 26, textAlign: 'right', flexShrink: 0 }}>
                                        {wo.planned_duration_hours != null ? `${wo.planned_duration_hours}h` : ''}
                                    </span>

                                    {/* Status select */}
                                    <select
                                        value={wo.status}
                                        onChange={e => handleStatusChange(wo, e.target.value)}
                                        style={{
                                            fontFamily: xpFont, fontSize: 9, height: 16,
                                            border: '1px solid #aca899', background: '#ece9d8',
                                            color: STATUS_LED[wo.status] || '#000',
                                            padding: '0 2px', flexShrink: 0, minWidth: 82,
                                        }}
                                    >
                                        {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => (
                                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                                        ))}
                                    </select>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                                        {onLogWO && wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED' && (
                                            <button
                                                onClick={() => onLogWO(wo)}
                                                style={{
                                                    fontFamily: xpFont, fontSize: 10, padding: '0px 6px',
                                                    background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                                    border: '1px solid #0a3e0a', cursor: 'pointer', color: '#004000',
                                                }}
                                            >
                                                Log
                                            </button>
                                        )}
                                        {parentMO && (
                                            <button
                                                onClick={() => setPrintWO(wo)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#555', padding: '0 2px' }}
                                                title="Print Kartu Kerja"
                                            >
                                                <i className="bi bi-printer" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => startEdit(wo)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#0058e6', padding: '0 2px' }}
                                        >
                                            <i className="bi bi-pencil" />
                                        </button>
                                        <button
                                            onClick={() => onDelete(wo.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#aa0000', padding: '0 2px' }}
                                        >
                                            <i className="bi bi-trash" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Add step form */}
                {addingRow && (
                    <div style={{ position: 'relative', marginBottom: 4 }}>
                        {/* Dashed circle for new step */}
                        <div style={{
                            position: 'absolute', left: -14, top: 7,
                            width: 12, height: 12, borderRadius: '50%',
                            border: '2px dashed #7f9db9', background: '#f0efe6',
                            zIndex: 1,
                        }} />
                        <div style={{
                            border: '1px dashed #7f9db9', background: '#fffbe6',
                            padding: '6px 8px',
                        }}>
                            <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>
                                New step — code assigned on save
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <select
                                    style={{ ...xpInput, flex: 1, minWidth: 140 }}
                                    value={form.work_center_id}
                                    onChange={e => setForm(f => ({ ...f, work_center_id: e.target.value }))}
                                    autoFocus
                                >
                                    <option value="">— Select work center —</option>
                                    {workCenters.map((wc: any) => (
                                        <option key={wc.id} value={wc.id}>{wc.name}</option>
                                    ))}
                                </select>
                                <label style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>
                                    Planned hrs:
                                    <input
                                        type="number" min="0" step="0.5"
                                        style={{ ...xpInput, width: 48, marginLeft: 4 }}
                                        value={form.planned_duration_hours}
                                        onChange={e => setForm(f => ({ ...f, planned_duration_hours: e.target.value }))}
                                        placeholder="0"
                                    />
                                </label>
                                <label style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>
                                    Target qty:
                                    <input
                                        type="number" min="0" step="any"
                                        style={{ ...xpInput, width: 60, marginLeft: 4 }}
                                        value={form.qty}
                                        onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                                        placeholder="0"
                                    />
                                </label>
                                <button
                                    onClick={handleAdd}
                                    disabled={isSaving}
                                    style={{
                                        fontFamily: xpFont, fontSize: 10, padding: '1px 10px',
                                        background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                        border: '1px solid #0a3e0a', cursor: 'pointer',
                                    }}
                                >
                                    {isSaving ? '...' : 'Add'}
                                </button>
                                <button
                                    onClick={resetForm}
                                    style={{
                                        fontFamily: xpFont, fontSize: 10, padding: '1px 6px',
                                        background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                                        border: '1px solid #808080', cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

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
