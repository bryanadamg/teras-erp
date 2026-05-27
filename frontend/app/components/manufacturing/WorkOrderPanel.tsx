'use client';
import React, { useState } from 'react';
import WOStepPrintModal from './WOStepPrintModal';
import { useToast } from '../shared/Toast';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', height: 20, padding: '0 4px', outline: 'none',
};

const STATUS_BORDER: Record<string, string> = {
    PENDING: '#c8c6be',
    IN_PROGRESS: '#6699dd',
    COMPLETED: '#44aa44',
    CANCELLED: '#cc4444',
};

// Work center type chip colors keyed on center_type string (case-insensitive match)
export function getChipStyle(centerType?: string | null): React.CSSProperties {
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
    input_location_id?: string;
    output_location_id?: string;
    input_location?: { id: string; code: string; name: string } | null;
    output_location?: { id: string; code: string; name: string } | null;
    status: string;
    planned_duration_hours?: number;
    actual_duration_hours?: number;
    qty?: number;
    qty_completed_total?: number;
    notes?: string;
}

const emptyForm = { work_center_id: '', input_location_id: '', output_location_id: '', planned_duration_hours: '', qty: '' };

interface Props {
    manufacturingOrderId: string;
    workOrders: WO[];
    workCenters: any[];
    locations?: any[];
    onAdd: (payload: any) => Promise<any>;
    onUpdate: (id: string, payload: any) => Promise<any>;
    onUpdateStatus: (id: string, status: string) => Promise<any>;
    onDelete: (id: string) => Promise<any>;
    onLogWO?: (wo: WO) => void;
    parentMO?: any;
}

