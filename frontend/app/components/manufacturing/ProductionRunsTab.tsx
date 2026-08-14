import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ManufacturingSearchBar from './ManufacturingSearchBar';
import { FilterChipBar } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import { useToast } from '../shared/Toast';
import { useData } from '../../context/DataContext';
import { statusChipStyle, useFloatingMenu, MenuTriggerButton, FloatingMenu, XPActionButton, ExpandedRowPanel, ExpandedRowPanelBody, ProgressBar, CodeChip, CODE_FONT, xpFont, TableSkeleton, useTableSkeletonMetrics } from '../shared/xpTheme';
const PRMaterialPullSheetModal = dynamic(() => import('./PRMaterialPullSheetModal'), { ssr: false });

export default function ProductionRunsTab({
    productionRuns,
    prPage,
    prTotal,
    setPrPage,
    pageSize,
    prSearch,
    setPrSearch,
    prSoFilter,
    setPrSoFilter,
    prProgressFilter,
    setPrProgressFilter,
    onDeleteProductionRun,
    currentStyle,
    canManage,
    companyProfile,
    helpers,
}: any) {
    const { showToast } = useToast();
    const router = useRouter();
    const { authFetch, loading: dataLoading } = useData();

    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skel = useTableSkeletonMetrics('production-runs', listBodyRef, (productionRuns?.length ?? 0) > 0);
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
    const { getLocationName, getAttributeValueName, formatDate, getStatusBadge } = helpers;

    const [expandedPRs, setExpandedPRs] = useState<Record<string, boolean>>({});
    const [prMaterialReqs, setPrMaterialReqs] = useState<Record<string, any[]>>({});
    const [prMaterialReqsLoading, setPrMaterialReqsLoading] = useState<Record<string, boolean>>({});
    // Lightweight per-PR material summary (component counts + shortfall count) for the
    // Materials column. Fetched for ALL visible rows in ONE batched call, so the column
    // stays populated up front without the old per-row /material-requirements fan-out.
    const [prMaterialStatus, setPrMaterialStatus] = useState<Record<string, { total_count: number; shortfall_count: number; sufficient_count: number }>>({});
    const [prStatusLoading, setPrStatusLoading] = useState(false);
    const [printPreviewPR, setPrintPreviewPR] = useState<any>(null);
    const { openId: openPrMenuId, pos: prMenuPos, toggle: togglePrMenu, close: closePrMenu } = useFloatingMenu();

    const classic = currentStyle === 'classic';
    const filteredProductionRuns = productionRuns || [];
    // Both filters are server-side (see /production-runs has_sales_order + progress) —
    // client-side narrowing would only filter the current page, not the whole result set.
    const filtersActive = !!prSoFilter || !!prProgressFilter;

    const fetchPRMaterialRequirements = async (prId: string) => {
        setPrMaterialReqsLoading(prev => ({ ...prev, [prId]: true }));
        try {
            const res = await authFetch(`${API_BASE}/production-runs/${prId}/material-requirements`);
            if (res.ok) {
                const data = await res.json();
                setPrMaterialReqs(prev => ({ ...prev, [prId]: data }));
            }
        } finally {
            setPrMaterialReqsLoading(prev => ({ ...prev, [prId]: false }));
        }
    };

    const togglePR = (prId: string) => {
        setExpandedPRs(prev => {
            const expanding = !prev[prId];
            if (expanding) fetchPRMaterialRequirements(prId);
            return { ...prev, [prId]: expanding };
        });
    };

    // One batched call for the Materials column of every visible PR (replaces the
    // old per-row storm). Full material rows are still fetched lazily on expand/print.
    useEffect(() => {
        const ids = (productionRuns || []).map((pr: any) => pr.id);
        if (ids.length === 0) { setPrMaterialStatus({}); return; }
        let cancelled = false;
        (async () => {
            setPrStatusLoading(true);
            try {
                const res = await authFetch(`${API_BASE}/production-runs/material-status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pr_ids: ids }),
                });
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    const map: Record<string, any> = {};
                    for (const s of (data || [])) map[String(s.pr_id)] = s;
                    setPrMaterialStatus(map);
                }
            } finally {
                if (!cancelled) setPrStatusLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [productionRuns]);

    // Full material requirement ROWS are fetched lazily — only when a PR row is
    // expanded (togglePR) or printed (handlePrintPR). The old eager loop fired one
    // /material-requirements call per visible row on mount (up to `pageSize`
    // concurrent heavy queries), which dominated PR-page load on the low-power
    // backend. The Materials column's shortfall/sufficient COUNTS come from the
    // single batched /material-status call above instead.

    const handlePrintPR = (pr: any) => {
        if (!prMaterialReqs[pr.id] && !prMaterialReqsLoading[pr.id]) fetchPRMaterialRequirements(pr.id);
        setPrintPreviewPR(pr);
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {printPreviewPR && (
                <PRMaterialPullSheetModal
                    pr={printPreviewPR}
                    reqs={prMaterialReqs[printPreviewPR.id] || []}
                    isLoading={!!prMaterialReqsLoading[printPreviewPR.id]}
                    currentStyle={currentStyle}
                    companyProfile={companyProfile}
                    getLocationName={getLocationName}
                    getAttributeValueName={getAttributeValueName}
                    formatDate={formatDate}
                    onClose={() => setPrintPreviewPR(null)}
                />
            )}

            {((productionRuns && productionRuns.length > 0) || prSearch || filtersActive) && (
                <ManufacturingSearchBar
                    value={prSearch}
                    onChange={setPrSearch}
                    placeholder="Search by code, style, or BOM..."
                    total={prTotal}
                    classic={classic}
                    showCount={filtersActive}
                    filters={
                        <>
                            <FilterChipBar
                                classic={classic}
                                value={prSoFilter || ''}
                                onChange={(v: string) => setPrSoFilter?.(v === prSoFilter ? '' : v)}
                                options={[
                                    { value: '', label: 'All SO' },
                                    { value: 'with', label: 'With SO' },
                                    { value: 'without', label: 'No SO' },
                                ]}
                            />
                            <FilterChipBar
                                classic={classic}
                                value={prProgressFilter || ''}
                                onChange={(v: string) => setPrProgressFilter?.(v === prProgressFilter ? '' : v)}
                                options={[
                                    { value: '', label: 'All Progress' },
                                    { value: 'complete', label: '100%' },
                                    { value: 'incomplete', label: 'Under 100%' },
                                ]}
                            />
                        </>
                    }
                />
            )}
            {/* The table renders while loading too, so the skeleton sits under the
                real header and inherits its columns instead of standing in for
                the whole table. */}
            {(productionRuns && productionRuns.length > 0) || dataLoading.productionRuns ? (
                <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    <table style={{
                        width: '100%', borderCollapse: 'collapse',
                        // Fixed layout: column widths come from the header row only, so an
                        // expanded colSpan detail row (MO chips + nested material table) can
                        // never widen the columns. Prevents the width flash on expand/collapse
                        // when a PR has many linked MOs. BOM/Style has no width -> it flexes to
                        // absorb the remaining space.
                        tableLayout: 'fixed',
                        fontFamily: classic ? xpFont : undefined,
                        fontSize: classic ? '11px' : undefined,
                        background: classic ? '#fff' : undefined,
                    }} className={classic ? '' : 'table table-hover align-middle mb-0'}>
                        <thead>
                            <tr style={{
                                background: classic ? 'linear-gradient(to bottom,#fff 0%,#d4d0c8 100%)' : undefined,
                                fontSize: classic ? '10px' : '9pt',
                            }} className={classic ? '' : 'table-light'}>
                                {(() => {
                                    const colWidths: Record<string, string | undefined> = {
                                        '': '22px',
                                        'Code': '210px',
                                        'BOM / Style': undefined, // flexes
                                        'MOs': '48px',
                                        'Progress': '150px',
                                        'Status': '92px',
                                        'Materials': '130px',
                                        'Due Date': '92px',
                                        'Actions': '104px',
                                    };
                                    return ['', 'Code', 'BOM / Style', 'MOs', 'Progress', 'Status', 'Materials', 'Due Date', 'Actions'].map((h, i) => (
                                        <th key={h || `col-${i}`} style={{
                                            border: classic ? '1px solid #808080' : undefined,
                                            padding: classic ? '3px 8px' : undefined,
                                            color: '#000', fontWeight: 'bold', whiteSpace: 'nowrap',
                                            textAlign: h === 'Actions' ? 'right' : 'left',
                                            width: colWidths[h],
                                        }}>{h}</th>
                                    ));
                                })()}
                            </tr>
                        </thead>
                        <tbody ref={listBodyRef}>
                            {filteredProductionRuns.length === 0 && dataLoading.productionRuns && (
                                <TableSkeleton rows={8} cols={skel.cols ?? 9} classic={classic} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                            )}
                            {filteredProductionRuns.map((pr: any, rowIdx: number) => {
                                const mos = pr.manufacturing_orders || [];
                                // DELIVERED = qty met, order not closed yet — still "done" for progress.
                                const done = mos.filter((m: any) => ['COMPLETED', 'DELIVERED'].includes(m.status)).length;
                                const total = mos.length;
                                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                const rowBg = classic
                                    ? (rowIdx % 2 === 0 ? '#fff' : '#f5f3ee')
                                    : undefined;
                                const tdStyle: React.CSSProperties = classic ? {
                                    border: '1px solid #c0bdb5', padding: '4px 8px', color: '#000', verticalAlign: 'middle',
                                } : {};
                                const isExpanded = !!expandedPRs[pr.id];
                                const reqs: any[] = prMaterialReqs[pr.id] || [];
                                const isLoading = !!prMaterialReqsLoading[pr.id];
                                // Materials column is driven by the batched summary; the
                                // full `reqs` (loaded on expand) only powers the detail panel.
                                const mstat = prMaterialStatus[pr.id];
                                const statusShort = mstat?.shortfall_count ?? 0;
                                const statusSuff = mstat?.sufficient_count ?? 0;
                                const statusTotal = mstat?.total_count ?? 0;
                                const hasShortfall = mstat ? statusShort > 0 : reqs.some((r: any) => r.shortfall > 0);
                                return (
                                    <React.Fragment key={pr.id}>
                                    <tr style={{ background: rowBg, cursor: 'pointer' }} onClick={() => togglePR(pr.id)} title="Material Requirements">
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <i
                                                className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'}`}
                                                style={{ color: hasShortfall && isExpanded ? '#c00000' : '#555' }}
                                            ></i>
                                        </td>
                                        <td style={tdStyle}>
                                            <CodeChip code={pr.code} classic={classic} style={{ fontWeight: 'bold' }} />
                                            {pr.sales_order_id && (
                                                <div style={{ marginTop: 3 }}>
                                                    <span style={classic ? {
                                                        fontSize: '8px', background: '#dce8ff', border: '1px solid #9ab0e0',
                                                        color: '#003ea6', padding: '0 5px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', fontFamily: xpFont,
                                                    } : {
                                                        fontSize: '0.65rem', background: '#cfe2ff', border: '1px solid #9ec5fe',
                                                        color: '#0a58ca', padding: '1px 6px', borderRadius: 3, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center',
                                                    }} title="Originating Sales Order">
                                                        <i className="bi bi-receipt me-1" style={{ fontSize: classic ? '7px' : undefined }}></i>SO: {pr.sales_order_code || '—'}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: 'bold', fontSize: classic ? '11px' : undefined }}>
                                                {pr.bom_entries?.length > 0
                                                    ? pr.bom_entries.map((e: any) => e.bom?.item_name || e.bom?.item_code || e.bom?.code).filter(Boolean).join(' / ')
                                                    : (pr.bom?.item_name || pr.bom?.item_code || pr.bom?.code || pr.bom_id)}
                                            </div>
                                            {(pr.bom_entries?.length > 0
                                                ? pr.bom_entries.map((e: any) => e.bom?.code).filter(Boolean).join(' / ')
                                                : pr.bom?.code
                                            ) && (
                                                <CodeChip
                                                    classic={classic}
                                                    tier={2}
                                                    style={{ display: 'block' }}
                                                    code={pr.bom_entries?.length > 0
                                                        ? pr.bom_entries.map((e: any) => e.bom?.code).filter(Boolean).join(' / ')
                                                        : pr.bom?.code}
                                                />
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>{total}</td>
                                        <td style={{ ...tdStyle, minWidth: 120 }}>
                                            <ProgressBar pct={pct} tone={pct === 100 ? 'green' : 'blue'} label="outside" />
                                            <div style={{ fontSize: 9, color: '#666' }}>{done}/{total} done</div>
                                        </td>
                                        <td style={tdStyle}>
                                            {classic ? (
                                                <span style={statusChipStyle(pr.status)}>{(pr.status || 'PENDING').replace('_', ' ')}</span>
                                            ) : (
                                                <span className={`badge ${getStatusBadge(pr.status)} extra-small`}>{pr.status}</span>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }} title={!mstat && prStatusLoading ? 'Loading material status...' : !mstat ? 'Material status unavailable' : statusTotal === 0 ? 'No components' : `${statusShort} short / ${statusSuff} sufficient`}>
                                            {!mstat && prStatusLoading ? (
                                                <span style={{ fontSize: 10, color: '#999' }}>…</span>
                                            ) : !mstat ? (
                                                <span style={{ fontSize: 10, color: '#bbb' }}>·</span>
                                            ) : statusTotal === 0 ? (
                                                <span style={{ fontSize: 10, color: '#999' }}>—</span>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 'bold', minWidth: 18, color: statusShort > 0 ? '#c00000' : '#ccc', opacity: statusShort > 0 ? 1 : 0.5 }}>
                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusShort > 0 ? '#c00000' : '#ccc', display: 'inline-block' }} />
                                                        {statusShort}
                                                    </span>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 'bold', minWidth: 18, color: statusSuff > 0 ? '#2d7a2d' : '#ccc', opacity: statusSuff > 0 ? 1 : 0.5 }}>
                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusSuff > 0 ? '#2d7a2d' : '#ccc', display: 'inline-block' }} />
                                                        {statusSuff}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: 10 }}>{formatDate(pr.target_end_date)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                                                <XPActionButton
                                                    classic={classic}
                                                    tone="primary"
                                                    icon="bi-printer"
                                                    title="Print Material Pull Sheet"
                                                    onClick={() => handlePrintPR(pr)}
                                                />
                                                <MenuTriggerButton classic={classic} onClick={(e) => togglePrMenu(pr.id, e)} />
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={9} className="p-0 border-0">
                                            <ExpandedRowPanel classic={classic}>
                                            <ExpandedRowPanelBody classic={classic}>
                                                {isLoading ? (
                                                    <span style={{ fontSize: 11, color: '#666', fontFamily: classic ? xpFont : undefined }}>
                                                        Loading material requirements...
                                                    </span>
                                                ) : reqs.length === 0 ? (
                                                    <span style={{ fontSize: 11, color: '#999', fontFamily: classic ? xpFont : undefined }}>
                                                        No component requirements found for this Production Run.
                                                    </span>
                                                ) : (
                                                    <div>
                                                        {(() => {
                                                            const rootMos = mos.filter((mo: any) => !mo.is_shared_component);
                                                            if (rootMos.length === 0) return null;
                                                            return (
                                                                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: classic ? 9 : 10, color: '#555', fontFamily: classic ? xpFont : undefined, marginRight: 2, whiteSpace: 'nowrap' }}>
                                                                        Linked MOs:
                                                                    </span>
                                                                    {rootMos.map((mo: any) => (
                                                                            <button
                                                                                key={mo.id}
                                                                                onClick={() => router.push(`/manufacturing-orders?mo=${encodeURIComponent(mo.code)}`)}
                                                                                title={`View ${mo.code} in Manufacturing Orders (${mo.status})`}
                                                                                style={{ padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                                                                            >
                                                                                <CodeChip code={mo.code} classic={classic} link />
                                                                            </button>
                                                                        ))}
                                                                </div>
                                                            );
                                                        })()}
                                                        <div style={{ fontSize: classic ? 10 : 11, fontWeight: 'bold', marginBottom: 4, fontFamily: classic ? xpFont : undefined, color: '#333' }}>
                                                            Consolidated Material Requirements — {reqs.length} component{reqs.length !== 1 ? 's' : ''}
                                                            {hasShortfall && <span style={{ marginLeft: 8, color: '#c00000', fontWeight: 'bold' }}>SHORTFALL DETECTED</span>}
                                                            {(() => {
                                                                // Production progress roll-up: how many made-here components have met
                                                                // their fixed requirement. Amber, never red — a run in progress is
                                                                // expected to be short until it finishes.
                                                                const made = reqs.filter((r: any) => (r.production_mos || []).length > 0);
                                                                if (made.length === 0) return null;
                                                                const ok = made.filter((r: any) => (r.production_shortfall ?? 0) <= 0.0001).length;
                                                                return (
                                                                    <span style={{ marginLeft: 8, color: ok === made.length ? '#2d7a2d' : '#a05a00', fontWeight: 'bold' }}>
                                                                        PRODUCTION {ok}/{made.length} OK
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                        <table style={{
                                                            width: '100%', borderCollapse: 'collapse', fontSize: classic ? 10 : 12,
                                                            fontFamily: classic ? xpFont : undefined,
                                                        }}>
                                                            <thead>
                                                                <tr style={{ background: classic ? '#d4d0c8' : '#e9ecef' }}>
                                                                    {[
                                                                        { h: 'Item Code', t: '', num: false },
                                                                        { h: 'Item Name', t: '', num: false },
                                                                        { h: 'UOM', t: '', num: false },
                                                                        { h: 'Req (fix)', t: 'Fixed requirement at full order qty — never decrements. Grey figure below it is the NET still required after what this run has already been issued.', num: true },
                                                                        { h: 'Produced', t: 'Good output logged so far by this Production Run’s own MOs that make this item. Dash = nothing here produces it (bought or taken from stock).', num: true },
                                                                        { h: 'Progress', t: 'Produced vs Req (fix). OK = the requirement has been made; SHORT = still being produced, by that much.', num: false },
                                                                        { h: 'Available', t: 'Physical on-hand across all locations (good stock only — QC-rejected lots excluded).', num: true },
                                                                        { h: 'Incoming', t: 'Outstanding output of this Production Run’s own component MOs — already scheduled, not yet made.', num: true },
                                                                        { h: 'Shortfall', t: 'MATERIAL blocker: Still Required − Available − Incoming. Only a positive gap is a real shortage.', num: true },
                                                                        { h: 'MOs', t: 'needs = MOs consuming this component. made = MOs producing it (logged / target).', num: false },
                                                                    ].map(({ h, t, num }) => (
                                                                        <th key={h} title={t || undefined} style={{ padding: '2px 6px', textAlign: num ? 'right' : 'left', border: classic ? '1px solid #808080' : '1px solid #dee2e6', fontWeight: 'bold', cursor: t ? 'help' : undefined }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {reqs.map((req: any, ri: number) => {
                                                                    const short = req.shortfall > 0;
                                                                    const rowColor = classic
                                                                        ? (short ? '#fff0f0' : ri % 2 === 0 ? '#fff' : '#ece7dc')
                                                                        : (short ? '#fff5f5' : ri % 2 === 0 ? '#fff' : '#eef1f4');
                                                                    const cellStyle: React.CSSProperties = {
                                                                        padding: '2px 6px', border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6',
                                                                        background: rowColor, verticalAlign: 'middle',
                                                                    };
                                                                    const gross = parseFloat(req.gross_required ?? req.total_required);
                                                                    const net = parseFloat(req.total_required);
                                                                    // Consumed-so-far is the gap between the full-order requirement and what is
                                                                    // still outstanding — spell it out so a dropping "Available" reads as
                                                                    // material issued to this run, not as material going missing.
                                                                    const issued = gross - net;
                                                                    const incoming = parseFloat(req.qty_incoming ?? 0);
                                                                    // Production progress: only rows this PR actually makes carry producing MOs.
                                                                    const prodMos = req.production_mos || [];
                                                                    const isMade = prodMos.length > 0;
                                                                    const produced = parseFloat(req.qty_produced ?? 0);
                                                                    const prodShort = parseFloat(req.production_shortfall ?? 0);
                                                                    // Amber, not red: still-being-made is the expected state of a live run,
                                                                    // while a material Shortfall is an actual blocker.
                                                                    const prodColor = !isMade ? '#999' : prodShort > 0.0001 ? '#a05a00' : '#2d7a2d';
                                                                    const needsSummary = (req.mo_contributions || []).map((c: any) => `${c.mo_code} (${parseFloat(c.required_qty).toFixed(2)})`).join(', ');
                                                                    return (
                                                                        <tr key={ri}>
                                                                            <td style={cellStyle}><CodeChip code={req.item_code} classic={classic} /></td>
                                                                            <td style={cellStyle}>{req.item_name}</td>
                                                                            <td style={cellStyle}>{req.uom}</td>
                                                                            <td
                                                                                style={{ ...cellStyle, textAlign: 'right', fontFamily: CODE_FONT, cursor: issued > 0.0001 ? 'help' : undefined }}
                                                                                title={issued > 0.0001
                                                                                    ? `Full order requirement ${gross.toFixed(2)} ${req.uom} − ${issued.toFixed(2)} already issued to this run = ${net.toFixed(2)} still required`
                                                                                    : undefined}
                                                                            >
                                                                                {gross.toFixed(2)}
                                                                                {issued > 0.0001 && (
                                                                                    <div style={{ color: '#777', fontWeight: 'normal', fontSize: classic ? 9 : 10 }}>
                                                                                        {net.toFixed(2)} net
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                            <td
                                                                                style={{ ...cellStyle, textAlign: 'right', fontFamily: CODE_FONT, color: prodColor, fontWeight: isMade ? 'bold' : undefined, cursor: isMade ? 'help' : undefined }}
                                                                                title={isMade
                                                                                    ? prodMos.map((m: any) => `${m.mo_code}: ${parseFloat(m.qty_produced).toFixed(2)} / ${parseFloat(m.mo_qty).toFixed(2)} ${m.status}`).join('\n')
                                                                                    : 'Not produced by this Production Run — bought or drawn from stock.'}
                                                                            >
                                                                                {isMade ? produced.toFixed(2) : '—'}
                                                                            </td>
                                                                            <td style={{ ...cellStyle, fontFamily: CODE_FONT, color: prodColor, fontWeight: isMade ? 'bold' : undefined }}>
                                                                                {!isMade ? '—' : prodShort > 0.0001 ? `SHORT ${prodShort.toFixed(2)}` : 'OK'}
                                                                            </td>
                                                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: CODE_FONT, color: short ? '#c00000' : '#2d7a2d', fontWeight: short ? 'bold' : undefined }}>
                                                                                {parseFloat(req.qty_available).toFixed(2)}
                                                                            </td>
                                                                            <td
                                                                                style={{ ...cellStyle, textAlign: 'right', fontFamily: CODE_FONT, color: incoming > 0 ? '#1b5e9c' : '#999' }}
                                                                                title={incoming > 0
                                                                                    ? (req.supply_mos || []).map((s: any) => `${s.mo_code} (${parseFloat(s.incoming_qty).toFixed(2)})`).join(', ')
                                                                                    : undefined}
                                                                            >
                                                                                {incoming > 0 ? incoming.toFixed(2) : '—'}
                                                                            </td>
                                                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: CODE_FONT, color: short ? '#c00000' : '#2d7a2d', fontWeight: short ? 'bold' : undefined }}>
                                                                                {short ? `-${parseFloat(req.shortfall).toFixed(2)}` : 'OK'}
                                                                            </td>
                                                                            <td style={{ ...cellStyle, fontSize: classic ? 9 : 11, color: '#555' }}>
                                                                                <div><span style={{ color: '#888' }}>needs:</span> {needsSummary}</div>
                                                                                {isMade && (
                                                                                    <div>
                                                                                        <span style={{ color: '#888' }}>made:</span>{' '}
                                                                                        {prodMos.map((m: any) => `${m.mo_code} (${parseFloat(m.qty_produced).toFixed(2)}/${parseFloat(m.mo_qty).toFixed(2)})`).join(', ')}
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </ExpandedRowPanelBody>
                                            </ExpandedRowPanel>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{
                    padding: '32px', textAlign: 'center',
                    fontFamily: classic ? xpFont : undefined,
                    fontSize: classic ? '11px' : undefined,
                    color: '#888',
                }}>
                    <i className="bi bi-collection-play" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.4 }}></i>
                    {prSearch
                        ? <>No Production Runs match "<strong>{prSearch}</strong>"{filtersActive ? ' with the selected filters' : ''}.</>
                        : filtersActive
                            ? <>No Production Runs match the selected filters.</>
                            : <>No Production Runs yet. Click <strong>New Production Run</strong> to get started.</>}
                </div>
            )}
            <Pager page={prPage} total={prTotal} pageSize={pageSize} onPageChange={setPrPage} hideWhenEmpty />
            {/* Floating "more actions" menu — Delete */}
            {openPrMenuId && (() => {
                const menuPR = (productionRuns || []).find((p: any) => p.id === openPrMenuId);
                if (!menuPR) return null;
                return (
                    <FloatingMenu
                        pos={prMenuPos}
                        items={[
                            { key: 'delete', icon: 'bi-trash', label: 'Delete', danger: true, hidden: !canManage, onClick: () => { closePrMenu(); onDeleteProductionRun(menuPR.id); } },
                        ]}
                    />
                );
            })()}
        </div>
    );
}
