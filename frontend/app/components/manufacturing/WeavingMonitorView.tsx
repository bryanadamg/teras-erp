'use client';

import { useState, useEffect, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { xpFont, xpBtn, StatusChip, XPLoading, XPEmptyState } from '../shared/xpTheme';
import WorkCenterMonitorModal from './WorkCenterMonitorModal';

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
    const { manufacturingOrders, authFetch } = useData();
    const { t } = useLanguage();
    const { uiStyle } = useTheme();
    const cls = uiStyle === 'classic';

    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<any>(null);

    const load = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/weaving/monitor`);
            if (res.ok) setData(await res.json());
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authFetch]);

    useEffect(() => { load(); }, [load]);

    // refresh grid when the detail modal closes (a run may have started/stopped)
    const closeModal = () => { setSelected(null); load(); };

    const machines: any[] = data?.machines || [];

    const EffBar = ({ eff, target }: { eff: number; target: number }) => {
        const on = (eff ?? 0) >= (target ?? 0);
        return (
            <div style={{ position: 'relative', height: 8, background: '#fff', border: '1px solid', borderColor: cls ? '#808080 #fff #fff #808080' : '#ccc' }}>
                <div style={{ width: `${Math.max(0, Math.min(eff || 0, 100))}%`, height: '100%', background: on ? GREEN : RED }} />
                <div title={`${t('target')} ${fmt(target, 0)}%`} style={{ position: 'absolute', left: `${Math.min(target || 0, 100)}%`, top: -2, bottom: -2, width: 2, background: '#000' }} />
            </div>
        );
    };

    const Card = ({ m }: { m: any }) => {
        const run = m.active_run;
        const on = run?.on_target;
        const effColor = on ? GREEN : RED;
        const cardStyle: React.CSSProperties = cls
            ? { background: '#fff', border: '1px solid', borderColor: '#808080 #fff #fff #808080', padding: 10, cursor: 'pointer', fontFamily: xpFont }
            : { cursor: 'pointer' };
        return (
            <div
                onClick={() => setSelected({ id: m.id, code: m.code, name: m.name, center_type: m.center_type })}
                className={cls ? '' : 'card h-100 shadow-sm border-0 monitor-card'}
                style={cardStyle}
                title={t('click_for_detail') || 'Click for detail'}
            >
                <div className={cls ? '' : 'card-body p-3'}>
                    <div className="d-flex align-items-center gap-2 mb-2">
                        <span style={{ fontWeight: 'bold', fontSize: cls ? 13 : 15 }}>{m.code}</span>
                        <span className="text-muted small text-truncate" style={{ flex: 1 }}>{m.name}</span>
                        {cls
                            ? <StatusChip status={run ? 'IN_PROGRESS' : 'DRAFT'} label={run ? t('running') : t('idle')} />
                            : <span className={`badge ${run ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`}>{run ? t('running') : t('idle')}</span>}
                    </div>

                    {run ? (
                        <>
                            <div className="small mb-1" style={{ minHeight: 18 }}>
                                <span style={{ fontWeight: 600 }}>{run.mo_code}</span>
                                {run.item_code && <span className="text-muted"> · {run.item_code}</span>}
                            </div>
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
                </div>
            </div>
        );
    };

    return (
        <div className="fade-in">
            {/* Header / summary */}
            <div className="d-flex align-items-center flex-wrap gap-3 mb-3">
                <h4 className="mb-0" style={cls ? { fontFamily: xpFont, fontSize: 16, color: BLUE } : undefined}>
                    <i className="bi bi-speedometer2 me-2" />{t('weaving_monitor') || 'Weaving Monitor'}
                </h4>
                {data && (
                    <div className="d-flex gap-3 small text-muted">
                        <span><strong>{data.total}</strong> {t('machines')}</span>
                        <span><strong style={{ color: GREEN }}>{data.running}</strong> {t('running')}</span>
                        {data.avg_efficiency_pct !== null && data.avg_efficiency_pct !== undefined && (
                            <span>{t('avg_efficiency')}: <strong>{fmt(data.avg_efficiency_pct, 1)}%</strong></span>
                        )}
                    </div>
                )}
                {cls
                    ? <button onClick={load} style={{ ...xpBtn(), marginLeft: 'auto' }}><i className="bi bi-arrow-clockwise me-1" />{t('refresh') || 'Refresh'}</button>
                    : <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={load}><i className="bi bi-arrow-clockwise me-1" />{t('refresh') || 'Refresh'}</button>}
            </div>

            {loading ? (
                <XPLoading label={t('loading') || 'Loading...'} />
            ) : machines.length === 0 ? (
                <XPEmptyState icon="bi-cpu" message={t('no_weaving_machines') || 'No weaving machines defined. Add machines with type WEAVING in Routing.'} />
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                    {machines.map(m => <Card key={m.id} m={m} />)}
                </div>
            )}

            <WorkCenterMonitorModal
                isOpen={!!selected}
                onClose={closeModal}
                workCenter={selected}
                manufacturingOrders={manufacturingOrders || []}
                authFetch={authFetch}
                apiBase={API_BASE}
            />
        </div>
    );
}
