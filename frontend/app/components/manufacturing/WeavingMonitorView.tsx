'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { xpFont, familyColor, ProgressBar, StatusChip, CardGridSkeleton, SkeletonBar, XPEmptyState, XPActionButton } from '../shared/xpTheme';
import { ShellWindow, ShellTitleBar, xpToolbar, FilterChipBar } from '../shared/shellTheme';
import VariantChips from '../shared/VariantChips';
import { useToast } from '../shared/Toast';
import WorkCenterMonitorModal from './WorkCenterMonitorModal';
import GroupCalendarModal from './GroupCalendarModal';

// Measurement accents come from the shared five-family palette (DESIGN.md's one
// semantic layer) — never a per-view hex.
const GREEN = familyColor('green');
const RED = familyColor('red');
// Sentinel for the leading "All" segment — groupFilter itself stays null for "no filter".
const ALL_GROUPS = '__all__';
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

// Every RUNNING run on a loom. A loom weaving one item for two combos carries one
// run per WO, so the card is a list — `active_run` is only the first of them and is
// read here as the fallback for an older API response.
function runsOf(m: any): any[] {
    if (Array.isArray(m?.active_runs)) return m.active_runs;
    return m?.active_run ? [m.active_run] : [];
}

export default function WeavingMonitorView() {
    const { authFetch, subscribeLiveEvents } = useData();
    const { t } = useLanguage();
    const { uiStyle } = useTheme();
    const { hasPermission } = useUser();
    const { showToast } = useToast();
    const canManage = hasPermission('calendar.edit');
    // Prep steps are floor dispatch decisions, same gate as starting a run.
    const canPrep = hasPermission('weaving_monitor.start');
    const cls = uiStyle === 'classic';

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<any>(null);
    const [calGroup, setCalGroup] = useState<any>(null);
    // Group focus. null = every group (the default): a monitor must open showing the
    // whole plant, so this narrows on request and never hides a bank by default.
    const [groupFilter, setGroupFilter] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/weaving/monitor`);
            if (res.ok) setData(await res.json());
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authFetch]);

    useEffect(() => { load(); }, [load]);

    // Live: a run start/update/stop/delete re-loads this monitor — and so does a
    // production log ('production'), because a WO completion on any of these looms
    // moves actual_kg/efficiency. Completions broadcast MANUFACTURING_ORDER_UPDATE,
    // not weaving_run, so listening for 'weaving' alone left the grid stale until a
    // manual refresh.
    useEffect(() => {
        const unsubscribe = subscribeLiveEvents((kind) => {
            if (kind === 'weaving' || kind === 'production') load();
        });
        return unsubscribe;
    }, [subscribeLiveEvents, load]);

    const closeModal = () => { setSelected(null); load(); };
    const machines: any[] = data?.machines || [];

    // Loom prep walk: IDLE → STAGED (warp up) → DRAW_IN → TUNING → RUNNING. The
    // backend derives the state (see weaving_service.derive_loom_status) — this view
    // only names and colours it, so the card can never invent a state the API
    // wouldn't accept a transition from.
    const loomLabel = (s: string): string => ({
        RUNNING: t('running'), STAGED: t('staged'), DRAW_IN: t('draw_in'), TUNING: t('tuning'),
    } as Record<string, string>)[s] || t('idle');
    // Strip gradient per state: green running, amber waiting on the floor's next
    // click, blue prep in flight, gray nothing up.
    const loomStrip = (s: string): string => ({
        RUNNING: 'linear-gradient(to right, #1a6e1a, #3ab83a)',
        STAGED: 'linear-gradient(to right, #9a6a06, #d99b1c)',
        DRAW_IN: 'linear-gradient(to right, #0a3d91, #2f74d0)',
        TUNING: 'linear-gradient(to right, #0a3d91, #2f74d0)',
    } as Record<string, string>)[s] || 'linear-gradient(to right, #808080, #a8a8a8)';
    // Chip family reuse: prep states are already in STATUS_FAMILY, so the modern
    // card gets its colour from the same map every other list uses.
    const loomChipStatus = (s: string): string => (s === 'RUNNING' ? 'IN_PROGRESS' : s === 'IDLE' ? 'PENDING' : s);

    const [prepBusy, setPrepBusy] = useState<string | null>(null);
    const setPrep = async (m: any, step: string | null) => {
        setPrepBusy(m.id);
        try {
            const res = await authFetch(`${API_BASE}/work-centers/${m.id}/loom-prep`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: step }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => null);
                showToast(d?.detail || t('prep_failed'), 'danger');
                return;
            }
            await load();
        } finally {
            setPrepBusy(null);
        }
    };

    // Looms are shown per work-center GROUP so a whole group's calendar can be set in
    // one go. Machines that sit straight under their TYPE node (the pre-group shape)
    // collect in a trailing Ungrouped section — no group, so no batch action.
    //
    // Each section carries its own health roll-up (running / below-target / avg
    // efficiency). That is what lets a bank report itself from its header band: a
    // group scrolled past — or filtered out — still surfaces its alarms in the chip
    // bar, which is the whole reason this screen doesn't hide groups behind tabs.
    const sections = useMemo(() => {
        const byGroup = new Map<string, { id: string | null; code: string; name: string; machines: any[] }>();
        for (const m of machines) {
            const key = m.group_id || '__ungrouped__';
            if (!byGroup.has(key)) {
                byGroup.set(key, { id: m.group_id || null, code: m.group_code || '', name: m.group_name || '', machines: [] });
            }
            byGroup.get(key)!.machines.push(m);
        }
        return [...byGroup.values()]
            .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || (a.code || '').localeCompare(b.code || ''))
            .map(sec => {
                const runs = sec.machines.flatMap((m: any) => runsOf(m));
                // on_target is null until a run has an efficiency to judge (no elapsed
                // working day yet) — only count a run that actually reports below.
                const belowTarget = runs.filter((r: any) => r.on_target === false).length;
                const effs = runs.map((r: any) => r.efficiency_pct).filter((e: any) => e !== null && e !== undefined);
                return {
                    ...sec,
                    running: runs.length,
                    // Projected past the date the WO promised. Separate alarm from
                    // below-target: a loom can hold its efficiency and still miss the
                    // date because the order needs more machines or more working days.
                    late: runs.filter((r: any) => r.is_late).length,
                    belowTarget,
                    avgEff: effs.length ? effs.reduce((a: number, b: number) => a + Number(b), 0) / effs.length : null,
                };
            });
    }, [machines]);
    const isGrouped = sections.some(s => !!s.id);
    const plantBelowTarget = sections.reduce((n, s) => n + s.belowTarget, 0);
    const plantLate = sections.reduce((n, s) => n + s.late, 0);

    // Chip bar filters which sections render; it never changes what was measured, so
    // the counts on the chips stay plant-wide. A filter that matches nothing (the
    // group was deleted or re-parented since it was picked) falls back to everything
    // — a monitor must never render an empty screen because of stale UI state.
    const visibleSections = useMemo(() => {
        if (!groupFilter) return sections;
        const hit = sections.filter(s => (s.id || '__ungrouped__') === groupFilter);
        return hit.length ? hit : sections;
    }, [sections, groupFilter]);

    // Efficiency vs its target tick — the shared ProgressBar with a threshold
    // marker, so this reads like every other bar in the app. The machine modal's
    // hero renders the same call; keep the two in step.
    const EffBar = ({ eff, target }: { eff: number; target: number }) => (
        <ProgressBar
            pct={Number(eff) || 0}
            tone={(eff ?? 0) >= (target ?? 0) ? 'green' : 'red'}
            markerPct={Number(target) || 0}
            markerTitle={`${t('target')} ${fmt(target, 0)}%`}
            height={9}
        />
    );

    const openCard = (m: any) => setSelected({ id: m.id, code: m.code, name: m.name, center_type: m.center_type });

    // What variant the loom is running right now. The MO alone doesn't say it — a
    // supervisor on the floor reads combo/size off the card to match the loom against
    // the physical warp and the WO ticket.
    const RunVariant = ({ run }: { run: any }) => (
        <VariantChips
            combo={run.combo_label}
            size={run.size_label}
            colorVariant={run.color_label}
            colorCode={run.color_code}
            colorName={run.color_name}
            colorHex={run.color_hex}
            labdipCode={run.labdip_variant_code}
            scale="sm"
            style={{ flexWrap: 'wrap', gap: 3 }}
        />
    );

    // Warp on the loom. A beam belongs to the machine, not to a work order — every
    // WO that runs here draws from it — so its readiness reads in whole beams
    // against the machine's beam positions, and lives on the machine card.
    const BeamStrip = ({ m }: { m: any }) => {
        const beams: any[] = m.mounted_beams || [];
        const slots = m.beam_slots ?? 1;
        const pcs = m.mounted_pcs ?? 0;
        const full = pcs >= slots;
        const border = cls ? '#c8c4b8' : '#e3e3e3';
        return (
            <div style={{ marginTop: 5, paddingTop: 4, borderTop: `1px solid ${border}`, fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ color: '#888' }}>{t('warp_mounted')}</span>
                    <span style={{ fontWeight: 'bold', color: full ? GREEN : pcs > 0 ? AMBER : '#999' }}>
                        {pcs} / {slots} {t('pcs')}
                        {pcs > 0 ? <span style={{ color: '#666', fontWeight: 'normal' }}> · {fmt(m.mounted_kg, 1)} kg</span> : null}
                    </span>
                </div>
                {beams.length > 0 && (
                    <div style={{ marginTop: 2, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {beams.map((b, i) => (
                            <span key={b.mount_id}>
                                {i > 0 ? ', ' : ''}
                                <b style={{ color: BLUE }}>{b.beam_number}</b>
                                <span style={{ color: '#888' }}> {fmt(b.remaining, 1)}kg</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const modal = (
        <>
            <WorkCenterMonitorModal
                isOpen={!!selected}
                onClose={closeModal}
                workCenter={selected}
                authFetch={authFetch}
                apiBase={API_BASE}
            />
            <GroupCalendarModal
                isOpen={!!calGroup}
                onClose={() => setCalGroup(null)}
                group={calGroup}
                authFetch={authFetch}
                apiBase={API_BASE}
                onApplied={load}
            />
        </>
    );

    const summaryText = data ? (
        <>
            <span><b>{data.total}</b> {t('machines')}</span>
            <span style={{ marginLeft: 12 }}><b style={{ color: cls ? '#9effa0' : GREEN }}>{data.running}</b> {t('running')}</span>
            {data.avg_efficiency_pct !== null && data.avg_efficiency_pct !== undefined && (
                <span style={{ marginLeft: 12 }}>{t('avg_efficiency')}: <b>{fmt(data.avg_efficiency_pct, 1)}%</b></span>
            )}
            {/* Plant-wide alarm counts, always visible regardless of the group filter. */}
            {plantBelowTarget > 0 && (
                <span style={{ marginLeft: 12 }}>
                    <b style={{ color: cls ? '#ffc9c9' : RED }}>{plantBelowTarget}</b> {t('below_target')}
                </span>
            )}
            {plantLate > 0 && (
                <span style={{ marginLeft: 12 }}>
                    <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 4 }} />
                    <b style={{ color: cls ? '#ffc9c9' : RED }}>{plantLate}</b> {t('behind_schedule')}
                </span>
            )}
        </>
    ) : null;

    // Run readout — ONE copy for both themes. This block used to be duplicated in
    // the classic and modern card renderers, which is how they drifted (a field
    // added to one went missing from the other). Only the chrome around it branches.
    // The two completion dates side by side, plus the warning. `wo_target_end_date`
    // is the date entered when the WO was created (the promise); `reality_...` is
    // where today's actual rate lands. The gap between them is the decision — add a
    // machine, or add working days.
    const DueLine = ({ run }: { run: any }) => {
        if (!run.wo_target_end_date && !run.reality_completion_date && !run.reality_unreachable) return null;
        const late = !!run.is_late;
        return (
            <div style={{ marginTop: 4, fontSize: cls ? 10 : 11, lineHeight: 1.35 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ color: '#888' }}>{t('wo_due')}</span>
                    <b>{fmtDate(run.wo_target_end_date || run.target_completion_date)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ color: '#888' }}>{t('projected_completion')}</span>
                    <b style={{ color: late ? RED : GREEN }}>
                        {run.reality_unreachable ? t('not_achievable') : fmtDate(run.reality_completion_date)}
                    </b>
                </div>
                {late && (
                    <div style={{
                        marginTop: 3, padding: '1px 5px', background: cls ? '#ffe6e6' : '#fdecea',
                        border: `1px solid ${RED}`, color: RED, fontWeight: 'bold',
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        <i className="bi bi-exclamation-triangle-fill" />
                        <span>
                            {run.reality_unreachable
                                ? t('no_output_yet')
                                : `${t('late_by')} ${run.days_late} ${t('days')}`}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    const RunBody = ({ run, index = 0, total = 1 }: { run: any; index?: number; total?: number }) => {
        // A parked run's % is a record of days already woven, not a live reading, so it
        // drops out of the green/red judgement instead of sitting there accusing a loom
        // of underperforming on work nobody asked it to do.
        const effColor = run.is_paused ? '#888' : run.on_target ? GREEN : RED;
        return (
            <>
                <div style={{ fontSize: cls ? 10 : 12, color: '#555', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {/* WO first: with several runs on one loom the WO is what tells them
                        apart on the floor — the MO is shared by every combo. */}
                    {index > 0 && (
                        <span style={{
                            display: 'inline-block', marginRight: 4, padding: '0 4px',
                            background: cls ? '#d4d0c8' : '#eceef0', color: '#555',
                            fontSize: 9, fontWeight: 700, borderRadius: cls ? 0 : 3,
                        }}>
                            {index}/{total}
                        </span>
                    )}
                    {run.wo_code && <b style={{ color: BLUE }}>{run.wo_code} · </b>}
                    <b>{run.mo_code}</b>{run.item_code ? ` · ${run.item_code}` : ''}
                </div>
                {/* Parked, not finished. The badge has to be on the card and not just
                    in the modal: the whole point of pausing is that the reader stops
                    reading this run's efficiency as a live judgement of the loom. */}
                {run.is_paused && (
                    <div style={{ marginBottom: 4 }}>
                        <StatusChip
                            status="PAUSED"
                            label={run.paused_on ? `${t('paused')} · ${fmtDate(run.paused_on)}` : t('paused')}
                            title={`${t('paused_days_excluded')}: ${run.paused_working_days ?? 0}`}
                            tint
                        />
                    </div>
                )}
                <div style={{ marginBottom: 4 }}><RunVariant run={run} /></div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: cls ? 24 : 26, fontWeight: 'bold', color: effColor, lineHeight: 1 }}>
                        {fmt(run.efficiency_pct, 1)}<span style={{ fontSize: cls ? 12 : 13 }}>%</span>
                    </span>
                    <span style={{ fontSize: cls ? 10 : 12, color: '#888' }}>{t('target')} {fmt(run.target_efficiency_pct, 0)}%</span>
                    <span style={{ fontSize: cls ? 10 : 12, color: '#888', marginLeft: 'auto' }}>
                        {run.lines} {t('lines')}
                    </span>
                </div>
                <div style={{ margin: '4px 0' }}><EffBar eff={run.efficiency_pct} target={run.target_efficiency_pct} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: cls ? 10 : 12 }}>
                    <span><span style={{ color: '#888' }}>{t('actual')}:</span> <b>{fmt(run.actual_kg, 1)}</b> / {fmt(run.target_qty, 0)} kg</span>
                    <span style={{ color: '#666' }}>{fmt(run.actual_daily_rate_kg, 1)} kg/d</span>
                </div>
                <DueLine run={run} />
            </>
        );
    };

    // Several WOs on one loom stack in the card, ruled off from each other. Each keeps
    // its own line count, dates and warning — they are different orders, not one run
    // averaged together, and a dashed hairline was not enough separation to say so at
    // card density. Solid rule + a per-run index chip, so the reader can see at a
    // glance that they are looking at 1 of 2.
    const RunStack = ({ runs }: { runs: any[] }) => (
        <>
            {runs.map((r: any, i: number) => (
                <div key={r.id} style={i === 0 ? undefined : {
                    marginTop: 7, paddingTop: 7, borderTop: `2px solid ${cls ? '#b0a898' : '#d0d0d0'}`,
                }}>
                    <RunBody run={r} index={runs.length > 1 ? i + 1 : 0} total={runs.length} />
                </div>
            ))}
        </>
    );

    // No run yet. Which prep step the loom is waiting on is the useful line here —
    // "no active run" alone couldn't tell a supervisor whether the loom is dead or
    // two clicks from producing.
    const IdleBody = ({ status }: { status: string }) => {
        const prep = status !== 'IDLE';
        return (
            <div style={{ fontSize: cls ? 11 : 12, color: prep ? '#555' : '#888', display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', minHeight: cls ? 64 : 70 }}>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <i className={`bi ${prep ? 'bi-tools' : 'bi-pause-circle'}`} style={{ fontSize: cls ? 16 : 18 }} />
                    {prep ? loomLabel(status) : t('no_active_run')}
                </span>
                {prep && <span style={{ fontSize: 10, color: '#888' }}>{t('loom_prep_hint')}</span>}
            </div>
        );
    };

    // Prep actions on the card. The floor confirms Draw-in, then Tuning, before a
    // run may be started — so the button that moves the loom forward sits on the
    // loom's own tile, not two clicks deep in the modal. The card itself opens the
    // modal, hence stopPropagation on every control here.
    const PrepRow = ({ m }: { m: any }) => {
        const status: string = m.loom_status || 'IDLE';
        const next: string | null = m.next_loom_step || null;
        if (!canPrep || status === 'RUNNING' || status === 'IDLE') return null;
        const busy = prepBusy === m.id;
        const border = cls ? '#c8c4b8' : '#e3e3e3';
        const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
        return (
            <div style={{ marginTop: 5, paddingTop: 5, borderTop: `1px solid ${border}`, display: 'flex', gap: 4, alignItems: 'center' }}>
                {next && (
                    <XPActionButton
                        classic={cls}
                        tone={next === 'TUNING' ? 'warning' : 'primary'}
                        icon={next === 'TUNING' ? 'bi-sliders' : 'bi-arrows-collapse-vertical'}
                        label={next === 'TUNING' ? t('tuning') : t('draw_in')}
                        disabled={busy}
                        onClick={stop(() => setPrep(m, next))}
                    />
                )}
                {status !== 'STAGED' && (
                    <XPActionButton
                        classic={cls}
                        tone="neutral"
                        icon="bi-arrow-counterclockwise"
                        title={t('prep_reset')}
                        disabled={busy}
                        onClick={stop(() => setPrep(m, null))}
                    />
                )}
                {/* TUNING is the last prep step: nothing left to click here, the run is
                    started from the machine modal's Start form. */}
                {status === 'TUNING' && !next && (
                    <span style={{ fontSize: 10, color: '#666', marginLeft: 'auto' }}>
                        <i className="bi bi-play-circle" style={{ marginRight: 3 }} />{t('start_run')}
                    </span>
                )}
            </div>
        );
    };

    // Loom card. Classic = XP raised tile with a status strip; modern = bootstrap
    // card. Body content is shared (RunBody / IdleBody / BeamStrip / PrepRow).
    const card = (m: any) => {
        const runs = runsOf(m);
        const lateCount = runs.filter((r: any) => r.is_late).length;
        const loomStatus: string = m.loom_status || (runs.length ? 'RUNNING' : 'IDLE');
        if (cls) {
            const strip: React.CSSProperties = {
                background: loomStrip(loomStatus),
                color: '#fff', fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
                padding: '2px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                borderBottom: '1px solid #00000033',
            };
            return (
                <div key={m.id} onClick={() => openCard(m)} title={t('click_for_detail')}
                    style={{ border: '2px solid', borderColor: '#ffffff #808080 #808080 #ffffff', background: '#ece9d8', cursor: 'pointer' }}>
                    <div style={strip}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.code} — {m.name}</span>
                        <span style={{ fontSize: 9, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {lateCount > 0 && <i className="bi bi-exclamation-triangle-fill" title={t('behind_schedule')} />}
                            {runs.length > 1 && <span>{runs.length} {t('wo_short')}</span>}
                            {loomLabel(loomStatus).toUpperCase()}
                        </span>
                    </div>
                    <div style={{ padding: '6px 8px', background: '#fff', fontFamily: xpFont }}>
                        {runs.length ? <RunStack runs={runs} /> : <IdleBody status={loomStatus} />}
                        <BeamStrip m={m} />
                        <PrepRow m={m} />
                    </div>
                </div>
            );
        }
        return (
            <div key={m.id} onClick={() => openCard(m)} className="card h-100 shadow-sm border" style={{ cursor: 'pointer' }} title={t('click_for_detail')}>
                <div className="card-body p-3">
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <span style={{ fontWeight: 'bold', fontSize: 15 }}>{m.code}</span>
                        <span className="text-muted small text-truncate" style={{ flex: 1 }}>{m.name}</span>
                        {/* Loom state through the shared chip so the grid uses the same
                            status vocabulary as every other list in the app. */}
                        {lateCount > 0 && (
                            <i className="bi bi-exclamation-triangle-fill" style={{ color: RED }} title={t('behind_schedule')} />
                        )}
                        {runs.length > 1 && (
                            <span className="text-muted" style={{ fontSize: 11 }}>{runs.length} {t('wo_short')}</span>
                        )}
                        <StatusChip status={loomChipStatus(loomStatus)} label={loomLabel(loomStatus)} tint />
                    </div>
                    {runs.length ? <RunStack runs={runs} /> : <IdleBody status={loomStatus} />}
                    <BeamStrip m={m} />
                    <PrepRow m={m} />
                </div>
            </div>
        );
    };

    const cardGrid = (list: any[]) => (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${cls ? 240 : 250}px, 1fr))`, gap: cls ? 8 : 12 }}>
            {list.map(card)}
        </div>
    );

    const sectionLabel = (sec: any) => (sec.id ? `${sec.code}${sec.name ? ' — ' + sec.name : ''}` : 'Ungrouped');

    // Group band. Carries the bank's own health (running · avg efficiency · below
    // target) so a section reports itself without the reader tallying cards — the
    // counts alone said nothing about whether the bank was in trouble. Classic reuses
    // the shared toolbar strip (xpToolbar); modern keeps the underlined caption row.
    const groupHeader = (sec: any) => {
        const health = (
            <>
                <span style={{ fontWeight: 'normal', color: '#555' }}>
                    {sec.machines.length} {t('machines')} · {sec.running} {t('running')}
                </span>
                {sec.avgEff !== null && (
                    <span style={{ fontWeight: 'normal', color: '#555' }}>
                        {t('avg_efficiency')}: <b style={{ color: '#333' }}>{fmt(sec.avgEff, 1)}%</b>
                    </span>
                )}
                {sec.belowTarget > 0 && (
                    <StatusChip status="CANCELLED" label={`${sec.belowTarget} ${t('below_target')}`} tint />
                )}
                {sec.late > 0 && (
                    <StatusChip status="CANCELLED" label={`${sec.late} ${t('behind_schedule')}`} tint />
                )}
            </>
        );
        const action = sec.id && canManage ? (
            <span style={{ marginLeft: 'auto' }}>
                <XPActionButton classic={cls} tone="neutral" icon="bi-calendar3" label={t('work_calendar')} onClick={() => setCalGroup(sec)} />
            </span>
        ) : null;
        return cls ? (
            <div style={xpToolbar({ marginBottom: 6, border: '1px solid #b0a898', fontFamily: xpFont, fontSize: 11, fontWeight: 'bold', color: BLUE })}>
                <i className="bi bi-collection" />
                <span>{sectionLabel(sec)}</span>
                {health}
                {action}
            </div>
        ) : (
            <div className="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom small">
                <i className="bi bi-collection text-secondary" />
                <span className="fw-semibold">{sectionLabel(sec)}</span>
                {health}
                {action}
            </div>
        );
    };

    // Group focus chips. These FILTER (they don't hide): every chip keeps its
    // plant-wide below-target badge, so an alarm in a bank you are not looking at is
    // still on screen — the property tabs would have cost.
    const chipBar = isGrouped ? (
        <div style={cls
            ? xpToolbar({ marginBottom: 8, border: '1px solid #b0a898' })
            : { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: cls ? 11 : 12, color: '#666', fontFamily: cls ? xpFont : undefined }}>
                <i className="bi bi-funnel" style={{ marginRight: 4 }} />{t('group')}
            </span>
            <FilterChipBar
                classic={cls}
                value={groupFilter ?? ALL_GROUPS}
                onChange={v => setGroupFilter(v === ALL_GROUPS || v === groupFilter ? null : v)}
                options={[
                    { value: ALL_GROUPS, label: `${t('all')} (${machines.length})` },
                    ...sections.map(sec => ({
                        value: sec.id || '__ungrouped__',
                        title: `${sec.machines.length} ${t('machines')} · ${sec.running} ${t('running')}`,
                        label: (
                            <>
                                {sectionLabel(sec)}
                                <span style={{ opacity: 0.75 }}> ({sec.machines.length})</span>
                                {sec.belowTarget > 0 && (
                                    <span
                                        title={`${sec.belowTarget} ${t('below_target')}`}
                                        style={{
                                            marginLeft: 5, padding: '0 4px', borderRadius: 8,
                                            background: RED, color: '#fff', fontSize: 9, fontWeight: 700,
                                        }}
                                    >
                                        {sec.belowTarget}
                                    </span>
                                )}
                            </>
                        ),
                    })),
                ]}
            />
        </div>
    ) : null;

    // Geometry mirrors cardGrid()/card() above — same minmax floor and gap, and a
    // body deep enough for the run stack + beam strip + prep row — so the real
    // grid drops straight into the skeleton's tracks with no shift.
    const body = loading ? (
        <CardGridSkeleton
            count={12}
            minWidth={cls ? 240 : 250}
            gap={cls ? 8 : 12}
            classic={cls}
            bodyLines={3}
            bodyHeight={cls ? 96 : 118}
        />
    ) : machines.length === 0 ? (
        <XPEmptyState icon="bi-cpu" message={t('no_weaving_machines')} />
    ) : !isGrouped ? (
        cardGrid(machines)
    ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: cls ? 10 : 20 }}>
            {visibleSections.map(sec => (
                <div key={sec.id || 'ungrouped'}>
                    {groupHeader(sec)}
                    {cardGrid(sec.machines)}
                </div>
            ))}
        </div>
    );

    // One chrome path for both themes via the shared shell primitives — the same
    // window + title bar every other top-level view uses, instead of a hand-rolled
    // bevel here and a bare <h4> in modern. The grid scrolls inside the window.
    return (
        <div className="fade-in" style={cls ? { fontFamily: xpFont } : undefined}>
            <ShellWindow classic={cls} fill="page">
                <ShellTitleBar
                    classic={cls}
                    icon="bi-speedometer2"
                    title={t('weaving_monitor')}
                    right={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 'normal', fontSize: cls ? 11 : 12 }}>
                            <span className={cls ? undefined : 'text-muted'}>{summaryText}</span>
                            <XPActionButton classic={cls} tone="neutral" icon="bi-arrow-clockwise" title={t('refresh')} onClick={load} />
                        </span>
                    }
                />
                {/* Chip bar sits OUTSIDE the scroll area: the filter and its alarm
                    badges stay on screen no matter how far down the grid you are. */}
                {(loading || machines.length > 0) && (
                    <div style={{ padding: cls ? '6px 8px 0' : '12px 12px 0', background: cls ? '#ece9d8' : undefined }}>
                        {/* Placeholder chips hold the strip's height while loading —
                            without them the whole grid jumps down when the real chip
                            bar appears. */}
                        {loading
                            ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {[70, 96, 84, 110].map((w, i) => (
                                    <SkeletonBar key={i} width={w} height={cls ? 17 : 24} />
                                ))}
                            </div>
                            : chipBar}
                    </div>
                )}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: cls ? 8 : 12, background: cls ? '#ece9d8' : undefined }}>
                    {body}
                </div>
            </ShellWindow>
            {modal}
        </div>
    );
}
