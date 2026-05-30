'use client';
import React, { useState, useMemo, useEffect } from 'react';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../shared/Toast';
import WOCompletionModal from './WOCompletionModal';
import WOStepPrintModal from './WOStepPrintModal';
import { getChipStyle } from './WorkOrderPanel';

const STATUS_COLORS: Record<string, string> = {
    PENDING: '#888',
    IN_PROGRESS: '#0058e6',
    COMPLETED: '#008000',
    CANCELLED: '#a00',
};

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

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

interface Props {
    manufacturingOrders: any[];
    workCenters: any[];
    onUpdate: (id: string, payload: any) => Promise<any>;
    onUpdateStatus: (id: string, status: string) => Promise<any>;
    onDelete: (id: string) => Promise<any>;
}

interface FlatWO {
    id: string;
    sequence: number;
    name: string;
    work_center_id?: string;
    work_center_name?: string;
    work_center_type?: string;
    input_location_id?: string;
    output_location_id?: string;
    input_location?: { id: string; code: string; name: string } | null;
    output_location?: { id: string; code: string; name: string } | null;
    status: string;
    planned_duration_hours?: number;
    actual_duration_hours?: number;
    actual_start_date?: string;
    actual_end_date?: string;
    target_start_date?: string;
    target_end_date?: string;
    created_at?: string;
    qty?: number;
    qty_completed_total?: number;
    notes?: string;
    completions?: any[];
    mo_id: string;
    mo_code: string;
    item_name: string;
}

