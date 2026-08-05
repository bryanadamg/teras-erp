'use client';
// Machine Output report — what each machine (or work-center group) produced in a
// date range, read from the WO completion log. Self-fetching like ReportsView:
// it pulls authFetch/workCenters from DataContext and queries
// /reports/machine-output with server-side filters + aggregation.
//
// Output is pegged to the machine through the WORK ORDER server-side; the operator's
// own completion work_center_id is only the fallback for MO-level logs.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useData } from '../../context/DataContext';
import {
    xpFont, xpBtn, xpInput, xpSep, XPLoading, XPEmptyState,
    useSortable, SortMark, workCenterChipStyle, StatusChip, SunkenPanel, ProgressBar,
} from '../shared/xpTheme';
import TreeSelect, { TreeSelectOption } from '../shared/TreeSelect';
import { childrenOfWC, isMachineWC, isTypeWC } from '../shared/workCenterTree';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar, xpToolbar as sharedXpToolbar } from '../shared/shellTheme';

const fmtQty = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// UOMs differ per item, so a row total is only meaningful when its items agree.
const uomOf = (row: any): string => {
    const set = new Set((row.items || []).map((i: any) => i.uom).filter(Boolean));
    if (set.size === 1) return String([...set][0]);
    return set.size === 0 ? '' : 'mixed';
};

