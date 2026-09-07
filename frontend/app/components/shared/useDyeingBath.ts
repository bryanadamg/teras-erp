'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DosePreview } from './DoseSheet';

/** The dye bath, from inside the work order flow.
 *
 *  A dyeing WO's bath used to be recorded on a second screen (the Dyeing Orders
 *  tab's Start/Complete modals) while the output was logged here, so the operator
 *  had to do both, in order, in two places, and nothing linked them. This hook is
 *  the bath half of the WO flow: it finds the WO's open `DyeingRun`, holds the
 *  volume/substrate the operator types, weighs the recipe against it server-side,
 *  and writes both the bath and the chemical actuals when the log is submitted.
 *
 *  Consumed by the desktop WO completion modal and the mobile scan terminal. They
 *  render different chrome (XP panel vs mobile panel) over identical behaviour —
 *  the same operator on the same bath must not meet two different rules.
 *
 *  Nothing is computed here. Doses come from `GET /dye-recipes/{id}/doses`
 *  (backend services/dyeing_dose_service.py is the only formula), and the bath's
 *  volume/ratio pair is solved server-side so the two can never disagree.
 */

export interface BathForm {
    volume_air_liters: string;
    substrate_qty: string;
}

export interface ChemicalRow {
    item_id: string;
    item_name: string;
    /** Snapshotted when the bath was filled, or the live dose for a run that has
     *  no sheet yet. Display-only: the operator records the actual, not the plan. */
    planned_qty: string;
    actual_qty: string;
    uom_id: string;
    /** Unit the planned/actual numbers are in — grams for a g/L line, the line's
     *  own UOM for an owf one. Never render one of these numbers without it. */
    dose_unit: string | null;
}

const EMPTY_BATH: BathForm = { volume_air_liters: '', substrate_qty: '' };

const numOrNull = (s: string) => {
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
};

/** Same tolerance the backend's bath solver works to — a re-typed identical value
 *  must not count as a change and write an audit row. */
const same = (a: number | null, b: number | null) =>
    (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-6);

interface Options {
    /** The dyeing WO being logged. Nothing is fetched when this is falsy. */
    workOrderId?: string | null;
    /** False for every non-dyeing WO — keeps the manufacturing flow from calling
     *  dyeing endpoints for a loom. */
    enabled: boolean;
    authFetch: (url: string, options?: any) => Promise<Response>;
    apiBase: string;
}

