'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { usePaginatedFetch } from '../../context/usePaginatedList';
import { useUser } from '../../context/UserContext';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
import { API_BASE } from '../shared/apiBase';
import { CodeChip, xpFont, ListSkeleton, StatusChip } from '../shared/xpTheme';
import { orDash, fmtQtyFixed } from '../shared/format';
import { lvThBanded, lvTd, lvTdRuled, lvZebra } from '../shared/listViewTheme';

// ── Fonts ───────────────────────────────────────────────────────────────────
const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// ── Style helpers (theme-aware) ───────────────────────────────────────────────
const xpInput = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 4px', outline: 'none', height: 20,
} : {
    fontFamily: modernFont, fontSize: 13, border: '1px solid #cbd3df',
    borderRadius: 7, padding: '4px 8px', background: '#fff', color: '#1e293b',
    outline: 'none', height: 'auto',
};

const xpBtn = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
} : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 500, padding: '5px 12px',
    background: '#fff', color: '#334155', border: '1px solid #cbd3df',
    borderRadius: 7, cursor: 'pointer',
};

const xpBtnPrimary = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
} : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 600, padding: '5px 12px',
    background: '#2563eb', color: '#fff', border: 'none',
    borderRadius: 7, cursor: 'pointer',
};

const xpSectionHeader = (classic: boolean): React.CSSProperties => classic ? {
    background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)',
    color: 'white', padding: '3px 8px',
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
} : {
    background: '#eef1f6', color: '#475569', textTransform: 'uppercase',
    fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', padding: '7px 12px',
    borderBottom: '1px solid #dbe1ea', fontFamily: modernFont,
};

