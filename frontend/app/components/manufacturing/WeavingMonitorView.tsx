'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { xpFont, xpBtn, StatusChip, XPLoading, XPEmptyState } from '../shared/xpTheme';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar } from '../shared/shellTheme';
import VariantChips from '../shared/VariantChips';
import WorkCenterMonitorModal from './WorkCenterMonitorModal';
import GroupCalendarModal from './GroupCalendarModal';

const GREEN = '#2d7a2d';
const RED = '#c00000';
const BLUE = '#1a3d90';

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

    const EffBar = ({ eff, target }: { eff: number; target: number }) => {
        const on = (eff ?? 0) >= (target ?? 0);
        return (
            <div style={{ position: 'relative', height: 8, background: '#fff', border: '1px solid', borderColor: cls ? '#808080 #fff #fff #808080' : '#ccc' }}>
                <div style={{ width: `${Math.max(0, Math.min(eff || 0, 100))}%`, height: '100%', background: on ? GREEN : RED }} />
                <div title={`${t('target')} ${fmt(target, 0)}%`} style={{ position: 'absolute', left: `${Math.min(target || 0, 100)}%`, top: -2, bottom: -2, width: 2, background: '#000' }} />
            </div>
        );
    };

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
                    <span style={{ fontWeight: 'bold', color: full ? GREEN : pcs > 0 ? '#b06000' : '#999' }}>
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

    // ── Classic (XP) ─────────────────────────────────────────────────────────
    if (cls) {
        const xpWin: React.CSSProperties = sharedXpBevel();
        const xpTitle: React.CSSProperties = sharedXpTitleBar({ gap: 8 });
        const xpCardWrap: React.CSSProperties = {
            border: '2px solid', borderColor: '#ffffff #808080 #808080 #ffffff',
            background: '#ece9d8', cursor: 'pointer',
        };

        const card = (m: any) => {
            const run = m.active_run;
            const on = run?.on_target;
            const effColor = on ? GREEN : RED;
            const strip: React.CSSProperties = {
                background: run ? 'linear-gradient(to right, #1a6e1a, #3ab83a)' : 'linear-gradient(to right, #808080, #a8a8a8)',
                color: '#fff', fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
                padding: '2px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                borderBottom: '1px solid #00000033',
            };
            return (
                <div key={m.id} style={xpCardWrap} onClick={() => openCard(m)} title={t('click_for_detail')}>
                    <div style={strip}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.code} — {m.name}</span>
                        <span style={{ fontSize: 9, flexShrink: 0 }}>{run ? t('running').toUpperCase() : t('idle').toUpperCase()}</span>
                    </div>
                    <div style={{ padding: '6px 8px', background: '#fff', fontFamily: xpFont }}>
                        {run ? (
                            <>
                                <div style={{ fontSize: 10, color: '#555', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <b>{run.mo_code}</b>{run.item_code ? ` · ${run.item_code}` : ''}
                                </div>
                                <div style={{ marginBottom: 4 }}><RunVariant run={run} /></div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span style={{ fontSize: 24, fontWeight: 'bold', color: effColor, lineHeight: 1 }}>{fmt(run.efficiency_pct, 1)}<span style={{ fontSize: 12 }}>%</span></span>
                                    <span style={{ fontSize: 10, color: '#888' }}>{t('target')} {fmt(run.target_efficiency_pct, 0)}%</span>
                                </div>
                                <div style={{ margin: '4px 0' }}><EffBar eff={run.efficiency_pct} target={run.target_efficiency_pct} /></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                                    <span><span style={{ color: '#888' }}>{t('actual')}:</span> <b>{fmt(run.actual_kg, 1)}</b>/{fmt(run.target_qty, 0)} kg</span>
                                    <span style={{ color: '#666' }}>{fmt(run.actual_daily_rate_kg, 1)} kg/d</span>
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: 11, color: '#888', display: 'flex', gap: 6, alignItems: 'center', minHeight: 64 }}>
                                <i className="bi bi-pause-circle" style={{ fontSize: 16 }} />{t('no_active_run')}
                            </div>
                        )}
                        <BeamStrip m={m} />
                    </div>
                </div>
            );
        };

        return (
            <div className="fade-in" style={{ fontFamily: xpFont }}>
                <div style={xpWin}>
                    <div style={xpTitle}>
                        <span><i className="bi bi-speedometer2" style={{ marginRight: 6 }} />{t('weaving_monitor')}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 'normal', fontSize: 11 }}>
                            <span>{summaryText}</span>
                            <button style={{ ...xpBtn() }} onClick={load}><i className="bi bi-arrow-clockwise" /></button>
                        </span>
                    </div>
                    <div style={{ padding: 8, background: '#ece9d8' }}>
                        {loading ? (
                            <XPLoading label={t('loading')} />
                        ) : machines.length === 0 ? (
                            <XPEmptyState icon="bi-cpu" message={t('no_weaving_machines')} />
                        ) : !isGrouped ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                                {machines.map(card)}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {sections.map(sec => (
                                    <div key={sec.id || 'ungrouped'}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            background: 'linear-gradient(to bottom, #f5f4ef, #dedbd0)',
                                            border: '1px solid #b0a898', padding: '2px 7px', marginBottom: 6,
                                            fontFamily: xpFont, fontSize: 11, fontWeight: 'bold', color: BLUE,
                                        }}>
                                            <i className="bi bi-collection" />
                                            <span>{sec.id ? `${sec.code}${sec.name ? ' — ' + sec.name : ''}` : 'Ungrouped'}</span>
                                            <span style={{ fontWeight: 'normal', color: '#555' }}>
                                                {sec.machines.length} {t('machines')} · {sec.machines.filter((m: any) => m.active_run).length} {t('running')}
                                            </span>
                                            {sec.id && canManage && (
                                                <button style={{ ...xpBtn(), marginLeft: 'auto' }} onClick={() => setCalGroup(sec)}>
                                                    <i className="bi bi-calendar3" style={{ marginRight: 4 }} />{t('work_calendar')}
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                                            {sec.machines.map(card)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {modal}
            </div>
        );
    }

    // ── Modern (Bootstrap) ─────────────────────────────────────────────────────
    const card = (m: any) => {
        const run = m.active_run;
        const on = run?.on_target;
        const effColor = on ? GREEN : RED;
        return (
            <div key={m.id} onClick={() => openCard(m)} className="card h-100 shadow-sm border-0" style={{ cursor: 'pointer' }} title={t('click_for_detail')}>
                <div className="card-body p-3">
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <span style={{ fontWeight: 'bold', fontSize: 15 }}>{m.code}</span>
                        <span className="text-muted small text-truncate" style={{ flex: 1 }}>{m.name}</span>
                        <span className={`badge ${run ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`}>{run ? t('running') : t('idle')}</span>
                    </div>
                    {run ? (
                        <>
                            <div className="small mb-1" style={{ minHeight: 18 }}>
                                <span style={{ fontWeight: 600 }}>{run.mo_code}</span>
                                {run.item_code && <span className="text-muted"> · {run.item_code}</span>}
                            </div>
                            <div className="mb-1"><RunVariant run={run} /></div>
                            <div className="d-flex align-items-baseline gap-2">
                                <span style={{ fontSize: 26, fontWeight: 800, color: effColor, lineHeight: 1 }}>{fmt(run.efficiency_pct, 1)}<span style={{ fontSize: 13 }}>%</span></span>
                                <span className="text-muted small">{t('target')} {fmt(run.target_efficiency_pct, 0)}%</span>
                            </div>
                            <div className="mt-1 mb-2"><EffBar eff={run.efficiency_pct} target={run.target_efficiency_pct} /></div>
                            <div className="d-flex justify-content-between small">
                                <span><span className="text-muted">{t('actual')}: </span><strong>{fmt(run.actual_kg, 1)}</strong> / {fmt(run.target_qty, 0)} kg</span>
                                <span className="text-muted">{fmt(run.actual_daily_rate_kg, 1)} kg/d</span>
                            </div>
                        </>
                    ) : (
                        <div className="text-muted small d-flex align-items-center gap-2" style={{ minHeight: 70 }}>
                            <i className="bi bi-pause-circle" style={{ fontSize: 18 }} />
                            <span>{t('no_active_run')}</span>
                        </div>
                    )}
                    <BeamStrip m={m} />
                </div>
            </div>
        );
    };

    return (
        <div className="fade-in">
            <div className="d-flex align-items-center flex-wrap gap-3 mb-3">
                <h4 className="mb-0"><i className="bi bi-speedometer2 me-2" />{t('weaving_monitor')}</h4>
                {data && <div className="d-flex small text-muted">{summaryText}</div>}
                <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={load}><i className="bi bi-arrow-clockwise me-1" />{t('refresh')}</button>
            </div>
            {loading ? (
                <XPLoading label={t('loading')} />
            ) : machines.length === 0 ? (
                <XPEmptyState icon="bi-cpu" message={t('no_weaving_machines')} />
            ) : !isGrouped ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                    {machines.map(card)}
                </div>
            ) : (
                <div className="d-flex flex-column gap-4">
                    {sections.map(sec => (
                        <div key={sec.id || 'ungrouped'}>
                            <div className="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom">
                                <i className="bi bi-collection text-secondary" />
                                <span className="fw-semibold">{sec.id ? `${sec.code}${sec.name ? ' — ' + sec.name : ''}` : 'Ungrouped'}</span>
                                <span className="text-muted small">
                                    {sec.machines.length} {t('machines')} · {sec.machines.filter((m: any) => m.active_run).length} {t('running')}
                                </span>
                                {sec.id && canManage && (
                                    <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setCalGroup(sec)}>
                                        <i className="bi bi-calendar3 me-1" />{t('work_calendar')}
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                                {sec.machines.map(card)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {modal}
        </div>
    );
}