export function useDyeingBath({ workOrderId, enabled, authFetch, apiBase }: Options) {
    const [run, setRun] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [bath, setBath] = useState<BathForm>(EMPTY_BATH);
    const [doses, setDoses] = useState<DosePreview | null>(null);
    const [chemicals, setChemicals] = useState<ChemicalRow[]>([]);
    // Generation counter: the dose sheet refires on every keystroke of the volume,
    // so without it a slow earlier response lands after a newer one and shows
    // weights for a bath the operator has already changed.
    const doseGen = useRef(0);

    const load = useCallback(async () => {
        if (!enabled || !workOrderId) { setRun(null); return; }
        setLoading(true);
        try {
            const res = await authFetch(`${apiBase}/dyeing-runs?work_order_id=${workOrderId}`);
            if (!res.ok) return;
            const data = await res.json();
            const list: any[] = Array.isArray(data) ? data : (data.items ?? []);
            // The bath this log belongs to: the first one nobody has closed. A
            // multi-bath WO closes them in order, so this walks forward with the
            // floor. Falls back to the last row so a fully closed WO still shows
            // what went in rather than an empty panel.
            const open = list.find(r => !r.completed_at) ?? list[list.length - 1] ?? null;
            setRun(open);
        } catch {
            /* the panel degrades to "no bath record" rather than blocking the log */
        } finally {
            setLoading(false);
        }
    }, [enabled, workOrderId, authFetch, apiBase]);

    useEffect(() => { load(); }, [load]);

    // Seed the form from the run. Substrate falls back to the WO's own qty only
    // through the caller — a multi-bath WO splits the load across runs, so the
    // run's own number is the one that must win here.
    useEffect(() => {
        if (!run) { setBath(EMPTY_BATH); setChemicals([]); return; }
        // The planned bath stands in until the floor records a real one: the WO was
        // cut with it and the Kartu Kerja printed grams from it, so the operator is
        // confirming a number they already hold rather than inventing one. It stays
        // an editable proposal — `bathDirty` compares against the ACTUAL column, so
        // a prefilled plan is dirty on purpose and gets written on submit.
        const seedVolume = run.volume_air_liters ?? run.planned_volume_air_liters;
        setBath({
            volume_air_liters: seedVolume != null ? String(seedVolume) : '',
            substrate_qty: run.substrate_qty != null ? String(run.substrate_qty) : '',
        });
        setChemicals((run.chemicals ?? []).map((c: any) => ({
            item_id: String(c.item_id ?? ''),
            item_name: c.item_name ?? '',
            planned_qty: c.planned_qty != null ? String(c.planned_qty) : '',
            actual_qty: c.actual_qty ? String(c.actual_qty) : '',
            uom_id: String(c.uom_id ?? ''),
            dose_unit: null,
        })));
    }, [run?.id, run?.volume_air_liters, run?.planned_volume_air_liters, run?.substrate_qty, JSON.stringify(run?.chemicals ?? [])]);

    // Weigh the recipe against the typed bath, debounced 350ms — the same pause the
    // item search uses. Never per keystroke.
    useEffect(() => {
        if (!enabled || !run?.recipe_id) { setDoses(null); return; }
        const gen = ++doseGen.current;
        const timer = setTimeout(async () => {
            const qs = new URLSearchParams();
            if (bath.substrate_qty) qs.set('substrate_qty', bath.substrate_qty);
            if (bath.volume_air_liters) qs.set('bath_volume_liters', bath.volume_air_liters);
            try {
                const res = await authFetch(`${apiBase}/dye-recipes/${run.recipe_id}/doses?${qs.toString()}`);
                const data = res.ok ? await res.json() : null;
                if (gen === doseGen.current) setDoses(data);
            } catch {
                if (gen === doseGen.current) setDoses(null);
            }
        }, 350);
        return () => clearTimeout(timer);
    }, [enabled, run?.recipe_id, bath.substrate_qty, bath.volume_air_liters, authFetch, apiBase]);

    // A run with no snapshotted sheet yet (never started) still needs rows to type
    // actuals into — take them from the live dose calc, labelled with its units.
    // A run that HAS a sheet keeps it: those are the weights the operator was told.
    const rows: ChemicalRow[] = useMemo(() => {
        const byItem = new Map(chemicals.map(c => [c.item_id, c]));
        const fromDoses: ChemicalRow[] = (doses?.lines ?? []).map(l => {
            const existing = byItem.get(String(l.item_id));
            return {
                item_id: String(l.item_id ?? ''),
                item_name: existing?.item_name || l.item_name || l.item_code || '',
                planned_qty: existing?.planned_qty
                    || (l.dose != null ? String(parseFloat(l.dose.toFixed(4))) : ''),
                actual_qty: existing?.actual_qty ?? '',
                uom_id: existing?.uom_id || String(l.uom_id ?? ''),
                dose_unit: l.dose_unit ?? null,
            };
        });
        const seeded = new Set(fromDoses.map(r => r.item_id));
        // Off-recipe rows the operator (or a past run) added stay on the sheet.
        return [...fromDoses, ...chemicals.filter(c => !seeded.has(c.item_id))];
    }, [chemicals, doses]);

    const setActual = useCallback((itemId: string, value: string) => {
        setChemicals(prev => {
            const hit = prev.find(c => c.item_id === itemId);
            if (hit) return prev.map(c => c.item_id === itemId ? { ...c, actual_qty: value } : c);
            const seed = rows.find(r => r.item_id === itemId);
            return [...prev, { ...(seed as ChemicalRow), actual_qty: value }];
        });
    }, [rows]);

    const bathDirty = !!run && (
        !same(numOrNull(bath.volume_air_liters), run.volume_air_liters != null ? Number(run.volume_air_liters) : null)
        || !same(numOrNull(bath.substrate_qty), run.substrate_qty != null ? Number(run.substrate_qty) : null)
    );
    const actualsEntered = rows.filter(r => r.item_id && numOrNull(r.actual_qty) != null);

    /** Write the bath and the chemical actuals. Called BEFORE the completion POST:
     *  a rejected bath must stop the log, not land after stock has already moved.
     *  Returns an error message, or null when there was nothing to do / it worked. */
    const flush = useCallback(async (): Promise<string | null> => {
        if (!enabled || !run) return null;
        try {
            if (bathDirty) {
                // Never started = starting it IS filling the bath, which is also what
                // snapshots the dose sheet onto the run. An already-filled bath is a
                // correction instead (a bath topped up mid-cycle re-weighs every g/L
                // chemical, so the backend owns that arithmetic either way).
                const isFirstFill = !run.started_at && run.volume_air_liters == null;
                const body = JSON.stringify({
                    volume_air_liters: numOrNull(bath.volume_air_liters),
                    substrate_qty: numOrNull(bath.substrate_qty),
                });
                const res = await authFetch(
                    `${apiBase}/dyeing-runs/${run.id}/${isFirstFill ? 'start' : 'bath'}`,
                    { method: isFirstFill ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    return err.detail || 'Failed to record the bath.';
                }
            }
            if (actualsEntered.length) {
                const res = await authFetch(`${apiBase}/dyeing-runs/${run.id}/chemicals`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chemicals: actualsEntered.map(r => ({
                            item_id: r.item_id,
                            actual_qty: numOrNull(r.actual_qty),
                            // Only sent for a row with no snapshot of its own — the
                            // plan the operator was told to weigh is not rewritten
                            // by recording what they actually weighed.
                            planned_qty: (run.chemicals ?? []).some((c: any) => String(c.item_id) === r.item_id)
                                ? null : numOrNull(r.planned_qty),
                            uom_id: r.uom_id || null,
                        })),
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    return err.detail || 'Failed to record the chemicals used.';
                }
            }
            return null;
        } catch {
            return 'Network error recording the bath.';
        }
    }, [enabled, run, bathDirty, bath, actualsEntered, authFetch, apiBase]);

    return {
        /** The WO's open bath record, or null when it has none (non-dyeing WO, or a
         *  WO cut before the auto-create). The panel is hidden in that case. */
        run,
        loading,
        bath,
        setBath,
        doses,
        /** Dose rows merged with what is recorded — render these, not `doses.lines`. */
        rows,
        setActual,
        bathDirty,
        /** The planner's bath, when the floor hasn't recorded its own yet — for the
         *  "planned 900 L" hint beside the input. Null once an actual exists. */
        plannedVolume: (run && run.volume_air_liters == null && run.planned_volume_air_liters != null)
            ? Number(run.planned_volume_air_liters) : null,
        hasActuals: actualsEntered.length > 0,
        flush,
        refresh: load,
    };
}
