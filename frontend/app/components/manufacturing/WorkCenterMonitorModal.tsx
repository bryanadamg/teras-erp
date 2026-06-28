'use client';

import { useState, useEffect, useCallback } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import SearchableSelect from '../shared/SearchableSelect';
import { useLanguage } from '../../context/LanguageContext';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // 0=Mon..6=Sun

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
    workCenter: any;            // the machine row
    manufacturingOrders: any[];
    authFetch: (url: string, opts?: any) => Promise<Response>;
    apiBase: string;
}

export default function WorkCenterMonitorModal({ isOpen, onClose, workCenter, manufacturingOrders, authFetch, apiBase }: Props) {
    const { t } = useLanguage();
    const [tab, setTab] = useState<'performance' | 'calendar'>('performance');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Start-run form
    const [showStart, setShowStart] = useState(false);
    const [moId, setMoId] = useState('');
    const [lines, setLines] = useState('1');
    const [rate, setRate] = useState('5');
    const [eff, setEff] = useState('50');
    const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

    // Override actual
    const [overrideVal, setOverrideVal] = useState('');
    const [editingOverride, setEditingOverride] = useState(false);

    // Calendar
    const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
    const [holidays, setHolidays] = useState<any[]>([]);
    const [newHoliday, setNewHoliday] = useState('');
    const [newHolidayNote, setNewHolidayNote] = useState('');

    const wcId = workCenter?.id;

    const load = useCallback(async () => {
        if (!wcId) return;
        setLoading(true);
        try {
            const res = await authFetch(`${apiBase}/work-centers/${wcId}/performance`);
            if (res.ok) {
                const d = await res.json();
                setData(d);
                setWeekdays(d?.calendar?.working_weekdays || [0, 1, 2, 3, 4]);
                setHolidays(d?.calendar?.holidays || []);
            }
        } finally {
            setLoading(false);
        }
    }, [wcId, apiBase, authFetch]);

    useEffect(() => {
        if (isOpen && wcId) {
            setTab('performance');
            setShowStart(false);
            setEditingOverride(false);
            load();
        }
    }, [isOpen, wcId, load]);

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

    const addHoliday = async () => {
        if (!newHoliday) return;
        const res = await authFetch(`${apiBase}/work-centers/${wcId}/holidays`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holiday_date: newHoliday, note: newHolidayNote || null }),
        });
        if (res.ok) { setNewHoliday(''); setNewHolidayNote(''); load(); }
    };

    const deleteHoliday = async (hid: string) => {
        const res = await authFetch(`${apiBase}/work-center-holidays/${hid}`, { method: 'DELETE' });
        if (res.ok) load();
    };

    const moOptions = (manufacturingOrders || []).map((mo: any) => ({
        value: mo.id,
        label: `${mo.code}${mo.item_code ? ' — ' + mo.item_code : ''}`,
        subLabel: mo.qty ? `${fmt(mo.qty, 2)}` : undefined,
    }));

    const run = data?.active_run;
    const proj = data?.mo_projection;

    const Metric = ({ label, value, unit, big, color }: any) => (
        <div style={{ padding: '6px 10px', background: '#f7f7f4', border: '1px solid #e2e0d8', borderRadius: 3 }}>
            <div style={{ fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
            <div style={{ fontSize: big ? 22 : 14, fontWeight: 700, color: color || '#1a1a2e', lineHeight: 1.2 }}>
                {value}{unit && <span style={{ fontSize: 10, fontWeight: 400, color: '#888', marginLeft: 2 }}>{unit}</span>}
            </div>
        </div>
    );

    const title = (
        <span><i className="bi bi-speedometer2 me-2"></i>{t('performance_monitor') || 'Performance Monitor'} — {workCenter?.code} {workCenter?.name}</span>
    );

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={title} size="xl" variant="info">
            {/* Tabs */}
            <ul className="nav nav-tabs mb-3">
                <li className="nav-item">
                    <button className={`nav-link ${tab === 'performance' ? 'active' : ''}`} onClick={() => setTab('performance')}>
                        <i className="bi bi-graph-up me-1"></i>{t('performance') || 'Performance'}
                    </button>
                </li>
                <li className="nav-item">
                    <button className={`nav-link ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>
                        <i className="bi bi-calendar3 me-1"></i>{t('work_calendar') || 'Calendar'}
                    </button>
                </li>
                <li className="ms-auto d-flex align-items-center">
                    <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
                        <i className="bi bi-arrow-clockwise"></i>
                    </button>
                </li>
            </ul>

            {tab === 'performance' && (
                <div>
                    {/* Active run / start */}
                    {!run && !showStart && (
                        <div className="text-center py-4 text-muted">
                            <p className="mb-2">{t('no_active_run') || 'No active run on this machine.'}</p>
                            <button className="btn btn-success btn-sm" onClick={() => setShowStart(true)}>
                                <i className="bi bi-play-fill me-1"></i>{t('start_run') || 'Start Run'}
                            </button>
                        </div>
                    )}

                    {showStart && (
                        <div className="p-3 mb-3 bg-light border rounded">
                            <h6 className="mb-2">{t('start_run') || 'Start Run'}</h6>
                            <div className="row g-2 align-items-end">
                                <div className="col-md-5">
                                    <label className="form-label small mb-0">{t('manufacturing_order') || 'Manufacturing Order'}</label>
                                    <SearchableSelect options={moOptions} value={moId} onChange={setMoId} placeholder="Select MO..." />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label small mb-0">{t('lines') || 'Lines'}</label>
                                    <input type="number" className="form-control form-control-sm" value={lines} onChange={e => setLines(e.target.value)} />
                                </div>
                                <div className="col-md-2">
                                    <label className="form-label small mb-0">{t('rate_per_line') || 'g/min/line'}</label>
                                    <input type="number" className="form-control form-control-sm" value={rate} onChange={e => setRate(e.target.value)} />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label small mb-0">{t('target_efficiency') || 'Target Eff %'}</label>
                                    <input type="number" className="form-control form-control-sm" value={eff} onChange={e => setEff(e.target.value)} />
                                </div>
                                <div className="col-md-4 mt-2">
                                    <label className="form-label small mb-0">{t('start_date') || 'Start Date'}</label>
                                    <input type="date" className="form-control form-control-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                </div>
                                <div className="col-md-8 mt-2 d-flex gap-2 align-items-end">
                                    <button className="btn btn-sm btn-success" onClick={startRun} disabled={!moId}>
                                        <i className="bi bi-play-fill me-1"></i>{t('start') || 'Start'}
                                    </button>
                                    <button className="btn btn-sm btn-secondary" onClick={() => setShowStart(false)}>{t('cancel') || 'Cancel'}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {run && (
                        <div className="mb-3">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <div>
                                    <span className="badge bg-info-subtle text-info-emphasis me-2">{run.mo_code}</span>
                                    <strong>{run.item_code}</strong> <span className="text-muted small">{run.item_name}</span>
                                    <span className="ms-2 text-muted small">{t('target') || 'Target'}: {fmt(run.target_qty, 2)} kg · {t('start') || 'Start'} {fmtDate(run.start_date)}</span>
                                </div>
                                <button className="btn btn-sm btn-outline-danger" onClick={() => stopRun(run.id)}>
                                    <i className="bi bi-stop-fill me-1"></i>{t('stop_run') || 'Stop'}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                <Metric label={t('lines') || 'Lines running'} value={run.lines} />
                                <Metric label={t('rate_per_line') || 'Rate/line'} value={fmt(run.rate_per_line_g_min, 2)} unit="g/min" />
                                <Metric label={t('target_100_day') || 'Target 100%/day'} value={fmt(run.target_100_per_day_kg, 2)} unit="kg" />
                                <Metric label={`${t('target') || 'Target'} ${fmt(run.target_efficiency_pct, 0)}%/day`} value={fmt(run.target_eff_per_day_kg, 2)} unit="kg" />
                                <Metric label={t('elapsed_days') || 'Working days'} value={run.elapsed_working_days} />
                                <Metric label={t('theoretical_100') || 'Theoretical 100%'} value={fmt(run.theoretical_100_kg, 2)} unit="kg" />
                            </div>

                            <div className="row g-2 mt-1">
                                <div className="col-md-4">
                                    <div style={{ padding: '8px 12px', background: '#fff', border: '2px solid #e2e0d8', borderRadius: 4 }}>
                                        <div style={{ fontSize: 10, color: '#777', textTransform: 'uppercase' }}>{t('actual_produced') || 'Actual produced'}</div>
                                        {editingOverride ? (
                                            <div className="d-flex gap-1 mt-1">
                                                <input type="number" className="form-control form-control-sm" style={{ maxWidth: 110 }}
                                                    value={overrideVal} placeholder={String(run.actual_kg)}
                                                    onChange={e => setOverrideVal(e.target.value)} />
                                                <button className="btn btn-sm btn-success" onClick={() => saveOverride(run.id)}><i className="bi bi-check"></i></button>
                                                <button className="btn btn-sm btn-secondary" onClick={() => setEditingOverride(false)}><i className="bi bi-x"></i></button>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 22, fontWeight: 700 }}>
                                                {fmt(run.actual_kg, 2)} <span style={{ fontSize: 11, color: '#888' }}>kg</span>
                                                <button className="btn btn-sm text-secondary p-0 ms-2" title="Override"
                                                    onClick={() => { setOverrideVal(run.actual_qty_override ?? ''); setEditingOverride(true); }}>
                                                    <i className="bi bi-pencil"></i>
                                                </button>
                                                {run.actual_qty_override !== null && <span className="badge bg-warning-subtle text-warning-emphasis ms-1" style={{ fontSize: 9 }}>{t('manual') || 'manual'}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="col-md-4">
                                    <div style={{ padding: '8px 12px', background: '#fff', border: `2px solid ${run.on_target ? '#198754' : '#dc3545'}`, borderRadius: 4 }}>
                                        <div style={{ fontSize: 10, color: '#777', textTransform: 'uppercase' }}>{t('efficiency') || 'Efficiency'}</div>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: run.on_target ? '#198754' : '#dc3545' }}>
                                            {fmt(run.efficiency_pct, 1)}<span style={{ fontSize: 14 }}>%</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: '#888' }}>
                                            {t('target') || 'Target'} {fmt(run.target_efficiency_pct, 0)}% · {run.on_target ? (t('on_target') || 'on target') : (t('below_target') || 'below target')}
                                        </div>
                                    </div>
                                </div>
                                <div className="col-md-4">
                                    <div style={{ padding: '8px 12px', background: '#fff', border: '2px solid #e2e0d8', borderRadius: 4 }}>
                                        <div style={{ fontSize: 10, color: '#777', textTransform: 'uppercase' }}>{t('actual_rate') || 'Actual rate'}</div>
                                        <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(run.actual_daily_rate_kg, 2)} <span style={{ fontSize: 11, color: '#888' }}>kg/day</span></div>
                                    </div>
                                </div>
                            </div>

                            {/* MO projection */}
                            {proj && (
                                <div className="mt-3 p-3" style={{ background: '#eef4fb', border: '1px solid #cfe0f0', borderRadius: 4 }}>
                                    <div className="fw-bold mb-2 small"><i className="bi bi-flag me-1"></i>{t('mo_completion') || 'MO Completion Projection'} — {proj.mo_code}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                                        <Metric label={t('target_qty') || 'Target qty'} value={fmt(proj.target_qty, 2)} unit="kg" />
                                        <Metric label={t('total_actual') || 'Total actual'} value={fmt(proj.total_actual_kg, 2)} unit="kg" />
                                        <Metric label={t('combined_target_rate') || 'Combined target/day'} value={fmt(proj.total_target_daily_kg, 2)} unit="kg" />
                                        <Metric label={t('target_working_days') || 'Target working days'} value={proj.target_working_days ?? '—'} />
                                        <Metric label={t('target_completion') || 'Target completion'} value={fmtDate(proj.target_completion_date)} color="#198754" />
                                        <Metric label={t('projected_completion') || 'Projected completion'} value={fmtDate(proj.reality_completion_date)} color="#b5530a" />
                                    </div>
                                    {proj.machines && proj.machines.length > 1 && (
                                        <div className="small text-muted mt-2">
                                            {t('machines_on_mo') || 'Machines on this MO'}: {proj.machines.map((m: any) => m.work_center_code).join(', ')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* History */}
                    {data?.history?.length > 0 && (
                        <div className="mt-3">
                            <h6 className="small text-muted">{t('run_history') || 'Run History'}</h6>
                            <div className="table-responsive">
                                <table className="table table-sm table-hover align-middle small mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th>{t('manufacturing_order') || 'MO'}</th>
                                            <th>{t('item') || 'Item'}</th>
                                            <th>{t('start') || 'Start'}</th>
                                            <th>{t('end') || 'End'}</th>
                                            <th className="text-end">{t('actual') || 'Actual'}</th>
                                            <th className="text-end">{t('efficiency') || 'Eff'}</th>
                                            <th>{t('status') || 'Status'}</th>
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
                                                <td className="text-end" style={{ color: h.on_target ? '#198754' : '#dc3545', fontWeight: 600 }}>{fmt(h.efficiency_pct, 1)}%</td>
                                                <td><span className="badge bg-secondary-subtle text-secondary-emphasis">{h.status}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tab === 'calendar' && (
                <div>
                    <h6 className="small text-muted">{t('working_days') || 'Working Days'}</h6>
                    <div className="d-flex flex-wrap gap-2 mb-2">
                        {WEEKDAY_LABELS.map((lbl, idx) => (
                            <label key={idx} className={`btn btn-sm ${weekdays.includes(idx) ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ minWidth: 54 }}>
                                <input type="checkbox" className="d-none" checked={weekdays.includes(idx)} onChange={() => toggleWeekday(idx)} />
                                {lbl}
                            </label>
                        ))}
                        <button className="btn btn-sm btn-success ms-2" onClick={saveCalendar}>
                            <i className="bi bi-check-lg me-1"></i>{t('save') || 'Save'}
                        </button>
                    </div>
                    <p className="text-muted small">{t('working_days_hint') || 'Days this machine runs. Production-day count and completion-date projection skip un-checked weekdays and the holidays below.'}</p>

                    <h6 className="small text-muted mt-3">{t('holidays') || 'Holidays'}</h6>
                    <div className="d-flex gap-2 align-items-end mb-2">
                        <div>
                            <label className="form-label small mb-0">{t('date') || 'Date'}</label>
                            <input type="date" className="form-control form-control-sm" value={newHoliday} onChange={e => setNewHoliday(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="form-label small mb-0">{t('note') || 'Note'}</label>
                            <input className="form-control form-control-sm" value={newHolidayNote} onChange={e => setNewHolidayNote(e.target.value)} placeholder="optional" />
                        </div>
                        <button className="btn btn-sm btn-primary" onClick={addHoliday} disabled={!newHoliday}>
                            <i className="bi bi-plus-lg me-1"></i>{t('add') || 'Add'}
                        </button>
                    </div>
                    {holidays.length === 0 ? (
                        <p className="text-muted small fst-italic">{t('no_holidays') || 'No holidays set.'}</p>
                    ) : (
                        <table className="table table-sm table-hover small">
                            <tbody>
                                {holidays.map((h: any) => (
                                    <tr key={h.id}>
                                        <td style={{ width: 120 }}>{fmtDate(h.holiday_date)}</td>
                                        <td>{h.note}</td>
                                        <td style={{ width: 40 }} className="text-end">
                                            <button className="btn btn-sm text-danger p-0" onClick={() => deleteHoliday(h.id)}><i className="bi bi-trash"></i></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </ModalWrapper>
    );
}
