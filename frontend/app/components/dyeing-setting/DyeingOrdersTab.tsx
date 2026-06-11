'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { STATUS_COLORS } from '../shared/xpTheme';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 4px', outline: 'none', height: 20,
};
const xpBtn: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
};
const xpSectionHeader: React.CSSProperties = {
    background: 'linear-gradient(to right, #3060b8, #1a3d90)',
    color: 'white', padding: '3px 8px',
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
};
const xpPanel: React.CSSProperties = {
    border: '1px solid #7f9db9', background: 'white',
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api')
    .replace(/\/api$/, '') + '/api';

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
    const [workOrders, setWorkOrders] = useState<any[]>([]);
    const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
    const [runs, setRuns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateRun, setShowCreateRun] = useState(false);
    const [showCompleteModal, setShowCompleteModal] = useState<any | null>(null);
    const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
    const [completeForm, setCompleteForm] = useState<CompleteForm>(emptyCompleteForm);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchWorkOrders = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/work-orders?center_type=DYEING`);
            if (res.ok) {
                const data = await res.json();
                setWorkOrders(Array.isArray(data) ? data : (data.items ?? []));
            }
        } catch {
            // silently fail
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
    }, [selectedWoId, fetchRuns]);

    const selectedWo = workOrders.find(wo => String(wo.id) === selectedWoId);

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
            return new Date(dt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
        } catch {
            return dt;
        }
    };

    const shortId = (id: any) => {
        const s = String(id ?? '');
        return s.length > 8 ? s.slice(0, 8) + '...' : s;
    };

    return (
        <div style={{ display: 'flex', gap: 6, fontFamily: xpFont, fontSize: 11, height: '100%', minHeight: 400 }}>
            {/* Left pane: Work Orders */}
            <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', ...xpPanel }}>
                <div style={xpSectionHeader}>Dyeing Work Orders</div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    {workOrders.length === 0 ? (
                        <div style={{ padding: '8px', color: '#666', fontSize: 11 }}>No dyeing work orders found.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                                <tr style={{ background: '#ece9d8', borderBottom: '1px solid #7f9db9' }}>
                                    <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold', whiteSpace: 'nowrap' }}>WO Name</th>
                                    <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
                                    <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>MO Ref</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workOrders.map(wo => {
                                    const isSelected = String(wo.id) === selectedWoId;
                                    return (
                                        <tr
                                            key={wo.id}
                                            onClick={() => handleSelectWo(wo)}
                                            style={{
                                                cursor: 'pointer',
                                                background: isSelected ? '#316ac5' : 'transparent',
                                                color: isSelected ? 'white' : '#000',
                                                borderBottom: '1px solid #e0e0e0',
                                            }}
                                        >
                                            <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                <div>{wo.name ?? wo.wo_number ?? `WO-${shortId(wo.id)}`}</div>
                                                {wo.work_center_name && (
                                                    <div style={{ fontSize: 10, color: isSelected ? '#cce' : '#666' }}>
                                                        {wo.work_center_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    color: isSelected ? 'white' : (STATUS_COLORS[wo.status] ?? '#333'),
                                                    fontWeight: isSelected ? 'normal' : 'bold',
                                                    fontSize: 10,
                                                }}>
                                                    {wo.status ?? '-'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '2px 6px', fontSize: 10, color: isSelected ? '#cce' : '#555' }}>
                                                {wo.manufacturing_order_id ? shortId(wo.manufacturing_order_id) : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Right pane: Runs */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', ...xpPanel, minWidth: 0 }}>
                {!selectedWoId ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888', fontSize: 12 }}>
                        Select a work order to view dyeing runs.
                    </div>
                ) : (
                    <>
                        <div style={{ ...xpSectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>
                                Dyeing Runs - {selectedWo?.name ?? selectedWo?.wo_number ?? `WO ${shortId(selectedWoId)}`}
                            </span>
                            <button
                                style={{ ...xpBtn, fontSize: 10 }}
                                onClick={handleOpenCreateRun}
                            >
                                {showCreateRun ? 'Cancel' : '+ Create Run'}
                            </button>
                        </div>

                        {errorMsg && (
                            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', padding: '3px 8px', fontSize: 11, color: '#664d03' }}>
                                {errorMsg}
                            </div>
                        )}

                        {/* Create Run Form */}
                        {showCreateRun && (
                            <div style={{ borderBottom: '1px solid #7f9db9', padding: '6px 8px', background: '#f5f4ed' }}>
                                <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 4 }}>New Dyeing Run</div>
                                {/* Job Info */}
                                <div style={{ fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 3, borderBottom: '1px solid #d0d8e8', paddingBottom: 2 }}>Job Info</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Customer</span>
                                        <input type="text" style={xpInput} value={createForm.customer_name}
                                            onChange={e => handleCreateFormChange('customer_name', e.target.value)} placeholder="customer name" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>No. PO</span>
                                        <input type="text" style={xpInput} value={createForm.po_number}
                                            onChange={e => handleCreateFormChange('po_number', e.target.value)} placeholder="PO number" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Artikel</span>
                                        <input type="text" style={xpInput} value={createForm.artikel}
                                            onChange={e => handleCreateFormChange('artikel', e.target.value)} placeholder="article code" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Warna</span>
                                        <input type="text" style={xpInput} value={createForm.color_name}
                                            onChange={e => handleCreateFormChange('color_name', e.target.value)} placeholder="color name" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Color Matching</span>
                                        <input type="text" style={xpInput} value={createForm.color_matching_ref}
                                            onChange={e => handleCreateFormChange('color_matching_ref', e.target.value)} placeholder="ref code" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>LOT</span>
                                        <input type="text" style={xpInput} value={createForm.lot_number}
                                            onChange={e => handleCreateFormChange('lot_number', e.target.value)} placeholder="lot number" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Qty Order (kg)</span>
                                        <input type="number" step="0.01" style={xpInput} value={createForm.qty_order_kg}
                                            onChange={e => handleCreateFormChange('qty_order_kg', e.target.value)} placeholder="e.g. 65" />
                                    </label>
                                </div>
                                {/* Process Params */}
                                <div style={{ fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 3, borderBottom: '1px solid #d0d8e8', paddingBottom: 2 }}>Process</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Recipe</span>
                                        <select
                                            style={{ ...xpInput, height: 22 }}
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
                                        <span style={{ fontSize: 10, color: '#444' }}>Substrate Qty</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.substrate_qty}
                                            onChange={e => handleCreateFormChange('substrate_qty', e.target.value)}
                                            placeholder="e.g. 100"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Input Lot</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.input_batch_id}
                                            onChange={e => handleCreateFormChange('input_batch_id', e.target.value)}
                                            placeholder="lot number"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Machine Name</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.machine_name}
                                            onChange={e => handleCreateFormChange('machine_name', e.target.value)}
                                            placeholder="e.g. JET-01"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Liquor Ratio</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.liquor_ratio}
                                            onChange={e => handleCreateFormChange('liquor_ratio', e.target.value)}
                                            placeholder="e.g. 10"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Volume Air (L)</span>
                                        <input type="number" step="0.1" style={xpInput} value={createForm.volume_air_liters}
                                            onChange={e => handleCreateFormChange('volume_air_liters', e.target.value)} placeholder="e.g. 190" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Speed</span>
                                        <input type="number" step="0.1" style={xpInput} value={createForm.machine_speed}
                                            onChange={e => handleCreateFormChange('machine_speed', e.target.value)} placeholder="e.g. 7" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Tekanan (Pressure)</span>
                                        <input type="text" style={xpInput} value={createForm.machine_pressure}
                                            onChange={e => handleCreateFormChange('machine_pressure', e.target.value)} placeholder="pressure" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Temperature (C)</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.temperature_c}
                                            onChange={e => handleCreateFormChange('temperature_c', e.target.value)}
                                            placeholder="e.g. 60"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Duration (min)</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.duration_min}
                                            onChange={e => handleCreateFormChange('duration_min', e.target.value)}
                                            placeholder="e.g. 45"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Operator Name</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.operator_name}
                                            onChange={e => handleCreateFormChange('operator_name', e.target.value)}
                                            placeholder="operator"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 10, color: '#444' }}>Notes</span>
                                        <input
                                            type="text"
                                            style={xpInput}
                                            value={createForm.notes}
                                            onChange={e => handleCreateFormChange('notes', e.target.value)}
                                            placeholder="optional"
                                        />
                                    </label>
                                </div>
                                <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                                    <button style={xpBtn} onClick={handleSaveRun} disabled={saving}>
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
                                <div style={{ padding: 12, color: '#555', fontSize: 11 }}>Loading runs...</div>
                            ) : runs.length === 0 ? (
                                <div style={{ padding: 12, color: '#888', fontSize: 11 }}>No dyeing runs for this work order.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                        <tr style={{ background: '#ece9d8', borderBottom: '1px solid #7f9db9' }}>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Run #</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Recipe</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Substrate Qty</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Machine</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Shade Result</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Started</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Completed</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {runs.map((run, idx) => {
                                            const runLabel = run.run_number ?? run.run_code ?? `#${idx + 1}`;
                                            const recipeName = run.recipe_name
                                                ?? recipes.find(r => String(r.id) === String(run.recipe_id))?.name
                                                ?? (run.recipe_id ? shortId(run.recipe_id) : '-');
                                            const shadeColors = run.shade_result ? SHADE_COLORS[run.shade_result] : null;
                                            return (
                                                <tr key={run.id} style={{ borderBottom: '1px solid #e0e0e0', background: idx % 2 === 0 ? 'white' : '#f9f8f4' }}>
                                                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{runLabel}</td>
                                                    <td style={{ padding: '2px 6px' }}>{recipeName}</td>
                                                    <td style={{ padding: '2px 6px', textAlign: 'right' }}>
                                                        {run.substrate_qty != null ? run.substrate_qty : '-'}
                                                    </td>
                                                    <td style={{ padding: '2px 6px' }}>{run.machine_name ?? '-'}</td>
                                                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            color: STATUS_COLORS[run.status] ?? '#333',
                                                            fontWeight: 'bold',
                                                            fontSize: 10,
                                                        }}>
                                                            {run.status ?? '-'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '2px 6px' }}>
                                                        {run.status === 'COMPLETED' && run.shade_result ? (
                                                            <span style={{
                                                                padding: '1px 6px',
                                                                borderRadius: 2,
                                                                fontSize: 10,
                                                                fontWeight: 'bold',
                                                                background: shadeColors?.bg ?? '#eee',
                                                                color: shadeColors?.color ?? '#333',
                                                                border: '1px solid #ccc',
                                                            }}>
                                                                {run.shade_result}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#999' }}>-</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 10 }}>
                                                        {formatDateTime(run.started_at)}
                                                    </td>
                                                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 10 }}>
                                                        {formatDateTime(run.completed_at)}
                                                    </td>
                                                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', gap: 3 }}>
                                                            {run.status === 'PENDING' && (
                                                                <>
                                                                    <button
                                                                        style={xpBtn}
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
                                                            {run.status === 'IN_PROGRESS' && (
                                                                <button
                                                                    style={xpBtn}
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
                    </>
                )}
            </div>

            {/* Complete Run Modal */}
            {showCompleteModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1050,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#ece9d8',
                        border: '2px solid #0a246a',
                        width: 640,
                        maxWidth: '95vw',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        fontFamily: xpFont,
                        fontSize: 11,
                        boxShadow: '3px 3px 8px rgba(0,0,0,0.4)',
                    }}>
                        {/* Title bar */}
                        <div style={{
                            background: 'linear-gradient(to right, #0a246a, #a6b5e3)',
                            color: 'white',
                            padding: '3px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: 11,
                            fontWeight: 'bold',
                        }}>
                            <span>
                                Complete Dyeing Run {showCompleteModal.run_number ?? showCompleteModal.run_code ?? `#${showCompleteModal.id}`}
                            </span>
                            <button
                                onClick={() => { setShowCompleteModal(null); setErrorMsg(null); }}
                                style={{
                                    background: 'linear-gradient(to bottom, #e06060, #c03030)',
                                    border: '1px solid #800',
                                    color: 'white',
                                    fontFamily: xpFont,
                                    fontSize: 10,
                                    padding: '0 4px',
                                    cursor: 'pointer',
                                    lineHeight: '16px',
                                    fontWeight: 'bold',
                                }}
                            >
                                X
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, padding: 10 }}>
                            {errorMsg && (
                                <div style={{ background: '#fff3cd', border: '1px solid #ffc107', padding: '3px 8px', fontSize: 11, color: '#664d03', marginBottom: 6 }}>
                                    {errorMsg}
                                </div>
                            )}

                            {/* Shade & batch fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 8 }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={{ fontSize: 10, color: '#444' }}>Shade Result</span>
                                    <select
                                        style={{ ...xpInput, height: 22 }}
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
                                    <span style={{ fontSize: 10, color: '#444' }}>Output Lot Number *</span>
                                    <input
                                        type="text"
                                        style={xpInput}
                                        value={completeForm.output_batch_number}
                                        onChange={e => handleCompleteFormChange('output_batch_number', e.target.value)}
                                        placeholder="lot number (required)"
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 1, gridColumn: '1 / -1' }}>
                                    <span style={{ fontSize: 10, color: '#444' }}>Shade Notes</span>
                                    <textarea
                                        style={{ ...xpInput, height: 48, resize: 'vertical' }}
                                        value={completeForm.shade_notes}
                                        onChange={e => handleCompleteFormChange('shade_notes', e.target.value)}
                                        placeholder="optional notes"
                                    />
                                </label>
                            </div>

                            {/* Chemicals section */}
                            <div style={{ ...xpPanel, marginBottom: 6 }}>
                                <div style={{ ...xpSectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Chemicals Used</span>
                                    <button style={{ ...xpBtn, fontSize: 10 }} onClick={handleAddChemical}>+ Add Chemical</button>
                                </div>
                                {completeForm.chemicals.length === 0 ? (
                                    <div style={{ padding: '6px 8px', color: '#888', fontSize: 11 }}>No chemicals added. Click "+ Add Chemical" to begin.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                        <thead>
                                            <tr style={{ background: '#ece9d8', borderBottom: '1px solid #7f9db9' }}>
                                                <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>Item</th>
                                                <th style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Planned Qty</th>
                                                <th style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Actual Qty</th>
                                                <th style={{ padding: '2px 6px', textAlign: 'left', fontWeight: 'bold' }}>UOM</th>
                                                <th style={{ padding: '2px 6px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completeForm.chemicals.map((row, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0', background: idx % 2 === 0 ? 'white' : '#f9f8f4' }}>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <select
                                                            style={{ ...xpInput, width: '100%', height: 22 }}
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
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...xpInput, width: 70 }}
                                                            value={row.planned_qty}
                                                            onChange={e => handleChemicalChange(idx, 'planned_qty', e.target.value)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...xpInput, width: 70 }}
                                                            value={row.actual_qty}
                                                            onChange={e => handleChemicalChange(idx, 'actual_qty', e.target.value)}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <input
                                                            type="text"
                                                            style={{ ...xpInput, width: 50 }}
                                                            value={row.uom_id}
                                                            onChange={e => handleChemicalChange(idx, 'uom_id', e.target.value)}
                                                            placeholder="UOM"
                                                        />
                                                    </td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <button
                                                            style={{ ...xpBtn, fontSize: 10, color: '#800' }}
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

                        {/* Modal footer */}
                        <div style={{
                            borderTop: '1px solid #7f9db9',
                            padding: '6px 10px',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 4,
                            background: '#ece9d8',
                        }}>
                            <button
                                style={{ ...xpBtn, padding: '3px 16px' }}
                                onClick={handleSaveComplete}
                                disabled={saving || !completeForm.output_batch_number}
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                style={{ ...xpBtn, padding: '3px 16px' }}
                                onClick={() => { setShowCompleteModal(null); setErrorMsg(null); }}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
