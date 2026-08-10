'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { STATUS_COLORS, xpFont, ListSkeleton } from '../shared/xpTheme';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { lvThead } from '../shared/listViewTheme';

const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const makeInput = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 4px', outline: 'none', height: 20,
} : {
    fontFamily: modernFont, fontSize: 13, border: '1px solid #cbd3df',
    borderRadius: 7, padding: '4px 8px', background: '#fff', color: '#1e293b',
    outline: 'none', height: 'auto',
};
const makeBtn = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
} : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 500, padding: '5px 12px',
    background: '#fff', color: '#334155', border: '1px solid #cbd3df',
    borderRadius: 7, cursor: 'pointer',
};
const makePrimaryBtn = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
} : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 600, padding: '5px 12px',
    background: '#2563eb', color: '#fff', border: 'none',
    borderRadius: 7, cursor: 'pointer',
};
const makeSectionHeader = (classic: boolean): React.CSSProperties => classic ? {
    background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)',
    color: 'white', padding: '3px 8px',
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
} : {
    background: '#eef1f6', color: '#475569', textTransform: 'uppercase',
    fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', padding: '7px 12px',
    borderBottom: '1px solid #dbe1ea', fontFamily: modernFont,
};
const makePanel = (classic: boolean): React.CSSProperties => classic ? {
    border: '1px solid #7f9db9', background: 'white',
} : {
    background: '#fff', border: '1px solid #dbe1ea', borderRadius: 9,
};
const makeThCell = (classic: boolean): React.CSSProperties => classic ? {
    ...lvThead(true), borderRight: '1px solid #b0aaa0',
    padding: '3px 6px', textAlign: 'left', whiteSpace: 'nowrap',
    fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#000',
} : {
    background: '#eef1f6', color: '#475569', textTransform: 'uppercase',
    fontSize: 11, fontWeight: 700, borderBottom: '1.5px solid #cbd3df',
    fontFamily: modernFont,
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api')
    .replace(/\/api$/, '') + '/api';

const WO_PAGE_SIZE = 20;
const RUN_PAGE_SIZE = 20;

const SHADE_COLORS: Record<string, { bg: string; color: string }> = {
    PASS: { bg: '#d4edda', color: '#155724' },
    FAIL: { bg: '#f8d7da', color: '#721c24' },
    REWORK: { bg: '#ffeeba', color: '#856404' },
};

interface ChemicalRow {
    item_id: string;
    planned_qty: string;
    actual_qty: string;
    uom_id: string;
}

interface CreateForm {
    recipe_id: string;
    substrate_qty: string;
    input_batch_id: string;
    machine_name: string;
    liquor_ratio: string;
    volume_air_liters: string;
    machine_speed: string;
    machine_pressure: string;
    temperature_c: string;
    duration_min: string;
    operator_name: string;
    notes: string;
    customer_name: string;
    po_number: string;
    artikel: string;
    color_name: string;
    color_matching_ref: string;
    lot_number: string;
    qty_order_kg: string;
}

interface CompleteForm {
    shade_result: string;
    shade_notes: string;
    output_batch_number: string;
    chemicals: ChemicalRow[];
}

interface DyeingOrdersTabProps {
    items: any[];
    recipes: any[];
    authFetch: Function;
}

const emptyCreateForm: CreateForm = {
    recipe_id: '',
    substrate_qty: '',
    input_batch_id: '',
    machine_name: '',
    liquor_ratio: '',
    volume_air_liters: '',
    machine_speed: '',
    machine_pressure: '',
    temperature_c: '',
    duration_min: '',
    operator_name: '',
    notes: '',
    customer_name: '',
    po_number: '',
    artikel: '',
    color_name: '',
    color_matching_ref: '',
    lot_number: '',
    qty_order_kg: '',
};

const emptyCompleteForm: CompleteForm = {
    shade_result: '',
    shade_notes: '',
    output_batch_number: '',
    chemicals: [],
};

export default function DyeingOrdersTab({ items, recipes, authFetch }: DyeingOrdersTabProps) {
    const { uiStyle } = useTheme();
    const { formatCustom: tzFmt } = useTimezone();
    const classic = uiStyle === 'classic';
    const { hasPermission } = useUser();
    const canManage = hasPermission('work_order.log');
    const xpInput = makeInput(classic);
    const xpBtn = makeBtn(classic);
    const xpPrimaryBtn = makePrimaryBtn(classic);
    const xpSectionHeader = makeSectionHeader(classic);
    const xpPanel = makePanel(classic);
    const xpThCell = makeThCell(classic);
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
    const [runs, setRuns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    // Separate from `loading` (which tracks the runs pane) — the WO list is its own fetch.
    const [woLoading, setWoLoading] = useState(true);
    const [showCreateRun, setShowCreateRun] = useState(false);
    const [showCompleteModal, setShowCompleteModal] = useState<any | null>(null);
    const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
    const [completeForm, setCompleteForm] = useState<CompleteForm>(emptyCompleteForm);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [woPage, setWoPage] = useState(1);
    const [runPage, setRunPage] = useState(1);

    const fetchWorkOrders = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/work-orders?center_type=DYEING`);
            if (res.ok) {
                const data = await res.json();
                setWorkOrders(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch {
            // silently fail
        } finally {
            setWoLoading(false);
        }
    }, [authFetch]);

    const fetchRuns = useCallback(async (woId: string) => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE}/dyeing-runs?work_order_id=${woId}`);
            if (res.ok) {
                const data = await res.json();
                setRuns(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchWorkOrders();
    }, [fetchWorkOrders]);

    useEffect(() => {
        if (selectedWoId) {
            fetchRuns(selectedWoId);
        } else {
            setRuns([]);
        }
        setRunPage(1);
    }, [selectedWoId, fetchRuns]);

    const selectedWo = workOrders.find(wo => String(wo.id) === selectedWoId);

    const woPages = Math.max(1, Math.ceil(workOrders.length / WO_PAGE_SIZE));
    const clampedWoPage = Math.min(woPage, woPages);
    const pagedWorkOrders = workOrders.slice((clampedWoPage - 1) * WO_PAGE_SIZE, clampedWoPage * WO_PAGE_SIZE);

    const runPages = Math.max(1, Math.ceil(runs.length / RUN_PAGE_SIZE));
    const clampedRunPage = Math.min(runPage, runPages);
    const pagedRuns = runs.slice((clampedRunPage - 1) * RUN_PAGE_SIZE, clampedRunPage * RUN_PAGE_SIZE);

    const handleSelectWo = (wo: any) => {
        setSelectedWoId(String(wo.id));
        setShowCreateRun(false);
        setCreateForm(emptyCreateForm);
        setErrorMsg(null);
    };

    const handleOpenCreateRun = async () => {
        if (showCreateRun) {
            setShowCreateRun(false);
            setCreateForm(emptyCreateForm);
            setErrorMsg(null);
            return;
        }
        setShowCreateRun(true);
        setErrorMsg(null);
        if (selectedWoId) {
            try {
                const res = await authFetch(`${API_BASE}/dye-recipes/match?work_order_id=${selectedWoId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.match?.id) {
                        setCreateForm(f => ({ ...f, recipe_id: String(data.match.id) }));
                    }
                }
            } catch {
                // silently fail — user can still select manually
            }
        }
    };

    const handleCreateFormChange = (field: keyof CreateForm, value: string) => {
        setCreateForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveRun = async () => {
        if (!selectedWoId) return;
        setSaving(true);
        setErrorMsg(null);
        try {
            const payload: any = {
                work_order_id: selectedWoId,
                recipe_id: createForm.recipe_id || null,
                substrate_qty: createForm.substrate_qty ? parseFloat(createForm.substrate_qty) : null,
                machine_name: createForm.machine_name || null,
                liquor_ratio: createForm.liquor_ratio ? parseFloat(createForm.liquor_ratio) : null,
                volume_air_liters: createForm.volume_air_liters ? parseFloat(createForm.volume_air_liters) : null,
                machine_speed: createForm.machine_speed ? parseFloat(createForm.machine_speed) : null,
                machine_pressure: createForm.machine_pressure || null,
                temperature_c: createForm.temperature_c ? parseFloat(createForm.temperature_c) : null,
                duration_min: createForm.duration_min ? parseInt(createForm.duration_min, 10) : null,
                operator_name: createForm.operator_name || null,
                notes: createForm.notes || null,
                input_batch_id: createForm.input_batch_id || null,
                customer_name: createForm.customer_name || null,
                po_number: createForm.po_number || null,
                artikel: createForm.artikel || null,
                color_name: createForm.color_name || null,
                color_matching_ref: createForm.color_matching_ref || null,
                lot_number: createForm.lot_number || null,
                qty_order_kg: createForm.qty_order_kg ? parseFloat(createForm.qty_order_kg) : null,
            };
            const res = await authFetch(`${API_BASE}/dyeing-runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setErrorMsg(err.detail || 'Failed to create run.');
            } else {
                setCreateForm(emptyCreateForm);
                setShowCreateRun(false);
                await fetchRuns(selectedWoId);
            }
        } catch {
            setErrorMsg('Network error creating run.');
        } finally {
            setSaving(false);
        }
    };

    const handleStartRun = async (run: any) => {
        setErrorMsg(null);
        try {
            const res = await authFetch(`${API_BASE}/dyeing-runs/${run.id}/start`, { method: 'POST' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setErrorMsg(err.detail || 'Failed to start run.');
            } else {
                if (selectedWoId) await fetchRuns(selectedWoId);
            }
        } catch {
            setErrorMsg('Network error starting run.');
        }
    };

    const handleOpenComplete = (run: any) => {
        let preChemicals: ChemicalRow[] = (run.chemicals ?? []).map((c: any) => ({
            item_id: String(c.item_id ?? ''),
            planned_qty: String(c.planned_qty ?? ''),
            actual_qty: String(c.actual_qty ?? ''),
            uom_id: String(c.uom_id ?? ''),
        }));
        // Auto-populate from recipe if no chemicals recorded yet and volume_air_liters is set
        if (preChemicals.length === 0 && run.recipe_id && run.volume_air_liters) {
            const recipe = recipes.find((r: any) => String(r.id) === String(run.recipe_id));
            if (recipe?.lines?.length) {
                preChemicals = recipe.lines.map((line: any) => {
                    let planned = 0;
                    if (line.qty_per_liter != null) {
                        planned = parseFloat((line.qty_per_liter * run.volume_air_liters).toFixed(4));
                    } else if (line.qty_per_100kg != null) {
                        planned = parseFloat((line.qty_per_100kg * run.substrate_qty / 100).toFixed(4));
                    }
                    return {
                        item_id: String(line.item_id ?? ''),
                        planned_qty: String(planned),
                        actual_qty: '',
                        uom_id: String(line.uom_id ?? ''),
                    };
                });
            }
        }
        setCompleteForm({
            shade_result: run.shade_result ?? '',
            shade_notes: run.shade_notes ?? '',
            output_batch_number: run.output_batch_number ?? '',
            chemicals: preChemicals,
        });
        setShowCompleteModal(run);
        setErrorMsg(null);
    };

    const handleCompleteFormChange = (field: keyof Omit<CompleteForm, 'chemicals'>, value: string) => {
        setCompleteForm(prev => ({ ...prev, [field]: value }));
    };

    const handleChemicalChange = (idx: number, field: keyof ChemicalRow, value: string) => {
        setCompleteForm(prev => {
            const updated = prev.chemicals.map((row, i) =>
                i === idx ? { ...row, [field]: value } : row
            );
            return { ...prev, chemicals: updated };
        });
    };

    const handleAddChemical = () => {
        setCompleteForm(prev => ({
            ...prev,
            chemicals: [...prev.chemicals, { item_id: '', planned_qty: '', actual_qty: '', uom_id: '' }],
        }));
    };

    const handleRemoveChemical = (idx: number) => {
        setCompleteForm(prev => ({
            ...prev,
            chemicals: prev.chemicals.filter((_, i) => i !== idx),
        }));
    };

    const handleSaveComplete = async () => {
        if (!showCompleteModal) return;
        setSaving(true);
        setErrorMsg(null);
        try {
            const payload: any = {
                shade_result: completeForm.shade_result || null,
                shade_notes: completeForm.shade_notes || null,
                output_batch_number: completeForm.output_batch_number || null,
                chemicals: completeForm.chemicals
                    .filter(c => c.item_id)
                    .map(c => ({
                        item_id: c.item_id,
                        planned_qty: c.planned_qty ? parseFloat(c.planned_qty) : null,
                        actual_qty: c.actual_qty ? parseFloat(c.actual_qty) : null,
                        uom_id: c.uom_id || null,
                    })),
            };
            const res = await authFetch(`${API_BASE}/dyeing-runs/${showCompleteModal.id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setErrorMsg(err.detail || 'Failed to complete run.');
            } else {
                setShowCompleteModal(null);
                setCompleteForm(emptyCompleteForm);
                if (selectedWoId) await fetchRuns(selectedWoId);
            }
        } catch {
            setErrorMsg('Network error completing run.');
        } finally {
            setSaving(false);
        }
    };

    const formatDateTime = (dt: string | null | undefined) => {
        if (!dt) return '-';
        try {
            return tzFmt(dt, { dateStyle: 'short', timeStyle: 'short' } as Intl.DateTimeFormatOptions, 'en-GB');
        } catch {
            return dt;
        }
    };

    const shortId = (id: any) => {
        const s = String(id ?? '');
        return s.length > 8 ? s.slice(0, 8) + '...' : s;
    };

    return (
        <div style={classic
            ? { display: 'flex', gap: 6, fontFamily: xpFont, fontSize: 11, height: '100%', minHeight: 400 }
            : { display: 'flex', gap: 10, fontFamily: modernFont, fontSize: 13, height: '100%', minHeight: 400, background: '#f8fafc' }}>
            {/* Left pane: Work Orders */}
            <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: classic ? undefined : 'hidden', ...xpPanel }}>
                <div style={xpSectionHeader}>Dyeing Work Orders</div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {workOrders.length === 0 ? (
                        woLoading
                            ? <ListSkeleton rows={6} />
                            : <div style={{ padding: '8px', color: classic ? '#666' : '#64748b', fontSize: classic ? 11 : 13 }}>No dyeing work orders found.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 11 : 13 }}>
                            <thead>
                                <tr style={classic
                                    ? { background: '#ece9d8', borderBottom: '1px solid #7f9db9' }
                                    : {}}>
                                    <th style={classic
                                        ? { ...xpThCell, whiteSpace: 'nowrap' }
                                        : { ...xpThCell, padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>WO Name</th>
                                    <th style={classic
                                        ? { ...xpThCell }
                                        : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Status</th>
                                    <th style={classic
                                        ? { ...xpThCell }
                                        : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>MO Ref</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedWorkOrders.map(wo => {
                                    const isSelected = String(wo.id) === selectedWoId;
                                    return (
                                        <tr
                                            key={wo.id}
                                            onClick={() => handleSelectWo(wo)}
                                            style={classic ? {
                                                cursor: 'pointer',
                                                background: isSelected ? '#316ac5' : 'transparent',
                                                color: isSelected ? 'white' : '#000',
                                                borderBottom: '1px solid #e0e0e0',
                                            } : {
                                                cursor: 'pointer',
                                                background: isSelected ? '#e7eefc' : 'transparent',
                                                color: isSelected ? '#1d4ed8' : '#334155',
                                                borderBottom: '1px solid #e6eaf1',
                                            }}
                                        >
                                            <td style={{ padding: classic ? '2px 6px' : '6px 10px', whiteSpace: 'nowrap' }}>
                                                <div>{wo.name ?? wo.wo_number ?? `WO-${shortId(wo.id)}`}</div>
                                                {wo.work_center_name && (
                                                    <div style={{ fontSize: classic ? 10 : 11, color: isSelected ? (classic ? '#cce' : '#2563eb') : (classic ? '#666' : '#64748b') }}>
                                                        {wo.work_center_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: classic ? '2px 6px' : '6px 10px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    color: isSelected ? (classic ? 'white' : '#1d4ed8') : (STATUS_COLORS[wo.status] ?? '#333'),
                                                    fontWeight: isSelected ? 'normal' : 'bold',
                                                    fontSize: classic ? 10 : 11,
                                                }}>
                                                    {wo.status ?? '-'}
                                                </span>
                                            </td>
                                            <td style={{ padding: classic ? '2px 6px' : '6px 10px', fontSize: classic ? 10 : 11, color: isSelected ? (classic ? '#cce' : '#2563eb') : (classic ? '#555' : '#64748b') }}>
                                                {wo.manufacturing_order_id ? shortId(wo.manufacturing_order_id) : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                <Pager page={clampedWoPage} total={workOrders.length} pageSize={WO_PAGE_SIZE} onPageChange={setWoPage} hideWhenEmpty />
            </div>

            {/* Right pane: Runs */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: classic ? undefined : 'hidden', ...xpPanel, minWidth: 0 }}>
                {!selectedWoId ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: classic ? '#888' : '#64748b', fontSize: classic ? 12 : 13 }}>
                        Select a work order to view dyeing runs.
                    </div>
                ) : (
                    <>
                        <div style={{ ...xpSectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>
                                Dyeing Runs - {selectedWo?.name ?? selectedWo?.wo_number ?? `WO ${shortId(selectedWoId)}`}
                            </span>
                            {canManage && (
                            <button
                                style={classic ? { ...xpBtn, fontSize: 10 } : { ...xpPrimaryBtn, fontSize: 12 }}
                                onClick={handleOpenCreateRun}
                            >
                                {showCreateRun ? 'Cancel' : '+ Create Run'}
                            </button>
                            )}
                        </div>

                        {errorMsg && (
                            <div style={classic
                                ? { background: '#fff3cd', border: '1px solid #ffc107', padding: '3px 8px', fontSize: 11, color: '#664d03' }
                                : { background: '#fef3cd', border: '1px solid #f0d98a', borderRadius: 7, margin: 8, padding: '6px 10px', fontSize: 13, color: '#854d0e' }}>
                                {errorMsg}
                            </div>
                        )}

                        {/* Create Run Form */}
                        {showCreateRun && (
                            <div style={classic
                                ? { borderBottom: '1px solid #7f9db9', padding: '6px 8px', background: '#f5f4ed' }
                                : { borderBottom: '1px solid #dbe1ea', padding: '10px 12px', background: '#f8fafc' }}>
                                <div style={classic
                                    ? { fontWeight: 'bold', fontSize: 11, marginBottom: 4 }
                                    : { fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#1e293b' }}>New Dyeing Run</div>
                                {/* Job Info */}
                                <div style={classic
                                    ? { fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 3, borderBottom: '1px solid #d0d8e8', paddingBottom: 2 }
                                    : { fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, borderBottom: '1px solid #e6eaf1', paddingBottom: 4 }}>Job Info</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Customer</span>
                                        <input type="text" style={xpInput} value={createForm.customer_name}
                                            onChange={e => handleCreateFormChange('customer_name', e.target.value)} placeholder="customer name" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>No. PO</span>
                                        <input type="text" style={xpInput} value={createForm.po_number}
                                            onChange={e => handleCreateFormChange('po_number', e.target.value)} placeholder="PO number" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Artikel</span>
                                        <input type="text" style={xpInput} value={createForm.artikel}
                                            onChange={e => handleCreateFormChange('artikel', e.target.value)} placeholder="article code" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Warna</span>
                                        <input type="text" style={xpInput} value={createForm.color_name}
                                            onChange={e => handleCreateFormChange('color_name', e.target.value)} placeholder="color name" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Color Matching</span>
                                        <input type="text" style={xpInput} value={createForm.color_matching_ref}
                                            onChange={e => handleCreateFormChange('color_matching_ref', e.target.value)} placeholder="ref code" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>LOT</span>
                                        <input type="text" style={xpInput} value={createForm.lot_number}
                                            onChange={e => handleCreateFormChange('lot_number', e.target.value)} placeholder="lot number" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Qty Order (kg)</span>
                                        <input type="number" step="0.01" style={xpInput} value={createForm.qty_order_kg}
                                            onChange={e => handleCreateFormChange('qty_order_kg', e.target.value)} placeholder="e.g. 65" />
                                    </label>
                                </div>
                                {/* Process Params */}
                                <div style={classic
                                    ? { fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 3, borderBottom: '1px solid #d0d8e8', paddingBottom: 2 }
                                    : { fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, borderBottom: '1px solid #e6eaf1', paddingBottom: 4 }}>Process</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Recipe</span>
                                        <select
                                            style={classic ? { ...xpInput, height: 22 } : { ...xpInput, height: 30 }}
                                            value={createForm.recipe_id}
                                            onChange={e => handleCreateFormChange('recipe_id', e.target.value)}
                                        >
                                            <option value="">-- select recipe --</option>
                                            {recipes.map(r => (
                                                <option key={r.id} value={r.id}>{r.name ?? r.recipe_code ?? `Recipe ${r.id}`}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Substrate Qty</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.substrate_qty}
                                            onChange={e => handleCreateFormChange('substrate_qty', e.target.value)}
                                            placeholder="e.g. 100"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Input Lot</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.input_batch_id}
                                            onChange={e => handleCreateFormChange('input_batch_id', e.target.value)}
                                            placeholder="lot number"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Machine Name</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.machine_name}
                                            onChange={e => handleCreateFormChange('machine_name', e.target.value)}
                                            placeholder="e.g. JET-01"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Liquor Ratio</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.liquor_ratio}
                                            onChange={e => handleCreateFormChange('liquor_ratio', e.target.value)}
                                            placeholder="e.g. 10"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Volume Air (L)</span>
                                        <input type="number" step="0.1" style={xpInput} value={createForm.volume_air_liters}
                                            onChange={e => handleCreateFormChange('volume_air_liters', e.target.value)} placeholder="e.g. 190" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Speed</span>
                                        <input type="number" step="0.1" style={xpInput} value={createForm.machine_speed}
                                            onChange={e => handleCreateFormChange('machine_speed', e.target.value)} placeholder="e.g. 7" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Tekanan (Pressure)</span>
                                        <input type="text" style={xpInput} value={createForm.machine_pressure}
                                            onChange={e => handleCreateFormChange('machine_pressure', e.target.value)} placeholder="pressure" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Temperature (C)</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.temperature_c}
                                            onChange={e => handleCreateFormChange('temperature_c', e.target.value)}
                                            placeholder="e.g. 60"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Duration (min)</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.duration_min}
                                            onChange={e => handleCreateFormChange('duration_min', e.target.value)}
                                            placeholder="e.g. 45"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Operator Name</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.operator_name}
                                            onChange={e => handleCreateFormChange('operator_name', e.target.value)}
                                            placeholder="operator"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Notes</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.notes}
                                            onChange={e => handleCreateFormChange('notes', e.target.value)}
                                            placeholder="optional"
                                        />
                                    </label>
                                </div>
                                <div style={{ marginTop: classic ? 6 : 10, display: 'flex', gap: classic ? 4 : 8 }}>
                                    <button style={xpPrimaryBtn} onClick={handleSaveRun} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Run'}
                                    </button>
                                    <button style={xpBtn} onClick={() => { setShowCreateRun(false); setCreateForm(emptyCreateForm); setErrorMsg(null); }}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Runs table */}
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {loading ? (
                                <ListSkeleton rows={4} padding="8px 12px" />
                            ) : runs.length === 0 ? (
                                <div style={{ padding: 12, color: classic ? '#888' : '#64748b', fontSize: classic ? 11 : 13 }}>No dyeing runs for this work order.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 11 : 13 }}>
                                    <thead>
                                        <tr style={classic
                                            ? { background: '#ece9d8', borderBottom: '1px solid #7f9db9' }
                                            : {}}>
                                            <th style={classic ? { ...xpThCell, whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>Run #</th>
                                            <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Recipe</th>
                                            <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Substrate Qty</th>
                                            <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Machine</th>
                                            <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Status</th>
                                            <th style={classic ? { ...xpThCell, whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>Shade Result</th>
                                            <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Started</th>
                                            <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Completed</th>
                                            <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedRuns.map((run, idx) => {
                                            const runLabel = run.run_number ?? run.run_code ?? `#${idx + 1}`;
                                            const recipeName = run.recipe_name
                                                ?? recipes.find(r => String(r.id) === String(run.recipe_id))?.name
                                                ?? (run.recipe_id ? shortId(run.recipe_id) : '-');
                                            const shadeColors = run.shade_result ? SHADE_COLORS[run.shade_result] : null;
                                            return (
                                                <tr key={run.id} style={classic
                                                    ? { borderBottom: '1px solid #e0e0e0', background: idx % 2 === 0 ? 'white' : '#f5f3ee' }
                                                    : { borderBottom: '1px solid #e6eaf1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap', fontWeight: 'bold' } : { padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontFamily: modernFont }}>{runLabel}</td>
                                                    <td style={classic ? { padding: '2px 6px' } : { padding: '6px 10px', color: '#334155', fontFamily: modernFont }}>{recipeName}</td>
                                                    <td style={classic ? { padding: '2px 6px', textAlign: 'right' } : { padding: '6px 10px', textAlign: 'right', color: '#334155', fontFamily: modernFont }}>
                                                        {run.substrate_qty != null ? run.substrate_qty : '-'}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px' } : { padding: '6px 10px', color: '#334155', fontFamily: modernFont }}>{run.machine_name ?? '-'}</td>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap' } : { padding: '6px 10px', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            color: STATUS_COLORS[run.status] ?? '#333',
                                                            fontWeight: 'bold',
                                                            fontSize: classic ? 10 : 11,
                                                        }}>
                                                            {run.status ?? '-'}
                                                        </span>
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px' } : { padding: '6px 10px' }}>
                                                        {run.status === 'COMPLETED' && run.shade_result ? (
                                                            <span style={classic ? {
                                                                padding: '1px 6px',
                                                                borderRadius: 2,
                                                                fontSize: 10,
                                                                fontWeight: 'bold',
                                                                background: shadeColors?.bg ?? '#eee',
                                                                color: shadeColors?.color ?? '#333',
                                                                border: '1px solid #ccc',
                                                            } : {
                                                                padding: '1px 8px',
                                                                borderRadius: 6,
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                background: shadeColors?.bg ?? '#eee',
                                                                color: shadeColors?.color ?? '#333',
                                                                border: '1px solid #ccc',
                                                            }}>
                                                                {run.shade_result}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: classic ? '#999' : '#94a3b8' }}>-</span>
                                                        )}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 10 } : { padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 12, color: '#64748b', fontFamily: modernFont }}>
                                                        {formatDateTime(run.started_at)}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 10 } : { padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 12, color: '#64748b', fontFamily: modernFont }}>
                                                        {formatDateTime(run.completed_at)}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap' } : { padding: '6px 10px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', gap: classic ? 3 : 6 }}>
                                                            {canManage && run.status === 'PENDING' && (
                                                                <>
                                                                    <button
                                                                        style={xpPrimaryBtn}
                                                                        onClick={() => handleStartRun(run)}
                                                                    >
                                                                        Start
                                                                    </button>
                                                                    <button
                                                                        style={xpBtn}
                                                                        onClick={() => handleOpenComplete(run)}
                                                                    >
                                                                        Complete
                                                                    </button>
                                                                </>
                                                            )}
                                                            {canManage && run.status === 'IN_PROGRESS' && (
                                                                <button
                                                                    style={xpPrimaryBtn}
                                                                    onClick={() => handleOpenComplete(run)}
                                                                >
                                                                    Complete
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <Pager page={clampedRunPage} total={runs.length} pageSize={RUN_PAGE_SIZE} onPageChange={setRunPage} hideWhenEmpty />
                    </>
                )}
            </div>

            {/* Complete Run Modal */}
            {showCompleteModal && (
                <ModalWrapper
                    isOpen={!!showCompleteModal}
                    onClose={() => { setShowCompleteModal(null); setErrorMsg(null); }}
                    title={`Complete Dyeing Run ${showCompleteModal.run_number ?? showCompleteModal.run_code ?? `#${showCompleteModal.id}`}`}
                    size="lg"
                    modeless
                    footer={<>
                        <button
                            style={classic ? { ...xpBtn, padding: '3px 16px' } : { ...xpPrimaryBtn, padding: '6px 18px' }}
                            onClick={handleSaveComplete}
                            disabled={saving || !completeForm.output_batch_number}
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            style={classic ? { ...xpBtn, padding: '3px 16px' } : { ...xpBtn, padding: '6px 18px' }}
                            onClick={() => { setShowCompleteModal(null); setErrorMsg(null); }}
                            disabled={saving}
                        >
                            Cancel
                        </button>
                    </>}
                >
                    <div>
                            {errorMsg && (
                                <div style={classic
                                    ? { background: '#fff3cd', border: '1px solid #ffc107', padding: '3px 8px', fontSize: 11, color: '#664d03', marginBottom: 6 }
                                    : { background: '#fef3cd', border: '1px solid #f0d98a', borderRadius: 7, padding: '6px 10px', fontSize: 13, color: '#854d0e', marginBottom: 10 }}>
                                    {errorMsg}
                                </div>
                            )}

                            {/* Shade & batch fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 8 }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Shade Result</span>
                                    <select
                                        style={classic ? { ...xpInput, height: 22 } : { ...xpInput, height: 30 }}
                                        value={completeForm.shade_result}
                                        onChange={e => handleCompleteFormChange('shade_result', e.target.value)}
                                    >
                                        <option value="">-- select --</option>
                                        <option value="PASS">PASS</option>
                                        <option value="FAIL">FAIL</option>
                                        <option value="REWORK">REWORK</option>
                                    </select>
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Output Lot Number *</span>
                                    <input
                                        type="text"
                                        style={xpInput}
                                        value={completeForm.output_batch_number}
                                        onChange={e => handleCompleteFormChange('output_batch_number', e.target.value)}
                                        placeholder="lot number (required)"
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 1, gridColumn: '1 / -1' }}>
                                    <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Shade Notes</span>
                                    <textarea
                                        style={{ ...xpInput, height: 48, resize: 'vertical' }}
                                        value={completeForm.shade_notes}
                                        onChange={e => handleCompleteFormChange('shade_notes', e.target.value)}
                                        placeholder="optional notes"
                                    />
                                </label>
                            </div>

                            {/* Chemicals section */}
                            <div style={{ ...xpPanel, marginBottom: classic ? 6 : 10, overflow: classic ? undefined : 'hidden' }}>
                                <div style={{ ...xpSectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Chemicals Used</span>
                                    <button style={classic ? { ...xpBtn, fontSize: 10 } : { ...xpPrimaryBtn, fontSize: 12 }} onClick={handleAddChemical}>+ Add Chemical</button>
                                </div>
                                {completeForm.chemicals.length === 0 ? (
                                    <div style={{ padding: classic ? '6px 8px' : '8px 12px', color: classic ? '#888' : '#64748b', fontSize: classic ? 11 : 13 }}>No chemicals added. Click "+ Add Chemical" to begin.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 11 : 13 }}>
                                        <thead>
                                            <tr style={classic
                                                ? { background: '#ece9d8', borderBottom: '1px solid #7f9db9' }
                                                : {}}>
                                                <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Item</th>
                                                <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Planned Qty</th>
                                                <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actual Qty</th>
                                                <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>UOM</th>
                                                <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completeForm.chemicals.map((row, idx) => (
                                                <tr key={idx} style={classic
                                                    ? { borderBottom: '1px solid #e0e0e0', background: idx % 2 === 0 ? 'white' : '#f5f3ee' }
                                                    : { borderBottom: '1px solid #e6eaf1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                    <td style={{ padding: classic ? '2px 4px' : '5px 6px' }}>
                                                        <select
                                                            style={classic ? { ...xpInput, width: '100%', height: 22 } : { ...xpInput, width: '100%', height: 30 }}
                                                            value={row.item_id}
                                                            onChange={e => handleChemicalChange(idx, 'item_id', e.target.value)}
                                                        >
                                                            <option value="">-- select item --</option>
                                                            {items.map(it => (
                                                                <option key={it.id} value={it.id}>
                                                                    {it.name ?? it.item_code ?? `Item ${it.id}`}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '5px 6px' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...xpInput, width: 70 }}
                                                            value={row.planned_qty}
                                                            onChange={e => handleChemicalChange(idx, 'planned_qty', e.target.value)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '5px 6px' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...xpInput, width: 70 }}
                                                            value={row.actual_qty}
                                                            onChange={e => handleChemicalChange(idx, 'actual_qty', e.target.value)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '5px 6px' }}>
                                                        <input
                                                            type="text"
                                                            style={{ ...xpInput, width: 50 }}
                                                            value={row.uom_id}
                                                            onChange={e => handleChemicalChange(idx, 'uom_id', e.target.value)}
                                                            placeholder="UOM"
                                                        />
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '5px 6px' }}>
                                                        <button
                                                            style={classic ? { ...xpBtn, fontSize: 10, color: '#800' } : { ...xpBtn, fontSize: 12, color: '#b91c1c', borderColor: '#f0c2c2' }}
                                                            onClick={() => handleRemoveChemical(idx)}
                                                        >
                                                            Remove
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                </ModalWrapper>
            )}
        </div>
    );
}
