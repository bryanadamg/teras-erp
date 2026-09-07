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

/** The bath as filled, editable while the run is open. Every g/L dose comes off it. */
interface BathForm {
    volume_air_liters: string;
    substrate_qty: string;
}

/** A weighed-out recipe from GET /dye-recipes/{id}/doses. Never computed here — the
 *  formula lives in backend services/dyeing_dose_service.py so this preview, the
 *  Complete Run dose sheet and the recipe print view cannot drift apart. */
interface DosePreview {
    recipe_code?: string | null;
    recipe_name?: string | null;
    substrate_qty?: number | null;
    bath_volume_liters?: number | null;
    liquor_ratio?: number | null;
    lines: {
        line_id: string;
        item_id: string;
        item_code?: string | null;
        item_name?: string | null;
        chemical_type?: string | null;
        basis?: string | null;
        qty_per_liter?: number | null;
        qty_per_100kg?: number | null;
        dose?: number | null;
        dose_unit?: string | null;
        dose_kg?: number | null;
        uom_id?: string | null;
        uom_name?: string | null;
    }[];
}

const fmtDose = (v: number | null | undefined, digits = 3) =>
    v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });

/** How a line is dosed, spelled out — the two bases are not interchangeable and the
 *  operator has to see which number a row followed. */
const BASIS_LABEL: Record<string, string> = {
    PER_LITER: 'g/L x bath',
    PER_100KG: '% owf x kg',
};

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
    output_batch_number: '',
    chemicals: [],
};

