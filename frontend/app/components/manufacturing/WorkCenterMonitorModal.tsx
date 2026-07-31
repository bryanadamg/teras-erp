'use client';

import { useState, useEffect, useCallback } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import SearchableSelect from '../shared/SearchableSelect';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { xpFont, xpBtn, StatusChip } from '../shared/xpTheme';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // 0=Mon..6=Sun
const GREEN = '#2d7a2d';
const RED = '#c00000';
const BLUE = '#1a3d90';

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
    const { hasPermission } = useUser();
    const canManage = hasPermission('work_order.manage');
    const cls = uiStyle === 'classic';

    const [tab, setTab] = useState<'performance' | 'calendar' | 'beams'>('performance');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [loom, setLoom] = useState<any>(null);
    const [dismounting, setDismounting] = useState<string | null>(null);

    const [showStart, setShowStart] = useState(false);
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
    const [idHols, setIdHols] = useState<{ date: string; name: string }[]>([]);

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
    // nothing to re-lot, unlike the old merge-to-pool model.
    const dismount = async (mountId: string) => {
        setDismounting(mountId);
        try {
            await authFetch(`${apiBase}/beam-mounts/${mountId}/dismount`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_location_id: null }),
            });
            await load();
        } finally {
            setDismounting(null);
        }
    };

    useEffect(() => {
        if (isOpen && wcId) {
            setTab('performance');
            setShowStart(false);
            setEditingOverride(false);
            setCalRef(new Date());
            setMoCands([]);
            setMoCandsAll(false);
            load();
        }
    }, [isOpen, wcId, load]);

    // MOs offered in the start-run picker: scoped to this machine's WOs, widened
    // to every open MO only when the operator asks for it.
    useEffect(() => {
        if (!isOpen || !wcId || !showStart) return;
        let cancelled = false;
        setMoCandsLoading(true);
        authFetch(`${apiBase}/work-centers/${wcId}/candidate-mos?include_all=${moCandsAll}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (!cancelled) setMoCands(d?.items || []); })
            .catch(() => { if (!cancelled) setMoCands([]); })
            .finally(() => { if (!cancelled) setMoCandsLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, wcId, showStart, moCandsAll, apiBase, authFetch]);

    // Indonesian national holidays for the displayed year (reference/highlight)
    useEffect(() => {
        if (!isOpen) return;
        const year = calRef.getFullYear();
        authFetch(`${apiBase}/weaving/id-holidays?year=${year}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setIdHols(d.holidays || []); })
            .catch(() => { });
    }, [isOpen, calRef, apiBase, authFetch]);

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
        if (res.ok) { setShowStart(false); setMoId(''); load(); }
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
    const GroupHead = ({ icon, children, right }: any) => cls ? (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 5, fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
            color: BLUE, borderBottom: '1px solid #b0a898', paddingBottom: 3, marginBottom: 7,
        }}>
            <i className={`bi ${icon}`} style={{ fontSize: 11 }} />{children}
            {right && <span style={{ marginLeft: 'auto', fontWeight: 'normal' }}>{right}</span>}
        </div>
    ) : (
        <div className="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom">
            <i className={`bi ${icon} text-info`} />
            <span className="text-uppercase fw-bold text-secondary" style={{ fontSize: 11, letterSpacing: 0.6 }}>{children}</span>
            {right && <span className="ms-auto small">{right}</span>}
        </div>
    );

    const Stat = ({ label, value, unit, accent }: any) => cls ? (
        <div style={{ background: '#fff', border: '1px solid', borderColor: '#808080 #ffffff #ffffff #808080', padding: '4px 8px' }}>
            <div style={{ fontFamily: xpFont, fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{label}</div>
            <div style={{ fontFamily: xpFont, fontSize: 14, fontWeight: 'bold', color: accent || '#000', lineHeight: 1.15 }}>
                {value}{unit && <span style={{ fontSize: 9, fontWeight: 'normal', color: '#888', marginLeft: 2 }}>{unit}</span>}
            </div>
        </div>
    ) : (
        <div className="border rounded bg-light px-2 py-1 h-100">
            <div className="text-uppercase text-secondary" style={{ fontSize: 10, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{label}</div>
            <div className="fw-bold" style={{ fontSize: 15, color: accent || undefined, lineHeight: 1.15 }}>
                {value}{unit && <span className="text-muted fw-normal ms-1" style={{ fontSize: 10 }}>{unit}</span>}
            </div>
        </div>
    );

    const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 6 });

    // ── Tab bar ──────────────────────────────────────────────────────────────
    const tabs: [string, string, string][] = [
        ['performance', t('performance'), 'bi-graph-up-arrow'],
        ['calendar', t('work_calendar'), 'bi-calendar3'],
        // Warp is machine state, so it lives on the machine — not on any WO.
        ...(((workCenter?.center_type || '').toUpperCase() === 'WEAVING'
            || (workCenter?.center_type || '').toUpperCase() === 'TENUN')
            ? [['beams', t('beams_on_loom'), 'bi-arrow-bar-up'] as [string, string, string]]
            : []),
    ];
    const tabBar = cls ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: '2px solid #808080', gap: 2, marginBottom: 12 }}>
            {tabs.map(([k, label, icon]) => {
                const active = tab === k;
                return (
                    <button key={k} onClick={() => setTab(k as any)} style={{
                        fontFamily: xpFont, fontSize: 11, fontWeight: active ? 'bold' : 'normal',
                        padding: '4px 14px', cursor: 'pointer', border: '1px solid',
                        borderColor: active ? '#ffffff #808080 #ece9d8 #ffffff' : '#dfdfdf #808080 #808080 #dfdfdf',
                        background: active ? '#ece9d8' : 'linear-gradient(to bottom,#f0f0e8,#d8d4c8)',
                        color: active ? BLUE : '#444', position: 'relative', top: active ? 2 : 0,
                    }}><i className={`bi ${icon}`} style={{ marginRight: 5 }} />{label}</button>
                );
            })}
            <button title="Refresh" onClick={load} disabled={loading} style={{ ...xpBtn(), marginLeft: 'auto', marginBottom: 2 }}>
                <i className="bi bi-arrow-clockwise" />
            </button>
        </div>
    ) : (
        <div className="d-flex align-items-center mb-3 gap-2">
            <div className="btn-group btn-group-sm" role="group">
                {tabs.map(([k, label, icon]) => (
                    <button key={k} className={`btn ${tab === k ? 'btn-info text-white' : 'btn-outline-secondary'}`} onClick={() => setTab(k as any)}>
                        <i className={`bi ${icon} me-1`} />{label}
                    </button>
                ))}
            </div>
            <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={load} disabled={loading} title="Refresh">
                <i className="bi bi-arrow-clockwise" />
            </button>
        </div>
    );

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
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={title} size="xl" variant="info" modeless>
            {tabBar}

            {tab === 'performance' && (
                <div>
                    {/* No run / start */}
                    {!run && !showStart && (
                        <div style={{ textAlign: 'center', padding: '28px 0' }}>
                            <i className="bi bi-stoplights" style={{ fontSize: 26, color: '#a0a0a0', display: 'block', marginBottom: 6 }} />
                            <div className={cls ? '' : 'text-muted'} style={cls ? { fontFamily: xpFont, fontSize: 12, color: '#666', marginBottom: 10 } : { marginBottom: 10 }}>
                                {t('no_active_run')}
                            </div>
                            {canManage && (
                                <button className="btn btn-success btn-sm" onClick={() => setShowStart(true)}>
                                    <i className="bi bi-play-fill me-1" />{t('start_run')}
                                </button>
                            )}
                        </div>
                    )}

                    {showStart && (
                        <div className={cls ? '' : 'p-3 mb-3 bg-light border rounded'} style={cls ? { border: '1px solid', borderColor: '#808080 #fff #fff #808080', background: '#fbfbf7', padding: 10, marginBottom: 12 } : undefined}>
                            <GroupHead icon="bi-play-circle">{t('start_run')}</GroupHead>
                            <div className="row g-2 align-items-end">
                                <div className="col-md-5">
                                    <label className="form-label small mb-0">{t('manufacturing_order')}</label>
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
                                    <label className="form-label small mb-0">{t('lines')}</label>
                                    <input type="number" min="1" className="form-control form-control-sm" value={lines} onChange={e => setLines(e.target.value)} />
                                </div>
                                <div className="col-md-2 col-4">
                                    <label className="form-label small mb-0">{t('rate_per_line')}</label>
                                    <input type="number" className="form-control form-control-sm" value={rate} onChange={e => setRate(e.target.value)} />
                                </div>
                                <div className="col-md-3 col-4">
                                    <label className="form-label small mb-0">{t('target_efficiency')}</label>
                                    <input type="number" className="form-control form-control-sm" value={eff} onChange={e => setEff(e.target.value)} />
                                </div>
                                <div className="col-md-4 col-6">
                                    <label className="form-label small mb-0">{t('start_date')}</label>
                                    <input type="date" className="form-control form-control-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                </div>
                                <div className="col-md-8 d-flex gap-2 align-items-end">
                                    <button className="btn btn-sm btn-success" onClick={startRun} disabled={!moId}>
                                        <i className="bi bi-play-fill me-1" />{t('start')}
                                    </button>
                                    <button className="btn btn-sm btn-secondary" onClick={() => setShowStart(false)}>{t('cancel')}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {run && (
                        <div>
                            {/* Run header strip */}
                            <div style={cls
                                ? { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fbfbf7', border: '1px solid', borderColor: '#808080 #fff #fff #808080', padding: '6px 10px', marginBottom: 10 }
                                : { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                                {cls
                                    ? <StatusChip status={run.status} />
                                    : <span className="badge bg-info-subtle text-info-emphasis">{run.status}</span>}
                                <span style={{ fontFamily: cls ? xpFont : undefined, fontWeight: 'bold' }}>{run.mo_code}</span>
                                <span><strong>{run.item_code}</strong> <span className="text-muted small">{run.item_name}</span></span>
                                <span className="text-muted small">
                                    {t('target')}: <strong>{fmt(run.target_qty, 2)} kg</strong> · {t('start_date')} {fmtDate(run.start_date)}
                                </span>
                                {canManage && (
                                    <button
                                        className={cls ? '' : 'btn btn-sm btn-outline-danger ms-auto'}
                                        style={cls ? xpBtn({ marginLeft: 'auto', color: RED, fontWeight: 'bold' }) : undefined}
                                        onClick={() => stopRun(run.id)}>
                                        <i className="bi bi-stop-fill me-1" />{t('stop_run')}
                                    </button>
                                )}
                            </div>

                            {/* Hero: efficiency + actual + rate */}
                            <div style={{ display: 'grid', gridTemplateColumns: cls ? '1.4fr 1fr 1fr' : 'repeat(auto-fit,minmax(170px,1fr))', gap: 8, marginBottom: 12 }}>
                                {/* Efficiency hero */}
                                <div style={{
                                    border: cls ? '1px solid' : undefined,
                                    borderColor: cls ? '#808080 #fff #fff #808080' : undefined,
                                    background: '#fff', padding: '8px 12px', borderRadius: cls ? 0 : 6,
                                    boxShadow: cls ? undefined : '0 0 0 1px #eee',
                                }} className={cls ? '' : 'border'}>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('efficiency')}</div>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 30, fontWeight: 800, color: effColor, lineHeight: 1.1 }}>
                                        {fmt(run.efficiency_pct, 1)}<span style={{ fontSize: 15 }}>%</span>
                                    </div>
                                    {/* efficiency bar with target tick */}
                                    <div style={{ position: 'relative', height: 9, background: '#fff', border: '1px solid', borderColor: cls ? '#808080 #fff #fff #808080' : '#ccc', marginTop: 3 }}>
                                        <div style={{ width: `${Math.max(0, Math.min(Number(run.efficiency_pct) || 0, 100))}%`, height: '100%', background: effColor }} />
                                        <div title={`${t('target')} ${fmt(run.target_efficiency_pct, 0)}%`} style={{ position: 'absolute', left: `${Math.min(Number(run.target_efficiency_pct) || 0, 100)}%`, top: -2, bottom: -2, width: 2, background: '#000' }} />
                                    </div>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#888', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {editingTarget ? (
                                            <div className="d-flex gap-1 align-items-center">
                                                <input type="number" className="form-control form-control-sm" style={{ maxWidth: 70, height: 22, fontSize: 10 }} value={targetVal} onChange={e => setTargetVal(e.target.value)} />
                                                <button className="btn btn-sm text-success p-0" onClick={() => saveTarget(run.id)}><i className="bi bi-check" /></button>
                                                <button className="btn btn-sm text-secondary p-0" onClick={() => setEditingTarget(false)}><i className="bi bi-x" /></button>
                                            </div>
                                        ) : (
                                            <>
                                                <span>{t('target')} {fmt(run.target_efficiency_pct, 0)}% · <span style={{ color: effColor, fontWeight: 'bold' }}>{onTarget ? t('on_target') : t('below_target')}</span></span>
                                                {canManage && (
                                                    <button className="btn btn-sm text-secondary p-0" title="Edit target" onClick={() => { setTargetVal(String(run.target_efficiency_pct ?? '')); setEditingTarget(true); }}>
                                                        <i className="bi bi-pencil-square" style={{ fontSize: 10 }} />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Actual produced (with override) */}
                                <div className={cls ? '' : 'border rounded'} style={{ border: cls ? '1px solid' : undefined, borderColor: cls ? '#808080 #fff #fff #808080' : undefined, background: '#fff', padding: '8px 12px' }}>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#777', textTransform: 'uppercase' }}>
                                        {t('actual_produced')}
                                        {run.actual_qty_override !== null && <span className="badge bg-warning-subtle text-warning-emphasis ms-1" style={{ fontSize: 8 }}>{t('manual')}</span>}
                                    </div>
                                    {editingOverride ? (
                                        <div className="d-flex gap-1 mt-1">
                                            <input type="number" className="form-control form-control-sm" style={{ maxWidth: 100 }} value={overrideVal} placeholder={String(run.actual_kg)} onChange={e => setOverrideVal(e.target.value)} />
                                            <button className="btn btn-sm btn-success" onClick={() => saveOverride(run.id)}><i className="bi bi-check" /></button>
                                            <button className="btn btn-sm btn-secondary" onClick={() => setEditingOverride(false)}><i className="bi bi-x" /></button>
                                        </div>
                                    ) : (
                                        <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 22, fontWeight: 700 }}>
                                            {fmt(run.actual_kg, 2)}<span style={{ fontSize: 11, color: '#888' }}> kg</span>
                                            <button className="btn btn-sm text-secondary p-0 ms-2" title="Override" onClick={() => { setOverrideVal(run.actual_qty_override ?? ''); setEditingOverride(true); }}>
                                                <i className="bi bi-pencil-square" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Actual rate */}
                                <div className={cls ? '' : 'border rounded'} style={{ border: cls ? '1px solid' : undefined, borderColor: cls ? '#808080 #fff #fff #808080' : undefined, background: '#fff', padding: '8px 12px' }}>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 10, color: '#777', textTransform: 'uppercase' }}>{t('actual_rate')}</div>
                                    <div style={{ fontFamily: cls ? xpFont : undefined, fontSize: 22, fontWeight: 700 }}>
                                        {fmt(run.actual_daily_rate_kg, 2)}<span style={{ fontSize: 11, color: '#888' }}> kg/day</span>
                                    </div>
                                </div>
                            </div>

                            {/* Targets */}
                            <GroupHead icon="bi-sliders">{t('targets') || 'Targets'}</GroupHead>
                            <div style={{ ...grid(118), marginBottom: 12 }}>
                                <Stat label={t('lines')} value={run.lines} />
                                <Stat label={t('rate_per_line')} value={fmt(run.rate_per_line_g_min, 2)} unit="g/min" />
                                <Stat label={t('target_100_day')} value={fmt(run.target_100_per_day_kg, 2)} unit="kg" />
                                <Stat label={`${t('target')} ${fmt(run.target_efficiency_pct, 0)}%/day`} value={fmt(run.target_eff_per_day_kg, 2)} unit="kg" accent={BLUE} />
                                <Stat label={t('elapsed_days')} value={run.elapsed_working_days} />
                                <Stat label={t('theoretical_100')} value={fmt(run.theoretical_100_kg, 2)} unit="kg" />
                            </div>

                            {/* MO projection */}
                            {proj && (
                                <>
                                    <GroupHead icon="bi-flag-fill" right={proj.machines && proj.machines.length > 1 ? `${t('machines_on_mo')}: ${proj.machines.map((m: any) => m.work_center_code).join(', ')}` : undefined}>
                                        {t('mo_completion')} — {proj.mo_code}
                                    </GroupHead>
                                    <div style={{ ...grid(135), marginBottom: 12 }}>
                                        <Stat label={t('target_qty')} value={fmt(proj.target_qty, 2)} unit="kg" />
                                        <Stat label={t('total_actual')} value={fmt(proj.total_actual_kg, 2)} unit="kg" />
                                        <Stat label={t('combined_target_rate')} value={fmt(proj.total_target_daily_kg, 2)} unit="kg" />
                                        <Stat label={t('target_working_days')} value={proj.target_working_days ?? '—'} />
                                        <Stat label={t('target_completion')} value={fmtDate(proj.target_completion_date)} accent={GREEN} />
                                        <Stat label={t('projected_completion')} value={fmtDate(proj.reality_completion_date)} accent="#b5530a" />
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* History */}
                    {data?.history?.length > 0 && (
                        <>
                            <GroupHead icon="bi-clock-history">{t('run_history')}</GroupHead>
                            <div className="table-responsive">
                                <table className="table table-sm table-hover align-middle small mb-0">
                                    <thead className={cls ? '' : 'table-light'}>
                                        <tr>
                                            <th>{t('manufacturing_order')}</th>
                                            <th>{t('item')}</th>
                                            <th>{t('start')}</th>
                                            <th>{t('end')}</th>
                                            <th className="text-end">{t('actual')}</th>
                                            <th className="text-end">{t('efficiency')}</th>
                                            <th>{t('status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.history.map((h: any) => (
                                            <tr key={h.id}>
                                                <td className="font-monospace">{h.mo_code}</td>
                                                <td>{h.item_code}</td>
                                                <td>{fmtDate(h.start_date)}</td>
                                                <td>{fmtDate(h.end_date)}</td>
                                                <td className="text-end">{fmt(h.actual_kg, 2)} kg</td>
                                                <td className="text-end" style={{ color: h.on_target ? GREEN : RED, fontWeight: 600 }}>{fmt(h.efficiency_pct, 1)}%</td>
                                                <td>{cls ? <StatusChip status={h.status} /> : <span className="badge bg-secondary-subtle text-secondary-emphasis">{h.status}</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === 'calendar' && (
                <div>
                    <GroupHead icon="bi-calendar-week">{t('working_days')}</GroupHead>
                    <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                        {WEEKDAY_LABELS.map((lbl, idx) => {
                            const on = weekdays.includes(idx);
                            return cls ? (
                                <button key={idx} disabled={!canManage} onClick={() => toggleWeekday(idx)} style={{
                                    fontFamily: xpFont, fontSize: 11, fontWeight: on ? 'bold' : 'normal', minWidth: 48, cursor: canManage ? 'pointer' : 'default',
                                    padding: '3px 8px', border: '1px solid',
                                    borderColor: on ? '#003080 #6ea8ff #6ea8ff #003080' : '#dfdfdf #808080 #808080 #dfdfdf',
                                    background: on ? 'linear-gradient(to bottom,#3a8dff,#0058e6)' : 'linear-gradient(to bottom,#ffffff,#d4d0c8)',
                                    color: on ? '#fff' : '#444',
                                }}>{lbl}</button>
                            ) : (
                                <button key={idx} disabled={!canManage} className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ minWidth: 52 }} onClick={() => toggleWeekday(idx)}>{lbl}</button>
                            );
                        })}
                        {canManage && (
                            <button className="btn btn-sm btn-success ms-2" onClick={saveCalendar}>
                                <i className="bi bi-check-lg me-1" />{t('save')}
                            </button>
                        )}
                    </div>
                    <p className={cls ? '' : 'text-muted small'} style={cls ? { fontFamily: xpFont, fontSize: 10, color: '#777' } : undefined}>{t('working_days_hint')}</p>

                    <div className="mt-3" />
                    <GroupHead icon="bi-calendar3" right={
                        canManage ? (cls
                            ? <button onClick={importNational} style={{ ...xpBtn() }}><i className="bi bi-download me-1" />{t('import_id_holidays')} {calRef.getFullYear()}</button>
                            : <button className="btn btn-sm btn-outline-primary py-0" onClick={importNational}><i className="bi bi-download me-1" />{t('import_id_holidays')} {calRef.getFullYear()}</button>
                        ) : null
                    }>{t('holidays')}</GroupHead>

                    {/* Month nav */}
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <button className={cls ? '' : 'btn btn-sm btn-outline-secondary'} style={cls ? xpBtn({ padding: '2px 10px' }) : undefined} onClick={() => setCalRef(new Date(calRef.getFullYear(), calRef.getMonth() - 1, 1))}><i className="bi bi-chevron-left" /></button>
                        <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 'bold', fontFamily: cls ? xpFont : undefined }}>
                            {calRef.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </span>
                        <button className={cls ? '' : 'btn btn-sm btn-outline-secondary'} style={cls ? xpBtn({ padding: '2px 10px' }) : undefined} onClick={() => setCalRef(new Date(calRef.getFullYear(), calRef.getMonth() + 1, 1))}><i className="bi bi-chevron-right" /></button>
                        <button className={cls ? '' : 'btn btn-sm btn-outline-secondary'} style={cls ? xpBtn({ padding: '2px 10px' }) : undefined} onClick={() => setCalRef(new Date())}>{t('today')}</button>
                    </div>

                    {/* Month grid */}
                    {(() => {
                        const y = calRef.getFullYear(), mo = calRef.getMonth();
                        const daysInMonth = new Date(y, mo + 1, 0).getDate();
                        const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // Mon-first
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const machineHolMap = new Map(holidays.map((h: any) => [String(h.holiday_date).slice(0, 10), h]));
                        const idHolMap = new Map(idHols.map(h => [h.date, h.name]));
                        const todayStr = new Date().toLocaleDateString('en-CA');
                        const cells: any[] = [];
                        for (let i = 0; i < lead; i++) cells.push(<div key={'b' + i} />);
                        for (let d = 1; d <= daysInMonth; d++) {
                            const ds = `${y}-${pad(mo + 1)}-${pad(d)}`;
                            const dow = (new Date(y, mo, d).getDay() + 6) % 7;
                            const working = weekdays.includes(dow);
                            const mh: any = machineHolMap.get(ds);
                            const nat = idHolMap.get(ds);
                            const isToday = ds === todayStr;
                            let bg = '#fff';
                            if (mh) bg = cls ? '#f0cccc' : '#f8d7da';
                            else if (nat) bg = cls ? '#ffe2b8' : '#ffe9c7';
                            else if (!working) bg = cls ? '#e6e3da' : '#eceef0';
                            cells.push(
                                <div key={ds}
                                    onClick={() => { if (!canManage) return; mh ? deleteHoliday(mh.id) : addHolidayDate(ds, (nat as string) || null); }}
                                    title={mh ? (mh.note || t('holiday')) : nat ? `${nat} — ${t('click_to_add') || 'click to add'}` : (working ? t('working_day') : t('rest_day'))}
                                    style={{
                                        minHeight: 48, padding: '2px 4px', background: bg, cursor: canManage ? 'pointer' : 'default', overflow: 'hidden',
                                        border: isToday ? '2px solid #0058e6' : '1px solid', borderColor: isToday ? '#0058e6' : (cls ? '#c8c4b8' : '#e6e6e6'),
                                        fontFamily: cls ? xpFont : undefined, fontSize: 11,
                                    }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: isToday ? 'bold' : 'normal' }}>{d}</span>
                                        {nat && <i className="bi bi-star-fill" style={{ fontSize: 8, color: '#c87c00' }} />}
                                        {mh && <i className="bi bi-x-circle-fill" style={{ fontSize: 8, color: RED }} />}
                                    </div>
                                    {nat && <div style={{ fontSize: 8, color: '#8a5200', lineHeight: 1.05, maxHeight: 22, overflow: 'hidden' }}>{nat}</div>}
                                    {mh && mh.note && !nat && <div style={{ fontSize: 8, color: RED, lineHeight: 1.05, maxHeight: 22, overflow: 'hidden' }}>{mh.note}</div>}
                                </div>
                            );
                        }
                        return (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 2 }}>
                                    {WEEKDAY_LABELS.map(h => <div key={h} style={{ textAlign: 'center', fontSize: 10, fontWeight: 'bold', color: '#666', fontFamily: cls ? xpFont : undefined }}>{h}</div>)}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>{cells}</div>
                            </div>
                        );
                    })()}

                    {/* Legend + hint */}
                    <div className="d-flex flex-wrap gap-3 mt-2" style={{ fontSize: 10, color: '#666', fontFamily: cls ? xpFont : undefined }}>
                        {[['#fff', t('working_day')], [cls ? '#e6e3da' : '#eceef0', t('rest_day')], [cls ? '#ffe2b8' : '#ffe9c7', `★ ${t('national_holiday')}`], [cls ? '#f0cccc' : '#f8d7da', t('holiday')]].map(([c, label]: any) => (
                            <span key={label} className="d-inline-flex align-items-center">
                                <span style={{ display: 'inline-block', width: 11, height: 11, background: c, border: '1px solid #aaa', marginRight: 4 }} />{label}
                            </span>
                        ))}
                    </div>
                    <p className={cls ? '' : 'text-muted small mt-1'} style={cls ? { fontFamily: xpFont, fontSize: 10, color: '#777', marginTop: 4 } : undefined}>{t('calendar_click_hint')}</p>
                </div>
            )}

            {tab === 'beams' && (() => {
                const mounts: any[] = loom?.mounts || [];
                const slots = loom?.beam_slots ?? 1;
                const pcs = loom?.mounted_pcs ?? 0;
                const cellPad = cls ? '3px 6px' : undefined;
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
                                color: pcs >= slots ? GREEN : pcs > 0 ? '#b06000' : '#888', lineHeight: 1,
                            }}>{pcs} / {slots}</span>
                            <span style={{ fontSize: 11, color: '#777' }}>
                                {t('beam_positions_filled')} · {fmt(loom?.total_remaining, 1)} kg
                            </span>
                        </div>

                        {mounts.length === 0 ? (
                            <div className={cls ? '' : 'text-muted small'}
                                style={cls ? { color: '#888', padding: 10 } : undefined}>
                                {t('no_beams_mounted')}
                            </div>
                        ) : (
                            <div className={cls ? undefined : 'table-responsive'} style={{ overflowX: 'auto' }}>
                                <table className={cls ? undefined : 'table table-sm align-middle small mb-0'}
                                    style={cls ? { width: '100%', borderCollapse: 'collapse', fontSize: 10 } : undefined}>
                                    <thead className={cls ? undefined : 'table-light'}>
                                        <tr style={cls ? { background: '#d4d0c8', textAlign: 'left' } : undefined}>
                                            <th style={{ padding: cellPad }}>{t('lot')}</th>
                                            <th style={{ padding: cellPad }}>{t('ends')}</th>
                                            <th style={{ padding: cellPad, textAlign: 'right' }}>{t('remaining')}</th>
                                            <th style={{ padding: cellPad }}>{t('mounted')}</th>
                                            <th style={{ padding: cellPad }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mounts.map(m => (
                                            <tr key={m.id} style={cls ? { borderBottom: '1px solid #cfccc4' } : undefined}>
                                                <td style={{ padding: cellPad, fontWeight: 'bold', color: BLUE }}>{m.beam_number || '—'}</td>
                                                <td style={{ padding: cellPad }}>{m.ends ?? '—'}</td>
                                                <td style={{ padding: cellPad, textAlign: 'right' }}>{fmt(m.remaining, 1)} kg</td>
                                                <td style={{ padding: cellPad, color: '#666' }}>
                                                    {fmtDate(m.mounted_at)}
                                                    {m.mounted_by ? ` · ${m.mounted_by}` : ''}
                                                </td>
                                                <td style={{ padding: cellPad, textAlign: 'right' }}>
                                                    {canManage && (
                                                        <button
                                                            onClick={() => dismount(m.id)}
                                                            disabled={dismounting === m.id}
                                                            className={cls ? undefined : 'btn btn-sm btn-outline-warning'}
                                                            style={cls ? { ...xpBtn(), fontSize: 10 } : undefined}
                                                            title={t('dismount_hint')}
                                                        >
                                                            {dismounting === m.id ? '...' : t('dismount')}
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
                );
            })()}
        </ModalWrapper>
    );
}