export default function WorkOrderListView({ manufacturingOrders, workCenters, onUpdate, onUpdateStatus, onDelete }: Props) {
    const router = useRouter();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { fetchData } = useData();
    const { showToast } = useToast();

    const [editId, setEditId] = useState<string | null>(null);
    const [completionMO, setCompletionMO] = useState<any>(null);
    const [completionWO, setCompletionWO] = useState<any>(null);
    const [printWO, setPrintWO] = useState<FlatWO | null>(null);
    const [printMO, setPrintMO] = useState<any>(null);
    const [form, setForm] = useState({ sequence: '', name: '', work_center_id: '', planned_duration_hours: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterWC, setFilterWC] = useState('');
    const [filterMO, setFilterMO] = useState('');
    const [expandedWOId, setExpandedWOId] = useState<string | null>(null);
    const [woQrUrls, setWoQrUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!expandedWOId || woQrUrls[expandedWOId]) return;
        QRCode.toDataURL(expandedWOId, { margin: 1, width: 200 })
            .then(url => setWoQrUrls(prev => ({ ...prev, [expandedWOId]: url })))
            .catch(() => {});
    }, [expandedWOId]);

    const flatWOs = useMemo<FlatWO[]>(() => {
        const result: FlatWO[] = [];
        for (const mo of manufacturingOrders) {
            for (const wo of (mo.work_orders || [])) {
                result.push({
                    ...wo,
                    mo_id: mo.id,
                    mo_code: mo.code,
                    item_name: mo.item_name || '',
                });
            }
        }
        result.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA || a.sequence - b.sequence;
        });
        return result;
    }, [manufacturingOrders]);

    const filtered = useMemo(() => flatWOs.filter(wo => {
        if (filterStatus && wo.status !== filterStatus) return false;
        if (filterWC && wo.work_center_id !== filterWC) return false;
        if (filterMO && wo.mo_id !== filterMO) return false;
        return true;
    }), [flatWOs, filterStatus, filterWC, filterMO]);

    const startEdit = (wo: FlatWO) => {
        setEditId(wo.id);
        setForm({
            sequence: String(wo.sequence),
            name: wo.name,
            work_center_id: wo.work_center_id || '',
            planned_duration_hours: wo.planned_duration_hours != null ? String(wo.planned_duration_hours) : '',
        });
    };

    const handleSave = async (wo: FlatWO) => {
        setIsSaving(true);
        try {
            await onUpdate(wo.id, {
                manufacturing_order_id: wo.mo_id,
                sequence: parseInt(form.sequence) || wo.sequence,
                name: wo.name,
                work_center_id: form.work_center_id || undefined,
                planned_duration_hours: form.planned_duration_hours ? parseFloat(form.planned_duration_hours) : undefined,
            });
            setEditId(null);
        } finally {
            setIsSaving(false);
        }
    };

    const canComplete = (wo: FlatWO) => !wo.qty || (wo.qty_completed_total ?? 0) >= wo.qty;

    const openLog = (wo: FlatWO) => {
        const mo = manufacturingOrders.find(m => m.id === wo.mo_id);
        setCompletionMO(mo ?? null);
        setCompletionWO(wo);
    };

    const xpFont = 'Tahoma, "Segoe UI", sans-serif';
    const xpInput: React.CSSProperties = {
        fontFamily: xpFont, fontSize: 11,
        border: '1px solid #7f9db9', background: 'white', height: 20, padding: '0 4px', outline: 'none',
    };

    const statusChip = (status: string) => {
        if (!classic) return <span className={`badge extra-small ${
            status === 'COMPLETED' ? 'bg-success' :
            status === 'IN_PROGRESS' ? 'bg-warning text-dark' :
            status === 'CANCELLED' ? 'bg-danger' : 'bg-secondary'
        }`}>{status.replace('_', ' ')}</span>;

        const chipStyle: React.CSSProperties = {
            display: 'inline-block', fontSize: 9, fontWeight: 'bold',
            padding: '1px 6px', borderRadius: 0, border: '1px solid',
            fontFamily: xpFont,
        };
        switch (status) {
            case 'COMPLETED':   return <span style={{ ...chipStyle, background: '#2d7a2d', borderColor: '#1a5e1a', color: '#fff' }}>COMPLETED</span>;
            case 'IN_PROGRESS': return <span style={{ ...chipStyle, background: '#0058e6', borderColor: '#003080', color: '#fff' }}>IN PROGRESS</span>;
            case 'CANCELLED':   return <span style={{ ...chipStyle, background: '#c00000', borderColor: '#800000', color: '#fff' }}>CANCELLED</span>;
            default:            return <span style={{ ...chipStyle, background: '#d4d0c8', borderColor: '#808080', color: '#333' }}>PENDING</span>;
        }
    };

    const moOptions = useMemo(() =>
        manufacturingOrders.map(mo => ({ id: mo.id, label: `${mo.code} — ${mo.item_name || ''}` })),
        [manufacturingOrders]
    );

    const COLS = 13; // chevron + 11 data cols + actions

    const renderDetailPanel = (wo: FlatWO) => {
        const parentMO = manufacturingOrders.find(m => m.id === wo.mo_id);
        const bomItemIds = new Set<string>((parentMO?.bom?.lines || []).map((l: any) => l.item_id as string));
        const completions: any[] = (parentMO?.completions || [])
            .filter((c: any) => c.work_order_id === wo.id)
            .reverse();

        const panelStyle: React.CSSProperties = {
            display: 'grid', gridTemplateColumns: '110px 192px 1fr',
            border: classic ? '1px solid #7f9db9' : '1px solid #dee2e6',
            fontFamily: xpFont, fontSize: 10,
        };
        const colHeaderStyle: React.CSSProperties = {
            fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#555',
            letterSpacing: 0.5, borderBottom: '1px solid #c0bdb5', paddingBottom: 2, marginBottom: 4, width: '100%',
        };
        const infoRow = (label: string, val: string) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1, fontSize: 9 }}>
                <span style={{ color: '#888' }}>{label}</span>
                <span style={{ fontWeight: 'bold', color: '#222', textAlign: 'right', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
            </div>
        );

        return (
            <tr key={`${wo.id}-detail`}>
                <td colSpan={COLS} style={{ padding: '0 4px 6px', background: '#eef2ff' }}>
                    <div style={panelStyle}>
                        {/* QR Code */}
                        <div style={{ borderRight: '1px solid #c0bdb5', padding: '6px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: '#f5f4ef' }}>
                            <div style={{ ...colHeaderStyle, alignSelf: 'flex-start' }}>QR</div>
                            {woQrUrls[wo.id]
                                ? <img src={woQrUrls[wo.id]} alt="QR" style={{ width: 76, height: 76, border: '1px solid #ccc' }} />
                                : <div style={{ width: 76, height: 76, background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#888' }}>...</div>
                            }
                            <div style={{ fontFamily: 'monospace', fontSize: 6, color: '#bbb', wordBreak: 'break-all', textAlign: 'center', maxWidth: 96 }}>{wo.id}</div>
                        </div>

                        {/* Timeline & Info — compact two-column key/value */}
                        <div style={{ borderRight: '1px solid #c0bdb5', padding: '6px 8px', background: '#f5f4ef' }}>
                            <div style={colHeaderStyle}>Info</div>
                            {infoRow('MO', wo.mo_code)}
                            {infoRow('Product', wo.item_name || '—')}
                            {infoRow('Work Center', wo.work_center_name || '—')}
                            {(wo.input_location || wo.output_location) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2, marginTop: 1 }}>
                                    <span style={{ color: '#888', fontSize: 9, minWidth: 60 }}>Location</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9 }}>
                                        <span style={{ background: '#e8f0fe', color: '#1a56c4', border: '1px solid #b0c8f8', padding: '0 4px' }}>
                                            {wo.input_location?.code || '?'}
                                        </span>
                                        <span style={{ color: '#888' }}>&#8594;</span>
                                        <span style={{ background: '#e6f4ea', color: '#1a6e2e', border: '1px solid #a8d8b0', padding: '0 4px' }}>
                                            {wo.output_location?.code || '?'}
                                        </span>
                                    </span>
                                </div>
                            )}
                            <div style={{ borderTop: '1px solid #e0ddd8', margin: '3px 0' }} />
                            {infoRow('Target Start', fmtDate(wo.target_start_date))}
                            {infoRow('Target End',   fmtDate(wo.target_end_date))}
                            {infoRow('Actual Start', fmtDateTime(wo.actual_start_date))}
                            {infoRow('Actual End',   fmtDateTime(wo.actual_end_date))}
                            <div style={{ borderTop: '1px solid #e0ddd8', margin: '3px 0' }} />
                            {infoRow('Planned hrs', wo.planned_duration_hours != null ? `${wo.planned_duration_hours}h` : '—')}
                            {infoRow('Actual hrs',  wo.actual_duration_hours != null  ? `${wo.actual_duration_hours}h`  : '—')}
                            {wo.notes && (
                                <div style={{ marginTop: 4, padding: '2px 5px', background: '#fffbe6', border: '1px solid #e0d080', fontSize: 9, fontStyle: 'italic', color: '#666' }}>
                                    {wo.notes}
                                </div>
                            )}
                        </div>

                        {/* Completion Log — compact table rows */}
                        <div style={{ padding: '6px 8px', background: '#f5f4ef', overflow: 'hidden' }}>
                            <div style={colHeaderStyle}>Completion Log ({completions.length})</div>
                            {completions.length === 0 ? (
                                <div style={{ color: '#aaa', fontStyle: 'italic', fontSize: 9 }}>No entries yet.</div>
                            ) : (
                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                                        <thead>
                                            <tr style={{ background: 'linear-gradient(to bottom,#ece9d8,#d4d0c8)', borderBottom: '1px solid #aca899' }}>
                                                <th style={{ padding: '1px 5px', textAlign: 'left', fontWeight: 'bold', color: '#444', width: 110 }}>Date / Time</th>
                                                <th style={{ padding: '1px 5px', textAlign: 'right', fontWeight: 'bold', color: '#444', width: 44 }}>Qty</th>
                                                <th style={{ padding: '1px 5px', textAlign: 'left', fontWeight: 'bold', color: '#444' }}>Operator</th>
                                                <th style={{ padding: '1px 5px', textAlign: 'left', fontWeight: 'bold', color: '#444' }}>Machine</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completions.map((c: any, ci: number) => {
                                                const substitutes = (c.actual_items || []).filter((ai: any) => !bomItemIds.has(ai.item_id));
                                                const bomItems    = (c.actual_items || []).filter((ai: any) =>  bomItemIds.has(ai.item_id));
                                                const hasMeta = substitutes.length > 0 || bomItems.length > 0 || c.notes;
                                                return (
                                                    <React.Fragment key={c.id || ci}>
                                                        <tr style={{ background: ci % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #e8e6e0' }}>
                                                            <td style={{ padding: '2px 5px', color: '#666', whiteSpace: 'nowrap' }}>{fmtDateTime(c.created_at)}</td>
                                                            <td style={{ padding: '2px 5px', fontWeight: 'bold', color: '#000080', textAlign: 'right' }}>+{parseFloat(c.qty_completed).toFixed(2)}</td>
                                                            <td style={{ padding: '2px 5px', color: '#333' }}>{c.operator_name || '—'}</td>
                                                            <td style={{ padding: '2px 5px', color: '#555' }}>{c.work_center_name || '—'}</td>
                                                        </tr>
                                                        {hasMeta && (
                                                            <tr style={{ background: ci % 2 === 0 ? '#fafaf7' : '#f0efe8', borderBottom: '1px solid #e8e6e0' }}>
                                                                <td colSpan={4} style={{ padding: '1px 5px 3px 12px' }}>
                                                                    {bomItems.length > 0 && (
                                                                        <span style={{ color: '#555', marginRight: 8 }}>
                                                                            {bomItems.map((ai: any) => (
                                                                                <span key={ai.item_id} style={{ marginRight: 6 }}>
                                                                                    {ai.item_code || ai.item_id} &times;{parseFloat(ai.qty_used).toFixed(2)}
                                                                                </span>
                                                                            ))}
                                                                        </span>
                                                                    )}
                                                                    {substitutes.map((ai: any) => (
                                                                        <span key={ai.item_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 6 }}>
                                                                            <span style={{ background: '#fff3cd', border: '1px solid #b8860b', color: '#7a5000', padding: '0 3px', fontWeight: 'bold', fontSize: 8 }}>SUB</span>
                                                                            <span style={{ color: '#555' }}>{ai.item_code || ai.item_id} &times;{parseFloat(ai.qty_used).toFixed(2)}</span>
                                                                        </span>
                                                                    ))}
                                                                    {c.notes && <span style={{ color: '#888', fontStyle: 'italic', marginLeft: 4 }}>{c.notes}</span>}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </td>
            </tr>
        );
    };

    const containerStyle: React.CSSProperties = classic ? {
        border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
        background: '#ece9d8', fontFamily: xpFont,
    } : {};

    const titleBarStyle: React.CSSProperties = classic ? {
        background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
        borderBottom: '1px solid #003080',
        padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8,
    } : {
        background: '#fff', borderBottom: '1px solid #dee2e6',
        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
    };

    const filterBarStyle: React.CSSProperties = classic ? {
        background: '#d4d0c8', borderBottom: '1px solid #808080',
        padding: '4px 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
    } : {
        background: '#f8f9fa', borderBottom: '1px solid #dee2e6',
        padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
    };

    const thStyle: React.CSSProperties = classic ? {
        border: '1px solid #808080', padding: '3px 8px', color: '#000', fontWeight: 'bold',
        background: 'linear-gradient(to bottom,#fff 0%,#d4d0c8 100%)', fontSize: 10, whiteSpace: 'nowrap',
    } : { fontSize: '9pt', fontWeight: 'bold', whiteSpace: 'nowrap' };

    const tdBase: React.CSSProperties = classic ? {
        border: '1px solid #c0bdb5', padding: '3px 8px', color: '#000', verticalAlign: 'middle',
    } : { verticalAlign: 'middle' };

    return (
        <>
        <div className="row g-4 fade-in">
            <div className="col-12">
                <div style={containerStyle} className={classic ? '' : 'card h-100 border-0 shadow-sm'}>

                    {/* Title bar */}
                    <div style={titleBarStyle}>
                        <i className="bi bi-list-task" style={{ color: classic ? '#fff' : '#000', fontSize: 14 }}></i>
                        <span style={{ fontWeight: 'bold', fontSize: classic ? 12 : 14, color: classic ? '#fff' : '#000', textShadow: classic ? '1px 1px 1px rgba(0,0,0,0.4)' : undefined }}>
                            Work Orders
                        </span>
                        <span style={{ fontSize: classic ? 10 : 11, color: classic ? '#cce0ff' : '#888', marginLeft: 4 }}>
                            {filtered.length} of {flatWOs.length} steps
                        </span>
                    </div>

                    {/* Filter bar */}
                    <div style={filterBarStyle}>
                        <label style={{ fontSize: classic ? 10 : 11, color: classic ? '#000' : '#555', whiteSpace: 'nowrap' }}>Filter:</label>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            style={classic ? { ...xpInput, width: 110 } : { width: 130 }}
                            className={classic ? '' : 'form-select form-select-sm'}>
                            <option value="">All Statuses</option>
                            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                        <select value={filterWC} onChange={e => setFilterWC(e.target.value)}
                            style={classic ? { ...xpInput, width: 130 } : { width: 150 }}
                            className={classic ? '' : 'form-select form-select-sm'}>
                            <option value="">All Work Centers</option>
                            {workCenters.map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                        </select>
                        <select value={filterMO} onChange={e => setFilterMO(e.target.value)}
                            style={classic ? { ...xpInput, width: 160 } : { width: 180 }}
                            className={classic ? '' : 'form-select form-select-sm'}>
                            <option value="">All MOs</option>
                            {moOptions.map(mo => <option key={mo.id} value={mo.id}>{mo.label}</option>)}
                        </select>
                        {(filterStatus || filterWC || filterMO) && (
                            <button onClick={() => { setFilterStatus(''); setFilterWC(''); setFilterMO(''); }}
                                style={classic ? { ...xpInput, width: 'auto', cursor: 'pointer', height: 20 } : undefined}
                                className={classic ? '' : 'btn btn-sm btn-outline-secondary'}>
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Table */}
                    <div className="table-responsive" style={{ background: classic ? '#fff' : undefined }}>
                        <table
                            style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 11 : undefined, fontFamily: classic ? xpFont : undefined, background: classic ? '#fff' : undefined }}
                            className={classic ? '' : 'table table-hover align-middle mb-0'}
                        >
                            <thead>
                                <tr className={classic ? '' : 'table-light'}>
                                    <th style={{ ...thStyle, width: 20, padding: '3px 4px' }} className={classic ? '' : 'ps-3'} />
                                    {['#', 'Name', 'MO', 'Product', 'Work Center', 'Planned', 'Actual', 'Target / Done', 'Start', 'End', 'Status', ''].map(h => (
                                        <th key={h} style={{ ...thStyle, textAlign: h === '' ? 'right' : 'left' }}
                                            className={classic ? '' : 'ps-3'}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={COLS} style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: classic ? 11 : undefined }}>
                                            No work orders found.
                                        </td>
                                    </tr>
                                )}
                                {filtered.map((wo, idx) => {
                                    const rowBg = classic ? (idx % 2 === 0 ? '#fff' : '#f5f3ee') : undefined;
                                    const isEditing = editId === wo.id;
                                    const isExpanded = expandedWOId === wo.id;

                                    if (isEditing) {
                                        return (
                                            <tr key={wo.id} style={{ background: classic ? '#fffbe6' : undefined }}
                                                className={classic ? '' : 'table-warning'}>
                                                <td style={tdBase} />
                                                <td style={tdBase} className={classic ? '' : 'ps-3'}>
                                                    <input style={{ ...xpInput, width: 32 }} value={form.sequence}
                                                        onChange={e => setForm(f => ({ ...f, sequence: e.target.value }))} />
                                                </td>
                                                <td style={tdBase}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555' }}>
                                                        {(wo as any).code || wo.name}
                                                    </span>
                                                </td>
                                                <td style={tdBase} colSpan={2}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{wo.mo_code}</span>
                                                </td>
                                                <td style={tdBase}>
                                                    <select style={{ ...xpInput, width: '100%' }} value={form.work_center_id}
                                                        onChange={e => setForm(f => ({ ...f, work_center_id: e.target.value }))}>
                                                        <option value="">—</option>
                                                        {workCenters.map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                                                    </select>
                                                </td>
                                                <td style={tdBase}>
                                                    <input type="number" min="0" step="0.5" style={{ ...xpInput, width: 56 }}
                                                        value={form.planned_duration_hours}
                                                        onChange={e => setForm(f => ({ ...f, planned_duration_hours: e.target.value }))} />
                                                </td>
                                                <td style={tdBase} colSpan={4} />
                                                <td style={tdBase} />
                                                <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <button onClick={() => handleSave(wo)} disabled={isSaving}
                                                        style={classic ? { fontFamily: xpFont, fontSize: 10, padding: '1px 8px', background: 'linear-gradient(to bottom,#b0e8b0,#70c870)', border: '1px solid #0a3e0a', cursor: 'pointer', marginRight: 4 } : undefined}
                                                        className={classic ? '' : 'btn btn-sm btn-success me-1'}>
                                                        {isSaving ? '...' : 'Save'}
                                                    </button>
                                                    <button onClick={() => setEditId(null)}
                                                        style={classic ? { fontFamily: xpFont, fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom,#f0efe6,#dddbd0)', border: '1px solid #808080', cursor: 'pointer' } : undefined}
                                                        className={classic ? '' : 'btn btn-sm btn-outline-secondary'}>
                                                        Cancel
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <React.Fragment key={wo.id}>
                                            <tr
                                                style={{ background: isExpanded ? '#eef2ff' : rowBg, cursor: 'pointer' }}
                                                onClick={() => setExpandedWOId(prev => prev === wo.id ? null : wo.id)}
                                            >
                                                <td style={{ ...tdBase, padding: '3px 4px', textAlign: 'center', width: 20 }} className={classic ? '' : 'ps-2'}>
                                                    <span style={{ fontSize: 10, color: '#555', lineHeight: 1 }}>
                                                        {isExpanded ? '▼' : '►'}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdBase, color: '#888', width: 36 }} className={classic ? '' : 'ps-3'}>{wo.sequence}</td>
                                                <td style={{ ...tdBase, fontFamily: 'monospace', fontWeight: 'bold', fontSize: classic ? 10 : 11, color: '#000080' }}>
                                                    {(wo as any).code || wo.name}
                                                </td>
                                                <td
                                                    style={{ ...tdBase, fontFamily: 'monospace', fontSize: classic ? 10 : 11, whiteSpace: 'nowrap', color: '#0058e6', textDecoration: 'underline', cursor: 'pointer' }}
                                                    onClick={e => { e.stopPropagation(); router.push(`/manufacturing-orders?mo=${encodeURIComponent(wo.mo_code)}`); }}
                                                    title="Go to Manufacturing Order"
                                                >
                                                    {wo.mo_code}
                                                </td>
                                                <td style={{ ...tdBase, fontSize: classic ? 10 : 11, color: '#444' }}>{wo.item_name || '—'}</td>
                                                <td style={{ ...tdBase, fontSize: classic ? 10 : 11 }}>
                                                    {wo.work_center_name
                                                        ? (() => {
                                                            const cs = getChipStyle(wo.work_center_type);
                                                            return (
                                                                <span style={{
                                                                    padding: '1px 5px',
                                                                    borderRadius: classic ? 2 : 4,
                                                                    border: `1px solid ${cs.borderColor as string}`,
                                                                    background: cs.background as string,
                                                                    color: cs.color as string,
                                                                    whiteSpace: 'nowrap',
                                                                    fontSize: 'inherit',
                                                                }}>
                                                                    {wo.work_center_name}
                                                                </span>
                                                            );
                                                        })()
                                                        : '—'}
                                                </td>
                                                <td style={{ ...tdBase, fontSize: classic ? 10 : 11 }}>{wo.planned_duration_hours != null ? `${wo.planned_duration_hours}h` : '—'}</td>
                                                <td style={{ ...tdBase, fontSize: classic ? 10 : 11 }}>{wo.actual_duration_hours != null ? `${wo.actual_duration_hours}h` : '—'}</td>
                                                <td style={{ ...tdBase, fontSize: classic ? 10 : 11 }}>
                                                    {wo.qty != null ? (() => {
                                                        const done = (wo.qty_completed_total ?? 0) >= wo.qty;
                                                        const pct = Math.min(100, ((wo.qty_completed_total ?? 0) / wo.qty) * 100);
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
                                                                <div style={{ width: 72, height: 8, border: '1px solid #7f9db9', background: '#fff', overflow: 'hidden' }}>
                                                                    {pct > 0 && (
                                                                        <div style={{
                                                                            height: '100%', width: `${pct}%`,
                                                                            background: done
                                                                                ? 'repeating-linear-gradient(45deg,#2e7d32,#2e7d32 2px,#4caf50 2px,#4caf50 5px)'
                                                                                : 'repeating-linear-gradient(45deg,#000080,#000080 2px,#1565c0 2px,#1565c0 5px)',
                                                                        }} />
                                                                    )}
                                                                </div>
                                                                <span style={{ fontSize: 9, color: done ? '#007000' : '#555', whiteSpace: 'nowrap' }}>
                                                                    {(wo.qty_completed_total ?? 0).toFixed(1)}/{wo.qty}
                                                                </span>
                                                            </div>
                                                        );
                                                    })() : <span style={{ color: '#bbb' }}>—</span>}
                                                </td>
                                                <td style={{ ...tdBase, fontSize: classic ? 10 : 11 }}>{fmtDateTime(wo.actual_start_date)}</td>
                                                <td style={{ ...tdBase, fontSize: classic ? 10 : 11 }}>{fmtDateTime(wo.actual_end_date)}</td>
                                                <td style={tdBase} onClick={e => e.stopPropagation()}>
                                                    {classic ? (
                                                        <select value={wo.status}
                                                            onChange={e => {
                                                                const s = e.target.value;
                                                                if (s === 'COMPLETED' && !canComplete(wo)) {
                                                                    showToast(`Target not reached: ${(wo.qty_completed_total ?? 0).toFixed(2)} of ${wo.qty} produced. Log more output first.`, 'warning');
                                                                    return;
                                                                }
                                                                onUpdateStatus(wo.id, s);
                                                            }}
                                                            style={{ fontFamily: xpFont, fontSize: 10, border: '1px solid #aca899', background: '#ece9d8', color: STATUS_COLORS[wo.status] || '#000', height: 18, padding: '0 2px' }}>
                                                            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                                        </select>
                                                    ) : statusChip(wo.status)}
                                                </td>
                                                <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                                    {classic ? (
                                                        <>
                                                            {(wo.status === 'PENDING' || wo.status === 'IN_PROGRESS') && (
                                                                <button onClick={() => openLog(wo)}
                                                                    style={{ fontFamily: xpFont, fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom,#b0e8b0,#70c870)', border: '1px solid #0a3e0a', cursor: 'pointer', color: '#004000', marginRight: 4 }}>
                                                                    Log
                                                                </button>
                                                            )}
                                                            <button onClick={() => { const mo = manufacturingOrders.find(m => m.id === wo.mo_id); setPrintWO(wo); setPrintMO(mo ?? null); }}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#555', marginRight: 4 }}
                                                                title="Print Kartu Kerja">
                                                                <i className="bi bi-printer" />
                                                            </button>
                                                            <button onClick={() => startEdit(wo)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0058e6', marginRight: 4 }}>
                                                                <i className="bi bi-pencil" />
                                                            </button>
                                                            <button onClick={() => onDelete(wo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#a00' }}>
                                                                <i className="bi bi-trash" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {wo.status === 'PENDING' && (
                                                                <button className="btn btn-sm btn-primary py-0 px-2 me-1" style={{ fontSize: '0.72rem' }} onClick={() => onUpdateStatus(wo.id, 'IN_PROGRESS')}>Start</button>
                                                            )}
                                                            {(wo.status === 'PENDING' || wo.status === 'IN_PROGRESS') && (
                                                                <button className="btn btn-sm btn-success py-0 px-2 me-1" style={{ fontSize: '0.72rem' }} onClick={() => openLog(wo)}>Log</button>
                                                            )}
                                                            {wo.status === 'IN_PROGRESS' && (
                                                                <button className="btn btn-sm btn-outline-success py-0 px-2 me-1" style={{ fontSize: '0.72rem' }}
                                                                    disabled={!canComplete(wo)} title={!canComplete(wo) ? `Target ${wo.qty} not reached` : undefined}
                                                                    onClick={() => onUpdateStatus(wo.id, 'COMPLETED')}>Finish</button>
                                                            )}
                                                            <button className="btn btn-sm btn-link text-secondary p-0 me-1"
                                                                onClick={() => { const mo = manufacturingOrders.find(m => m.id === wo.mo_id); setPrintWO(wo); setPrintMO(mo ?? null); }}
                                                                title="Print Kartu Kerja"><i className="bi bi-printer fs-6" /></button>
                                                            <button className="btn btn-sm btn-link text-primary p-0 me-1" onClick={() => startEdit(wo)}><i className="bi bi-pencil fs-6" /></button>
                                                            <button className="btn btn-sm btn-link text-danger p-0" onClick={() => onDelete(wo.id)}><i className="bi bi-trash fs-6" /></button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExpanded && renderDetailPanel(wo)}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        {completionMO && (
            <WOCompletionModal
                mo={completionMO}
                workOrder={completionWO ?? undefined}
                onClose={() => { setCompletionMO(null); setCompletionWO(null); }}
                onSaved={() => { setCompletionMO(null); setCompletionWO(null); fetchData('work-orders'); }}
            />
        )}
        {printWO && printMO && (
            <WOStepPrintModal
                workOrder={printWO}
                parentMO={printMO}
                onClose={() => { setPrintWO(null); setPrintMO(null); }}
            />
        )}
        </>
    );
}
