'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { STATUS_COLORS, xpFont, ListSkeleton, CHIP_RADIUS, FORM_SECTION_BLUE, XP_BTN } from '../shared/xpTheme';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import { useTheme } from '../../context/ThemeContext';
import { usePaginatedFetch } from '../../context/usePaginatedList';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { lvThBanded, LV_STICKY_THEAD, lvZebra, Dash, lvBtn, lvInput } from '../shared/listViewTheme';
import DoseSheet, { fmtDose, doseUnitFor, type DosePreview } from '../shared/DoseSheet';

const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const makeInput = (classic: boolean): React.CSSProperties => lvInput(classic, classic ? { padding: '1px 4px', width: 'auto' } : { height: 'auto' });
const makeBtn = (classic: boolean): React.CSSProperties => lvBtn(classic, 'default', classic ? { fontSize: 10, padding: '2px 8px' } : {});
const makePrimaryBtn = (classic: boolean): React.CSSProperties => lvBtn(classic, 'primary', classic ? { fontSize: 10, padding: '2px 8px' } : {});
const makeSectionHeader = (classic: boolean): React.CSSProperties => classic ? {
    background: FORM_SECTION_BLUE,
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
const makeThCell = (classic: boolean): React.CSSProperties => lvThBanded(classic);

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api')
    .replace(/\/api$/, '') + '/api';

const WO_PAGE_SIZE = 20;
const RUN_PAGE_SIZE = 20;

const SHADE_COLORS: Record<string, { bg: string; color: string }> = {
    PASS: { bg: '#d4edda', color: '#155724' },
    FAIL: { bg: '#f8d7da', color: '#721c24' },
    REWORK: { bg: '#ffeeba', color: '#856404' },
};

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

/** The QC entry, and nothing else.
 *
 *  This tab is supervisory now: the bath, the doses and the chemicals actually used
 *  are recorded in the work order flow (`useDyeingBath`, in the WO completion modal
 *  and the mobile scan terminal), because the bath and the output it produced are
 *  one act by one operator. The shade result stays here — it is a different person
 *  at a later moment, which is exactly why it is not folded into the production log.
 *
 *  No output lot field either: the dyed lot is minted once, by that production log,
 *  and the run adopts it (backend `add_mo_completion`).
 */
interface CompleteForm {
    shade_result: string;
    shade_notes: string;
}

interface DyeingOrdersTabProps {
    items: any[];
    recipes: any[];
    /** Typed rather than bare `Function` so usePaginatedFetch accepts it. */
    authFetch: (url: string, options?: any) => Promise<Response>;
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
    const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
    // The selected WO's row is retained, not looked up in the current page. The list
    // is server-paginated now, so paging away from the row you picked would other-
    // wise blank the runs pane's header mid-session.
    const [selectedWoRow, setSelectedWoRow] = useState<any | null>(null);
    const [runs, setRuns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreateRun, setShowCreateRun] = useState(false);
    const [showCompleteModal, setShowCompleteModal] = useState<any | null>(null);
    const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
    const [completeForm, setCompleteForm] = useState<CompleteForm>(emptyCompleteForm);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [runPage, setRunPage] = useState(1);
    // Live dose preview under the create form, and the read-only sheet the shade
    // screen shows so QC can see what the bath was dosed at.
    const [dosePreview, setDosePreview] = useState<DosePreview | null>(null);
    const [completeDoses, setCompleteDoses] = useState<DosePreview | null>(null);
    // Generation counter: the preview refires on every keystroke of substrate/volume,
    // so without it a slow earlier response lands after a newer one and shows doses
    // for a bath the operator has already changed.
    const doseGen = useRef(0);

    // Server-paginated: this list previously sent no window, so it silently showed
    // only the endpoint's default first page and paged over that — dyeing WO #51 was
    // unreachable no matter how far you clicked.
    const {
        rows: workOrders, total: woTotal, loading: woLoading,
        page: clampedWoPage, setPage: setWoPage, refetch: fetchWorkOrders,
    } = usePaginatedFetch<any>({
        endpoint: `${API_BASE}/work-orders`,
        authFetch,
        pageSize: WO_PAGE_SIZE,
        params: { center_type: 'DYEING' },
    });

    /** Weigh a recipe against a bath, server-side. Volume wins over ratio; the
     *  backend derives whichever is missing (dyeing_dose_service.solve_bath). */
    const fetchDoses = useCallback(async (
        recipeId: string,
        substrateQty: string | number | null | undefined,
        volumeLiters: string | number | null | undefined,
        liquorRatio?: string | number | null,
    ): Promise<DosePreview | null> => {
        if (!recipeId) return null;
        const qs = new URLSearchParams();
        if (substrateQty) qs.set('substrate_qty', String(substrateQty));
        if (volumeLiters) qs.set('bath_volume_liters', String(volumeLiters));
        else if (liquorRatio) qs.set('liquor_ratio', String(liquorRatio));
        try {
            const res = await authFetch(`${API_BASE}/dye-recipes/${recipeId}/doses?${qs.toString()}`);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }, [authFetch]);

    // Debounced so typing a substrate weight doesn't fire a request per keystroke —
    // same 350ms the item search uses.
    useEffect(() => {
        if (!showCreateRun || !createForm.recipe_id) {
            setDosePreview(null);
            return;
        }
        const gen = ++doseGen.current;
        const timer = setTimeout(async () => {
            const data = await fetchDoses(
                createForm.recipe_id, createForm.substrate_qty,
                createForm.volume_air_liters, createForm.liquor_ratio,
            );
            if (gen === doseGen.current) setDosePreview(data);
        }, 350);
        return () => clearTimeout(timer);
    }, [
        showCreateRun, createForm.recipe_id, createForm.substrate_qty,
        createForm.volume_air_liters, createForm.liquor_ratio, fetchDoses,
    ]);

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
        if (selectedWoId) {
            fetchRuns(selectedWoId);
        } else {
            setRuns([]);
        }
        setRunPage(1);
    }, [selectedWoId, fetchRuns]);

    // Prefer the retained row; fall back to the page for a selection made before it
    // was retained (or restored from elsewhere).
    const selectedWo = selectedWoRow ?? workOrders.find((wo: any) => String(wo.id) === selectedWoId);

    const runPages = Math.max(1, Math.ceil(runs.length / RUN_PAGE_SIZE));
    const clampedRunPage = Math.min(runPage, runPages);
    const pagedRuns = runs.slice((clampedRunPage - 1) * RUN_PAGE_SIZE, clampedRunPage * RUN_PAGE_SIZE);

    const handleSelectWo = (wo: any) => {
        setSelectedWoId(String(wo.id));
        setSelectedWoRow(wo);
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

    const handleOpenShade = async (run: any) => {
        setCompleteForm({
            shade_result: run.shade_result ?? '',
            shade_notes: run.shade_notes ?? '',
        });
        setCompleteDoses(null);
        setShowCompleteModal(run);
        setErrorMsg(null);

        if (!run.recipe_id) return;
        // Reference only, and read-only: it labels each row's basis and unit so the
        // recorded quantities below are legible. The numbers QC is looking at were
        // snapshotted when the bath was filled — recomputing them here would show
        // what the recipe says today instead of what the operator weighed.
        setCompleteDoses(await fetchDoses(run.recipe_id, run.substrate_qty, run.volume_air_liters));
    };

    const handleCompleteFormChange = (field: keyof CompleteForm, value: string) => {
        setCompleteForm(prev => ({ ...prev, [field]: value }));
    };

    /** Record the shade and close the bath.
     *
     *  `chemicals` is deliberately absent from the payload: omitting it means "leave
     *  the recorded doses alone" (backend DyeingRunCompletePayload). The actuals were
     *  recorded from the WO flow, and a QC entry must not wipe them.
     */
    const handleSaveShade = async () => {
        if (!showCompleteModal) return;
        setSaving(true);
        setErrorMsg(null);
        try {
            const res = await authFetch(`${API_BASE}/dyeing-runs/${showCompleteModal.id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shade_result: completeForm.shade_result || null,
                    shade_notes: completeForm.shade_notes || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setErrorMsg(err.detail || 'Failed to record the shade result.');
            } else {
                setShowCompleteModal(null);
                setCompleteForm(emptyCompleteForm);
                setCompleteDoses(null);
                if (selectedWoId) await fetchRuns(selectedWoId);
            }
        } catch {
            setErrorMsg('Network error recording the shade result.');
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
                            <thead style={LV_STICKY_THEAD}>
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
                                {workOrders.map((wo: any) => {
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
                                                {wo.manufacturing_order_id ? shortId(wo.manufacturing_order_id) : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                <Pager page={clampedWoPage} total={woTotal} pageSize={WO_PAGE_SIZE} onPageChange={setWoPage} hideWhenEmpty />
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
                                className={XP_BTN}
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
                                        <span
                                            style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}
                                            title="Litres of water per kg of substrate. Used to derive the bath volume when Volume Air is left blank; an entered Volume Air always wins."
                                        >Liquor Ratio (1:x)</span>
                                        <input
                                            type="number"
                                            style={xpInput}
                                            value={createForm.liquor_ratio}
                                            onChange={e => handleCreateFormChange('liquor_ratio', e.target.value)}
                                            placeholder="e.g. 10"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span
                                            style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}
                                            title="Water volume of the bath, in litres. Every g/L chemical is weighed out against this. Leave blank to have it derived from the liquor ratio."
                                        >Volume Air (L)</span>
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
                                {createForm.recipe_id && (
                                    <DoseSheet
                                        classic={classic}
                                        doses={dosePreview}
                                        emptyHint="This recipe has no chemical lines to weigh out."
                                        style={{ marginTop: classic ? 6 : 10 }}
                                    />
                                )}
                                <div style={{ marginTop: classic ? 6 : 10, display: 'flex', gap: classic ? 4 : 8 }}>
                                    <button className={XP_BTN} style={xpPrimaryBtn} onClick={handleSaveRun} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Run'}
                                    </button>
                                    <button className={XP_BTN} style={xpBtn} onClick={() => { setShowCreateRun(false); setCreateForm(emptyCreateForm); setErrorMsg(null); }}>
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
                                            <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }} title="Water volume of the bath — what every g/L dose is weighed against">Volume Air (L)</th>
                                            <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>L:R</th>
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
                                                ?? (run.recipe_id ? shortId(run.recipe_id) : '—');
                                            const shadeColors = run.shade_result ? SHADE_COLORS[run.shade_result] : null;
                                            // Gate the actions on the bath's own facts, not on `status`:
                                            // status is derived from the WO too (backend
                                            // services/dyeing_run_service), so a closed WO shows its
                                            // baths COMPLETED — and the shade is QC at a later moment,
                                            // which must stay recordable after the WO is finished.
                                            const bathClosed = !!run.completed_at;
                                            const bathFilled = !!run.started_at || run.volume_air_liters != null;
                                            return (
                                                <tr key={run.id} style={classic
                                                    ? { borderBottom: '1px solid #e0e0e0', background: lvZebra(true, idx) }
                                                    : { borderBottom: '1px solid #e6eaf1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap', fontWeight: 'bold' } : { padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontFamily: modernFont }}>{runLabel}</td>
                                                    <td style={classic ? { padding: '2px 6px' } : { padding: '6px 10px', color: '#334155', fontFamily: modernFont }}>{recipeName}</td>
                                                    <td style={classic ? { padding: '2px 6px', textAlign: 'right' } : { padding: '6px 10px', textAlign: 'right', color: '#334155', fontFamily: modernFont }}>
                                                        {run.substrate_qty != null ? run.substrate_qty : '—'}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap' } : { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: '#334155', fontFamily: modernFont }}>
                                                        {fmtDose(run.volume_air_liters, 1)}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap', color: '#666' } : { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: '#64748b', fontFamily: modernFont }}>
                                                        {run.liquor_ratio != null ? `1:${fmtDose(run.liquor_ratio, 2)}` : '—'}
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
                                                        {run.shade_result ? (
                                                            <span style={classic ? {
                                                                padding: '1px 6px',
                                                                borderRadius: CHIP_RADIUS,
                                                                fontSize: 10,
                                                                fontWeight: 'bold',
                                                                background: shadeColors?.bg ?? '#eee',
                                                                color: shadeColors?.color ?? '#333',
                                                                border: '1px solid #ccc',
                                                            } : {
                                                                padding: '1px 8px',
                                                                borderRadius: CHIP_RADIUS,
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                background: shadeColors?.bg ?? '#eee',
                                                                color: shadeColors?.color ?? '#333',
                                                                border: '1px solid #ccc',
                                                            }}>
                                                                {run.shade_result}
                                                            </span>
                                                        ) : (
                                                            <Dash classic={classic} />
                                                        )}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 10 } : { padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 12, color: '#64748b', fontFamily: modernFont }}>
                                                        {formatDateTime(run.started_at)}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 10 } : { padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 12, color: '#64748b', fontFamily: modernFont }}>
                                                        {formatDateTime(run.completed_at)}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap' } : { padding: '6px 10px', whiteSpace: 'nowrap' }}>
                                                        {/* One action: the shade. There is no Start button
                                                            any more — filling the bath is done from the WO,
                                                            with the output it produced. */}
                                                        <div style={{ display: 'flex', gap: classic ? 3 : 6 }}>
                                                            {canManage && !bathClosed && (
                                                                <button
                                                                    className={XP_BTN}
                                                                    style={bathFilled ? xpPrimaryBtn : xpBtn}
                                                                    onClick={() => handleOpenShade(run)}
                                                                    title={bathFilled
                                                                        ? 'Record the shade result and close this bath'
                                                                        : 'No bath recorded yet — the operator fills it from the work order log'}
                                                                >
                                                                    Shade Result
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

            {/* Shade Result Modal — the QC gate, and all this tab does now.
                The bath, the dose sheet and the chemicals actually used moved into
                the work order flow (WOCompletionModal / the mobile scan terminal):
                the bath and the output it produced are one act by one operator, and
                recording them on two screens is what let a WO be finished with its
                bath never recorded. What is left here is genuinely a different
                person at a later moment, judging the colour — so everything below
                the shade fields is read-only context for that judgement. */}
            {showCompleteModal && (
                <ModalWrapper
                    isOpen={!!showCompleteModal}
                    onClose={() => { setShowCompleteModal(null); setErrorMsg(null); }}
                    title={`Shade Result — Dyeing Run ${showCompleteModal.run_number ?? showCompleteModal.run_code ?? `#${showCompleteModal.id}`}`}
                    size="lg"
                    modeless
                    footer={<>
                        <button
                            className={XP_BTN}
                            style={classic ? { ...xpBtn, padding: '3px 16px' } : { ...xpPrimaryBtn, padding: '6px 18px' }}
                            onClick={handleSaveShade}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save & Close Bath'}
                        </button>
                        <button
                            className={XP_BTN}
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 8 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Shade Result</span>
                                <select
                                    style={classic ? { ...xpInput, height: 22 } : { ...xpInput, height: 30 }}
                                    value={completeForm.shade_result}
                                    onChange={e => handleCompleteFormChange('shade_result', e.target.value)}
                                    autoFocus
                                >
                                    <option value="">-- select --</option>
                                    <option value="PASS">PASS</option>
                                    <option value="FAIL">FAIL</option>
                                    <option value="REWORK">REWORK</option>
                                </select>
                            </label>
                            {/* Read-only: the dyed lot is minted by the WO production log
                                (one lot per physical dye batch) and this run adopts it. */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Output Lot</span>
                                <span
                                    style={classic
                                        ? { fontSize: 11, padding: '2px 4px', color: showCompleteModal.output_batch_number ? '#333' : '#888' }
                                        : { fontSize: 13, padding: '4px 2px', fontFamily: modernFont, color: showCompleteModal.output_batch_number ? '#334155' : '#94a3b8' }}
                                    title="The dyed lot is created when the work order's output is logged, and this run picks it up automatically — one lot per physical dye batch."
                                >
                                    {showCompleteModal.output_batch_number || 'set when the WO output is logged'}
                                </span>
                            </div>
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

                        {/* The bath as the floor recorded it. Read-only here: it is
                            corrected in the WO log, where the operator is standing. */}
                        <div style={{ ...xpPanel, marginBottom: classic ? 6 : 10, overflow: classic ? undefined : 'hidden' }}>
                            <div style={xpSectionHeader}>Bath as Recorded</div>
                            <div style={{ padding: classic ? '5px 8px' : '8px 12px', display: 'flex', gap: classic ? 16 : 24, flexWrap: 'wrap', fontSize: classic ? 11 : 13 }}>
                                <span>Volume Air: <strong>{showCompleteModal.volume_air_liters != null ? `${fmtDose(showCompleteModal.volume_air_liters, 1)} L` : '—'}</strong></span>
                                <span>Substrate: <strong>{showCompleteModal.substrate_qty != null ? `${fmtDose(showCompleteModal.substrate_qty, 2)} kg` : '—'}</strong></span>
                                <span>Liquor Ratio: <strong>{showCompleteModal.liquor_ratio != null ? `1 : ${fmtDose(showCompleteModal.liquor_ratio, 2)}` : '—'}</strong></span>
                            </div>
                        </div>

                        {showCompleteModal.recipe_id && (
                            <DoseSheet
                                classic={classic}
                                doses={completeDoses}
                                emptyHint={completeDoses
                                    ? 'This recipe has no chemical lines to weigh out.'
                                    : 'Loading the recipe...'}
                            />
                        )}

                        {/* What the vessel actually took, recorded with the output log.
                            Planned vs actual is the only dosing variance signal there
                            is, which is why it sits in front of QC. */}
                        <div style={{ ...xpPanel, marginTop: classic ? 6 : 10, overflow: classic ? undefined : 'hidden' }}>
                            <div style={xpSectionHeader}>Chemicals Used</div>
                            {(showCompleteModal.chemicals ?? []).length === 0 ? (
                                <div style={{ padding: classic ? '6px 8px' : '8px 12px', color: classic ? '#888' : '#64748b', fontSize: classic ? 11 : 13 }}>
                                    Nothing recorded yet — the operator enters what went in with the
                                    work order&apos;s production log.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 11 : 13 }}>
                                    <thead>
                                        <tr style={classic ? { background: '#ece9d8', borderBottom: '1px solid #7f9db9' } : {}}>
                                            <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Item</th>
                                            <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Planned</th>
                                            <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actual</th>
                                            <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Variance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(showCompleteModal.chemicals ?? []).map((c: any, idx: number) => {
                                            const unit = doseUnitFor(completeDoses, String(c.item_id)) ?? '';
                                            const planned = Number(c.planned_qty ?? 0);
                                            const actual = Number(c.actual_qty ?? 0);
                                            const variance = actual - planned;
                                            return (
                                                <tr key={c.id ?? idx} style={classic
                                                    ? { borderBottom: '1px solid #e0e0e0', background: lvZebra(true, idx) }
                                                    : { borderBottom: '1px solid #e6eaf1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                    <td style={classic ? { padding: '2px 6px' } : { padding: '6px 10px', color: '#334155', fontFamily: modernFont }}>
                                                        {c.item_name ?? items.find(it => String(it.id) === String(c.item_id))?.name ?? <Dash classic={classic} />}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap', color: '#666' } : { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: '#64748b', fontFamily: modernFont }}>
                                                        {fmtDose(planned, 3)}{unit ? ` ${unit}` : ''}
                                                    </td>
                                                    <td style={classic ? { padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 'bold' } : { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontFamily: modernFont }}>
                                                        {actual > 0 ? `${fmtDose(actual, 3)}${unit ? ` ${unit}` : ''}` : <Dash classic={classic} />}
                                                    </td>
                                                    <td style={{
                                                        ...(classic ? { padding: '2px 6px' } : { padding: '6px 10px', fontFamily: modernFont }),
                                                        textAlign: 'right', whiteSpace: 'nowrap',
                                                        color: actual <= 0 ? '#888' : Math.abs(variance) < 1e-9 ? '#666' : variance > 0 ? '#900' : '#1a5e1a',
                                                    }}>
                                                        {actual > 0 ? `${variance > 0 ? '+' : ''}${fmtDose(variance, 3)}` : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
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
