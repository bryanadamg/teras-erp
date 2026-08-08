'use client';
// Production Output report — what was produced, how much was QC-rejected, and the
// reject % of output. Self-fetching like ReportsView: it pulls authFetch/workCenters
// from DataContext and queries the server-side aggregation endpoints.
//
// Three groupings over one source (`/reports/machine-output`):
//   machine / group — per work centre, output pegged to the machine through the
//                     WORK ORDER server-side (the operator's own completion
//                     work_center_id is only the fallback for MO-level logs)
//   wo              — the per-WO result sheet the floor asks for: hasil, QC reject
//                     and reject % per work order, filterable to finished orders
// plus a separate source (`/reports/packing-output`) for packing, which cannot be a
// grouping of the machine report: a PackingCompletion has no work centre to peg to.
//
// Every row carries its reject events (reason, operator, defect store), so the
// expanded panel answers "what was rejected and where did it go" in one place.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useData } from '../../context/DataContext';
import {
    xpFont, xpBtn, xpInput, xpSep, XPLoading, XPEmptyState,
    useSortable, SortMark, WorkCenterChip, StatusChip, SunkenPanel, ProgressBar,
} from '../shared/xpTheme';
import TreeSelect, { TreeSelectOption } from '../shared/TreeSelect';
import { childrenOfWC, isMachineWC, isTypeWC } from '../shared/workCenterTree';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar, xpToolbar as sharedXpToolbar } from '../shared/shellTheme';

const fmtQty = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
const fmtPct = (n: number | null | undefined) => (n == null ? '-' : `${n}%`);
const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// UOMs differ per item, so a row total is only meaningful when its items agree.
// A WO/packing row states its own item's uom directly.
const uomOf = (row: any): string => {
    if (row.uom) return String(row.uom);
    const set = new Set((row.items || []).map((i: any) => i.uom).filter(Boolean));
    if (set.size === 1) return String([...set][0]);
    return set.size === 0 ? '' : 'mixed';
};

// Reject % is scrap over *hasil* (good), matching the shop-floor formula, so 10
// rejected against 100 good reads 10%. Anything at or above this is worth flagging
// red rather than leaving it to the reader to spot in a column of numbers.
const REJECT_ALERT_PCT = 5;

type Mode = 'machine' | 'group' | 'wo' | 'packing';

