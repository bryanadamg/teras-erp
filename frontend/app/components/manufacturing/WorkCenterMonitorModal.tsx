'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import SearchableSelect from '../shared/SearchableSelect';
import VariantChips from '../shared/VariantChips';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../shared/Toast';
import {
    xpFont, familyColor, StatusChip, XPActionButton, XPLoading, XPEmptyState,
    SunkenPanel, SunkenPanelBody, FormSection, FieldLabel, ProgressBar,
    xpSelect, xpPanel, SectionTitle,
} from '../shared/xpTheme';
import { LvTabBar, LvTab, lvInput, lvTh, lvTd, lvRow } from '../shared/listViewTheme';
import { WorkingDaysSection, HolidayCalendarSection, useNationalHolidays } from '../shared/productionCalendar';

// Measurement accents from the shared five-family palette — see DESIGN.md's one
// semantic layer rule; the weaving grid resolves the same three.
const GREEN = familyColor('green');
const RED = familyColor('red');
const BLUE = familyColor('blue');
const AMBER = familyColor('amber');

function fmt(n: any, d = 1): string {
    if (n === null || n === undefined) return '—';
    const v = Number(n);
    if (Number.isNaN(v)) return '—';
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
}
function fmtDate(s: any): string {
    if (!s) return '—';
    return String(s).slice(0, 10);
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    workCenter: any;
    authFetch: (url: string, opts?: any) => Promise<Response>;
    apiBase: string;
}

