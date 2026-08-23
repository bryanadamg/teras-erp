import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { statusColor, statusTint, xpFont, CHIP_RADIUS } from './xpTheme';
import { xpBevel as sharedXpBevel, SearchField, FilterChipBar } from './shellTheme';
import { lvThead } from './listViewTheme';

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

    // ── Build per-day index: deadline chips, keyed on the deadline day ─────────
    const { byDay, maxLoad } = useMemo(() => {
        const map: Record<string, any[]> = {};
        for (const wo of filtered) {
            const e = getEnd(wo);
            if (!e) continue;
            (map[e] ??= []).push(wo);
        }
        let max = 0;
        for (const k in map) {
            const q = map[k].reduce((a, w) => a + (Number(w.qty) || 0), 0);
            if (q > max) max = q;
        }
        return { byDay: map, maxLoad: max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtered, endField]);

    // ── XP nav button ──────────────────────────────────────────────────────
    const xpNavBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
        fontFamily: xpFont, fontSize: '10px', padding: '1px 6px', cursor: 'pointer',
        background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
        border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
        color: '#000000', borderRadius: 0, ...extra,
    });

    const todayStr = fmt(new Date());
    const days: React.ReactNode[] = [];

    // Empty leading cells — recede quietly (light diagonal hatch), not a heavy slab.
    const emptyHatch = 'repeating-linear-gradient(45deg, #f7f5f0, #f7f5f0 6px, #f1eee7 6px, #f1eee7 12px)';
    for (let i = 0; i < firstDay; i++) {
        days.push(
            classic
                ? <div key={`empty-${i}`} style={{ background: emptyHatch, border: '1px solid #d8d4cc', minHeight: compact ? 34 : 100 }}></div>
                : <div key={`empty-${i}`} className={`calendar-day empty border ${compact ? 'py-1' : ''}`} style={{ background: emptyHatch }}></div>
        );
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
        const isToday = todayStr === dateStr;
        const holidayName = showHolidays ? holidays[dateStr] : undefined;
        const endWOs = byDay[dateStr] || [];
        const dayQty = showLoad ? endWOs.reduce((a: number, w: any) => a + (Number(w.qty) || 0), 0) : 0;
        const loadPct = showLoad && maxLoad > 0 ? Math.max(8, Math.round((dayQty / maxLoad) * 100)) : 0;

        if (classic) {
            const bg = isToday ? '#dde8f5' : holidayName ? '#ffe9c7' : '#ffffff';
            days.push(
                <div key={day} title={holidayName || undefined}
                    style={{ background: bg, border: isToday ? '1px solid #316ac5' : '1px solid #c0bdb5', minHeight: compact ? 34 : 100, padding: compact ? '2px 3px' : '4px 6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 2 : 4, minHeight: compact ? undefined : 14 }}>
                        <span style={{ fontFamily: xpFont, fontSize: compact ? '9px' : '11px', fontWeight: 'bold', color: holidayName ? '#994d00' : isToday ? '#0058e6' : '#555' }}>{day}</span>
                        {!compact && endWOs.length > 0 && (
                            <span title={showLoad ? `${endWOs.length} MO · qty ${dayQty}` : `${endWOs.length} due`}
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {showLoad && maxLoad > 0 && (
                                    <span style={{ display: 'inline-block', width: 22, height: 4, background: '#e2ddd2' }}>
                                        <span style={{ display: 'block', height: '100%', width: `${loadPct}%`, background: statusColor('IN_PROGRESS') }}></span>
                                    </span>
                                )}
                                <span style={{ fontFamily: xpFont, fontSize: '9px', fontWeight: 'bold', color: '#888' }}>{endWOs.length}</span>
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', gap: compact ? 2 : 3, overflow: 'hidden' }}>
                        {compact ? (
                            endWOs.slice(0, 3).map((wo: any) => (
                                <div key={wo.id} title={wo.code} style={{ width: 5, height: 5, background: dotColor(wo.status), border: '1px solid rgba(0,0,0,0.2)' }}></div>
                            ))
                        ) : (
                            endWOs.slice(0, MAX_VISIBLE).map((wo: any) => {
                                const name = getItemName(wo.item_id);
                                return (
                                    <div key={wo.id} title={`${wo.code}${name ? ': ' + name : ''}`}
                                        onClick={onMOClick ? () => onMOClick(wo.id) : undefined}
                                        style={{ ...chipStyle(wo.status), padding: '2px 5px', fontFamily: xpFont, overflow: 'hidden', cursor: onMOClick ? 'pointer' : 'default' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '9px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.code}</div>
                                        {name && <div style={{ fontSize: '9px', lineHeight: 1.3, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>}
                                    </div>
                                );
                            })
                        )}
                        {compact && endWOs.length > 3 && <span style={{ fontFamily: xpFont, fontSize: '8px', color: '#666' }}>+</span>}
                        {!compact && endWOs.length > MAX_VISIBLE && (
                            <span style={{ fontFamily: xpFont, fontSize: '9px', color: '#888', paddingLeft: 2 }}>+{endWOs.length - MAX_VISIBLE} more</span>
                        )}
                    </div>
                </div>
            );
        } else {
            const bgCls = isToday ? 'bg-primary bg-opacity-10 border-primary' : holidayName ? 'bg-warning bg-opacity-10' : 'bg-white';
            days.push(
                <div key={day} className={`calendar-day border p-1 ${bgCls}`} style={{ minHeight: compact ? '40px' : '120px' }} title={holidayName || undefined}>
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: compact ? undefined : 16 }}>
                        <span className={`fw-bold ${compact ? 'extra-small' : 'small'} ${holidayName ? 'text-warning' : isToday ? 'text-primary' : 'text-secondary'}`} style={{ fontSize: compact ? '0.6rem' : 'inherit' }}>{day}</span>
                        {!compact && endWOs.length > 0 && (
                            <span className="d-flex align-items-center gap-1" title={showLoad ? `${endWOs.length} MO · qty ${dayQty}` : `${endWOs.length} due`}>
                                {showLoad && maxLoad > 0 && (
                                    <span style={{ display: 'inline-block', width: 22, height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                                        <span style={{ display: 'block', height: '100%', width: `${loadPct}%`, background: statusColor('IN_PROGRESS'), borderRadius: 2 }}></span>
                                    </span>
                                )}
                                <span className="text-muted fw-bold" style={{ fontSize: '0.6rem' }}>{endWOs.length}</span>
                            </span>
                        )}
                    </div>
                    <div className={`d-flex ${compact ? 'flex-row justify-content-center' : 'flex-column'} gap-1 overflow-hidden`}>
                        {compact ? (
                            endWOs.slice(0, 3).map((wo: any) => (
                                <div key={wo.id} className="rounded-circle" style={{ width: '4px', height: '4px', background: dotColor(wo.status) }} title={wo.code}></div>
                            ))
                        ) : (
                            endWOs.slice(0, MAX_VISIBLE).map((wo: any) => {
                                const name = getItemName(wo.item_id);
                                return (
                                    <div key={wo.id} className="text-start text-truncate w-100"
                                        style={{ ...chipStyle(wo.status), borderRadius: CHIP_RADIUS, padding: '2px 6px', cursor: onMOClick ? 'pointer' : 'default' }}
                                        title={`${wo.code}${name ? ': ' + name : ''}`}
                                        onClick={onMOClick ? () => onMOClick(wo.id) : undefined}>
                                        <div className="text-truncate fw-bold" style={{ fontSize: '0.65rem', lineHeight: '1.3' }}>{wo.code}</div>
                                        {name && <div className="text-truncate" style={{ fontSize: '0.68rem', lineHeight: '1.3', opacity: 0.8 }}>{name}</div>}
                                    </div>
                                );
                            })
                        )}
                        {compact && endWOs.length > 3 && <div className="text-muted" style={{ fontSize: '0.5rem' }}>+</div>}
                        {!compact && endWOs.length > MAX_VISIBLE && (
                            <div className="text-muted" style={{ fontSize: '0.65rem' }}>+{endWOs.length - MAX_VISIBLE} more</div>
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

    // Multi-select status bar: `statusFilter` is a Set, so the segmented bar gets
    // the whole selection and `toggleStatus` does the add/remove.
    const filterBar = filterable && !compact && (
        <div
            className={classic ? 'no-print' : 'd-flex flex-wrap align-items-center gap-2 mb-2 no-print'}
            style={classic ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 } : undefined}
        >
            <SearchField classic={classic} value={search} onChange={setSearch} placeholder="Search" width={classic ? 160 : 180} />
            <FilterChipBar
                classic={classic}
                options={statusOptions.map(s => ({ value: s, label: s.replace(/_/g, ' ') }))}
                value={Array.from(statusFilter)}
                onChange={toggleStatus}
            />
            {(statusFilter.size > 0 || search) && (
                <button
                    onClick={() => { setStatusFilter(new Set()); setSearch(''); }}
                    style={classic ? xpNavBtn() : undefined}
                    className={classic ? undefined : 'btn btn-sm btn-light border'}
                >Clear</button>
            )}
        </div>
    );

    // ── Classic render ───────────────────────────────────────────────────────
    if (classic) {
        const xpBevel: React.CSSProperties = sharedXpBevel();
        return (
            <div className={`fade-in ${compact ? 'compact-calendar' : ''}`}>
                {filterBar}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }} className="no-print">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button style={xpNavBtn()} onClick={prevMonth}><i className="bi bi-chevron-left"></i></button>
                        {!compact && <button style={xpNavBtn({ padding: '1px 8px' })} onClick={goToToday}>Today</button>}
                        <button style={xpNavBtn()} onClick={nextMonth}><i className="bi bi-chevron-right"></i></button>
                        <span style={{ fontFamily: xpFont, fontSize: compact ? '11px' : '12px', fontWeight: 'bold', color: '#0058e6', marginLeft: 4 }}>
                            {currentDate.toLocaleDateString(undefined, { month: compact ? 'short' : 'long', year: 'numeric' })}
                        </span>
                    </div>
                </div>
                <div style={xpBevel}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', ...lvThead(true) }}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                            <div key={i} style={{ textAlign: 'center', padding: compact ? '2px 0' : '3px 0', fontFamily: xpFont, fontSize: '10px', fontWeight: 'bold', color: '#000', borderRight: i < 6 ? '1px solid #b0aaa0' : 'none' }}>{d}</div>
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
