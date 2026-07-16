import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { statusColor, statusTint } from './xpTheme';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api')
    .replace(/\/api$/, '') + '/api';

// Max MO chips shown per day in full (non-compact) mode before collapsing to "+N more".
const MAX_VISIBLE = 4;

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayKey = (v?: string | null) => (v ? String(v).slice(0, 10) : null);

/**
 * Month calendar. Shared by the Dashboard (compact, WO due_date) and the MO view.
 * Props:
 *  - endField   which field carries the deadline day (default 'due_date'; MO passes 'target_end_date')
 *  - startField optional lead-time start; when set, days between start..end render a slim status trail
 *  - onMOClick  makes chips clickable (jump to the row)
 *  - showHolidays overlay Indonesian national holidays for the shown year
 *  - filterable render a status + text filter bar
 *  - showLoad   render per-day count/qty + a load bar scaled to the month's busiest day
 */
export default function CalendarView({
    workOrders, items, compact = false,
    onMOClick, endField = 'due_date', startField,
    showHolidays = false, filterable = false, showLoad = false,
}: any) {
    const { itemIndex, authFetch } = useData();
    const [currentDate, setCurrentDate] = useState(new Date());
    const { uiStyle: currentStyle } = useTheme();
    const classic = currentStyle === 'classic';

    const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [holidays, setHolidays] = useState<Record<string, string>>({});

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    // Empty (not raw UUID) when the item isn't loaded — the chip's code line already identifies it.
    const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || itemIndex?.[String(id)]?.name || '';

    // Chip style per status — shared STATUS_FAMILY palette (tinted), single source of truth.
    const chipStyle = (status: string): React.CSSProperties => {
        const c = statusTint(status);
        return { background: c.background, border: `1px solid ${c.borderColor}`, color: c.color };
    };
    const dotColor = (status: string) => statusColor(status);

    const getEnd = (wo: any) => dayKey(wo[endField]) || (startField ? dayKey(wo[startField]) : null);
    const getStart = (wo: any) => (startField ? dayKey(wo[startField]) : null);

    // ── Holidays (national) ──────────────────────────────────────────────────
    useEffect(() => {
        if (!showHolidays || !authFetch) return;
        let cancelled = false;
        authFetch(`${API_BASE}/weaving/id-holidays?year=${year}`)
            .then((r: Response) => (r.ok ? r.json() : null))
            .then((d: any) => {
                if (cancelled || !d?.holidays) return;
                setHolidays(Object.fromEntries(d.holidays.map((h: any) => [h.date, h.name])));
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [showHolidays, authFetch, year]);

    // ── Filtering ────────────────────────────────────────────────────────────
    const statusOptions = useMemo(
        () => Array.from(new Set(workOrders.map((wo: any) => wo.status).filter(Boolean))).sort() as string[],
        [workOrders]
    );
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return workOrders.filter((wo: any) => {
            if (statusFilter.size && !statusFilter.has(wo.status)) return false;
            if (q) {
                const name = getItemName(wo.item_id).toLowerCase();
                const code = String(wo.code || '').toLowerCase();
                if (!code.includes(q) && !name.includes(q)) return false;
            }
            return true;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workOrders, statusFilter, search, items]);

    // ── Build per-day index: deadline chips ("end") + lead-time trail ("span") ─
    const { byDay, maxLoad } = useMemo(() => {
        const map: Record<string, { end: any[]; span: any[] }> = {};
        const bucket = (k: string) => (map[k] ??= { end: [], span: [] });
        for (const wo of filtered) {
            const e = getEnd(wo);
            if (!e) continue;
            bucket(e).end.push(wo);
            const s = getStart(wo);
            if (s && s < e) {
                const cur = new Date(`${s}T00:00:00`);
                const stop = new Date(`${e}T00:00:00`);
                while (cur < stop) {
                    const k = fmt(cur);
                    if (k !== e) bucket(k).span.push(wo);
                    cur.setDate(cur.getDate() + 1);
                }
            }
        }
        let max = 0;
        for (const k in map) {
            const q = map[k].end.reduce((a, w) => a + (Number(w.qty) || 0), 0);
            if (q > max) max = q;
        }
        return { byDay: map, maxLoad: max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtered, endField, startField]);

    // ── XP nav button ──────────────────────────────────────────────────────
    const xpNavBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
        fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', padding: '1px 6px', cursor: 'pointer',
        background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
        border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
        color: '#000000', borderRadius: 0, ...extra,
    });

    const todayStr = fmt(new Date());
    const days: React.ReactNode[] = [];

    // Empty leading cells
    for (let i = 0; i < firstDay; i++) {
        days.push(
            classic
                ? <div key={`empty-${i}`} style={{ background: '#f0ede6', border: '1px solid #c0bdb5', minHeight: compact ? 34 : 100, opacity: 0.5 }}></div>
                : <div key={`empty-${i}`} className={`calendar-day empty bg-light border opacity-25 ${compact ? 'py-1' : ''}`}></div>
        );
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
        const isToday = todayStr === dateStr;
        const holidayName = showHolidays ? holidays[dateStr] : undefined;
        const cell = byDay[dateStr];
        const endWOs = cell?.end || [];
        const spanWOs = cell?.span || [];
        const dayQty = showLoad ? endWOs.reduce((a, w) => a + (Number(w.qty) || 0), 0) : 0;
        const loadPct = showLoad && maxLoad > 0 ? Math.max(6, Math.round((dayQty / maxLoad) * 100)) : 0;

        if (classic) {
            const bg = isToday ? '#dde8f5' : holidayName ? '#ffe9c7' : '#ffffff';
            days.push(
                <div key={day} title={holidayName || undefined}
                    style={{ background: bg, border: isToday ? '1px solid #316ac5' : '1px solid #c0bdb5', minHeight: compact ? 34 : 100, padding: compact ? '2px 3px' : '4px 5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 2 : 3 }}>
                        <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: compact ? '9px' : '10px', fontWeight: 'bold', color: holidayName ? '#994d00' : isToday ? '#0058e6' : '#333' }}>{day}</span>
                        {!compact && (showLoad
                            ? (endWOs.length > 0 && <span style={{ background: '#e8e8e8', border: '1px solid #6a6a6a', color: '#333', padding: '0 4px', fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', fontWeight: 'bold' }}>{endWOs.length} / {dayQty}</span>)
                            : (endWOs.length > 0 && <span style={{ background: '#e8e8e8', border: '1px solid #6a6a6a', color: '#333', padding: '0 4px', fontSize: '8px', fontFamily: 'Tahoma, Arial, sans-serif', fontWeight: 'bold' }}>{endWOs.length} Due</span>))}
                    </div>
                    {!compact && showLoad && loadPct > 0 && (
                        <div style={{ height: 3, background: '#d8d4cc', marginBottom: 3 }}>
                            <div style={{ height: '100%', width: `${loadPct}%`, background: statusColor('IN_PROGRESS') }}></div>
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', gap: 2, overflow: 'hidden' }}>
                        {compact ? (
                            endWOs.slice(0, 3).map((wo: any) => (
                                <div key={wo.id} title={wo.code} style={{ width: 5, height: 5, background: dotColor(wo.status), border: '1px solid rgba(0,0,0,0.2)' }}></div>
                            ))
                        ) : (<>
                            {spanWOs.slice(0, MAX_VISIBLE).map((wo: any) => (
                                <div key={`s-${wo.id}`} title={`${wo.code} (in progress)`}
                                    onClick={onMOClick ? () => onMOClick(wo.id) : undefined}
                                    style={{ height: 4, background: statusTint(wo.status).borderColor, opacity: 0.55, cursor: onMOClick ? 'pointer' : 'default' }}></div>
                            ))}
                            {endWOs.slice(0, MAX_VISIBLE).map((wo: any) => {
                                const name = getItemName(wo.item_id);
                                return (
                                    <div key={wo.id} title={`${wo.code}${name ? ': ' + name : ''}`}
                                        onClick={onMOClick ? () => onMOClick(wo.id) : undefined}
                                        style={{ ...chipStyle(wo.status), padding: '1px 4px', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: onMOClick ? 'pointer' : 'default' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '8px', lineHeight: 1.2 }}>{wo.code}</div>
                                        {name && <div style={{ fontSize: '9px', lineHeight: 1.2 }}>{name}</div>}
                                    </div>
                                );
                            })}
                        </>)}
                        {compact && endWOs.length > 3 && <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '8px', color: '#666' }}>+</span>}
                        {!compact && endWOs.length > MAX_VISIBLE && (
                            <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '8px', color: '#666', paddingLeft: 2 }}>+{endWOs.length - MAX_VISIBLE} more</span>
                        )}
                    </div>
                </div>
            );
        } else {
            const bgCls = isToday ? 'bg-primary bg-opacity-10 border-primary' : holidayName ? 'bg-warning bg-opacity-10' : 'bg-white';
            days.push(
                <div key={day} className={`calendar-day border p-1 ${bgCls}`} style={{ minHeight: compact ? '40px' : '120px' }} title={holidayName || undefined}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className={`fw-bold ${compact ? 'extra-small' : 'small'} ${holidayName ? 'text-warning' : isToday ? 'text-primary' : 'text-muted'}`} style={{ fontSize: compact ? '0.6rem' : 'inherit' }}>{day}</span>
                        {!compact && endWOs.length > 0 && <span className="badge bg-secondary text-white" style={{ fontSize: '0.6rem' }}>{showLoad ? `${endWOs.length} / ${dayQty}` : `${endWOs.length} Due`}</span>}
                    </div>
                    {!compact && showLoad && loadPct > 0 && (
                        <div className="mb-1" style={{ height: 3, background: '#e5e7eb' }}>
                            <div style={{ height: '100%', width: `${loadPct}%`, background: statusColor('IN_PROGRESS') }}></div>
                        </div>
                    )}
                    <div className={`d-flex ${compact ? 'flex-row justify-content-center' : 'flex-column'} gap-1 overflow-hidden`}>
                        {compact ? (
                            endWOs.slice(0, 3).map((wo: any) => (
                                <div key={wo.id} className="rounded-circle" style={{ width: '4px', height: '4px', background: dotColor(wo.status) }} title={wo.code}></div>
                            ))
                        ) : (<>
                            {spanWOs.slice(0, MAX_VISIBLE).map((wo: any) => (
                                <div key={`s-${wo.id}`} title={`${wo.code} (in progress)`}
                                    onClick={onMOClick ? () => onMOClick(wo.id) : undefined}
                                    style={{ height: 4, borderRadius: 2, background: statusTint(wo.status).borderColor, opacity: 0.55, cursor: onMOClick ? 'pointer' : 'default' }}></div>
                            ))}
                            {endWOs.slice(0, MAX_VISIBLE).map((wo: any) => {
                                const name = getItemName(wo.item_id);
                                return (
                                    <div key={wo.id} className="badge text-start fw-normal text-truncate w-100 p-1"
                                        style={{ ...chipStyle(wo.status), cursor: onMOClick ? 'pointer' : 'default' }}
                                        title={`${wo.code}${name ? ': ' + name : ''}`}
                                        onClick={onMOClick ? () => onMOClick(wo.id) : undefined}>
                                        <div style={{ fontSize: '0.65rem', lineHeight: '1.1' }}>{wo.code}</div>
                                        {name && <div style={{ fontSize: '0.7rem' }}>{name}</div>}
                                    </div>
                                );
                            })}
                        </>)}
                        {compact && endWOs.length > 3 && <div className="text-muted" style={{ fontSize: '0.5rem' }}>+</div>}
                        {!compact && endWOs.length > MAX_VISIBLE && (
                            <div className="text-muted" style={{ fontSize: '0.6rem' }}>+{endWOs.length - MAX_VISIBLE} more</div>
                        )}
                    </div>
                </div>
            );
        }
    }

    // ── Filter bar ─────────────────────────────────────────────────────────
    const toggleStatus = (s: string) => setStatusFilter(prev => {
        const next = new Set(prev);
        next.has(s) ? next.delete(s) : next.add(s);
        return next;
    });

    const filterBar = filterable && !compact && (
        classic ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }} className="no-print">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
                    style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', padding: '2px 6px', border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080', borderRadius: 0, width: 160 }} />
                {statusOptions.map(s => {
                    const on = statusFilter.has(s);
                    const c = statusTint(s);
                    return (
                        <button key={s} onClick={() => toggleStatus(s)}
                            style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '9px', fontWeight: 'bold', padding: '1px 6px', cursor: 'pointer', borderRadius: 0, border: '1px solid', background: on ? c.background : '#f0ede6', borderColor: on ? c.borderColor : '#c0bdb5', color: on ? c.color : '#888' }}>
                            {s.replace(/_/g, ' ')}
                        </button>
                    );
                })}
                {(statusFilter.size > 0 || search) && (
                    <button onClick={() => { setStatusFilter(new Set()); setSearch(''); }} style={xpNavBtn()}>Clear</button>
                )}
            </div>
        ) : (
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2 no-print">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="form-control form-control-sm" style={{ width: 180 }} />
                {statusOptions.map(s => (
                    <button key={s} onClick={() => toggleStatus(s)} className={`btn btn-sm ${statusFilter.has(s) ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ fontSize: '0.7rem' }}>
                        {s.replace(/_/g, ' ')}
                    </button>
                ))}
                {(statusFilter.size > 0 || search) && (
                    <button onClick={() => { setStatusFilter(new Set()); setSearch(''); }} className="btn btn-sm btn-light border">Clear</button>
                )}
            </div>
        )
    );

    // ── Classic render ───────────────────────────────────────────────────────
    if (classic) {
        const xpBevel: React.CSSProperties = {
            border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
            boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0,
        };
        return (
            <div className={`fade-in ${compact ? 'compact-calendar' : ''}`}>
                {filterBar}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }} className="no-print">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button style={xpNavBtn()} onClick={prevMonth}><i className="bi bi-chevron-left"></i></button>
                        {!compact && <button style={xpNavBtn({ padding: '1px 8px' })} onClick={goToToday}>Today</button>}
                        <button style={xpNavBtn()} onClick={nextMonth}><i className="bi bi-chevron-right"></i></button>
                        <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: compact ? '11px' : '12px', fontWeight: 'bold', color: '#0058e6', marginLeft: 4 }}>
                            {currentDate.toLocaleDateString(undefined, { month: compact ? 'short' : 'long', year: 'numeric' })}
                        </span>
                    </div>
                </div>
                <div style={xpBevel}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                            <div key={i} style={{ textAlign: 'center', padding: compact ? '2px 0' : '3px 0', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', fontWeight: 'bold', color: '#000', borderRight: i < 6 ? '1px solid #b0aaa0' : 'none' }}>{d}</div>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#808080', gap: '1px' }}>{days}</div>
                </div>
            </div>
        );
    }

    // ── Modern render ──────────────────────────────────────────────────────
    return (
        <div className={`fade-in ${compact ? 'compact-calendar' : ''}`}>
            {filterBar}
            <div className="d-flex justify-content-between align-items-center mb-2 no-print">
                <div className="d-flex align-items-center gap-2">
                    <div className="btn-group">
                        <button className="btn btn-xs btn-light border p-1" style={{ fontSize: '0.6rem' }} onClick={prevMonth}><i className="bi bi-chevron-left"></i></button>
                        {compact ? null : <button className="btn btn-sm btn-light border" onClick={goToToday}>Today</button>}
                        <button className="btn btn-xs btn-light border p-1" style={{ fontSize: '0.6rem' }} onClick={nextMonth}><i className="bi bi-chevron-right"></i></button>
                    </div>
                    <span className={`fw-bold text-primary ${compact ? 'small' : ''}`}>
                        {currentDate.toLocaleDateString(undefined, { month: compact ? 'short' : 'long', year: 'numeric' })}
                    </span>
                </div>
            </div>
            <div className="card border-0 shadow-sm overflow-hidden">
                <div className="card-body p-0">
                    <div className="d-grid text-center bg-light border-bottom" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                            <div key={d} className="py-1 fw-bold text-muted" style={{ fontSize: '0.6rem' }}>{d}</div>
                        ))}
                    </div>
                    <div className="d-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#e5e7eb', gap: '1px' }}>{days}</div>
                </div>
            </div>
        </div>
    );
}