export default function WorkCenterMonitorModal({ isOpen, onClose, workCenter, authFetch, apiBase }: Props) {
    const { t } = useLanguage();
    const { uiStyle } = useTheme();
    const { hasPermission, hasAnyPermission } = useUser();
    const { locations } = useData();
    const { showToast } = useToast();
    const canManage = hasAnyPermission('weaving_monitor.start', 'calendar.edit', 'beam.unmount');
    const cls = uiStyle === 'classic';

    // Stock lives only in leaf locations — same filter/label the PR modal uses.
    const leafLocations = useMemo(
        () => (locations || []).filter((l: any) => !l.has_children && l.location_type !== 'warehouse'),
        [locations],
    );
    const locLabel = (l: any) => l.full_path || (l.parent_name ? `${l.parent_name} / ${l.name}` : l.name);

    const [tab, setTab] = useState<'performance' | 'calendar' | 'beams'>('performance');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [loom, setLoom] = useState<any>(null);
    const [dismounting, setDismounting] = useState<string | null>(null);
    // Row expanded into its unmount confirm strip, plus the picked return location.
    const [unmountingId, setUnmountingId] = useState<string | null>(null);
    const [returnLoc, setReturnLoc] = useState('');

    const [moId, setMoId] = useState('');
    // MO candidates come from the server scoped to this machine (MOs with a WO
    // dispatched here) — the global manufacturingOrders list is page-1 roots only
    // and misses consolidated component MOs, which is what weaving usually runs.
    const [moCands, setMoCands] = useState<any[]>([]);
    const [moCandsAll, setMoCandsAll] = useState(false);
    const [moCandsLoading, setMoCandsLoading] = useState(false);
    const [lines, setLines] = useState('1');
    const [rate, setRate] = useState('5');
    const [eff, setEff] = useState('50');
    const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

    const [overrideVal, setOverrideVal] = useState('');
    const [editingOverride, setEditingOverride] = useState(false);

    const [targetVal, setTargetVal] = useState('');
    const [editingTarget, setEditingTarget] = useState(false);

    const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
    const [holidays, setHolidays] = useState<any[]>([]);
    const [calRef, setCalRef] = useState<Date>(() => new Date());
    // National holidays for the displayed year — shared hook, same overlay the group
    // calendar renders.
    const national = useNationalHolidays(authFetch, apiBase, calRef.getFullYear(), isOpen);

    const wcId = workCenter?.id;

    const load = useCallback(async () => {
        if (!wcId) return;
        setLoading(true);
        try {
            const [res, bres] = await Promise.all([
                authFetch(`${apiBase}/work-centers/${wcId}/performance`),
                authFetch(`${apiBase}/work-centers/${wcId}/beam-mounts`),
            ]);
            if (res.ok) {
                const d = await res.json();
                setData(d);
                setWeekdays(d?.calendar?.working_weekdays || [0, 1, 2, 3, 4]);
                setHolidays(d?.calendar?.holidays || []);
            }
            setLoom(bres.ok ? await bres.json() : null);
        } finally {
            setLoading(false);
        }
    }, [wcId, apiBase, authFetch]);

    // Take a beam off this loom. The remnant keeps its own lot and remaining kg —
    // nothing to re-lot, unlike the old merge-to-pool model. The remnant does have
    // to be booked back to wherever it physically goes, though: leaving it at the
    // loom's input location means stock claims a beam is up that is really on a rack.
    const dismount = async (mountId: string, toLocationId: string) => {
        setDismounting(mountId);
        try {
            const res = await authFetch(`${apiBase}/beam-mounts/${mountId}/dismount`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_location_id: toLocationId || null }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null);
                showToast(d?.detail || t('unmount_failed'), 'danger');
                return;
            }
            showToast(t('unmount_done'), 'success');
            setUnmountingId(null);
            await load();
        } finally {
            setDismounting(null);
        }
    };

    useEffect(() => {
        if (isOpen && wcId) {
            setTab('performance');
            setUnmountingId(null);
            setEditingOverride(false);
            setCalRef(new Date());
            setMoCands([]);
            setMoCandsAll(false);
            load();
        }
    }, [isOpen, wcId, load]);

    // MOs offered in the start-run picker: scoped to this machine's WOs, widened
    // to every open MO only when the operator asks for it. The form itself is
    // now shown as soon as there's no active run, so fetch as soon as that's true.
    useEffect(() => {
        if (!isOpen || !wcId || !canManage || data?.active_run) return;
        let cancelled = false;
        setMoCandsLoading(true);
        authFetch(`${apiBase}/work-centers/${wcId}/candidate-mos?include_all=${moCandsAll}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!cancelled) setMoCands(d?.items || []); })
            .catch(() => { if (!cancelled) setMoCands([]); })
            .finally(() => { if (!cancelled) setMoCandsLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, wcId, canManage, data?.active_run, moCandsAll, apiBase, authFetch]);

    const startRun = async () => {
        if (!moId) return;
        const res = await authFetch(`${apiBase}/weaving-runs`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                work_center_id: wcId, mo_id: moId,
                lines: parseInt(lines) || 1,
                rate_per_line_g_min: parseFloat(rate) || 0,
                target_efficiency_pct: parseFloat(eff) || 0,
                start_date: startDate,
            }),
        });
        if (res.ok) { setMoId(''); load(); }
    };
    const stopRun = async (runId: string) => {
        const res = await authFetch(`${apiBase}/weaving-runs/${runId}/stop`, { method: 'POST' });
        if (res.ok) load();
    };
    const saveOverride = async (runId: string) => {
        const body: any = { actual_qty_override: overrideVal === '' ? null : parseFloat(overrideVal) };
        const res = await authFetch(`${apiBase}/weaving-runs/${runId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) { setEditingOverride(false); load(); }
    };
    const saveTarget = async (runId: string) => {
        const v = parseFloat(targetVal);
        if (Number.isNaN(v)) return;
        const res = await authFetch(`${apiBase}/weaving-runs/${runId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_efficiency_pct: v }),
        });
        if (res.ok) { setEditingTarget(false); load(); }
    };
    const toggleWeekday = (d: number) => {
        setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
    };
    const saveCalendar = async () => {
        const res = await authFetch(`${apiBase}/work-centers/${wcId}/calendar`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ working_weekdays: weekdays }),
        });
        if (res.ok) load();
    };
    const addHolidayDate = async (ds: string, note: string | null) => {
        const res = await authFetch(`${apiBase}/work-centers/${wcId}/holidays`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holiday_date: ds, note }),
        });
        if (res.ok) load();
    };
    const deleteHoliday = async (hid: string) => {
        const res = await authFetch(`${apiBase}/work-center-holidays/${hid}`, { method: 'DELETE' });
        if (res.ok) load();
    };
    const importNational = async () => {
        const res = await authFetch(`${apiBase}/work-centers/${wcId}/holidays/import-national?year=${calRef.getFullYear()}`, { method: 'POST' });
        if (res.ok) load();
    };

    const moOptions = moCands.map((mo: any) => ({
        value: mo.id,
        label: `${mo.code}${mo.item_code ? ' — ' + mo.item_code : ''}`,
        subLabel: mo.qty ? `${fmt(mo.qty, 2)}` : undefined,
    }));

    const run = data?.active_run;
    const proj = data?.mo_projection;

    // ── Themed primitives ────────────────────────────────────────────────────
    const SecTitle = SectionTitle;

    // One card shell for the hero tiles and the small stats below them — three
    // separately hand-rolled copies of the same sunken-white box before.
    const CardBox = ({ children, pad = '4px 8px' }: { children: React.ReactNode; pad?: string }) => (
        <div
            className={cls ? '' : 'border rounded bg-white h-100'}
            style={cls
                ? { ...xpPanel({ background: '#fff' }), padding: pad }
                : { padding: pad }}
        >
            {children}
        </div>
    );

    const Stat = ({ label, value, unit, accent }: any) => cls ? (
        <CardBox>
            <div style={{ fontFamily: xpFont, fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{label}</div>
            <div style={{ fontFamily: xpFont, fontSize: 14, fontWeight: 'bold', color: accent || '#000', lineHeight: 1.15 }}>
                {value}{unit && <span style={{ fontSize: 9, fontWeight: 'normal', color: '#888', marginLeft: 2 }}>{unit}</span>}
            </div>
        </CardBox>
    ) : (
        <div className="border rounded bg-light px-2 py-1 h-100">
            <div className="text-uppercase text-secondary" style={{ fontSize: 10, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{label}</div>
            <div className="fw-bold" style={{ fontSize: 15, color: accent || undefined, lineHeight: 1.15 }}>
                {value}{unit && <span className="text-muted fw-normal ms-1" style={{ fontSize: 10 }}>{unit}</span>}
            </div>
        </div>
    );

    const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 6 });

    // Text/number/date inputs: the shared list-view input in classic, bootstrap in
    // modern. This form was bootstrap-only, so it rendered as rounded modern fields
    // inside XP chrome — the one form in the monitor that ignored the classic theme.
    const inputProps = {
        className: cls ? undefined : 'form-control form-control-sm',
        style: cls ? lvInput(true) : undefined,
    };

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const tabs: LvTab[] = [
        { key: 'performance', label: t('performance'), icon: 'bi-graph-up-arrow' },
        { key: 'calendar', label: t('work_calendar'), icon: 'bi-calendar3' },
        // Warp is machine state, so it lives on the machine — not on any WO.
        ...(((workCenter?.center_type || '').toUpperCase() === 'WEAVING'
            || (workCenter?.center_type || '').toUpperCase() === 'TENUN')
            ? [{ key: 'beams', label: t('beams_on_loom'), icon: 'bi-arrow-bar-up' } as LvTab]
            : []),
    ];
    const refreshBtn = (
        <XPActionButton classic={cls} tone="neutral" icon="bi-arrow-clockwise" title="Refresh" disabled={loading} onClick={load} />
    );
    const tabBar = (
        <LvTabBar classic={cls} active={tab} onChange={k => setTab(k as any)} tabs={tabs} right={refreshBtn} />
    );
    // Fixed-height body so switching tabs (performance/calendar/beams) never
    // resizes the modal — each pane scrolls internally instead of the panel
    // growing/shrinking to its own content height.
    const TAB_PANEL_HEIGHT = 560;

    // ── Title ────────────────────────────────────────────────────────────────
    const title = (
        <span>
            <i className="bi bi-speedometer2 me-2" />
            {t('performance_monitor')} — {workCenter?.code} {workCenter?.name}
        </span>
    );

    const onTarget = !!run?.on_target;
    const effColor = onTarget ? GREEN : RED;

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={title} size="xl" variant="info" modeless bodyScroll={false}>
            {tabBar}

            <div style={{ height: `min(${TAB_PANEL_HEIGHT}px, calc(100vh - 220px))`, overflowY: 'auto', paddingTop: 12 }}>

            {tab === 'performance' && (
                <div>
                    {/* First load of this machine: the shared spinner, same as every list
                        view — the panel used to sit blank until the fetch resolved. */}
                    {loading && !data && <XPLoading label={t('loading')} />}

                    {/* No run: read-only viewers get the shared empty state; managers go
                        straight to the start-run form — no extra click to get there. */}
                    {!loading && !run && !canManage && (
                        <XPEmptyState icon="bi-stoplights" message={t('no_active_run')} />
                    )}

                    {!loading && !run && canManage && (
                        <FormSection title={<SecTitle icon="bi-play-circle">{t('start_run')}</SecTitle>} classic={cls}>
                            {/* Top-align, not bottom: the MO column carries a helper line
                                under its select, and align-items-end pushed every other
                                input down by that line's height instead of keeping the
                                label/input baselines in a row. */}
                            <div className="row g-2 align-items-start">
                                <div className="col-md-5">
                                    <FieldLabel classic={cls}>{t('manufacturing_order')}</FieldLabel>
                                    <SearchableSelect
                                        options={moOptions}
                                        value={moId}
                                        onChange={setMoId}
                                        placeholder={moCandsLoading ? 'Loading...' : (moOptions.length ? 'Select MO...' : 'No MO on this machine')}
                                    />
                                    <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                                        {moCandsAll
                                            ? 'Showing all open MOs.'
                                            : `On this machine${moCandsLoading ? '' : `: ${moOptions.length}`}`}
                                        {!moCandsAll && (
                                            <button
                                                type="button"
                                                className="btn btn-link p-0 ms-1"
                                                style={{ fontSize: 10, verticalAlign: 'baseline' }}
                                                onClick={() => { setMoId(''); setMoCandsAll(true); }}
                                            >
                                                show all
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="col-md-2 col-4">
                                    <FieldLabel classic={cls}>{t('lines')}</FieldLabel>
                                    <input type="number" min="1" {...inputProps} value={lines} onChange={e => setLines(e.target.value)} />
                                </div>
                                <div className="col-md-2 col-4">
                                    <FieldLabel classic={cls}>{t('rate_per_line')}</FieldLabel>
                                    <input type="number" {...inputProps} value={rate} onChange={e => setRate(e.target.value)} />
                                </div>
                                <div className="col-md-3 col-4">
                                    <FieldLabel classic={cls}>{t('target_efficiency')}</FieldLabel>
                                    <input type="number" {...inputProps} value={eff} onChange={e => setEff(e.target.value)} />
                                </div>
                                <div className="col-md-4 col-6">
                                    <FieldLabel classic={cls}>{t('start_date')}</FieldLabel>
                                    <input type="date" {...inputProps} value={startDate} onChange={e => setStartDate(e.target.value)} />
                                </div>
                                <div className="col-md-8">
                                    {/* Empty label so the button lines up with the date
                                        input beside it, not with that input's label. */}
                                    <FieldLabel classic={cls}>&nbsp;</FieldLabel>
                                    <XPActionButton classic={cls} tone="success" icon="bi-play-fill" label={t('start')} onClick={startRun} disabled={!moId} />
                                </div>
                            </div>
                        </FormSection>
                    )}

                    {run && (
                        <div>
                            {/* Run header strip */}
                            <div style={cls
                                ? { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fbfbf7', border: '1px solid', borderColor: '#808080 #fff #fff #808080', padding: '6px 10px', marginBottom: 10 }
                                : { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                                <StatusChip status={run.status} />
                                <span style={{ fontFamily: cls ? xpFont : undefined, fontWeight: 'bold' }}>{run.mo_code}</span>
                                <span><strong>{run.item_code}</strong> <span className="text-muted small">{run.item_name}</span></span>
                                <VariantChips
                                    combo={run.combo_label}
                                    size={run.size_label}
                                    colorVariant={run.color_label}
                                    colorCode={run.color_code}
                                    colorName={run.color_name}
                                    colorHex={run.color_hex}
                                    labdipCode={run.labdip_variant_code}
                                    scale="sm"
                                />
                                <span className="text-muted small">
                                    {t('target')}: <strong>{fmt(run.target_qty, 2)} kg</strong> · {t('start_date')} {fmtDate(run.start_date)}
                                </span>
                                {canManage && (
                                    <span style={{ marginLeft: 'auto' }}>
                                        <XPActionButton classic={cls} tone="danger" icon="bi-stop-fill" label={t('stop_run')} onClick={() => stopRun(run.id)} />
                                    </span>
                                )}
                            </div>

                            {/* Hero: efficiency + actual + rate */}
                            <div style={{ display: 'grid', gridTemplateColumns: cls ? '1.4fr 1fr 1fr' : 'repeat(auto-fit,minmax(170px,1fr))', gap: 8, marginBottom: 12 }}>
                                {/* Efficiency hero */}
                                <CardBox pad="8px 12px">
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('efficiency')}</div>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 30, fontWeight: 800, color: effColor, lineHeight: 1.1 }}>
                                        {fmt(run.efficiency_pct, 1)}<span style={{ fontSize: 15 }}>%</span>
                                    </div>
                                    {/* Efficiency vs target tick — same shared ProgressBar call as
                                        the loom card on the monitor grid, so the two agree. */}
                                    <div style={{ marginTop: 3 }}>
                                        <ProgressBar
                                            pct={Number(run.efficiency_pct) || 0}
                                            tone={onTarget ? 'green' : 'red'}
                                            markerPct={Number(run.target_efficiency_pct) || 0}
                                            markerTitle={`${t('target')} ${fmt(run.target_efficiency_pct, 0)}%`}
                                            height={9}
                                        />
                                    </div>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#888', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {editingTarget ? (
                                            <div className="d-flex gap-1 align-items-center">
                                                <input type="number" {...inputProps} style={{ ...(inputProps.style || {}), maxWidth: 70, height: 22, fontSize: 10 }} value={targetVal} onChange={e => setTargetVal(e.target.value)} />
                                                <XPActionButton classic={cls} tone="success" icon="bi-check" onClick={() => saveTarget(run.id)} />
                                                <XPActionButton classic={cls} tone="neutral" icon="bi-x" onClick={() => setEditingTarget(false)} />
                                            </div>
                                        ) : (
                                            <>
                                                <span>{t('target')} {fmt(run.target_efficiency_pct, 0)}% · <span style={{ color: effColor, fontWeight: 'bold' }}>{onTarget ? t('on_target') : t('below_target')}</span></span>
                                                {canManage && (
                                                    <XPActionButton classic={cls} tone="neutral" icon="bi-pencil-square" title="Edit target" onClick={() => { setTargetVal(String(run.target_efficiency_pct ?? '')); setEditingTarget(true); }} />
                                                )}
                                            </>
                                        )}
                                    </div>
                                </CardBox>

                                {/* Actual produced (with override) */}
                                <CardBox pad="8px 12px">
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#777', textTransform: 'uppercase' }}>
                                        {t('actual_produced')}
                                        {run.actual_qty_override !== null && (
                                            <span style={{ marginLeft: 4 }}><StatusChip status="PARTIAL" label={t('manual')} tint /></span>
                                        )}
                                    </div>
                                    {editingOverride ? (
                                        <div className="d-flex gap-1 mt-1">
                                            <input type="number" {...inputProps} style={{ ...(inputProps.style || {}), maxWidth: 100 }} value={overrideVal} placeholder={String(run.actual_kg)} onChange={e => setOverrideVal(e.target.value)} />
                                            <XPActionButton classic={cls} tone="success" icon="bi-check" onClick={() => saveOverride(run.id)} />
                                            <XPActionButton classic={cls} tone="neutral" icon="bi-x" onClick={() => setEditingOverride(false)} />
                                        </div>
                                    ) : (
                                        <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>{fmt(run.actual_kg, 2)}<span style={{ fontSize: 11, color: '#888' }}> kg</span></span>
                                            <XPActionButton classic={cls} tone="neutral" icon="bi-pencil-square" title="Override" onClick={() => { setOverrideVal(run.actual_qty_override ?? ''); setEditingOverride(true); }} />
                                        </div>
                                    )}
                                </CardBox>

                                {/* Actual rate */}
                                <CardBox pad="8px 12px">
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#777', textTransform: 'uppercase' }}>{t('actual_rate')}</div>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 22, fontWeight: 700 }}>
                                        {fmt(run.actual_daily_rate_kg, 2)}<span style={{ fontSize: 11, color: '#888' }}> kg/day</span>
                                    </div>
                                </CardBox>
                            </div>

                            {/* Targets */}
                            <FormSection title={<SecTitle icon="bi-sliders">{t('targets') || 'Targets'}</SecTitle>} classic={cls}>
                                <div style={grid(118)}>
                                    <Stat label={t('lines')} value={run.lines} />
                                    <Stat label={t('rate_per_line')} value={fmt(run.rate_per_line_g_min, 2)} unit="g/min" />
                                    <Stat label={t('target_100_day')} value={fmt(run.target_100_per_day_kg, 2)} unit="kg" />
                                    <Stat label={`${t('target')} ${fmt(run.target_efficiency_pct, 0)}%/day`} value={fmt(run.target_eff_per_day_kg, 2)} unit="kg" accent={BLUE} />
                                    <Stat label={t('elapsed_days')} value={run.elapsed_working_days} />
                                    <Stat label={t('theoretical_100')} value={fmt(run.theoretical_100_kg, 2)} unit="kg" />
                                </div>
                            </FormSection>

                            {/* MO projection */}
                            {proj && (
                                <FormSection title={
                                    <SecTitle icon="bi-flag-fill" right={proj.machines && proj.machines.length > 1 ? `${t('machines_on_mo')}: ${proj.machines.map((m: any) => m.work_center_code).join(', ')}` : undefined}>
                                        {t('mo_completion')} — {proj.mo_code}
                                    </SecTitle>
                                } classic={cls}>
                                    <div style={grid(135)}>
                                        <Stat label={t('target_qty')} value={fmt(proj.target_qty, 2)} unit="kg" />
                                        <Stat label={t('total_actual')} value={fmt(proj.total_actual_kg, 2)} unit="kg" />
                                        <Stat label={t('combined_target_rate')} value={fmt(proj.total_target_daily_kg, 2)} unit="kg" />
                                        <Stat label={t('target_working_days')} value={proj.target_working_days ?? '—'} />
                                        <Stat label={t('target_completion')} value={fmtDate(proj.target_completion_date)} accent={GREEN} />
                                        <Stat label={t('projected_completion')} value={fmtDate(proj.reality_completion_date)} accent="#b5530a" />
                                    </div>
                                </FormSection>
                            )}
                        </div>
                    )}

                    {/* History */}
                    {data?.history?.length > 0 && (
                        <FormSection title={<SecTitle icon="bi-clock-history">{t('run_history')}</SecTitle>} classic={cls}>
                            {/* Shared list-view table styling (lvTh/lvTd/lvRow) — same chrome as
                                the beams table below and the group calendar's holiday table. */}
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={cls ? { background: '#d4d0c8' } : undefined}>
                                            <th style={lvTh(cls)}>{t('manufacturing_order')}</th>
                                            <th style={lvTh(cls)}>{t('item')}</th>
                                            <th style={lvTh(cls)}>{t('start')}</th>
                                            <th style={lvTh(cls)}>{t('end')}</th>
                                            <th style={{ ...lvTh(cls), textAlign: 'right' }}>{t('actual')}</th>
                                            <th style={{ ...lvTh(cls), textAlign: 'right' }}>{t('efficiency')}</th>
                                            <th style={{ ...lvTh(cls), borderRight: 'none' }}>{t('status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.history.map((h: any, idx: number) => (
                                            <tr key={h.id} style={lvRow(cls, idx)}>
                                                <td style={{ ...lvTd(cls), fontFamily: 'monospace' }}>{h.mo_code}</td>
                                                <td style={lvTd(cls)}>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span>{h.item_code}</span>
                                                        <VariantChips
                                                            combo={h.combo_label}
                                                            size={h.size_label}
                                                            colorVariant={h.color_label}
                                                            colorCode={h.color_code}
                                                            colorName={h.color_name}
                                                            colorHex={h.color_hex}
                                                            labdipCode={h.labdip_variant_code}
                                                        />
                                                    </div>
                                                </td>
                                                <td style={lvTd(cls)}>{fmtDate(h.start_date)}</td>
                                                <td style={lvTd(cls)}>{fmtDate(h.end_date)}</td>
                                                <td style={{ ...lvTd(cls), textAlign: 'right' }}>{fmt(h.actual_kg, 2)} kg</td>
                                                <td style={{ ...lvTd(cls), textAlign: 'right', color: h.on_target ? GREEN : RED, fontWeight: 600 }}>{fmt(h.efficiency_pct, 1)}%</td>
                                                {/* StatusChip in both themes — the modern branch used a
                                                    bootstrap badge, so a DONE run read gray here and green
                                                    everywhere else. */}
                                                <td style={{ ...lvTd(cls), borderRight: 'none' }}><StatusChip status={h.status} tint /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </FormSection>
                    )}
                </div>
            )}

            {/* Calendar: the shared production-calendar editor. Identical surface to the
                group batch-apply modal — only persistence differs (each click here is a
                server call; the group form batches into one cascade PUT). */}
            {tab === 'calendar' && (
                <div>
                    <WorkingDaysSection
                        classic={cls}
                        weekdays={weekdays}
                        onToggleWeekday={toggleWeekday}
                        canEdit={canManage}
                        onSave={saveCalendar}
                    />
                    <HolidayCalendarSection
                        classic={cls}
                        month={calRef}
                        onMonthChange={setCalRef}
                        weekdays={weekdays}
                        holidays={holidays}
                        national={national}
                        canEdit={canManage}
                        onToggleDay={(ds, existing, nat) => {
                            if (existing?.id) deleteHoliday(existing.id);
                            else addHolidayDate(ds, nat || null);
                        }}
                        headerAction={canManage ? (
                            <XPActionButton classic={cls} tone="neutral" icon="bi-download"
                                label={`${t('import_id_holidays')} ${calRef.getFullYear()}`} onClick={importNational} />
                        ) : undefined}
                    />
                </div>
            )}

            {tab === 'beams' && (() => {
                const mounts: any[] = loom?.mounts || [];
                const slots = loom?.beam_slots ?? 1;
                const pcs = loom?.mounted_pcs ?? 0;
                return (
                    <div style={cls ? { fontFamily: xpFont, fontSize: 11 } : undefined}>
                        <div className={cls ? '' : 'text-muted small mb-2'}
                            style={cls ? { fontSize: 10, color: '#555', marginBottom: 8 } : undefined}>
                            {t('beam_loom_hint')}
                        </div>

                        <div className={cls ? '' : 'mb-2'} style={{
                            display: 'flex', alignItems: 'baseline', gap: 8,
                            marginBottom: cls ? 8 : undefined,
                        }}>
                            <span style={{
                                fontSize: cls ? 18 : 22, fontWeight: 'bold',
                                color: pcs >= slots ? GREEN : pcs > 0 ? AMBER : '#888', lineHeight: 1,
                            }}>{pcs} / {slots}</span>
                            <span style={{ fontSize: 11, color: '#777' }}>
                                {t('beam_positions_filled')} · {fmt(loom?.total_remaining, 1)} kg
                            </span>
                        </div>

                        {mounts.length === 0 ? (
                            <XPEmptyState icon="bi-arrow-bar-up" message={t('no_beams_mounted')} />
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={cls ? { background: '#d4d0c8' } : undefined}>
                                            <th style={lvTh(cls)}>{t('lot')}</th>
                                            <th style={lvTh(cls)}>{t('ends')}</th>
                                            <th style={{ ...lvTh(cls), textAlign: 'right' }}>{t('remaining')}</th>
                                            <th style={lvTh(cls)}>{t('mounted')}</th>
                                            <th style={{ ...lvTh(cls), borderRight: 'none' }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mounts.map((m, idx) => (
                                            <React.Fragment key={m.id}>
                                            <tr style={lvRow(cls, idx)}>
                                                <td style={{ ...lvTd(cls), fontWeight: 'bold', color: BLUE }}>{m.beam_number || '—'}</td>
                                                <td style={lvTd(cls)}>{m.ends ?? '—'}</td>
                                                <td style={{ ...lvTd(cls), textAlign: 'right' }}>{fmt(m.remaining, 1)} kg</td>
                                                <td style={{ ...lvTd(cls), color: '#666' }}>
                                                    {fmtDate(m.mounted_at)}
                                                    {m.mounted_by ? ` · ${m.mounted_by}` : ''}
                                                </td>
                                                <td style={{ ...lvTd(cls), borderRight: 'none', textAlign: 'right' }}>
                                                    {canManage && unmountingId !== m.id && (
                                                        <XPActionButton
                                                            classic={cls}
                                                            tone="warning"
                                                            icon="bi-box-arrow-up"
                                                            label={t('dismount')}
                                                            title={t('dismount_hint')}
                                                            disabled={dismounting === m.id}
                                                            onClick={() => {
                                                                setUnmountingId(m.id);
                                                                // Pre-pick the beam item's home store so the floor
                                                                // usually just confirms instead of hunting for a bin.
                                                                setReturnLoc(m.default_return_location_id || '');
                                                            }}
                                                        />
                                                    )}
                                                </td>
                                            </tr>
                                            {unmountingId === m.id && (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: cls ? '4px 2px' : '4px 0' }}>
                                                        <SunkenPanel classic={cls}>
                                                            <SunkenPanelBody classic={cls}>
                                                                <div style={{
                                                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                                                                    gap: 8, fontSize: cls ? 11 : 12,
                                                                }}>
                                                                    <span>
                                                                        <b style={{ color: BLUE }}>{m.beam_number || '—'}</b>
                                                                        {' · '}
                                                                        <b>{fmt(m.remaining, 1)} kg</b> {t('unmount_remnant_to')}:
                                                                    </span>
                                                                    <select
                                                                        value={returnLoc}
                                                                        onChange={e => setReturnLoc(e.target.value)}
                                                                        className={cls ? undefined : 'form-select form-select-sm w-auto'}
                                                                        style={cls ? xpSelect() : undefined}
                                                                    >
                                                                        <option value="">{t('unmount_leave_at_loom')}</option>
                                                                        {leafLocations.map((l: any) => (
                                                                            <option key={l.id} value={l.id}>{locLabel(l)}</option>
                                                                        ))}
                                                                    </select>
                                                                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                                                        <XPActionButton
                                                                            classic={cls}
                                                                            tone="warning"
                                                                            icon="bi-box-arrow-up"
                                                                            label={dismounting === m.id ? '...' : t('unmount_confirm')}
                                                                            disabled={dismounting === m.id}
                                                                            onClick={() => dismount(m.id, returnLoc)}
                                                                        />
                                                                        <XPActionButton
                                                                            classic={cls}
                                                                            tone="neutral"
                                                                            label={t('cancel')}
                                                                            disabled={dismounting === m.id}
                                                                            onClick={() => setUnmountingId(null)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </SunkenPanelBody>
                                                        </SunkenPanel>
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })()}

            </div>
        </ModalWrapper>
    );
}