interface ReportColumn {
    key: string;
    label: string;
    sortKey?: string;
    align?: 'left' | 'right';
    width?: number;
    /** Cell body. `classic` lets a cell pick XP vs Bootstrap typography. */
    render: (r: any, classic: boolean) => React.ReactNode;
    /** Flat value for the CSV export. */
    csv: (r: any) => string | number;
}

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
    const [mode, setMode] = useState<Mode>('machine');
    const [completedOnly, setCompletedOnly] = useState(false);
    const [rejectsOnly, setRejectsOnly] = useState(false);
    const [hideIdle, setHideIdle] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const [rows, setRows] = useState<any[]>([]);
    const [totals, setTotals] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const isGroupMode = mode === 'group';
    const isWoMode = mode === 'wo';
    const isPacking = mode === 'packing';
    const isMachineLevel = mode === 'machine' || mode === 'group';

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const p = new URLSearchParams();
            if (startDate) p.set('start_date', startDate);
            if (endDate) p.set('end_date', `${endDate}T23:59:59`);

            let url: string;
            if (mode === 'packing') {
                // Packing is its own source — no work-centre scope applies to it.
                url = `${API_BASE}/reports/packing-output?${p.toString()}`;
            } else {
                if (scope.startsWith('wc:')) p.set('work_center_id', scope.slice(3));
                else if (scope.startsWith('grp:')) p.set('group_id', scope.slice(4));
                p.set('group_by', mode);
                p.set('include_idle', hideIdle && mode !== 'wo' ? 'false' : 'true');
                if (mode === 'wo' && completedOnly) p.set('wo_status', 'COMPLETED');
                url = `${API_BASE}/reports/machine-output?${p.toString()}`;
            }

            const res = await authFetch(url);
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
    }, [API_BASE, authFetch, startDate, endDate, scope, mode, hideIdle, completedOnly]);

    useEffect(() => { fetchReport(); }, [fetchReport]);
    // Row identity differs per grouping, so a stale expanded key would open nothing.
    useEffect(() => { setExpanded(null); }, [mode]);

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

    // "Rejects only" is a client-side cut of the loaded rows, not another request —
    // the reject events already ship with every row.
    const visibleRows = useMemo(
        () => (rejectsOnly ? rows.filter((r: any) => (r.qty_rejected || 0) > 0) : rows),
        [rows, rejectsOnly],
    );

    const rowKey = useCallback((r: any): string => {
        if (isPacking) return String(r.packing_order_id);
        if (isWoMode) return String(r.work_order_id || `${r.work_center_id}:${r.mo_code}`);
        return String(r.work_center_id);
    }, [isPacking, isWoMode]);

    const sortCols = useMemo(() => ({
        name:      (r: any) => (isPacking ? r.po_code : isWoMode ? (r.wo_code || r.mo_code || '') : r.work_center_name) || '',
        item:      (r: any) => r.item_code || r.item_name || '',
        machine:   (r: any) => r.work_center_name || '',
        status:    (r: any) => r.wo_status || r.po_status || '',
        target:    (r: any) => (isPacking ? r.qty_target : r.wo_qty) || 0,
        output:    (r: any) => r.qty_good || 0,
        scrap:     (r: any) => r.qty_rejected || 0,
        rejectPct: (r: any) => (r.reject_pct ?? -1),
        yield:     (r: any) => (r.yield_pct ?? -1),
        wos:       (r: any) => r.wo_count || 0,
        logs:      (r: any) => r.logs || 0,
        last:      (r: any) => r.last_log || '',
    }), [isPacking, isWoMode]);
    const { sorted, sort, toggle } = useSortable(visibleRows, sortCols);

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
    const maxOutput = useMemo(() => Math.max(1, ...visibleRows.map((r: any) => r.qty_good || 0)), [visibleRows]);

    // ── Cell fragments shared by both themes ─────────────────────────────────
    const twoLine = (main: React.ReactNode, sub: React.ReactNode, classicTheme: boolean) => (
        <>
            <div style={{ fontWeight: 'bold' }}>{main}</div>
            {sub ? <div style={{ fontSize: classicTheme ? 10 : 11, color: '#777' }}>{sub}</div> : null}
        </>
    );

    const outputCell = (r: any) => (
        <>
            <span style={{ fontWeight: 'bold', color: r.qty_good ? '#1a5e1a' : '#999' }}>{fmtQty(r.qty_good)}</span>
            <span style={{ fontWeight: 'normal', fontSize: 10, color: '#888', marginLeft: 3 }}>{uomOf(r)}</span>
        </>
    );

    const rejectCell = (r: any) => (
        <span style={{ color: r.qty_rejected ? '#c00000' : '#aaa' }}>{fmtQty(r.qty_rejected)}</span>
    );

    const rejectPctCell = (r: any) => {
        const pct = r.reject_pct;
        const hot = pct != null && pct >= REJECT_ALERT_PCT;
        return (
            <span style={{ color: pct == null ? '#aaa' : hot ? '#c00000' : '#333', fontWeight: hot ? 'bold' : 'normal' }}>
                {fmtPct(pct)}
            </span>
        );
    };

    const lastLogCell = (r: any, classicTheme: boolean) => (
        r.last_log
            ? <><div>{tzDate(r.last_log)}</div><div style={{ fontSize: classicTheme ? 10 : 11, color: '#777' }}>{tzTime(r.last_log)}</div></>
            : <span style={{ color: '#aaa', fontSize: 10 }}>no activity</span>
    );

    // ── Column sets ──────────────────────────────────────────────────────────
    const columns = useMemo((): ReportColumn[] => {
        const shared: ReportColumn[] = [
            {
                key: 'output', label: 'Output', sortKey: 'output', align: 'right',
                render: r => outputCell(r), csv: r => r.qty_good ?? 0,
            },
            {
                key: 'share', label: 'Share', width: 110,
                render: r => <ProgressBar pct={(r.qty_good / maxOutput) * 100} tone="blue" height={8} />,
                csv: () => '',
            },
            {
                key: 'scrap', label: 'QC Reject', sortKey: 'scrap', align: 'right',
                render: r => rejectCell(r), csv: r => r.qty_rejected ?? 0,
            },
            {
                key: 'rejectPct', label: 'Reject %', sortKey: 'rejectPct', align: 'right',
                render: r => rejectPctCell(r), csv: r => r.reject_pct ?? '',
            },
        ];
        const lastLog: ReportColumn = {
            key: 'last', label: 'Last log', sortKey: 'last',
            render: (r, c) => lastLogCell(r, c), csv: r => r.last_log || '',
        };

        if (isPacking) {
            return [
                {
                    key: 'name', label: 'Packing Order', sortKey: 'name',
                    render: (r, c) => twoLine(r.po_code, [r.sales_order_code, r.customer_name].filter(Boolean).join(' · ') || 'to stock', c),
                    csv: r => r.po_code || '',
                },
                {
                    key: 'item', label: 'Item', sortKey: 'item',
                    render: (r, c) => twoLine(r.item_code || '-', r.item_name, c),
                    csv: r => r.item_code || r.item_name || '',
                },
                {
                    key: 'status', label: 'Status', sortKey: 'status',
                    render: r => (r.po_status ? <StatusChip status={r.po_status} tint /> : <span style={{ color: '#aaa' }}>-</span>),
                    csv: r => r.po_status || '',
                },
                {
                    key: 'target', label: 'Target', sortKey: 'target', align: 'right',
                    render: r => fmtQty(r.qty_target), csv: r => r.qty_target ?? 0,
                },
                ...shared,
                {
                    key: 'cartons', label: 'Cartons', align: 'right',
                    render: r => (
                        <>
                            <span>{r.cartons || 0}</span>
                            {r.cartons_rejected ? <span style={{ color: '#c00000', marginLeft: 4 }}>(-{r.cartons_rejected})</span> : null}
                        </>
                    ),
                    csv: r => `${r.cartons || 0}${r.cartons_rejected ? ` (-${r.cartons_rejected})` : ''}`,
                },
                lastLog,
            ];
        }

        if (isWoMode) {
            return [
                {
                    key: 'name', label: 'Work Order', sortKey: 'name',
                    render: (r, c) => twoLine(
                        r.wo_code || '(MO-level log)',
                        [r.wo_name, r.mo_code].filter(Boolean).join(' · '),
                        c,
                    ),
                    csv: r => r.wo_code || r.mo_code || '',
                },
                {
                    key: 'item', label: 'Item', sortKey: 'item',
                    render: (r, c) => twoLine(r.item_code || '-', r.item_name, c),
                    csv: r => r.item_code || r.item_name || '',
                },
                {
                    key: 'machine', label: 'Machine', sortKey: 'machine',
                    render: (r, c) => twoLine(r.work_center_name || '-', r.work_center_code, c),
                    csv: r => r.work_center_name || '',
                },
                {
                    key: 'status', label: 'Status', sortKey: 'status',
                    render: r => (r.wo_status ? <StatusChip status={r.wo_status} tint /> : <span style={{ color: '#aaa' }}>-</span>),
                    csv: r => r.wo_status || '',
                },
                {
                    key: 'target', label: 'Target', sortKey: 'target', align: 'right',
                    render: r => (r.wo_qty != null ? fmtQty(r.wo_qty) : <span style={{ color: '#aaa' }}>-</span>),
                    csv: r => r.wo_qty ?? '',
                },
                ...shared,
                lastLog,
            ];
        }

        return [
            {
                key: 'name', label: isGroupMode ? 'Group' : 'Machine', sortKey: 'name',
                render: (r, c) => twoLine(
                    r.work_center_name,
                    `${r.work_center_code || ''}${isGroupMode
                        ? ` · ${r.machine_count || 0} machines`
                        : (r.group_name ? ` · ${r.group_name}` : (r.type_name ? ` · ${r.type_name}` : ''))}`,
                    c,
                ),
                csv: r => r.work_center_name || '',
            },
            {
                key: 'type', label: 'Type',
                render: r => (r.center_type
                    ? <WorkCenterChip type={r.center_type} name={r.work_center_name} />
                    : <span style={{ color: '#aaa', fontSize: 10 }}>-</span>),
                csv: r => r.center_type || '',
            },
            {
                key: 'wos', label: 'WOs', sortKey: 'wos', align: 'right',
                render: r => r.wo_count || 0, csv: r => r.wo_count ?? 0,
            },
            {
                key: 'logs', label: 'Logs', sortKey: 'logs', align: 'right',
                render: r => r.logs || 0, csv: r => r.logs ?? 0,
            },
            ...shared,
            {
                key: 'yield', label: 'Yield', sortKey: 'yield', align: 'right',
                render: r => fmtPct(r.yield_pct), csv: r => r.yield_pct ?? '',
            },
            lastLog,
        ];
    }, [isPacking, isWoMode, isGroupMode, maxOutput, tzDate, tzTime]);

    const exportCsv = () => {
        const head = columns.filter(c => c.key !== 'share').map(c => c.label);
        const body = sorted.map((r: any) => columns.filter(c => c.key !== 'share').map(c => c.csv(r)));
        const csv = [head, ...body]
            .map(line => line.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${isPacking ? 'packing' : mode}-output_${startDate || 'all'}_${endDate || 'now'}.csv`;
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
                <div style={{ background: '#fff', border: classic ? '1px solid #a8a292' : '1px solid #dee2e6', maxHeight: 220, overflowY: 'auto' }}>
                    {body}
                </div>
            </div>
        );

        const itemsTable = (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: xpFont }}>
                <thead><tr>
                    <th style={dth}>Item</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Output</th>
                    <th style={{ ...dth, textAlign: 'right' }}>QC Reject</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Reject %</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Logs</th>
                </tr></thead>
                <tbody>
                    {(r.items || []).length === 0 ? (
                        <tr><td style={{ ...dtd, color: '#999' }} colSpan={5}>No output logged</td></tr>
                    ) : r.items.map((it: any) => (
                        <tr key={String(it.item_id)}>
                            <td style={dtd}>
                                <div style={{ fontWeight: 'bold' }}>{it.item_name || '(unknown item)'}</div>
                                <div style={{ fontSize: 9, color: '#777' }}>{it.item_code}</div>
                            </td>
                            <td style={{ ...dtd, textAlign: 'right', fontWeight: 'bold', color: '#1a5e1a' }}>{fmtQty(it.qty_good)} <span style={{ color: '#888', fontWeight: 'normal' }}>{it.uom}</span></td>
                            <td style={{ ...dtd, textAlign: 'right', color: it.qty_rejected ? '#c00000' : '#aaa' }}>{fmtQty(it.qty_rejected)}</td>
                            <td style={{ ...dtd, textAlign: 'right' }}>{fmtPct(it.reject_pct)}</td>
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
                    <th style={{ ...dth, textAlign: 'right' }}>QC Reject</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Reject %</th>
                    <th style={dth}>Last log</th>
                </tr></thead>
                <tbody>
                    {(r.work_orders || []).length === 0 ? (
                        <tr><td style={{ ...dtd, color: '#999' }} colSpan={6}>No work order activity</td></tr>
                    ) : r.work_orders.map((w: any, i: number) => (
                        <tr key={`${w.work_order_id || 'nowo'}-${w.mo_code}-${i}`}>
                            <td style={dtd}>
                                <div style={{ fontWeight: 'bold' }}>{w.wo_code || '(MO-level log)'}</div>
                                <div style={{ fontSize: 9, color: '#777' }}>{w.wo_name || ''}{w.mo_code ? ` · ${w.mo_code}` : ''}</div>
                            </td>
                            <td style={dtd}>{w.item_code || w.item_name || '-'}</td>
                            <td style={{ ...dtd, textAlign: 'right', fontWeight: 'bold' }}>{fmtQty(w.qty_good)} <span style={{ color: '#888', fontWeight: 'normal' }}>{w.uom}</span></td>
                            <td style={{ ...dtd, textAlign: 'right', color: w.qty_rejected ? '#c00000' : '#aaa' }}>{fmtQty(w.qty_rejected)}</td>
                            <td style={{ ...dtd, textAlign: 'right' }}>{fmtPct(w.reject_pct)}</td>
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
                    <th style={{ ...dth, textAlign: 'right' }}>QC Reject</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Reject %</th>
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
                            <td style={{ ...dtd, textAlign: 'right' }}>{fmtPct(m.reject_pct)}</td>
                            <td style={{ ...dtd, textAlign: 'right' }}>{m.wo_count}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );

        // The reject log — reason, who rejected it, and which defect store the scrap
        // was moved into (blank = the reject predates reject routing, or the output
        // was un-lotted and written off rather than quarantined).
        const rejectsTable = (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: xpFont }}>
                <thead><tr>
                    <th style={dth}>When</th>
                    {!isWoMode && !isPacking && <th style={dth}>Work Order</th>}
                    <th style={dth}>Lot</th>
                    <th style={{ ...dth, textAlign: 'right' }}>Rejected</th>
                    <th style={dth}>Reject location</th>
                    <th style={dth}>Reason</th>
                    <th style={dth}>By</th>
                </tr></thead>
                <tbody>
                    {(r.rejects || []).length === 0 ? (
                        <tr><td style={{ ...dtd, color: '#999' }} colSpan={7}>No QC rejects in this period</td></tr>
                    ) : r.rejects.map((rj: any) => (
                        <tr key={rj.completion_id}>
                            <td style={dtd}>
                                <div>{rj.logged_at ? tzDate(rj.logged_at) : '-'}</div>
                                <div style={{ fontSize: 9, color: '#777' }}>{rj.logged_at ? tzTime(rj.logged_at) : ''}</div>
                            </td>
                            {!isWoMode && !isPacking && (
                                <td style={dtd}>
                                    <div>{rj.wo_code || '(MO-level log)'}</div>
                                    <div style={{ fontSize: 9, color: '#777' }}>{rj.mo_code}</div>
                                </td>
                            )}
                            <td style={dtd}>
                                {isPacking
                                    ? <span style={{ color: '#777' }}>{rj.cartons_rejected || 0} carton(s)</span>
                                    : (rj.lot_number
                                        ? <>
                                            <div>{rj.lot_number}</div>
                                            {rj.lot_status && rj.lot_status !== 'GOOD' && (
                                                <div style={{ fontSize: 9, color: rj.lot_status === 'REJECT_USABLE' ? '#8a5a00' : '#900' }}>
                                                    {rj.lot_status === 'REJECT_USABLE' ? 'usable' : rj.lot_status.toLowerCase()}
                                                </div>
                                            )}
                                          </>
                                        : <span style={{ color: '#aaa' }}>un-lotted</span>)}
                            </td>
                            <td style={{ ...dtd, textAlign: 'right', color: '#c00000', fontWeight: 'bold' }}>
                                {fmtQty(rj.qty_rejected)}
                                {!rj.whole_lot && <span style={{ fontWeight: 'normal', color: '#777', fontSize: 9 }}> partial</span>}
                            </td>
                            <td style={dtd}>{rj.reject_location_name || <span style={{ color: '#aaa' }}>—</span>}</td>
                            <td style={dtd}>{rj.reason || <span style={{ color: '#aaa' }}>—</span>}</td>
                            <td style={dtd}>{rj.rejected_by || rj.operator_name || <span style={{ color: '#aaa' }}>—</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );

        return (
            <SunkenPanel classic={classic} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {isMachineLevel && block('By item', itemsTable)}
                {isGroupMode && block(`Machines (${(r.machines || []).length})`, machinesTable)}
                {isMachineLevel && block('Work orders', wosTable)}
                {block(`QC rejects (${(r.rejects || []).length})`, rejectsTable)}
            </SunkenPanel>
        );
    };

    const emptyIcon = isPacking ? 'bi-box-seam' : isWoMode ? 'bi-card-checklist' : 'bi-cpu';
    const emptyMessage = rows.length === 0
        ? (isPacking ? 'No packing logged in this period'
            : isWoMode ? 'No work order output in this period'
            : hideIdle ? 'No production logged in this period' : 'No machines in scope')
        : 'No rows with QC rejects in this period';

    const modeTabs: { val: Mode; label: string }[] = [
        { val: 'machine', label: 'Per Machine' },
        { val: 'group', label: 'Per Group' },
        { val: 'wo', label: 'Per Work Order' },
        { val: 'packing', label: 'Packing' },
    ];

    // Summary tiles — mode-aware, reject % always present since that is the ask.
    const statTiles = useMemo(() => {
        const base = [
            { label: 'Output', value: fmtQty(totals.qty_good || 0), color: '#1a5e1a', cls: 'text-success' },
            { label: 'QC Reject', value: fmtQty(totals.qty_rejected || 0), color: '#c00000', cls: 'text-danger' },
            { label: 'Reject %', value: fmtPct(totals.reject_pct), color: (totals.reject_pct ?? 0) >= REJECT_ALERT_PCT ? '#c00000' : '#1a3d7a', cls: (totals.reject_pct ?? 0) >= REJECT_ALERT_PCT ? 'text-danger' : 'text-primary' },
            { label: 'Yield', value: fmtPct(totals.yield_pct), color: '#1a3d7a', cls: 'text-primary' },
        ];
        if (isPacking) {
            return [
                ...base,
                { label: 'Cartons', value: `${totals.cartons || 0}`, color: '#1a3d7a', cls: 'text-primary' },
                { label: 'Orders', value: String(totals.order_count || 0), color: '#4a2a7a', cls: 'text-dark' },
            ];
        }
        return [
            ...base,
            { label: 'Work Orders', value: String(totals.wo_count || 0), color: '#1a3d7a', cls: 'text-primary' },
            { label: 'Logs', value: String(totals.logs || 0), color: '#1a3d7a', cls: 'text-primary' },
            ...(isMachineLevel
                ? [{ label: 'Machines', value: `${totals.active_machine_count || 0}/${totals.machine_count || 0}`, color: '#4a2a7a', cls: 'text-dark' }]
                : [{ label: 'Reject events', value: String(totals.reject_events || 0), color: '#4a2a7a', cls: 'text-dark' }]),
        ];
    }, [totals, isPacking, isMachineLevel]);

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
        const modeBtn = (val: Mode): React.CSSProperties => ({
            ...xpBtn({ fontSize: '10px', padding: '1px 8px' }),
            ...(mode === val ? { background: '#0058e6', color: '#fff', fontWeight: 'bold', borderColor: '#003080' } : {}),
        });
        const statTile = (label: string, value: string, color: string) => (
            <div key={label} style={{
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
                        <span><i className="bi bi-clipboard-data" style={{ marginRight: 6 }} />Production Output &amp; QC Reject</span>
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
                            style={{ width: 200 }}
                            disabled={isPacking}
                        />
                        <div style={xpSep} />
                        <span style={lbl}>View:</span>
                        <div style={{ display: 'flex' }}>
                            {modeTabs.map(m => (
                                <button key={m.val} style={modeBtn(m.val)} onClick={() => setMode(m.val)}>{m.label}</button>
                            ))}
                        </div>
                        <div style={xpSep} />
                        {isWoMode && (
                            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={completedOnly} onChange={e => setCompletedOnly(e.target.checked)} />
                                Completed WOs only
                            </label>
                        )}
                        {isMachineLevel && (
                            <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={hideIdle} onChange={e => setHideIdle(e.target.checked)} />
                                Hide machines with no output
                            </label>
                        )}
                        <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={rejectsOnly} onChange={e => setRejectsOnly(e.target.checked)} />
                            With rejects only
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
                        <span style={{ ...lbl, whiteSpace: 'nowrap' }}>{sorted.length} rows</span>
                        <button style={xpBtn({ padding: '1px 6px' })} onClick={fetchReport} title="Refresh"><i className="bi bi-arrow-clockwise" /></button>
                        <button style={xpBtn({ padding: '1px 6px' })} onClick={exportCsv} disabled={!sorted.length} title="Export CSV"><i className="bi bi-filetype-csv" /></button>
                    </div>

                    {/* Summary strip */}
                    <div style={{ display: 'flex', gap: 5, padding: '3px 6px', background: '#ece9d8', borderBottom: '1px solid #b0a898' }}>
                        {statTiles.map(s => statTile(s.label, s.value, s.color))}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', background: '#fff', minHeight: 0 }}>
                        {loading ? <XPLoading label="Loading report..." />
                        : error ? <XPEmptyState icon="bi-exclamation-triangle" message={`Could not load report — ${error}`} />
                        : sorted.length === 0 ? <XPEmptyState icon={emptyIcon} message={emptyMessage} />
                        : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...th, width: 22 }} />
                                        {columns.map((c, ci) => (
                                            <th
                                                key={c.key}
                                                style={{
                                                    ...th,
                                                    ...(c.align === 'right' ? { textAlign: 'right' } : {}),
                                                    ...(c.width ? { width: c.width } : {}),
                                                    ...(ci === columns.length - 1 ? { borderRight: 'none' } : {}),
                                                    ...(c.sortKey ? { cursor: 'pointer' } : {}),
                                                }}
                                                onClick={c.sortKey ? () => toggle(c.sortKey!) : undefined}
                                            >
                                                {c.label}{c.sortKey && <SortMark sort={sort} colKey={c.sortKey} />}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((r: any, i: number) => {
                                        const key = rowKey(r);
                                        const open = expanded === key;
                                        return (
                                            <React.Fragment key={key}>
                                            <tr
                                                style={{ background: open ? '#dde8f5' : (i % 2 === 0 ? '#ffffff' : '#f5f3ee'), borderBottom: '1px solid #e0ddd3', cursor: 'pointer' }}
                                                onClick={() => setExpanded(open ? null : key)}
                                            >
                                                <td style={{ ...td, textAlign: 'center', color: '#555' }}><i className={`bi bi-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 8 }} /></td>
                                                {columns.map((c, ci) => (
                                                    <td
                                                        key={c.key}
                                                        style={{
                                                            ...td,
                                                            ...(c.align === 'right' ? { textAlign: 'right' } : {}),
                                                            ...(ci === columns.length - 1 ? { borderRight: 'none', whiteSpace: 'nowrap' } : {}),
                                                        }}
                                                    >
                                                        {c.render(r, true)}
                                                    </td>
                                                ))}
                                            </tr>
                                            {open && (
                                                <tr style={{ background: '#ece9d8' }}>
                                                    <td colSpan={columns.length + 1} style={{ padding: 6 }}>{detailPanel(r)}</td>
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
                        <h5 className="card-title mb-0">Production Output &amp; QC Reject</h5>
                        <small className="text-muted">
                            {isPacking ? 'Packing output per order' : isWoMode ? 'Output per work order' : 'Work order output per machine'} · {periodLabel}
                        </small>
                    </div>
                    <div className="d-flex gap-1">
                        <button className="btn btn-outline-secondary btn-sm" onClick={fetchReport} title="Refresh"><i className="bi bi-arrow-clockwise" /></button>
                        <button className="btn btn-outline-primary btn-sm" onClick={exportCsv} disabled={!sorted.length}><i className="bi bi-filetype-csv me-1" />CSV</button>
                    </div>
                </div>
                <div className="row g-2 align-items-center">
                    <div className="col-md-3">
                        <TreeSelect
                            options={wcTreeOptions}
                            value={scope}
                            onChange={setScope}
                            allowEmpty
                            emptyLabel="All Work Centres"
                            size="sm"
                            disabled={isPacking}
                        />
                    </div>
                    <div className="col-md-5">
                        <div className="btn-group w-100" role="group">
                            {modeTabs.map(m => (
                                <button
                                    key={m.val}
                                    className={`btn btn-sm ${mode === m.val ? 'btn-primary' : 'btn-outline-primary'}`}
                                    onClick={() => setMode(m.val)}
                                >{m.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="col-md-4 d-flex flex-wrap gap-3">
                        {isWoMode && (
                            <div className="form-check form-switch">
                                <input className="form-check-input" type="checkbox" id="completedOnlySwitch" checked={completedOnly} onChange={e => setCompletedOnly(e.target.checked)} />
                                <label className="form-check-label small" htmlFor="completedOnlySwitch">Completed WOs only</label>
                            </div>
                        )}
                        {isMachineLevel && (
                            <div className="form-check form-switch">
                                <input className="form-check-input" type="checkbox" id="hideIdleSwitch" checked={hideIdle} onChange={e => setHideIdle(e.target.checked)} />
                                <label className="form-check-label small" htmlFor="hideIdleSwitch">Hide machines with no output</label>
                            </div>
                        )}
                        <div className="form-check form-switch">
                            <input className="form-check-input" type="checkbox" id="rejectsOnlySwitch" checked={rejectsOnly} onChange={e => setRejectsOnly(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="rejectsOnlySwitch">With rejects only</label>
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
                    <span className="text-muted small ms-auto">{sorted.length} rows</span>
                </div>
            </div>

            <div className="row g-0 border-bottom text-center">
                {statTiles.map((s, i) => (
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
                        <i className={`bi ${emptyIcon} d-block fs-2 mb-2 opacity-50`} />{emptyMessage}
                    </div>
                ) : (
                    <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr>
                                    <th style={{ width: 28 }} />
                                    {columns.map(c => (
                                        <th
                                            key={c.key}
                                            className={c.align === 'right' ? 'text-end' : undefined}
                                            style={{ ...(c.width ? { width: c.width + 10 } : {}), ...(c.sortKey ? { cursor: 'pointer' } : {}) }}
                                            onClick={c.sortKey ? () => toggle(c.sortKey!) : undefined}
                                        >
                                            {c.label}{c.sortKey && <SortMark sort={sort} colKey={c.sortKey} />}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((r: any) => {
                                    const key = rowKey(r);
                                    const open = expanded === key;
                                    return (
                                        <React.Fragment key={key}>
                                        <tr className={open ? 'table-primary' : ''} style={{ cursor: 'pointer' }} onClick={() => setExpanded(open ? null : key)}>
                                            <td className="text-center text-muted"><i className={`bi bi-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 10 }} /></td>
                                            {columns.map((c, ci) => (
                                                <td
                                                    key={c.key}
                                                    className={c.align === 'right' ? 'text-end' : undefined}
                                                    style={ci === columns.length - 1 ? { whiteSpace: 'nowrap' } : undefined}
                                                >
                                                    {c.render(r, false)}
                                                </td>
                                            ))}
                                        </tr>
                                        {open && (
                                            <tr>
                                                <td colSpan={columns.length + 1} className="p-2 bg-body-tertiary">{detailPanel(r)}</td>
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