export default function WorkOrderPanel({
    manufacturingOrderId, workOrders, workCenters, locations,
    onAdd, onUpdate, onUpdateStatus, onDelete, onLogWO, parentMO,
}: Props) {
    const { showToast } = useToast();
    const [addingRow, setAddingRow] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [isSaving, setIsSaving] = useState(false);
    const [printWO, setPrintWO] = useState<WO | null>(null);
    const [overAssignWarning, setOverAssignWarning] = useState<{ totalAssigned: number; moQty: number } | null>(null);

    const locationList = locations || [];

    const resetForm = () => {
        setForm({ ...emptyForm });
        setAddingRow(false);
        setEditId(null);
    };

    const handleWCChange = (wcId: string) => {
        const wc = workCenters.find((w: any) => w.id === wcId);
        setForm(f => ({
            ...f,
            work_center_id: wcId,
            input_location_id: wc?.input_location_id || '',
            output_location_id: wc?.output_location_id || '',
        }));
    };

    const handleAdd = async () => {
        setIsSaving(true);
        try {
            const res = await onAdd({
                manufacturing_order_id: manufacturingOrderId,
                work_center_id: form.work_center_id || undefined,
                input_location_id: form.input_location_id || undefined,
                output_location_id: form.output_location_id || undefined,
                planned_duration_hours: form.planned_duration_hours ? parseFloat(form.planned_duration_hours) : undefined,
                qty: form.qty ? parseFloat(form.qty) : undefined,
            });
            if (res && !res.ok) {
                try {
                    const err = await res.json();
                    showToast(err.detail || 'Failed to create work order', 'danger');
                } catch {
                    showToast('Failed to create work order', 'danger');
                }
                return;
            }
            const result = res && res.ok ? await res.json().catch(() => null) : res;
            if (result?.warning === 'total_assigned_exceeds_mo_qty') {
                setOverAssignWarning({ totalAssigned: result.total_assigned, moQty: result.mo_qty });
            } else {
                setOverAssignWarning(null);
            }
            resetForm();
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdate = async (wo: WO) => {
        setIsSaving(true);
        try {
            const result = await onUpdate(wo.id, {
                manufacturing_order_id: manufacturingOrderId,
                sequence: wo.sequence,
                name: wo.name,
                work_center_id: form.work_center_id || undefined,
                input_location_id: form.input_location_id || undefined,
                output_location_id: form.output_location_id || undefined,
                planned_duration_hours: form.planned_duration_hours ? parseFloat(form.planned_duration_hours) : undefined,
                qty: form.qty ? parseFloat(form.qty) : undefined,
            });
            if (result?.warning === 'total_assigned_exceeds_mo_qty') {
                setOverAssignWarning({ totalAssigned: result.total_assigned, moQty: result.mo_qty });
            } else {
                setOverAssignWarning(null);
            }
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
            input_location_id: wo.input_location_id || '',
            output_location_id: wo.output_location_id || '',
            planned_duration_hours: wo.planned_duration_hours != null ? String(wo.planned_duration_hours) : '',
            qty: wo.qty != null ? String(wo.qty) : '',
        });
    };

    const handleStatusChange = (wo: WO, s: string) => {
        if (s === 'COMPLETED' && wo.qty && (wo.qty_completed_total ?? 0) < wo.qty) {
            showToast(`Note: ${(wo.qty_completed_total ?? 0).toFixed(2)} of ${wo.qty} logged — marking complete anyway.`, 'warning');
        }
        onUpdateStatus(wo.id, s);
    };

    const sorted = [...workOrders].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return (
        <div style={{ fontFamily: xpFont, fontSize: 11 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: parentMO ? 4 : 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: 11, color: '#000080' }}>
                    Work Orders
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
                        + Add Work Order
                    </button>
                )}
            </div>

            {/* MO context badge */}
            {parentMO && (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: '#e8eaf6', border: '1px solid #9fa8da',
                    padding: '1px 7px', marginBottom: 8, fontSize: 10, color: '#1a237e',
                }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{parentMO.code}</span>
                    {parentMO.item_name && (
                        <span style={{ color: '#3949ab' }}>{parentMO.item_name}</span>
                    )}
                    {parentMO.qty != null && (
                        <span style={{ color: '#5c6bc0' }}>· {parentMO.qty}</span>
                    )}
                </div>
            )}

            {overAssignWarning && (
                <div style={{
                    background: '#fff8e1', border: '1px solid #f0c040',
                    padding: '3px 8px', marginBottom: 6, fontSize: 10, color: '#7a5500',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span>
                        Total assigned ({overAssignWarning.totalAssigned.toFixed(1)}) exceeds MO qty ({overAssignWarning.moQty.toFixed(1)})
                    </span>
                    <button
                        onClick={() => setOverAssignWarning(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#7a5500', padding: '0 2px' }}
                    >
                        x
                    </button>
                </div>
            )}

            {/* Pipeline */}
            <div>
                {sorted.length === 0 && !addingRow && (
                    <div style={{ color: '#888', fontStyle: 'italic', fontSize: 11, padding: '4px 0' }}>
                        No work orders yet. Click + Add Work Order.
                    </div>
                )}

                {sorted.map((wo) => {
                    const pct = wo.qty ? Math.min(100, ((wo.qty_completed_total ?? 0) / wo.qty) * 100) : 0;
                    const done = wo.qty != null && (wo.qty_completed_total ?? 0) >= wo.qty;
                    const chipStyle = getChipStyle(wo.work_center_type);
                    const isEditing = editId === wo.id;

                    return (
                        <div key={wo.id} style={{ marginBottom: 5 }}>

                            {isEditing ? (
                                /* ── Edit row ── */
                                <div style={{
                                    border: '1px solid #7f9db9', background: '#fffbe6',
                                    padding: '5px 8px',
                                    borderLeft: `3px solid ${STATUS_BORDER[wo.status] || '#aaa'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#666', minWidth: 90 }}>
                                            {wo.code || `Step ${wo.sequence}`}
                                        </span>
                                        <select
                                            style={{ ...xpInput, flex: 1, minWidth: 130 }}
                                            value={form.work_center_id}
                                            onChange={e => handleWCChange(e.target.value)}
                                            autoFocus
                                        >
                                            <option value="">— No work center —</option>
                                            {workCenters.filter((wc: any) => !!wc.parent_id).map((wc: any) => (
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
                                    {locationList.length > 0 && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 96 }}>
                                            <select style={{ ...xpInput, minWidth: 120 }} value={form.input_location_id} onChange={e => setForm(f => ({ ...f, input_location_id: e.target.value }))}>
                                                <option value="">In: —</option>
                                                {locationList.map((l: any) => <option key={l.id} value={l.id}>In: {l.code}</option>)}
                                            </select>
                                            <select style={{ ...xpInput, minWidth: 120 }} value={form.output_location_id} onChange={e => setForm(f => ({ ...f, output_location_id: e.target.value }))}>
                                                <option value="">Out: —</option>
                                                {locationList.map((l: any) => <option key={l.id} value={l.id}>Out: {l.code}</option>)}
                                            </select>
                                        </div>
                                    )}
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
                                    <span style={{ fontSize: 11, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {wo.work_center_name || <span style={{ color: '#aaa' }}>— no work center —</span>}
                                    </span>

                                    {/* Location flow chips */}
                                    {(wo.input_location || wo.output_location) && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, fontSize: 9 }}>
                                            <span style={{ background: '#e8f0fe', color: '#1a56c4', border: '1px solid #b0c8f8', padding: '0 4px' }}>
                                                {wo.input_location?.code || '?'}
                                            </span>
                                            <span style={{ color: '#888' }}>&#8594;</span>
                                            <span style={{ background: '#e6f4ea', color: '#1a6e2e', border: '1px solid #a8d8b0', padding: '0 4px' }}>
                                                {wo.output_location?.code || '?'}
                                            </span>
                                        </span>
                                    )}

                                    {/* Flex spacer */}
                                    <span style={{ flex: 1 }} />

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
                                                        height: '100%', width: `${Math.min(100, pct)}%`,
                                                        background: done
                                                            ? 'repeating-linear-gradient(45deg,#b87000,#b87000 3px,#e8a020 3px,#e8a020 6px)'
                                                            : 'repeating-linear-gradient(45deg,#000080,#000080 3px,#1565c0 3px,#1565c0 6px)',
                                                    }} />
                                                )}
                                            </div>
                                            <span style={{ fontSize: 9, color: done ? '#b87000' : '#555', whiteSpace: 'nowrap' }}>
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
                                            color: STATUS_BORDER[wo.status] || '#000',
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
                    <div style={{ marginBottom: 4 }}>
                        <div style={{
                            border: '1px dashed #7f9db9', background: '#fffbe6',
                            padding: '6px 8px',
                        }}>
                            <div style={{ fontSize: 9, color: '#888', marginBottom: 4 }}>
                                New work order — code assigned on save
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                                <select
                                    style={{ ...xpInput, flex: 1, minWidth: 140 }}
                                    value={form.work_center_id}
                                    onChange={e => handleWCChange(e.target.value)}
                                    autoFocus
                                >
                                    <option value="">— Select work center —</option>
                                    {workCenters.filter((wc: any) => !!wc.parent_id).map((wc: any) => (
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
                            {(form.input_location_id || form.output_location_id) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#555', paddingLeft: 4 }}>
                                    <span style={{ background: '#e8f0fe', color: '#1a56c4', border: '1px solid #b0c8f8', padding: '0 4px' }}>
                                        {locationList.find((l: any) => l.id === form.input_location_id)?.code || '?'}
                                    </span>
                                    <span>&#8594;</span>
                                    <span style={{ background: '#e6f4ea', color: '#1a6e2e', border: '1px solid #a8d8b0', padding: '0 4px' }}>
                                        {locationList.find((l: any) => l.id === form.output_location_id)?.code || '?'}
                                    </span>
                                    <span style={{ color: '#aaa' }}>(from work center)</span>
                                </div>
                            )}
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