export default function MachineOutputReportView() {
    const { t } = useLanguage();
    const { uiStyle } = useTheme();
    const { formatDate: tzDate, formatTime: tzTime } = useTimezone();
    const { authFetch, workCenters = [] } = useData();
    const classic = uiStyle === 'classic';

    const API_BASE = useMemo(() => {
        const env = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
        return env.replace(/\/api$/, '') + '/api';
    }, []);

    // Filters — default to the trailing 7 days (a shift report, not all-time).
    const [startDate, setStartDate] = useState(() => {
        const s = new Date(); s.setDate(s.getDate() - 6); return fmtDate(s);
    });
    const [endDate, setEndDate] = useState(() => fmtDate(new Date()));
    const [scope, setScope] = useState('');            // '' | 'grp:<id>' | 'wc:<id>'
    const [groupBy, setGroupBy] = useState<'machine' | 'group'>('machine');
    const [hideIdle, setHideIdle] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const [rows, setRows] = useState<any[]>([]);
    const [totals, setTotals] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const p = new URLSearchParams();
            if (startDate) p.set('start_date', startDate);
            if (endDate) p.set('end_date', `${endDate}T23:59:59`);
            if (scope.startsWith('wc:')) p.set('work_center_id', scope.slice(3));
            else if (scope.startsWith('grp:')) p.set('group_id', scope.slice(4));
            p.set('group_by', groupBy);
            p.set('include_idle', hideIdle ? 'false' : 'true');

            const res = await authFetch(`${API_BASE}/reports/machine-output?${p.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRows(data.rows || []);
            setTotals(data.totals || {});
        } catch (e: any) {
            setError(e.message || 'Failed to load report');
            setRows([]);
            setTotals({});
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authFetch, startDate, endDate, scope, groupBy, hideIdle]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    // Mirrors the 3-level work-center tree: TYPE > GROUP > machine. A `grp:` value is
    // any container (type or group) — the backend resolves its whole subtree.
    const wcTreeOptions = useMemo((): TreeSelectOption[] => {
        const nodeOption = (node: any): TreeSelectOption => {
            const kids = childrenOfWC(workCenters, node.id);
            return {
                value: `grp:${node.id}`,
                label: node.name,
                subLabel: node.code,
                selectable: true,
                children: kids.length > 0
                    ? kids.map((k: any) => isMachineWC(k)
                        ? { value: `wc:${k.id}`, label: k.name, subLabel: k.code, selectable: true }
                        : nodeOption(k))
                    : undefined,
            };
        };
        const out: TreeSelectOption[] = (workCenters || []).filter((wc: any) => isTypeWC(wc)).map(nodeOption);
        // Nodes whose parent row isn't loaded — keep them reachable.
        const known = new Set((workCenters || []).map((wc: any) => String(wc.id)));
        (workCenters || [])
            .filter((wc: any) => wc.parent_id && !known.has(String(wc.parent_id)))
            .forEach((wc: any) => out.push(isMachineWC(wc)
                ? { value: `wc:${wc.id}`, label: wc.name, subLabel: wc.code, selectable: true }
                : nodeOption(wc)));
        return out;
    }, [workCenters]);

    const sortCols = useMemo(() => ({
        name:   (r: any) => r.work_center_name || '',
        output: (r: any) => r.qty_good || 0,
        scrap:  (r: any) => r.qty_rejected || 0,
        yield:  (r: any) => (r.yield_pct ?? -1),
        wos:    (r: any) => r.wo_count || 0,
        logs:   (r: any) => r.logs || 0,
        last:   (r: any) => r.last_log || '',
    }), []);
    const { sorted, sort, toggle } = useSortable(rows, sortCols);

    const applyPreset = (kind: 'today' | 'yesterday' | '7d' | '30d' | 'month') => {
        const now = new Date();
        if (kind === 'yesterday') {
            const d = new Date(now); d.setDate(d.getDate() - 1);
            setStartDate(fmtDate(d)); setEndDate(fmtDate(d)); return;
        }
        const end = fmtDate(now);
        let start = end;
        if (kind === '7d') { const s = new Date(now); s.setDate(s.getDate() - 6); start = fmtDate(s); }
        else if (kind === '30d') { const s = new Date(now); s.setDate(s.getDate() - 29); start = fmtDate(s); }
        else if (kind === 'month') { start = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)); }
        setStartDate(start); setEndDate(end);
    };

    const periodLabel = `${startDate || 'All time'} → ${endDate || 'now'}`;
    const maxOutput = useMemo(() => Math.max(1, ...rows.map((r: any) => r.qty_good || 0)), [rows]);
    const isGroupMode = groupBy === 'group';

    const exportCsv = () => {
        const head = [
            isGroupMode ? 'Group' : 'Machine', 'Code', isGroupMode ? 'Machines' : 'Group',
            'Type', 'Work Orders', 'Logs', 'Output', 'UOM', 'Scrap', 'Yield %', 'Last log',
        ];
        const body = sorted.map((r: any) => [
            r.work_center_name || '', r.work_center_code || '',
            isGroupMode ? String(r.machine_count ?? '') : (r.group_name || r.type_name || ''),
            r.center_type || '', r.wo_count ?? 0, r.logs ?? 0,
            r.qty_good ?? 0, uomOf(r), r.qty_rejected ?? 0,
            r.yield_pct ?? '', r.last_log || '',
        ]);
        const csv = [head, ...body]
            .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `machine-output_${startDate || 'all'}_${endDate || 'now'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Expanded detail (shared by both themes) ──────────────────────────────
    const detailPanel = (r: any) => {
        const dth: React.CSSProperties = {
            fontSize: 10, fontWeight: 'bold', textAlign: 'left', padding: '2px 6px',
            borderBottom: '1px solid #b0a898', color: '#333', whiteSpace: 'nowrap',
        };
        const dtd: React.CSSProperties = { fontSize: 10, padding: '2px 6px', borderBottom: '1px solid #e6e2d8' };
        const block = (title: string, body: React.ReactNode) => (
            <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                    {title}
                </div>
                <div style={{ background: classic ? '#fff' : '#fff', border: classic ? '1px solid #a8a292' : '1px solid #dee2e6', maxHeight: 220, overflowY: 'auto' }}>
                    {body}
                </div>
            </div>
        );

        const itemsTable = (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: xpFont }}>
                <thead><tr>
                    <th style={dth}>Item</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Output</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Scrap</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Logs</th>
                </tr></thead>
                <tbody>
                    {(r.items || []).length === 0 ? (
                        <tr><td style={{ ...dtd, color: '#999' }} colSpan={4}>No output logged</td></tr>
                    ) : r.items.map((it: any) => (
                        <tr key={String(it.item_id)}>
                            <td style={dtd}>
                                <div style={{ fontWeight: 'bold' }}>{it.item_name || '(unknown item)'}</div>
                                <div style={{ fontSize: 9, color: '#777' }}>{it.item_code}</div>
                            </td>
                            <td style={{ ...dtd, textAlign: 'right', fontWeight: 'bold', color: '#1a5e1a' }}>{fmtQty(it.qty_good)} <span style={{ color: '#888', fontWeight: 'normal' }}>{it.uom}</span></td>
                            <td style={{ ...dtd, textAlign: 'right', color: it.qty_rejected ? '#c00000' : '#aaa' }}>{fmtQty(it.qty_rejected)}</td>
                            <td style={{ ...dtd, textAlign: 'right' }}>{it.logs}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );

        const wosTable = (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: xpFont }}>
                <thead><tr>
                    <th style={dth}>Work Order</th>
                    <th style={dth}>Item</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Output</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Scrap</th>
                    <th style={dth}>Last log</th>
                </tr></thead>
                <tbody>
                    {(r.work_orders || []).length === 0 ? (
                        <tr><td style={{ ...dtd, color: '#999' }} colSpan={5}>No work order activity</td></tr>
                    ) : r.work_orders.map((w: any, i: number) => (
                        <tr key={`${w.work_order_id || 'nowo'}-${w.mo_code}-${i}`}>
                            <td style={dtd}>
                                <div style={{ fontWeight: 'bold' }}>{w.wo_code || '(MO-level log)'}</div>
                                <div style={{ fontSize: 9, color: '#777' }}>{w.wo_name || ''}{w.mo_code ? ` · ${w.mo_code}` : ''}</div>
                            </td>
                            <td style={dtd}>{w.item_code || w.item_name || '-'}</td>
                            <td style={{ ...dtd, textAlign: 'right', fontWeight: 'bold' }}>{fmtQty(w.qty_good)} <span style={{ color: '#888', fontWeight: 'normal' }}>{w.uom}</span></td>
                            <td style={{ ...dtd, textAlign: 'right', color: w.qty_rejected ? '#c00000' : '#aaa' }}>{fmtQty(w.qty_rejected)}</td>
                            <td style={dtd}>
                                {w.wo_status && <StatusChip status={w.wo_status} tint />}
                                <div style={{ fontSize: 9, color: '#777' }}>{w.last_log ? `${tzDate(w.last_log)} ${tzTime(w.last_log)}` : '-'}</div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );

        const machinesTable = (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: xpFont }}>
                <thead><tr>
                    <th style={dth}>Machine</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Output</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Scrap</th>
                    <th style={{ ...dth, textAlign: 'right' }}>WOs</th>
                </tr></thead>
                <tbody>
                    {(r.machines || []).map((m: any) => (
                        <tr key={m.work_center_id}>
                            <td style={dtd}>
                                <div style={{ fontWeight: 'bold' }}>{m.work_center_name}</div>
                                <div style={{ fontSize: 9, color: '#777' }}>{m.work_center_code}</div>
                            </td>
                            <td style={{ ...dtd, textAlign: 'right', fontWeight: 'bold', color: '#1a5e1a' }}>{fmtQty(m.qty_good)}</td>
                            <td style={{ ...dtd, textAlign: 'right', color: m.qty_rejected ? '#c00000' : '#aaa' }}>{fmtQty(m.qty_rejected)}</td>
                            <td style={{ ...dtd, textAlign: 'right' }}>{m.wo_count}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );

        return (
            <SunkenPanel classic={classic} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {block('By item', itemsTable)}
                {isGroupMode && block(`Machines (${(r.machines || []).length})`, machinesTable)}
                {block('Work orders', wosTable)}
            </SunkenPanel>
        );
    };

    const emptyMessage = rows.length === 0
        ? (hideIdle ? 'No production logged in this period' : 'No machines in scope')
        : '';

    // ── Classic (XP) ─────────────────────────────────────────────────────────
    if (classic) {
        const toolbar: React.CSSProperties = sharedXpToolbar({ padding: '4px 6px', gap: '5px', flexWrap: 'nowrap', overflowX: 'auto' });
        const toolbarTop: React.CSSProperties = { ...toolbar, borderBottom: 'none', paddingBottom: 0 };
        const th: React.CSSProperties = {
            background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
            fontSize: '10px', fontWeight: 'bold', color: '#000', fontFamily: xpFont, padding: '3px 8px',
            position: 'sticky', top: 0, textAlign: 'left', borderRight: '1px solid #b0a898',
        };
        const td: React.CSSProperties = { padding: '4px 8px', fontFamily: xpFont, borderRight: '1px solid #e0ddd3', fontSize: 11 };
        const lbl: React.CSSProperties = { fontFamily: xpFont, fontSize: '11px', color: '#444' };
        const modeBtn = (val: 'machine' | 'group', text: string): React.CSSProperties => ({
            ...xpBtn({ fontSize: '10px', padding: '1px 8px' }),
            ...(groupBy === val ? { background: '#0058e6', color: '#fff', fontWeight: 'bold', borderColor: '#003080' } : {}),
        });
        const statTile = (label: string, value: string, color: string) => (
            <div style={{
                flex: 1, minWidth: 96, background: '#ffffff',
                border: '1px solid', borderColor: '#808080 #ffffff #ffffff #808080',
                padding: '1px 8px', fontFamily: xpFont,
                display: 'flex', alignItems: 'baseline', gap: 6,
            }}>
                <span style={{ fontSize: 9, color: '#777', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 'bold', color, marginLeft: 'auto' }}>{value}</span>
            </div>
        );

        return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
                <div style={sharedXpBevel({ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 })}>
                    <div style={sharedXpTitleBar()}>
                        <span><i className="bi bi-cpu" style={{ marginRight: 6 }} />Machine Output Report</span>
                        <span style={{ fontSize: '10px', opacity: 0.85 }}>{periodLabel}</span>
                    </div>

                    {/* Line 1: scope + mode */}
                    <div style={toolbarTop}>
                        <span style={lbl}>Work center:</span>
                        <TreeSelect
                            options={wcTreeOptions}
                            value={scope}
                            onChange={setScope}
                            allowEmpty
                            emptyLabel="All Work Centres"
                            style={{ width: 220 }}
                        />
                        <div style={xpSep} />
                        <span style={lbl}>View:</span>
                        <div style={{ display: 'flex' }}>
                            <button style={modeBtn('machine', 'Per machine')} onClick={() => setGroupBy('machine')}>Per Machine</button>
                            <button style={modeBtn('group', 'Per group')} onClick={() => setGroupBy('group')}>Per Group</button>
                        </div>
                        <div style={xpSep} />
                        <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={hideIdle} onChange={e => setHideIdle(e.target.checked)} />
                            Hide machines with no output
                        </label>
                        <div style={{ flex: 1 }} />
                    </div>

                    {/* Line 2: date range + actions */}
                    <div style={toolbar}>
                        <span style={lbl}>{t('from')}:</span>
                        <input type="date" style={xpInput({ width: 122 })} value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span style={lbl}>{t('to')}:</span>
                        <input type="date" style={xpInput({ width: 122 })} value={endDate} onChange={e => setEndDate(e.target.value)} />
                        <div style={{ display: 'flex' }}>
                            <button style={xpBtn({ fontSize: '10px', padding: '1px 7px' })} onClick={() => applyPreset('today')}>Today</button>
                            <button style={xpBtn({ fontSize: '10px', padding: '1px 7px' })} onClick={() => applyPreset('yesterday')}>Yesterday</button>
                            <button style={xpBtn({ fontSize: '10px', padding: '1px 7px' })} onClick={() => applyPreset('7d')}>7d</button>
                            <button style={xpBtn({ fontSize: '10px', padding: '1px 7px' })} onClick={() => applyPreset('30d')}>30d</button>
                            <button style={xpBtn({ fontSize: '10px', padding: '1px 7px' })} onClick={() => applyPreset('month')}>Month</button>
                        </div>
                        <div style={{ flex: 1 }} />
                        <button style={xpBtn({ padding: '1px 6px' })} onClick={fetchReport} title="Refresh"><i className="bi bi-arrow-clockwise" /></button>
                        <button style={xpBtn({ padding: '1px 6px' })} onClick={exportCsv} disabled={!rows.length} title="Export CSV"><i className="bi bi-filetype-csv" /></button>
                    </div>

                    {/* Summary strip */}
                    <div style={{ display: 'flex', gap: 5, padding: '3px 6px', background: '#ece9d8', borderBottom: '1px solid #b0a898' }}>
                        {statTile('Output', fmtQty(totals.qty_good || 0), '#1a5e1a')}
                        {statTile('Scrap', fmtQty(totals.qty_rejected || 0), '#c00000')}
                        {statTile('Yield', totals.yield_pct != null ? `${totals.yield_pct}%` : '-', '#1a3d7a')}
                        {statTile('Work Orders', String(totals.wo_count || 0), '#1a3d7a')}
                        {statTile('Logs', String(totals.logs || 0), '#1a3d7a')}
                        {statTile('Machines', `${totals.active_machine_count || 0}/${totals.machine_count || 0}`, '#4a2a7a')}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', background: '#fff', minHeight: 0 }}>
                        {loading ? <XPLoading label="Loading report..." />
                        : error ? <XPEmptyState icon="bi-exclamation-triangle" message={`Could not load report — ${error}`} />
                        : sorted.length === 0 ? <XPEmptyState icon="bi-cpu" message={emptyMessage} />
                        : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...th, width: 22 }} />
                                        <th style={{ ...th, cursor: 'pointer' }} onClick={() => toggle('name')}>{isGroupMode ? 'Group' : 'Machine'}<SortMark sort={sort} colKey="name" /></th>
                                        <th style={th}>Type</th>
                                        <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggle('wos')}>WOs<SortMark sort={sort} colKey="wos" /></th>
                                        <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggle('logs')}>Logs<SortMark sort={sort} colKey="logs" /></th>
                                        <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggle('output')}>Output<SortMark sort={sort} colKey="output" /></th>
                                        <th style={{ ...th, width: 110 }}>Share</th>
                                        <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggle('scrap')}>Scrap<SortMark sort={sort} colKey="scrap" /></th>
                                        <th style={{ ...th, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggle('yield')}>Yield<SortMark sort={sort} colKey="yield" /></th>
                                        <th style={{ ...th, borderRight: 'none', cursor: 'pointer' }} onClick={() => toggle('last')}>Last log<SortMark sort={sort} colKey="last" /></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((r: any, i: number) => {
                                        const key = String(r.work_center_id);
                                        const open = expanded === key;
                                        return (
                                            <React.Fragment key={key}>
                                            <tr
                                                style={{ background: open ? '#dde8f5' : (i % 2 === 0 ? '#ffffff' : '#f5f3ee'), borderBottom: '1px solid #e0ddd3', cursor: 'pointer' }}
                                                onClick={() => setExpanded(open ? null : key)}
                                            >
                                                <td style={{ ...td, textAlign: 'center', color: '#555' }}><i className={`bi bi-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 8 }} /></td>
                                                <td style={td}>
                                                    <div style={{ fontWeight: 'bold' }}>{r.work_center_name}</div>
                                                    <div style={{ fontSize: 10, color: '#777' }}>
                                                        {r.work_center_code}
                                                        {isGroupMode
                                                            ? ` · ${r.machine_count || 0} machines`
                                                            : (r.group_name ? ` · ${r.group_name}` : (r.type_name ? ` · ${r.type_name}` : ''))}
                                                    </div>
                                                </td>
                                                <td style={td}>
                                                    {r.center_type
                                                        ? <span style={workCenterChipStyle(r.center_type, r.work_center_name)}>{r.center_type}</span>
                                                        : <span style={{ color: '#aaa', fontSize: 10 }}>-</span>}
                                                </td>
                                                <td style={{ ...td, textAlign: 'right' }}>{r.wo_count || 0}</td>
                                                <td style={{ ...td, textAlign: 'right' }}>{r.logs || 0}</td>
                                                <td style={{ ...td, textAlign: 'right', fontWeight: 'bold', color: r.qty_good ? '#1a5e1a' : '#999' }}>
                                                    {fmtQty(r.qty_good)}
                                                    <span style={{ fontWeight: 'normal', fontSize: 10, color: '#888', marginLeft: 3 }}>{uomOf(r)}</span>
                                                </td>
                                                <td style={td}><ProgressBar pct={(r.qty_good / maxOutput) * 100} tone="blue" height={8} /></td>
                                                <td style={{ ...td, textAlign: 'right', color: r.qty_rejected ? '#c00000' : '#aaa' }}>{fmtQty(r.qty_rejected)}</td>
                                                <td style={{ ...td, textAlign: 'right' }}>{r.yield_pct != null ? `${r.yield_pct}%` : '-'}</td>
                                                <td style={{ ...td, borderRight: 'none', whiteSpace: 'nowrap' }}>
                                                    {r.last_log
                                                        ? <><div>{tzDate(r.last_log)}</div><div style={{ fontSize: 10, color: '#777' }}>{tzTime(r.last_log)}</div></>
                                                        : <span style={{ color: '#aaa', fontSize: 10 }}>no activity</span>}
                                                </td>
                                            </tr>
                                            {open && (
                                                <tr style={{ background: '#ece9d8' }}>
                                                    <td colSpan={10} style={{ padding: 6 }}>{detailPanel(r)}</td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Modern (Bootstrap) ───────────────────────────────────────────────────
    return (
        <div className="card fade-in border-0 shadow-sm" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
            <div className="card-header bg-white border-bottom py-3">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <div>
                        <h5 className="card-title mb-0">Machine Output Report</h5>
                        <small className="text-muted">Work order output per machine · {periodLabel}</small>
                    </div>
                    <div className="d-flex gap-1">
                        <button className="btn btn-outline-secondary btn-sm" onClick={fetchReport} title="Refresh"><i className="bi bi-arrow-clockwise" /></button>
                        <button className="btn btn-outline-primary btn-sm" onClick={exportCsv} disabled={!rows.length}><i className="bi bi-filetype-csv me-1" />CSV</button>
                    </div>
                </div>
                <div className="row g-2 align-items-center">
                    <div className="col-md-4">
                        <TreeSelect
                            options={wcTreeOptions}
                            value={scope}
                            onChange={setScope}
                            allowEmpty
                            emptyLabel="All Work Centres"
                            size="sm"
                        />
                    </div>
                    <div className="col-md-3">
                        <div className="btn-group w-100" role="group">
                            <button className={`btn btn-sm ${groupBy === 'machine' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGroupBy('machine')}>Per Machine</button>
                            <button className={`btn btn-sm ${groupBy === 'group' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGroupBy('group')}>Per Group</button>
                        </div>
                    </div>
                    <div className="col-md-5">
                        <div className="form-check form-switch">
                            <input className="form-check-input" type="checkbox" id="hideIdleSwitch" checked={hideIdle} onChange={e => setHideIdle(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="hideIdleSwitch">Hide machines with no output</label>
                        </div>
                    </div>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-1 mt-2">
                    <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <input type="date" className="form-control form-control-sm me-1" style={{ width: 150 }} value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <div className="btn-group" role="group">
                        {(['today', 'yesterday', '7d', '30d', 'month'] as const).map(k => (
                            <button key={k} className="btn btn-light btn-sm border py-0" onClick={() => applyPreset(k)}>
                                {k === 'today' ? 'Today' : k === 'yesterday' ? 'Yesterday' : k === 'month' ? 'This month' : k}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="row g-0 border-bottom text-center">
                {[
                    { label: 'Output', value: fmtQty(totals.qty_good || 0), cls: 'text-success' },
                    { label: 'Scrap', value: fmtQty(totals.qty_rejected || 0), cls: 'text-danger' },
                    { label: 'Yield', value: totals.yield_pct != null ? `${totals.yield_pct}%` : '-', cls: 'text-primary' },
                    { label: 'Work Orders', value: String(totals.wo_count || 0), cls: 'text-primary' },
                    { label: 'Logs', value: String(totals.logs || 0), cls: 'text-primary' },
                    { label: 'Machines', value: `${totals.active_machine_count || 0}/${totals.machine_count || 0}`, cls: 'text-dark' },
                ].map((s, i) => (
                    <div key={s.label} className={`col py-1 d-flex align-items-baseline justify-content-center gap-2 ${i > 0 ? 'border-start' : ''}`}>
                        <span className="text-muted text-uppercase" style={{ fontSize: 10, letterSpacing: '0.5px' }}>{s.label}</span>
                        <span className={`fw-bold ${s.cls}`}>{s.value}</span>
                    </div>
                ))}
            </div>

            <div className="card-body p-0" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {loading ? <XPLoading label="Loading report..." />
                : error ? <div className="text-center py-5 text-danger"><i className="bi bi-exclamation-triangle me-2" />Could not load report — {error}</div>
                : sorted.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                        <i className="bi bi-cpu d-block fs-2 mb-2 opacity-50" />{emptyMessage}
                    </div>
                ) : (
                    <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr>
                                    <th style={{ width: 28 }} />
                                    <th style={{ cursor: 'pointer' }} onClick={() => toggle('name')}>{isGroupMode ? 'Group' : 'Machine'}<SortMark sort={sort} colKey="name" /></th>
                                    <th>Type</th>
                                    <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => toggle('wos')}>WOs<SortMark sort={sort} colKey="wos" /></th>
                                    <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => toggle('logs')}>Logs<SortMark sort={sort} colKey="logs" /></th>
                                    <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => toggle('output')}>Output<SortMark sort={sort} colKey="output" /></th>
                                    <th style={{ width: 120 }}>Share</th>
                                    <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => toggle('scrap')}>Scrap<SortMark sort={sort} colKey="scrap" /></th>
                                    <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => toggle('yield')}>Yield<SortMark sort={sort} colKey="yield" /></th>
                                    <th style={{ cursor: 'pointer' }} onClick={() => toggle('last')}>Last log<SortMark sort={sort} colKey="last" /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((r: any) => {
                                    const key = String(r.work_center_id);
                                    const open = expanded === key;
                                    return (
                                        <React.Fragment key={key}>
                                        <tr className={open ? 'table-primary' : ''} style={{ cursor: 'pointer' }} onClick={() => setExpanded(open ? null : key)}>
                                            <td className="text-center text-muted"><i className={`bi bi-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 10 }} /></td>
                                            <td>
                                                <div className="fw-medium">{r.work_center_name}</div>
                                                <div className="small text-muted">
                                                    {r.work_center_code}
                                                    {isGroupMode
                                                        ? ` · ${r.machine_count || 0} machines`
                                                        : (r.group_name ? ` · ${r.group_name}` : (r.type_name ? ` · ${r.type_name}` : ''))}
                                                </div>
                                            </td>
                                            <td>{r.center_type ? <span style={workCenterChipStyle(r.center_type, r.work_center_name)}>{r.center_type}</span> : <span className="text-muted">-</span>}</td>
                                            <td className="text-end">{r.wo_count || 0}</td>
                                            <td className="text-end">{r.logs || 0}</td>
                                            <td className={`text-end fw-bold ${r.qty_good ? 'text-success' : 'text-muted'}`}>
                                                {fmtQty(r.qty_good)} <span className="text-muted fw-normal small">{uomOf(r)}</span>
                                            </td>
                                            <td><ProgressBar pct={(r.qty_good / maxOutput) * 100} tone="blue" height={8} /></td>
                                            <td className={`text-end ${r.qty_rejected ? 'text-danger' : 'text-muted'}`}>{fmtQty(r.qty_rejected)}</td>
                                            <td className="text-end">{r.yield_pct != null ? `${r.yield_pct}%` : '-'}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {r.last_log
                                                    ? <><div className="small">{tzDate(r.last_log)}</div><div className="text-muted" style={{ fontSize: 11 }}>{tzTime(r.last_log)}</div></>
                                                    : <span className="text-muted small">no activity</span>}
                                            </td>
                                        </tr>
                                        {open && (
                                            <tr>
                                                <td colSpan={10} className="p-2 bg-body-tertiary">{detailPanel(r)}</td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