const emptyBathForm: BathForm = { volume_air_liters: '', substrate_qty: '' };

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
    // Live dose preview under the create form, and the dose sheet behind the
    // Complete Run modal's planned quantities.
    const [dosePreview, setDosePreview] = useState<DosePreview | null>(null);
    const [completeDoses, setCompleteDoses] = useState<DosePreview | null>(null);
    const [bathForm, setBathForm] = useState<BathForm>(emptyBathForm);
    const [bathSaving, setBathSaving] = useState(false);
    // Starting a run IS filling the bath, so the volume is taken there and the dose
    // sheet is in the operator's hand before any chemical goes in.
    const [showStartModal, setShowStartModal] = useState<any | null>(null);
    const [startBath, setStartBath] = useState<BathForm>(emptyBathForm);
    const [startDoses, setStartDoses] = useState<DosePreview | null>(null);
    const [starting, setStarting] = useState(false);
    // Generation counter: the preview refires on every keystroke of substrate/volume,
    // so without it a slow earlier response lands after a newer one and shows doses
    // for a bath the operator has already changed.
    const doseGen = useRef(0);
    // The Start modal keeps its own counter: the create form's preview can be open at
    // the same time, and sharing one would let each cancel the other's response.
    const startDoseGen = useRef(0);

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

    // Same debounce for the Start modal's sheet: the operator types the volume off
    // the machine and watches the weights settle before committing the start.
    useEffect(() => {
        if (!showStartModal?.recipe_id) {
            setStartDoses(null);
            return;
        }
        const gen = ++startDoseGen.current;
        const timer = setTimeout(async () => {
            const data = await fetchDoses(
                showStartModal.recipe_id, startBath.substrate_qty, startBath.volume_air_liters,
            );
            if (gen === startDoseGen.current) setStartDoses(data);
        }, 350);
        return () => clearTimeout(timer);
    }, [showStartModal, startBath.substrate_qty, startBath.volume_air_liters, fetchDoses]);

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

    const handleOpenStart = (run: any) => {
        setShowStartModal(run);
        setStartDoses(null);
        setErrorMsg(null);
        // The debounced effect below loads the sheet off this seed — no fetch here, or
        // the modal fires two requests for the same bath on every open.
        setStartBath({
            volume_air_liters: run.volume_air_liters != null ? String(run.volume_air_liters) : '',
            substrate_qty: run.substrate_qty != null ? String(run.substrate_qty) : '',
        });
    };

    /** Start = bath fill. The backend rejects a start with no resolvable volume and
     *  snapshots the doses onto the run, so there is nothing to seed at completion. */
    const handleStartRun = async () => {
        if (!showStartModal) return;
        setStarting(true);
        setErrorMsg(null);
        try {
            const res = await authFetch(`${API_BASE}/dyeing-runs/${showStartModal.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    volume_air_liters: startBath.volume_air_liters ? parseFloat(startBath.volume_air_liters) : null,
                    substrate_qty: startBath.substrate_qty ? parseFloat(startBath.substrate_qty) : null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setErrorMsg(err.detail || 'Failed to start run.');
                return;
            }
            setShowStartModal(null);
            setStartBath(emptyBathForm);
            setStartDoses(null);
            if (selectedWoId) await fetchRuns(selectedWoId);
        } catch {
            setErrorMsg('Network error starting run.');
        } finally {
            setStarting(false);
        }
    };

    /** Dose rows -> chemical rows. `planned_qty` is the calculated dose in the unit
     *  the dose sheet shows beside it (grams for a g/L line), so it is only ever
     *  filled from the server calc — never recomputed here. */
    const chemicalRowsFromDoses = (doses: DosePreview | null): ChemicalRow[] =>
        (doses?.lines ?? []).map(l => ({
            item_id: String(l.item_id ?? ''),
            planned_qty: l.dose != null ? String(parseFloat(l.dose.toFixed(4))) : '',
            actual_qty: '',
            uom_id: String(l.uom_id ?? ''),
        }));

    const handleOpenComplete = async (run: any) => {
        const preChemicals: ChemicalRow[] = (run.chemicals ?? []).map((c: any) => ({
            item_id: String(c.item_id ?? ''),
            planned_qty: String(c.planned_qty ?? ''),
            actual_qty: String(c.actual_qty ?? ''),
            uom_id: String(c.uom_id ?? ''),
        }));
        setCompleteForm({
            shade_result: run.shade_result ?? '',
            shade_notes: run.shade_notes ?? '',
            output_batch_number: run.output_batch_number ?? '',
            chemicals: preChemicals,
        });
        setBathForm({
            volume_air_liters: run.volume_air_liters != null ? String(run.volume_air_liters) : '',
            substrate_qty: run.substrate_qty != null ? String(run.substrate_qty) : '',
        });
        setCompleteDoses(null);
        setShowCompleteModal(run);
        setErrorMsg(null);

        if (!run.recipe_id) return;
        // The dose sheet is loaded for reference only — it labels each row's basis and
        // unit. The planned quantities themselves come off the run, snapshotted when
        // the bath was filled at start; recomputing them here would quietly replace
        // what the operator was told to weigh with what the recipe says today.
        setCompleteDoses(await fetchDoses(run.recipe_id, run.substrate_qty, run.volume_air_liters));
    };

    /** Record the bath the operator actually filled, then re-weigh the recipe against
     *  it. A bath change moves every g/L dose, so the planned column is refilled. */
    const handleSaveBath = async () => {
        if (!showCompleteModal) return;
        setBathSaving(true);
        setErrorMsg(null);
        try {
            const res = await authFetch(`${API_BASE}/dyeing-runs/${showCompleteModal.id}/bath`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    volume_air_liters: bathForm.volume_air_liters ? parseFloat(bathForm.volume_air_liters) : null,
                    substrate_qty: bathForm.substrate_qty ? parseFloat(bathForm.substrate_qty) : null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setErrorMsg(err.detail || 'Failed to save the bath.');
                return;
            }
            const updated = await res.json();
            setShowCompleteModal(updated);
            setBathForm({
                volume_air_liters: updated.volume_air_liters != null ? String(updated.volume_air_liters) : '',
                substrate_qty: updated.substrate_qty != null ? String(updated.substrate_qty) : '',
            });
            const doses = await fetchDoses(updated.recipe_id, updated.substrate_qty, updated.volume_air_liters);
            setCompleteDoses(doses);
            if (doses?.lines?.length) {
                // Only the planned column follows the new bath. Typed actuals survive,
                // an actual already recorded pins its plan (the backend leaves those
                // rows alone too — the chemical is in the vessel), and off-recipe rows
                // the operator added by hand are kept rather than replaced away.
                setCompleteForm(prev => {
                    const seeded = chemicalRowsFromDoses(doses);
                    const seededIds = new Set(seeded.map(r => r.item_id));
                    const reweighed = seeded.map(row => {
                        const existing = prev.chemicals.find(c => c.item_id === row.item_id);
                        if (!existing) return row;
                        const weighed = parseFloat(existing.actual_qty);
                        return {
                            ...row,
                            planned_qty: weighed > 0 ? existing.planned_qty : row.planned_qty,
                            actual_qty: existing.actual_qty,
                            uom_id: existing.uom_id || row.uom_id,
                        };
                    });
                    const manual = prev.chemicals.filter(c => !seededIds.has(c.item_id));
                    return { ...prev, chemicals: [...reweighed, ...manual] };
                });
            }
            if (selectedWoId) await fetchRuns(selectedWoId);
        } catch {
            setErrorMsg('Network error saving the bath.');
        } finally {
            setBathSaving(false);
        }
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
                setBathForm(emptyBathForm);
                setCompleteDoses(null);
                if (selectedWoId) await fetchRuns(selectedWoId);
            }
        } catch {
            setErrorMsg('Network error completing run.');
        } finally {
            setSaving(false);
        }
    };

    /** Unit of a chemical row's planned qty, taken from the dose sheet that filled it.
     *  A g/L line is dosed in grams while an owf line carries the line's own UOM, so
     *  an unlabelled number in that column is a 1000x mistake waiting to happen. */
    const doseUnitFor = (itemId: string) =>
        completeDoses?.lines.find(l => String(l.item_id) === String(itemId))?.dose_unit ?? null;

    /** The weighed-out recipe for one bath. Shared by the create form's preview and
     *  the Complete Run modal so the operator reads the same sheet in both. */
    const renderDoseSheet = (doses: DosePreview | null, emptyHint: string) => {
        const rows = doses?.lines ?? [];
        const noBath = !doses?.bath_volume_liters;
        return (
            <div style={{ ...xpPanel, marginTop: classic ? 6 : 10, overflow: classic ? undefined : 'hidden' }}>
                <div style={{ ...xpSectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>Dye Weights for this Bath</span>
                    <span style={{ fontWeight: 400, fontSize: classic ? 10 : 11 }}>
                        {doses?.bath_volume_liters != null
                            ? `${fmtDose(doses.bath_volume_liters, 1)} L water`
                            : 'no bath volume yet'}
                        {doses?.liquor_ratio != null ? `  |  1 : ${fmtDose(doses.liquor_ratio, 2)}` : ''}
                        {doses?.substrate_qty != null ? `  |  ${fmtDose(doses.substrate_qty, 2)} kg substrate` : ''}
                    </span>
                </div>
                {rows.length === 0 ? (
                    <div style={{ padding: classic ? '6px 8px' : '8px 12px', color: classic ? '#888' : '#64748b', fontSize: classic ? 11 : 13 }}>
                        {emptyHint}
                    </div>
                ) : (
                    <>
                        {noBath && (
                            <div style={classic
                                ? { background: '#fff3cd', borderBottom: '1px solid #ffc107', padding: '3px 8px', fontSize: 10, color: '#664d03' }
                                : { background: '#fef3cd', borderBottom: '1px solid #f0d98a', padding: '5px 10px', fontSize: 12, color: '#854d0e' }}>
                                Enter the bath volume (Volume Air) to weigh out the g/L chemicals. Per-100kg
                                dyestuff is already costed off the substrate weight.
                            </div>
                        )}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 11 : 13 }}>
                            <thead>
                                <tr style={classic ? { background: '#ece9d8', borderBottom: '1px solid #7f9db9' } : {}}>
                                    <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Chemical</th>
                                    <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>Type</th>
                                    <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Rate</th>
                                    <th style={classic ? { ...xpThCell, whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>Basis</th>
                                    <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Weigh Out</th>
                                    <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>kg</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((l, idx) => (
                                    <tr key={l.line_id} style={classic
                                        ? { borderBottom: '1px solid #e0e0e0', background: lvZebra(true, idx) }
                                        : { borderBottom: '1px solid #e6eaf1', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                        <td style={classic ? { padding: '2px 6px' } : { padding: '6px 10px', color: '#334155', fontFamily: modernFont }}>
                                            {l.item_name ?? l.item_code ?? <Dash />}
                                        </td>
                                        <td style={classic ? { padding: '2px 6px' } : { padding: '6px 10px', color: '#64748b', fontFamily: modernFont }}>
                                            {l.chemical_type ?? <Dash />}
                                        </td>
                                        <td style={classic ? { padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap' } : { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: '#334155', fontFamily: modernFont }}>
                                            {l.basis === 'PER_LITER'
                                                ? `${fmtDose(l.qty_per_liter, 4)} g/L`
                                                : l.basis === 'PER_100KG'
                                                    ? `${fmtDose(l.qty_per_100kg, 4)} /100kg`
                                                    : <Dash />}
                                        </td>
                                        <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap', color: '#666' } : { padding: '6px 10px', whiteSpace: 'nowrap', color: '#64748b', fontFamily: modernFont }}>
                                            {l.basis ? (BASIS_LABEL[l.basis] ?? l.basis) : 'no rate set'}
                                        </td>
                                        <td style={classic
                                            ? { padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 'bold' }
                                            : { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b', fontFamily: modernFont }}>
                                            {l.dose == null ? <Dash /> : `${fmtDose(l.dose, 3)}${l.dose_unit ? ` ${l.dose_unit}` : ''}`}
                                        </td>
                                        <td style={classic ? { padding: '2px 6px', textAlign: 'right', whiteSpace: 'nowrap', color: '#666' } : { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: '#64748b', fontFamily: modernFont }}>
                                            {l.dose_kg == null ? <Dash /> : fmtDose(l.dose_kg, 4)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </div>
        );
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
                                {createForm.recipe_id && renderDoseSheet(
                                    dosePreview,
                                    'This recipe has no chemical lines to weigh out.',
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
                                                        {run.status === 'COMPLETED' && run.shade_result ? (
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
                                                        <div style={{ display: 'flex', gap: classic ? 3 : 6 }}>
                                                            {canManage && run.status === 'PENDING' && (
                                                                <>
                                                                    <button
                                                                        className={XP_BTN}
                                                                        style={xpPrimaryBtn}
                                                                        onClick={() => handleOpenStart(run)}
                                                                    >
                                                                        Start
                                                                    </button>
                                                                    <button
                                                                        className={XP_BTN}
                                                                        style={xpBtn}
                                                                        onClick={() => handleOpenComplete(run)}
                                                                    >
                                                                        Complete
                                                                    </button>
                                                                </>
                                                            )}
                                                            {canManage && run.status === 'IN_PROGRESS' && (
                                                                <button
                                                                    className={XP_BTN}
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

            {/* Start Run Modal — the bath-fill screen.
                The volume is taken here, not at completion: the doses below are what
                the operator actually weighs into the vessel, so they have to exist
                before the run starts. Starting also snapshots them onto the run, which
                is why the Complete screen no longer calculates anything. */}
            {showStartModal && (
                <ModalWrapper
                    isOpen={!!showStartModal}
                    onClose={() => { setShowStartModal(null); setErrorMsg(null); }}
                    title={`Start Dyeing Run ${showStartModal.run_number ?? `#${showStartModal.id}`} — Fill the Bath`}
                    size="lg"
                    modeless
                    footer={<>
                        <button
                            className={XP_BTN}
                            style={classic ? { ...xpBtn, padding: '3px 16px' } : { ...xpPrimaryBtn, padding: '6px 18px' }}
                            onClick={handleStartRun}
                            disabled={starting || !startBath.volume_air_liters}
                        >
                            {starting ? 'Starting...' : 'Start Run'}
                        </button>
                        <button
                            className={XP_BTN}
                            style={classic ? { ...xpBtn, padding: '3px 16px' } : { ...xpBtn, padding: '6px 18px' }}
                            onClick={() => { setShowStartModal(null); setErrorMsg(null); }}
                            disabled={starting}
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
                        <div style={{ ...xpPanel, overflow: classic ? undefined : 'hidden' }}>
                            <div style={xpSectionHeader}>Bath</div>
                            <div style={{ padding: classic ? '5px 8px' : '8px 12px', display: 'flex', alignItems: 'flex-end', gap: classic ? 8 : 12, flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span
                                        style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}
                                        title="Water volume of the bath, in litres. Required to start — every g/L chemical is weighed out against it."
                                    >Volume Air (L) *</span>
                                    <input
                                        type="number" step="0.1" style={{ ...xpInput, width: 110 }}
                                        value={startBath.volume_air_liters}
                                        onChange={e => setStartBath(prev => ({ ...prev, volume_air_liters: e.target.value }))}
                                        placeholder="e.g. 950"
                                        autoFocus
                                    />
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Substrate (kg)</span>
                                    <input
                                        type="number" step="0.01" style={{ ...xpInput, width: 110 }}
                                        value={startBath.substrate_qty}
                                        onChange={e => setStartBath(prev => ({ ...prev, substrate_qty: e.target.value }))}
                                        placeholder="e.g. 100"
                                    />
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Liquor Ratio</span>
                                    <span
                                        style={classic
                                            ? { fontSize: 11, padding: '2px 4px', color: '#333' }
                                            : { fontSize: 13, padding: '4px 2px', color: '#334155', fontFamily: modernFont }}
                                        title="Derived from the bath volume and substrate weight — never typed separately, so the two can't disagree."
                                    >
                                        {startDoses?.liquor_ratio != null ? `1 : ${fmtDose(startDoses.liquor_ratio, 2)}` : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {showStartModal.recipe_id ? renderDoseSheet(
                            startDoses,
                            startDoses ? 'This recipe has no chemical lines to weigh out.' : 'Loading the recipe...',
                        ) : (
                            <div style={{ ...xpPanel, marginTop: classic ? 6 : 10, padding: classic ? '6px 8px' : '8px 12px', color: classic ? '#888' : '#64748b', fontSize: classic ? 11 : 13 }}>
                                This run carries no recipe, so there is nothing to dose. The bath volume is still recorded.
                            </div>
                        )}
                    </div>
                </ModalWrapper>
            )}

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
                            className={XP_BTN}
                            style={classic ? { ...xpBtn, padding: '3px 16px' } : { ...xpPrimaryBtn, padding: '6px 18px' }}
                            onClick={handleSaveComplete}
                            disabled={saving || !completeForm.output_batch_number}
                        >
                            {saving ? 'Saving...' : 'Save'}
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

                            {/* Bath — the correction path, not the primary entry point: the
                                volume is normally taken at Start (bath fill). It stays editable
                                here for a bath topped up mid-cycle, and for back-filling a run
                                completed straight out of PENDING, which never saw a Start. */}
                            <div style={{ ...xpPanel, marginBottom: classic ? 6 : 10, overflow: classic ? undefined : 'hidden' }}>
                                <div style={xpSectionHeader}>Bath (adjust)</div>
                                <div style={{ padding: classic ? '5px 8px' : '8px 12px', display: 'flex', alignItems: 'flex-end', gap: classic ? 8 : 12, flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span
                                            style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}
                                            title="Water volume of the bath, in litres. Every g/L chemical is weighed out against this."
                                        >Volume Air (L)</span>
                                        <input
                                            type="number" step="0.1" style={{ ...xpInput, width: 100 }}
                                            value={bathForm.volume_air_liters}
                                            onChange={e => setBathForm(prev => ({ ...prev, volume_air_liters: e.target.value }))}
                                            placeholder="e.g. 950"
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Substrate (kg)</span>
                                        <input
                                            type="number" step="0.01" style={{ ...xpInput, width: 100 }}
                                            value={bathForm.substrate_qty}
                                            onChange={e => setBathForm(prev => ({ ...prev, substrate_qty: e.target.value }))}
                                            placeholder="e.g. 100"
                                        />
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={classic ? { fontSize: 10, color: '#444' } : { fontSize: 11, color: '#475569', fontWeight: 500, marginBottom: 2 }}>Liquor Ratio</span>
                                        <span
                                            style={classic
                                                ? { fontSize: 11, padding: '2px 4px', color: '#333' }
                                                : { fontSize: 13, padding: '4px 2px', color: '#334155', fontFamily: modernFont }}
                                            title="Derived from the bath volume and substrate weight — never typed separately, so the two can't disagree."
                                        >
                                            {showCompleteModal.liquor_ratio != null ? `1 : ${fmtDose(showCompleteModal.liquor_ratio, 2)}` : '—'}
                                        </span>
                                    </div>
                                    <button
                                        className={XP_BTN}
                                        style={classic ? { ...xpPrimaryBtn } : { ...xpPrimaryBtn }}
                                        onClick={handleSaveBath}
                                        disabled={bathSaving || (!bathForm.volume_air_liters && !bathForm.substrate_qty)}
                                    >
                                        {bathSaving ? 'Saving...' : 'Save Bath & Recalculate'}
                                    </button>
                                </div>
                            </div>

                            {showCompleteModal.recipe_id && renderDoseSheet(
                                completeDoses,
                                completeDoses
                                    ? 'This recipe has no chemical lines to weigh out.'
                                    : 'Loading the recipe...',
                            )}

                            {/* Chemicals section */}
                            <div style={{ ...xpPanel, marginBottom: classic ? 6 : 10, marginTop: classic ? 6 : 10, overflow: classic ? undefined : 'hidden' }}>
                                <div style={{ ...xpSectionHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Chemicals Used</span>
                                    <button className={XP_BTN} style={classic ? { ...xpBtn, fontSize: 10 } : { ...xpPrimaryBtn, fontSize: 12 }} onClick={handleAddChemical}>+ Add Chemical</button>
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
                                                <th
                                                    style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}
                                                    title="Calculated from the recipe against this bath — g/L lines follow the bath volume, per-100kg lines the substrate weight. Save the bath above to refill it."
                                                >Planned Qty</th>
                                                <th style={classic ? { ...xpThCell, textAlign: 'right', whiteSpace: 'nowrap' } : { ...xpThCell, padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>Actual Qty</th>
                                                <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px', textAlign: 'left' }}>UOM</th>
                                                <th style={classic ? { ...xpThCell } : { ...xpThCell, padding: '6px 10px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completeForm.chemicals.map((row, idx) => (
                                                <tr key={idx} style={classic
                                                    ? { borderBottom: '1px solid #e0e0e0', background: lvZebra(true, idx) }
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
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                                            <input
                                                                type="number"
                                                                style={{ ...xpInput, width: 70 }}
                                                                value={row.planned_qty}
                                                                onChange={e => handleChemicalChange(idx, 'planned_qty', e.target.value)}
                                                            />
                                                            <span style={{ fontSize: classic ? 10 : 11, color: classic ? '#666' : '#64748b', minWidth: 10 }}>
                                                                {doseUnitFor(row.item_id) ?? ''}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '5px 6px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                                            <input
                                                                type="number"
                                                                style={{ ...xpInput, width: 70 }}
                                                                value={row.actual_qty}
                                                                onChange={e => handleChemicalChange(idx, 'actual_qty', e.target.value)}
                                                            />
                                                            <span style={{ fontSize: classic ? 10 : 11, color: classic ? '#666' : '#64748b', minWidth: 10 }}>
                                                                {doseUnitFor(row.item_id) ?? ''}
                                                            </span>
                                                        </div>
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
                                                            className={XP_BTN}
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