const xpPanel = (classic: boolean): React.CSSProperties => classic ? {
    border: '1px solid #7f9db9', background: 'white',
} : {
    border: '1px solid #dbe1ea', background: '#fff', borderRadius: 9,
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface CreateForm {
    substrate_qty: string;
    machine_name: string;
    temperature_c: string;
    speed_mpm: string;
    width_cm: string;
    overfeed_pct: string;
    operator_name: string;
    notes: string;
    input_batch_id_text: string;
}

interface CompleteForm {
    output_batch_number: string;
    actual_width_cm: string;
    actual_gsm: string;
    actual_shrinkage_pct: string;
}

interface Props {
    items: any[];
    /** Typed rather than bare `Function` so usePaginatedFetch accepts it. */
    authFetch: (url: string, options?: any) => Promise<Response>;
}

const EMPTY_CREATE: CreateForm = {
    substrate_qty: '',
    machine_name: '',
    temperature_c: '',
    speed_mpm: '',
    width_cm: '',
    overfeed_pct: '',
    operator_name: '',
    notes: '',
    input_batch_id_text: '',
};

const EMPTY_COMPLETE: CompleteForm = {
    output_batch_number: '',
    actual_width_cm: '',
    actual_gsm: '',
    actual_shrinkage_pct: '',
};

const SO_WO_PAGE_SIZE = 20;
const SO_RUN_PAGE_SIZE = 20;

const fmtNum = (v: any, decimals = 2) => orDash(v, x => fmtQtyFixed(x, decimals));

export default function SettingOrdersTab({ items, authFetch }: Props) {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { hasPermission } = useUser();
    const canManage = hasPermission('work_order.log');

    const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
    // The selected WO's row is retained rather than looked up in the current page:
    // the list is server-paginated now, so paging away from the row you picked would
    // otherwise blank the runs pane's header mid-session.
    const [selectedWoRow, setSelectedWoRow] = useState<any | null>(null);
    const [runs, setRuns] = useState<any[]>([]);
    const [showCreateRun, setShowCreateRun] = useState(false);
    const [showCompleteModal, setShowCompleteModal] = useState<any | null>(null);
    const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
    const [completeForm, setCompleteForm] = useState<CompleteForm>(EMPTY_COMPLETE);
    const [saving, setSaving] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [runPage, setRunPage] = useState(1);

    // ── WOs (server-paginated) ────────────────────────────────────────────────
    // Previously sent no window, so this silently showed only the endpoint's default
    // first page and paged over that — setting WO #51 was unreachable.
    const {
        rows: workOrders, total: woTotal, loading,
        page: clampedWoPage, setPage: setWoPage, refetch: fetchWorkOrders,
    } = usePaginatedFetch<any>({
        endpoint: `${API_BASE}/work-orders`,
        authFetch,
        pageSize: SO_WO_PAGE_SIZE,
        params: { center_type: 'SETTING' },
    });

    // ── Fetch Runs for selected WO ────────────────────────────────────────────
    const fetchRuns = useCallback(async (woId: string) => {
        try {
            const res = await authFetch(`${API_BASE}/setting-runs?work_order_id=${woId}`);
            if (res.ok) {
                const data = await res.json();
                setRuns(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch {
            // silent
        }
    }, [authFetch]);

    useEffect(() => {
        if (selectedWoId) {
            fetchRuns(selectedWoId);
        } else {
            setRuns([]);
        }
        setRunPage(1);
    }, [selectedWoId, fetchRuns]);

    // Prefer the retained row; fall back to the page for a selection made elsewhere.
    const selectedWo = selectedWoRow ?? workOrders.find((w: any) => w.id === selectedWoId);

    const runPages = Math.max(1, Math.ceil(runs.length / SO_RUN_PAGE_SIZE));
    const clampedRunPage = Math.min(runPage, runPages);
    const pagedRuns = runs.slice((clampedRunPage - 1) * SO_RUN_PAGE_SIZE, clampedRunPage * SO_RUN_PAGE_SIZE);

    // ── Create Run ────────────────────────────────────────────────────────────
    const handleCreateRun = async () => {
        if (!selectedWoId) return;
        setSaving(true);
        try {
            const payload: any = {
                work_order_id: selectedWoId,
                machine_name: createForm.machine_name.trim() || undefined,
                operator_name: createForm.operator_name.trim() || undefined,
                notes: createForm.notes.trim() || undefined,
                input_batch_id_text: createForm.input_batch_id_text.trim() || undefined,
            };
            if (createForm.substrate_qty !== '') payload.substrate_qty = parseFloat(createForm.substrate_qty);
            if (createForm.temperature_c !== '') payload.temperature_c = parseFloat(createForm.temperature_c);
            if (createForm.speed_mpm !== '') payload.speed_mpm = parseFloat(createForm.speed_mpm);
            if (createForm.width_cm !== '') payload.width_cm = parseFloat(createForm.width_cm);
            if (createForm.overfeed_pct !== '') payload.overfeed_pct = parseFloat(createForm.overfeed_pct);

            const res = await authFetch(`${API_BASE}/setting-runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setShowCreateRun(false);
                setCreateForm(EMPTY_CREATE);
                fetchRuns(selectedWoId);
            }
        } finally {
            setSaving(false);
        }
    };

    // ── Start Run ─────────────────────────────────────────────────────────────
    const handleStartRun = async (run: any) => {
        try {
            const res = await authFetch(`${API_BASE}/setting-runs/${run.id}/start`, { method: 'POST' });
            if (res.ok && selectedWoId) fetchRuns(selectedWoId);
        } catch {
            // silent
        }
    };

    // ── Complete Run ──────────────────────────────────────────────────────────
    const handleCompleteRun = async () => {
        if (!showCompleteModal || !selectedWoId) return;
        if (!completeForm.output_batch_number.trim()) return;
        setCompleting(true);
        try {
            const payload: any = {
                output_batch_number: completeForm.output_batch_number.trim(),
            };
            if (completeForm.actual_width_cm !== '') payload.actual_width_cm = parseFloat(completeForm.actual_width_cm);
            if (completeForm.actual_gsm !== '') payload.actual_gsm = parseFloat(completeForm.actual_gsm);
            if (completeForm.actual_shrinkage_pct !== '') payload.actual_shrinkage_pct = parseFloat(completeForm.actual_shrinkage_pct);

            const res = await authFetch(`${API_BASE}/setting-runs/${showCompleteModal.id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setShowCompleteModal(null);
                setCompleteForm(EMPTY_COMPLETE);
                fetchRuns(selectedWoId);
            }
        } finally {
            setCompleting(false);
        }
    };

    // ── Styles ────────────────────────────────────────────────────────────────
    const thStyle: React.CSSProperties = classic
        ? lvThBanded(true, { border: '1px solid #808080' })
        : lvThBanded(false);
    const tdStyle: React.CSSProperties = classic
        ? { ...lvTd(true), border: '1px solid #c0bdb5' }
        : lvTdRuled(false);

    const inputStyle = (width?: number): React.CSSProperties => ({
        ...xpInput(classic), width: width ?? '100%',
    });

    const labelStyle: React.CSSProperties = classic ? {
        fontFamily: xpFont, fontSize: 10, color: '#000', display: 'block', marginBottom: 1,
    } : {
        fontFamily: modernFont, fontSize: 12, color: '#64748b', display: 'block', marginBottom: 3, fontWeight: 500,
    };

    const fieldRow = (label: string, field: keyof CreateForm, type = 'text', width?: number) => (
        <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>{label}</label>
            <input
                type={type}
                style={inputStyle(width)}
                value={createForm[field]}
                onChange={e => setCreateForm(f => ({ ...f, [field]: e.target.value }))}
            />
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', height: '100%', fontFamily: classic ? xpFont : modernFont, fontSize: 11, background: classic ? undefined : '#f8fafc' }}>

            {/* Left pane — WO list */}
            <div style={{ width: 280, minWidth: 280, borderRight: classic ? '1px solid #7f9db9' : '1px solid #dbe1ea', display: 'flex', flexDirection: 'column', background: classic ? '#f5f4ef' : '#fff' }}>
                <div style={xpSectionHeader(classic)}>Setting Work Orders</div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
                    {loading && <ListSkeleton rows={6} />}
                    {!loading && workOrders.length === 0 && (
                        <div style={{ padding: 8, color: classic ? '#888' : '#64748b', fontSize: 10, fontStyle: 'italic' }}>
                            No setting work orders found.
                        </div>
                    )}
                    {workOrders.map((wo: any) => {
                        const selected = wo.id === selectedWoId;
                        return (
                            <div
                                key={wo.id}
                                onClick={() => { const off = wo.id === selectedWoId; setSelectedWoId(off ? null : wo.id); setSelectedWoRow(off ? null : wo); }}
                                style={classic ? {
                                    padding: '4px 8px', marginBottom: 2, cursor: 'pointer',
                                    background: selected
                                        ? 'linear-gradient(to bottom, #3060b8, #1a3d90)'
                                        : '#ece9d8',
                                    border: selected ? '1px solid #1a3d90' : '1px solid #c0bdb5',
                                    color: selected ? '#fff' : '#000',
                                } : {
                                    padding: '6px 10px', marginBottom: 4, cursor: 'pointer',
                                    background: selected ? '#eff6ff' : '#fff',
                                    border: selected ? '1px solid #2563eb' : '1px solid #dbe1ea',
                                    borderRadius: 7,
                                    color: selected ? '#1d4ed8' : '#1e293b',
                                }}
                            >
                                <div style={{ fontWeight: classic ? 'bold' : 600, fontSize: classic ? 11 : 13 }}>{wo.name || wo.code || wo.id}</div>
                                {wo.mo_code && (
                                    <CodeChip
                                        code={`MO: ${wo.mo_code}`}
                                        classic={classic}
                                        tier={2}
                                        style={{ display: 'block', color: selected ? (classic ? '#cce0ff' : '#2563eb') : undefined }}
                                    />
                                )}
                                {wo.status && (
                                    <div style={{ marginTop: 2 }}><StatusChip status={wo.status || 'PENDING'} /></div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <Pager page={clampedWoPage} total={woTotal} pageSize={SO_WO_PAGE_SIZE} onPageChange={setWoPage} hideWhenEmpty />
                <div style={{ borderTop: classic ? '1px solid #c0bdb5' : '1px solid #dbe1ea', padding: 4 }}>
                    <button onClick={fetchWorkOrders} style={{ ...xpBtn(classic), width: '100%', fontSize: 10 }}>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Right pane — Runs */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ ...xpSectionHeader(classic), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                        Setting Runs{selectedWo ? ` — ${selectedWo.name || selectedWo.code || selectedWoId}` : ''}
                    </span>
                    {canManage && selectedWoId && (
                        <button
                            onClick={() => { setShowCreateRun(true); setCreateForm(EMPTY_CREATE); }}
                            style={classic ? {
                                ...xpBtn(classic),
                                fontSize: 9, padding: '1px 8px',
                                background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                borderColor: '#0a3e0a #1a5e1a #1a5e1a #0a3e0a',
                                color: '#004000',
                            } : {
                                ...xpBtnPrimary(classic),
                                fontSize: 11, padding: '4px 10px',
                            }}
                        >
                            + New Run
                        </button>
                    )}
                </div>

                {!selectedWoId ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: classic ? '#888' : '#64748b', fontSize: 11, fontStyle: 'italic' }}>
                        Select a work order to view setting runs.
                    </div>
                ) : (
                    <>
                        {/* Create Run form */}
                        {showCreateRun && (
                            <div style={classic ? { ...xpPanel(classic), margin: 8, padding: 0, borderColor: '#7f9db9' } : { ...xpPanel(classic), margin: 8, padding: 0 }}>
                                <div style={classic ? { ...xpSectionHeader(classic), background: 'linear-gradient(to right, #5a7a20, #3a5a10)', fontSize: 10 } : { ...xpSectionHeader(classic) }}>
                                    New Setting Run
                                </div>
                                <div style={{ padding: 10, background: classic ? '#f5f4ef' : '#fff' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
                                        <div>
                                            {fieldRow('Input Lot', 'input_batch_id_text')}
                                            {fieldRow('Substrate Qty', 'substrate_qty', 'number')}
                                            {fieldRow('Machine Name', 'machine_name')}
                                        </div>
                                        <div>
                                            {fieldRow('Temperature (C)', 'temperature_c', 'number')}
                                            {fieldRow('Speed (m/min)', 'speed_mpm', 'number')}
                                            {fieldRow('Width (cm)', 'width_cm', 'number')}
                                        </div>
                                        <div>
                                            {fieldRow('Overfeed (%)', 'overfeed_pct', 'number')}
                                            {fieldRow('Operator Name', 'operator_name')}
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Notes</label>
                                                <textarea
                                                    style={{ ...xpInput(classic), height: 38, width: '100%', resize: 'vertical', padding: classic ? '2px 4px' : '4px 8px' }}
                                                    value={createForm.notes}
                                                    onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                        <button
                                            onClick={handleCreateRun}
                                            disabled={saving}
                                            style={classic ? {
                                                ...xpBtn(classic),
                                                background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                                borderColor: '#0a3e0a #1a5e1a #1a5e1a #0a3e0a',
                                                color: '#004000',
                                            } : xpBtnPrimary(classic)}
                                        >
                                            {saving ? 'Saving...' : 'Create Run'}
                                        </button>
                                        <button onClick={() => setShowCreateRun(false)} style={xpBtn(classic)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Runs table */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                            {runs.length === 0 ? (
                                <div style={{ padding: 12, color: classic ? '#888' : '#64748b', fontSize: 10, fontStyle: 'italic', textAlign: 'center' }}>
                                    No setting runs yet.
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', ...(classic ? {} : { border: '1px solid #dbe1ea', borderRadius: 9, overflow: 'hidden' }) }}>
                                        <thead>
                                            <tr>
                                                {[
                                                    'Run #', 'Substrate Qty', 'Machine', 'Temp (C)',
                                                    'Speed (m/min)', 'Width (cm)', 'Overfeed (%)', 'Status',
                                                    'Actual Width', 'Actual GSM', 'Actual Shrinkage', 'Actions',
                                                ].map(h => (
                                                    <th key={h} style={{ ...thStyle, textAlign: h === 'Actions' ? 'right' : 'left' }}>
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pagedRuns.map((run: any, idx: number) => (
                                                <tr
                                                    key={run.id}
                                                    style={{ background: lvZebra(classic, idx) }}
                                                >
                                                    <td style={tdStyle}>{run.run_number ?? idx + 1}</td>
                                                    <td style={tdStyle}>{fmtNum(run.substrate_qty)}</td>
                                                    <td style={tdStyle}>{run.machine_name || '—'}</td>
                                                    <td style={tdStyle}>{fmtNum(run.temperature_c, 1)}</td>
                                                    <td style={tdStyle}>{fmtNum(run.speed_mpm, 1)}</td>
                                                    <td style={tdStyle}>{fmtNum(run.width_cm, 1)}</td>
                                                    <td style={tdStyle}>{fmtNum(run.overfeed_pct, 2)}</td>
                                                    <td style={tdStyle}><StatusChip status={run.status || 'PENDING'} /></td>
                                                    <td style={tdStyle}>{fmtNum(run.actual_width_cm, 1)}</td>
                                                    <td style={tdStyle}>{fmtNum(run.actual_gsm, 2)}</td>
                                                    <td style={tdStyle}>{fmtNum(run.actual_shrinkage_pct, 2)}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {canManage && (!run.status || run.status === 'PENDING') && (
                                                            <button
                                                                onClick={() => handleStartRun(run)}
                                                                style={classic ? {
                                                                    ...xpBtn(classic), fontSize: 9,
                                                                    background: 'linear-gradient(to bottom, #c0d8ff, #80a8e8)',
                                                                    borderColor: '#003080 #80a8e8 #80a8e8 #003080',
                                                                    color: '#001060',
                                                                    marginRight: 3,
                                                                } : {
                                                                    ...xpBtnPrimary(classic), fontSize: 11,
                                                                    padding: '4px 10px', marginRight: 4,
                                                                }}
                                                            >
                                                                Start
                                                            </button>
                                                        )}
                                                        {canManage && run.status === 'IN_PROGRESS' && (
                                                            <button
                                                                onClick={() => {
                                                                    setShowCompleteModal(run);
                                                                    setCompleteForm(EMPTY_COMPLETE);
                                                                }}
                                                                style={classic ? {
                                                                    ...xpBtn(classic), fontSize: 9,
                                                                    background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                                                    borderColor: '#0a3e0a #1a5e1a #1a5e1a #0a3e0a',
                                                                    color: '#004000',
                                                                    marginRight: 3,
                                                                } : {
                                                                    ...xpBtnPrimary(classic), fontSize: 11,
                                                                    padding: '4px 10px', marginRight: 4,
                                                                }}
                                                            >
                                                                Complete
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <Pager page={clampedRunPage} total={runs.length} pageSize={SO_RUN_PAGE_SIZE} onPageChange={setRunPage} hideWhenEmpty />
                    </>
                )}
            </div>

            {/* Complete Modal */}
            {showCompleteModal && (
                <ModalWrapper
                    isOpen={!!showCompleteModal}
                    onClose={() => setShowCompleteModal(null)}
                    title="Complete Setting Run"
                    size="sm"
                    modeless
                    footer={
                        <>
                            <button
                                onClick={handleCompleteRun}
                                disabled={completing || !completeForm.output_batch_number.trim()}
                                style={classic ? {
                                    ...xpBtn(classic),
                                    background: !completeForm.output_batch_number.trim()
                                        ? '#d4d0c8'
                                        : 'linear-gradient(to bottom, #b0e8b0, #70c870)',
                                    borderColor: '#0a3e0a #1a5e1a #1a5e1a #0a3e0a',
                                    color: !completeForm.output_batch_number.trim() ? '#888' : '#004000',
                                    opacity: completing ? 0.7 : 1,
                                } : {
                                    ...xpBtnPrimary(classic),
                                    background: !completeForm.output_batch_number.trim() ? '#cbd5e1' : '#2563eb',
                                    color: !completeForm.output_batch_number.trim() ? '#94a3b8' : '#fff',
                                    cursor: !completeForm.output_batch_number.trim() ? 'default' : 'pointer',
                                    opacity: completing ? 0.7 : 1,
                                }}
                            >
                                {completing ? 'Completing...' : 'Complete Run'}
                            </button>
                            <button onClick={() => setShowCompleteModal(null)} style={xpBtn(classic)}>
                                Cancel
                            </button>
                        </>
                    }
                >
                    {/* Output lot number — required */}
                    <div style={{ marginBottom: 8 }}>
                        <label style={labelStyle}>
                            Output Lot Number <span style={{ color: classic ? '#c00' : '#dc2626' }}>*</span>
                        </label>
                        <input
                            type="text"
                            autoFocus
                            style={{ ...xpInput(classic), width: '100%' }}
                            value={completeForm.output_batch_number}
                            onChange={e => setCompleteForm(f => ({ ...f, output_batch_number: e.target.value }))}
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 8px' }}>
                        <div>
                            <label style={labelStyle}>Actual Width (cm)</label>
                            <input
                                type="number"
                                style={{ ...xpInput(classic), width: '100%' }}
                                value={completeForm.actual_width_cm}
                                onChange={e => setCompleteForm(f => ({ ...f, actual_width_cm: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Actual GSM</label>
                            <input
                                type="number"
                                style={{ ...xpInput(classic), width: '100%' }}
                                value={completeForm.actual_gsm}
                                onChange={e => setCompleteForm(f => ({ ...f, actual_gsm: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Actual Shrinkage (%)</label>
                            <input
                                type="number"
                                style={{ ...xpInput(classic), width: '100%' }}
                                value={completeForm.actual_shrinkage_pct}
                                onChange={e => setCompleteForm(f => ({ ...f, actual_shrinkage_pct: e.target.value }))}
                            />
                        </div>
                    </div>
                </ModalWrapper>
            )}
        </div>
    );
}
