'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { xpFont, familyColor, ProgressBar, StatusChip, XPLoading, XPEmptyState, XPActionButton } from '../shared/xpTheme';
import { ShellWindow, ShellTitleBar, xpToolbar } from '../shared/shellTheme';
import VariantChips from '../shared/VariantChips';
import WorkCenterMonitorModal from './WorkCenterMonitorModal';
import GroupCalendarModal from './GroupCalendarModal';

// Measurement accents come from the shared five-family palette (DESIGN.md's one
// semantic layer) — never a per-view hex.
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

export default function WeavingMonitorView() {
    const { authFetch, subscribeLiveEvents } = useData();
    const { t } = useLanguage();
    const { uiStyle } = useTheme();
    const { hasPermission } = useUser();
    const canManage = hasPermission('work_order.manage');
    const cls = uiStyle === 'classic';

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<any>(null);
    const [calGroup, setCalGroup] = useState<any>(null);

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

    // Looms are shown per work-center GROUP so a whole group's calendar can be set in
    // one go. Machines that sit straight under their TYPE node (the pre-group shape)
    // collect in a trailing Ungrouped section — no group, so no batch action.
    const sections = useMemo(() => {
        const byGroup = new Map<string, { id: string | null; code: string; name: string; machines: any[] }>();
        for (const m of machines) {
            const key = m.group_id || '__ungrouped__';
            if (!byGroup.has(key)) {
                byGroup.set(key, { id: m.group_id || null, code: m.group_code || '', name: m.group_name || '', machines: [] });
            }
            byGroup.get(key)!.machines.push(m);
        }
        return [...byGroup.values()].sort((a, b) =>
            (a.id ? 0 : 1) - (b.id ? 0 : 1) || (a.code || '').localeCompare(b.code || ''));
    }, [machines]);
    const isGrouped = sections.some(s => !!s.id);

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
        </>
    ) : null;

    // Run readout — ONE copy for both themes. This block used to be duplicated in
    // the classic and modern card renderers, which is how they drifted (a field
    // added to one went missing from the other). Only the chrome around it branches.
    const RunBody = ({ run }: { run: any }) => {
        const effColor = run.on_target ? GREEN : RED;
        return (
            <>
                <div style={{ fontSize: cls ? 10 : 12, color: '#555', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b>{run.mo_code}</b>{run.item_code ? ` · ${run.item_code}` : ''}
                </div>
                <div style={{ marginBottom: 4 }}><RunVariant run={run} /></div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: cls ? 24 : 26, fontWeight: 'bold', color: effColor, lineHeight: 1 }}>
                        {fmt(run.efficiency_pct, 1)}<span style={{ fontSize: cls ? 12 : 13 }}>%</span>
                    </span>
                    <span style={{ fontSize: cls ? 10 : 12, color: '#888' }}>{t('target')} {fmt(run.target_efficiency_pct, 0)}%</span>
                </div>
                <div style={{ margin: '4px 0' }}><EffBar eff={run.efficiency_pct} target={run.target_efficiency_pct} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: cls ? 10 : 12 }}>
                    <span><span style={{ color: '#888' }}>{t('actual')}:</span> <b>{fmt(run.actual_kg, 1)}</b> / {fmt(run.target_qty, 0)} kg</span>
                    <span style={{ color: '#666' }}>{fmt(run.actual_daily_rate_kg, 1)} kg/d</span>
                </div>
            </>
        );
    };

    const IdleBody = () => (
        <div style={{ fontSize: cls ? 11 : 12, color: '#888', display: 'flex', gap: 6, alignItems: 'center', minHeight: cls ? 64 : 70 }}>
            <i className="bi bi-pause-circle" style={{ fontSize: cls ? 16 : 18 }} />{t('no_active_run')}
        </div>
    );

    // Loom card. Classic = XP raised tile with a status strip; modern = bootstrap
    // card. Body content is shared (RunBody / IdleBody / BeamStrip).
    const card = (m: any) => {
        const run = m.active_run;
        if (cls) {
            const strip: React.CSSProperties = {
                background: run ? 'linear-gradient(to right, #1a6e1a, #3ab83a)' : 'linear-gradient(to right, #808080, #a8a8a8)',
                color: '#fff', fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
                padding: '2px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                borderBottom: '1px solid #00000033',
            };
            return (
                <div key={m.id} onClick={() => openCard(m)} title={t('click_for_detail')}
                    style={{ border: '2px solid', borderColor: '#ffffff #808080 #808080 #ffffff', background: '#ece9d8', cursor: 'pointer' }}>
                    <div style={strip}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.code} — {m.name}</span>
                        <span style={{ fontSize: 9, flexShrink: 0 }}>{run ? t('running').toUpperCase() : t('idle').toUpperCase()}</span>
                    </div>
                    <div style={{ padding: '6px 8px', background: '#fff', fontFamily: xpFont }}>
                        {run ? <RunBody run={run} /> : <IdleBody />}
                        <BeamStrip m={m} />
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
                        {/* Idle/running through the shared chip so the loom grid uses the
                            same status vocabulary as every other list in the app. */}
                        <StatusChip status={run ? 'IN_PROGRESS' : 'PENDING'} label={run ? t('running') : t('idle')} tint />
                    </div>
                    {run ? <RunBody run={run} /> : <IdleBody />}
                    <BeamStrip m={m} />
                </div>
            </div>
        );
    };

    const cardGrid = (list: any[]) => (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${cls ? 240 : 250}px, 1fr))`, gap: cls ? 8 : 12 }}>
            {list.map(card)}
        </div>
    );

    // Group band. Classic reuses the shared toolbar strip (xpToolbar) instead of a
    // one-off gradient; modern keeps the underlined caption row.
    const groupHeader = (sec: any) => {
        const label = sec.id ? `${sec.code}${sec.name ? ' — ' + sec.name : ''}` : 'Ungrouped';
        const counts = `${sec.machines.length} ${t('machines')} · ${sec.machines.filter((m: any) => m.active_run).length} ${t('running')}`;
        const action = sec.id && canManage ? (
            <span style={{ marginLeft: 'auto' }}>
                <XPActionButton classic={cls} tone="neutral" icon="bi-calendar3" label={t('work_calendar')} onClick={() => setCalGroup(sec)} />
            </span>
        ) : null;
        return cls ? (
            <div style={xpToolbar({ marginBottom: 6, border: '1px solid #b0a898', fontFamily: xpFont, fontSize: 11, fontWeight: 'bold', color: BLUE })}>
                <i className="bi bi-collection" />
                <span>{label}</span>
                <span style={{ fontWeight: 'normal', color: '#555' }}>{counts}</span>
                {action}
            </div>
        ) : (
            <div className="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom">
                <i className="bi bi-collection text-secondary" />
                <span className="fw-semibold">{label}</span>
                <span className="text-muted small">{counts}</span>
                {action}
            </div>
        );
    };

    const body = loading ? (
        <XPLoading label={t('loading')} />
    ) : machines.length === 0 ? (
        <XPEmptyState icon="bi-cpu" message={t('no_weaving_machines')} />
    ) : !isGrouped ? (
        cardGrid(machines)
    ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: cls ? 10 : 20 }}>
            {sections.map(sec => (
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
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: cls ? 8 : 12, background: cls ? '#ece9d8' : undefined }}>
                    {body}
                </div>
            </ShellWindow>
            {modal}
        </div>
    );
}
