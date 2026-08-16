'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState, TableSkeleton, useTableSkeletonMetrics, StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu, ExpandedRowPanel, CODE_FONT } from '../shared/xpTheme';
import { LV_XP_FONT, lvBtn, lvInput, lvTh, lvTd, lvLabel, lvRow, lvThead } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
import { Tabs } from '../shared/Tabs';
const PickListPrintModal = dynamic(() => import('./PickListPrintModal'), { ssr: false });
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// ── Classic XP theme primitives (match StockOnHandView / LocationsView) ──────
// This view has no modern-theme branch yet (renders the classic look always,
// regardless of the user's theme setting) — inherited from the packing view this
// was split out of, tracked separately.
const xpFont = LV_XP_FONT;
const xpInput: React.CSSProperties = lvInput(true);
const xpSelect: React.CSSProperties = { ...xpInput, height: 22 };
const xpTableHeader: React.CSSProperties = {
    ...lvTh(true),
    ...lvThead(true),
    position: 'sticky', top: 0,
};
const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => lvBtn(true, extra);
const xpBtnGreen = (extra: React.CSSProperties = {}) => xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold', ...extra });
const rowStyle = (idx: number): React.CSSProperties => lvRow(true, idx);
const td: React.CSSProperties = lvTd(true);
const xpLabel: React.CSSProperties = lvLabel(true);

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const PL_PAGE_SIZE = 20;
const OPEN_STATUSES = ['DRAFT', 'PICKING', 'PICKED'];
type PLTab = 'lists' | 'topick';

export default function PickListView() {
    // partners/locations/attributes/companyProfile/itemIndex come from DataContext
    // master data (loaded on initial app load). Pick lists, sales orders and stock
    // balances are all fetched here scoped to what's actually on screen.
    const { partners, locations, attributes, companyProfile, itemIndex, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { formatDate: tzDate, formatDateTime: tzDateTime } = useTimezone();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');

    // Two surfaces for one planner: "To Pick" is the release board (which order
    // do I cut a list for next), "Pick Lists" is the register of lists already
    // cut. Same user, same permission — tabs, not separate pages.
    //
    // The board lands first: opening this page is nearly always "what should ship
    // next", and the Pick row on the board is the only way to create a list, so
    // the register is the follow-up view rather than the entry point.
    const [tab, setTab] = useState<PLTab>('topick');

    const [pickLists, setPickLists] = useState<any[]>([]);
    const [plTotal, setPlTotal] = useState(0);
    const [openCount, setOpenCount] = useState(0);
    const [dispatchedCount, setDispatchedCount] = useState(0);
    // Only loaded once the release board is opened — `pickable-orders` scores
    // every open SO line by line, so it is not cheap enough to prefetch for a
    // tab badge the user may never look at.
    const [pickableSOs, setPickableSOs] = useState<any[]>([]);
    const [pickableLoading, setPickableLoading] = useState(false);
    const [pickableLoaded, setPickableLoaded] = useState(false);
    // True from first paint so the list shows the loader, not "none yet".
    const [loading, setLoading] = useState(true);
    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skel = useTableSkeletonMetrics('pick-lists', listBodyRef, pickLists.length > 0);
    const [editing, setEditing] = useState<any | null>(null);
    // Kartu Picking — the floor card, distinct from the Surat Jalan above it.
    const [printCard, setPrintCard] = useState<any | null>(null);
    // One row open at a time, same as the packing order and WO lists.
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [plPage, setPlPage] = useState(1);
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(160);

    const itemById = useMemo(() => {
        const m: Record<string, any> = {};
        Object.entries(itemIndex || {}).forEach(([id, v]: [string, any]) => { m[id] = { id, ...v }; });
        return m;
    }, [itemIndex]);

    const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);
    const locationById = useMemo(() => {
        const m: Record<string, any> = {};
        (locations || []).forEach((l: any) => { m[String(l.id)] = l; });
        return m;
    }, [locations]);

    const loadPickListPage = useCallback(async (page: number) => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE}/pick-lists?page=${page}&size=${PL_PAGE_SIZE}`);
            if (res.ok) { const d = await res.json(); setPickLists(d.items || []); setPlTotal(d.total || 0); }
        } finally { setLoading(false); }
    }, [authFetch]);

    // Cheap total-only lookups (size=1) for the status-bar counts.
    const loadCounts = useCallback(async () => {
        const [openRes, sRes] = await Promise.all([
            Promise.all(OPEN_STATUSES.map(s => authFetch(`${API_BASE}/pick-lists?status=${s}&page=1&size=1`))),
            authFetch(`${API_BASE}/pick-lists?status=DISPATCHED&page=1&size=1`),
        ]);
        let open = 0;
        for (const r of openRes) { if (r.ok) { const d = await r.json(); open += d.total || 0; } }
        setOpenCount(open);
        if (sRes.ok) { const d = await sRes.json(); setDispatchedCount(d.total || 0); }
    }, [authFetch]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([loadPickListPage(plPage), loadCounts()]);
        } finally { setLoading(false); }
    }, [loadPickListPage, loadCounts, plPage]);

    useEffect(() => { loadCounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { loadPickListPage(plPage); }, [plPage, loadPickListPage]);

    // One readiness call instead of "every open SO" + "every draft": the server
    // scores each order's packed cartons against what it still owes, so the picker
    // sees what can actually ship rather than the whole order book.
    const loadPickable = useCallback(async () => {
        setPickableLoading(true);
        try {
            const res = await authFetch(`${API_BASE}/pick-lists/pickable-orders`);
            setPickableSOs(res.ok ? (await res.json() || []) : []);
            setPickableLoaded(true);
        } finally {
            setPickableLoading(false);
        }
    }, [authFetch]);

    // Board data is fetched on first visit to the tab and then kept — creating a
    // list refreshes it explicitly, so re-scoring on every tab flip would only
    // re-pay the N+1 for an unchanged answer.
    useEffect(() => {
        if (tab === 'topick' && !pickableLoaded && !pickableLoading) loadPickable();
    }, [tab, pickableLoaded, pickableLoading, loadPickable]);

    const createForSO = async (so: any) => {
        const res = await authFetch(`${API_BASE}/pick-lists`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales_order_id: so.id }),
        });
        if (res.ok) {
            const pl = await res.json();
            // The order just consumed cartons — re-score the board before the
            // planner returns to it, and land them on the list they just cut.
            await Promise.all([loadAll(), loadPickable()]);
            setTab('lists');
            setEditing(pl);
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(`Error: ${err.detail || 'could not create'}`, 'danger');
        }
    };

    const deletePL = async (pl: any) => {
        const ok = await confirm({ title: 'Delete Pick List', message: `Delete ${pl.code}?`, confirmText: 'Delete', variant: 'danger' });
        if (!ok) return;
        const res = await authFetch(`${API_BASE}/pick-lists/${pl.id}`, { method: 'DELETE' });
        if (res.ok) { showToast('Pick list deleted', 'success'); loadAll(); }
        else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'failed'}`, 'danger'); }
    };

    // Tab badge counts orders that can actually be picked today, not every open
    // order — a board full of un-packed orders is not work waiting on the planner.
    const readyCount = useMemo(
        () => pickableSOs.filter((so: any) => num(so.cartons_ready) > 0).length,
        [pickableSOs],
    );

    const plPages = Math.max(1, Math.ceil(plTotal / PL_PAGE_SIZE));
    const clampedPage = Math.min(plPage, plPages);

    const cartonProgress = (pl: any) => {
        const cartons = (pl.lines || []).filter((l: any) => l.batch_id);
        if (!cartons.length) return '—';
        return `${cartons.filter((l: any) => l.picked_at).length}/${cartons.length}`;
    };

    const PL_COLS = 9; // chevron + 7 data cols + actions

    // Expanded row — same three-pane shape as the packing order and WO list
    // panels (info, the physical units, the log/summary). Everything rendered
    // here is already on the list payload (`_load_options` eager-loads lines with
    // item + batch), so opening a row costs no fetch.
    const renderPickDetail = (pl: any) => {
        const lines: any[] = pl.lines || [];
        const cartons = lines.filter((l: any) => l.batch_id);
        const pickedCount = cartons.filter((l: any) => l.picked_at).length;
        const srcName = locationById?.[String(pl.source_location_id)]?.name || null;

        // Per-item roll-up across cartons: what actually goes on the Surat Jalan.
        const byItem: Record<string, { code: string; name: string; qty: number; cartons: number; picked: number; uom: string }> = {};
        for (const l of lines) {
            const key = String(l.item_id);
            const it = itemById[key];
            const row = byItem[key] || (byItem[key] = {
                code: l.item_code || it?.code || key,
                name: l.item_name || it?.name || '',
                qty: 0, cartons: 0, picked: 0,
                uom: l.item_uom || it?.uom || '',
            });
            row.qty += num(l.qty_picked);
            if (l.batch_id) { row.cartons += 1; if (l.picked_at) row.picked += 1; }
        }
        const itemRows = Object.values(byItem);

        const colHeader: React.CSSProperties = {
            fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#555',
            letterSpacing: 0.5, borderBottom: '1px solid #c0bdb5', paddingBottom: 2, marginBottom: 4,
        };
        const infoRow = (label: string, val: React.ReactNode) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 1, fontSize: 9 }}>
                <span style={{ color: '#888' }}>{label}</span>
                <span style={{ fontWeight: 'bold', color: '#222', textAlign: 'right', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
            </div>
        );
        const th: React.CSSProperties = {
            padding: '1px 5px', textAlign: 'left', fontWeight: 'bold', color: '#444',
            background: 'linear-gradient(to bottom,#ece9d8,#d4d0c8)', borderBottom: '1px solid #aca899',
        };

        return (
            <tr key={`${pl.id}-detail`}>
                <td colSpan={PL_COLS} style={{ padding: 0 }}>
                    <ExpandedRowPanel classic>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '250px minmax(280px, 1fr) 260px',
                            border: '1px solid #7f9db9', fontFamily: xpFont, fontSize: 10,
                        }}>
                            {/* Info + QC + where the goods went */}
                            <div style={{ borderRight: '1px solid #c0bdb5', padding: '6px 8px', background: '#f5f4ef' }}>
                                <div style={colHeader}>Info</div>
                                {infoRow('Sales Order', pl.sales_order_code || '—')}
                                {infoRow('Customer', pl.customer_name || '—')}
                                {infoRow('Pick from', srcName || 'any location')}
                                {infoRow('Cartons', `${pickedCount} / ${cartons.length} scanned`)}
                                <div style={{ borderTop: '1px solid #e0ddd8', margin: '3px 0' }} />
                                <div style={colHeader}>QC</div>
                                {infoRow('Passed', pl.qc_passed
                                    ? <span style={{ color: '#0a3e0a' }}>yes</span>
                                    : <span style={{ color: '#a00000' }}>not yet</span>)}
                                {infoRow('Inspector', pl.qc_inspector || '—')}
                                {infoRow('Checked', pl.qc_at ? tzDateTime(pl.qc_at) : '—')}
                                <div style={{ borderTop: '1px solid #e0ddd8', margin: '3px 0' }} />
                                {/* The delivery note itself lives on the Dispatch
                                    page — this only says where the goods went. */}
                                <div style={colHeader}>Loading Deck</div>
                                {infoRow('Shipment', pl.shipment_code || 'not staged')}
                                {infoRow('Deck status', pl.shipment_status || '—')}
                                {infoRow('Surat Jalan', pl.delivery_note_number || '—')}
                                <div style={{ borderTop: '1px solid #e0ddd8', margin: '3px 0' }} />
                                {infoRow('Created', pl.created_at ? tzDateTime(pl.created_at) : '—')}
                                {infoRow('Dispatched', pl.dispatched_at ? tzDateTime(pl.dispatched_at) : '—')}
                                {pl.notes && (
                                    <div style={{ marginTop: 4, padding: '2px 5px', background: '#fffbe6', border: '1px solid #e0d080', fontSize: 9, fontStyle: 'italic', color: '#666' }}>
                                        {pl.notes}
                                    </div>
                                )}
                            </div>

                            {/* Carton lines — the floor's scan sheet */}
                            <div style={{ borderRight: '1px solid #c0bdb5', padding: '6px 8px', background: '#f5f4ef', overflow: 'hidden' }}>
                                <div style={{ ...colHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Cartons ({cartons.length})</span>
                                    {cartons.length > 0 && (
                                        <span style={{ color: pickedCount === cartons.length ? '#0a3e0a' : '#b8860b' }}>
                                            {pickedCount} scanned
                                        </span>
                                    )}
                                </div>
                                {lines.length === 0 ? (
                                    <div style={{ color: '#aaa', fontStyle: 'italic', fontSize: 9 }}>
                                        No lines — nothing was packed for this order when it was created.
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ ...th, width: 24 }}>#</th>
                                                    <th style={th}>Lot</th>
                                                    <th style={th}>Item</th>
                                                    <th style={{ ...th, textAlign: 'right', width: 54 }}>Qty</th>
                                                    <th style={{ ...th, width: 96 }}>Scanned</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lines.map((l: any, li: number) => (
                                                    <tr key={l.id} style={{ background: l.picked_at ? '#eef7ee' : li % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #e8e6e0' }}>
                                                        <td style={{ padding: '2px 5px', color: '#888' }}>{l.package_no ?? '—'}</td>
                                                        <td style={{ padding: '2px 5px', fontFamily: CODE_FONT, color: '#00309c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}
                                                            title={l.batch_number || undefined}>
                                                            {/* No batch = a bulk line from before pick lists became carton-only. */}
                                                            {l.batch_number || <span style={{ fontFamily: xpFont, color: '#b8860b' }}>bulk line</span>}
                                                        </td>
                                                        <td style={{ padding: '2px 5px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}
                                                            title={l.item_name || undefined}>
                                                            {l.item_code || itemById[String(l.item_id)]?.code || '—'}
                                                        </td>
                                                        <td style={{ padding: '2px 5px', textAlign: 'right', fontWeight: 'bold' }}>{num(l.qty_picked).toFixed(2)}</td>
                                                        <td style={{ padding: '2px 5px', color: '#555', whiteSpace: 'nowrap' }}>
                                                            {l.picked_at
                                                                ? <span title={l.picked_by ? `by ${l.picked_by}` : undefined} style={{ color: '#0a3e0a' }}>
                                                                    {tzDateTime(l.picked_at)}
                                                                </span>
                                                                : <span style={{ color: '#aaa' }}>pending</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* What ships, per item */}
                            <div style={{ padding: '6px 8px', background: '#f5f4ef', overflow: 'hidden' }}>
                                <div style={colHeader}>Shipping ({itemRows.length} item{itemRows.length === 1 ? '' : 's'})</div>
                                {itemRows.length === 0 ? (
                                    <div style={{ color: '#aaa', fontStyle: 'italic', fontSize: 9 }}>Nothing allocated.</div>
                                ) : (
                                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                        {itemRows.map(r => (
                                            <div key={r.code} style={{ marginBottom: 3, paddingBottom: 3, borderBottom: '1px solid #e8e6e0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 9 }}>
                                                    <span style={{ fontWeight: 'bold', color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>
                                                        {r.code}
                                                    </span>
                                                    <span style={{ fontWeight: 'bold', color: '#000080', whiteSpace: 'nowrap' }}>
                                                        {r.qty.toLocaleString()} {r.uom}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 9, color: '#888' }}>
                                                    {r.cartons > 0
                                                        ? `${r.picked}/${r.cartons} carton${r.cartons === 1 ? '' : 's'} scanned`
                                                        : 'bulk line'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </ExpandedRowPanel>
                </td>
            </tr>
        );
    };

    return (
        <ShellWindow classic fill="page" className="fade-in" style={{ fontFamily: xpFont }}>
            <ShellTitleBar
                classic
                icon="bi-clipboard-check"
                title="Pick Lists & Dispatch"
            />
            {/* No "New Pick List" button: a list is only ever created from a scored
                order on the board, so the Pick action lives on the row that says
                whether the order can be picked at all. */}
            <Tabs<PLTab>
                classic
                activeKey={tab}
                onChange={setTab}
                tabs={[
                    { key: 'topick' as const, label: pickableLoaded ? `To Pick (${readyCount})` : 'To Pick', icon: 'bi-box-arrow-in-down' },
                    { key: 'lists' as const, label: 'Pick Lists', icon: 'bi-clipboard-check' },
                ]}
            />
            {tab === 'topick' ? (
                <SOPickerBoard
                    pickableSOs={pickableSOs}
                    loading={pickableLoading}
                    tzDate={tzDate}
                    canManage={canManage}
                    onRefresh={loadPickable}
                    onPick={createForSO}
                />
            ) : (
            <>
            <div style={xpToolbar()}>
                <button style={xpBtn()} onClick={loadAll} title="Refresh">
                    <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#333' }}>
                    {plTotal.toLocaleString()} pick list{plTotal !== 1 ? 's' : ''}
                </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#fff', minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ ...xpTableHeader, width: 22 }} />
                            <th style={xpTableHeader}>Code</th>
                            <th style={xpTableHeader}>Sales Order</th>
                            <th style={xpTableHeader}>Customer</th>
                            <th style={xpTableHeader}>Status</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Cartons scanned</th>
                            <th style={xpTableHeader}>Delivery Note</th>
                            <th style={xpTableHeader}>Dispatched</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody ref={listBodyRef}>
                        {pickLists.length === 0 && (loading ? (
                            <TableSkeleton rows={7} cols={skel.cols ?? PL_COLS} classic tdStyle={td} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                        ) : (
                            <tr><td colSpan={PL_COLS} style={{ padding: 0 }}>
                                <XPEmptyState icon="bi-clipboard-check" message='No pick lists yet. Click "New Pick List" to pick packed cartons for an order.' />
                            </td></tr>
                        ))}
                        {pickLists.map((pl: any, idx: number) => {
                            const isExpanded = expandedId === String(pl.id);
                            return (
                            <React.Fragment key={pl.id}>
                            <tr
                                style={{ ...rowStyle(idx), ...(isExpanded ? { background: '#eef2ff' } : {}), cursor: 'pointer' }}
                                onClick={() => setExpandedId(prev => prev === String(pl.id) ? null : String(pl.id))}
                            >
                                <td style={{ ...td, padding: '3px 4px', textAlign: 'center' }}>
                                    <span style={{ fontSize: 10, color: '#555', lineHeight: 1 }}>{isExpanded ? '▼' : '►'}</span>
                                </td>
                                <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{pl.code}</td>
                                <td style={td}>{pl.sales_order_code || '-'}</td>
                                <td style={td}>{pl.customer_name || '-'}</td>
                                <td style={td}><StatusChip status={pl.status} /></td>
                                <td style={{ ...td, textAlign: 'right' }}>{cartonProgress(pl)}</td>
                                <td style={td}>{pl.delivery_note_number || '-'}</td>
                                <td style={td}>{pl.dispatched_at ? tzDate(pl.dispatched_at) : '-'}</td>
                                <td style={{ ...td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                    <MenuTriggerButton classic onClick={e => menuToggle(String(pl.id), e)} />
                                </td>
                            </tr>
                            {isExpanded && renderPickDetail(pl)}
                            </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pager page={clampedPage} total={plTotal} pageSize={PL_PAGE_SIZE} onPageChange={setPlPage} hideWhenEmpty />
            </>
            )}

            {menuOpenId && tab === 'lists' && (() => {
                const pl = pickLists.find((x: any) => String(x.id) === menuOpenId);
                if (!pl) return null;
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            { key: 'edit', label: pl.status === 'DISPATCHED' ? 'View' : 'Pick', icon: 'bi-upc-scan', onClick: () => { menuClose(); setEditing(pl); } },
                            { key: 'card', label: 'Kartu Picking', icon: 'bi-card-list', onClick: () => { menuClose(); setPrintCard(pl); } },
                            { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, hidden: !(canManage && pl.status !== 'DISPATCHED'), onClick: () => { menuClose(); deletePL(pl); } },
                        ]}
                    />
                );
            })()}
            <XPStatusBar right={`${openCount} open · ${dispatchedCount} dispatched`}>
                {tab === 'topick'
                    ? (pickableLoading ? 'Scoring open orders...' : `${pickableSOs.length} open order(s) · ${readyCount} ready to pick`)
                    : (loading ? 'Loading...' : `${plTotal} pick list(s)`)}
            </XPStatusBar>

            {editing && (
                <PickListEditor
                    pl={editing}
                    itemById={itemById}
                    locPickerTreeOptions={locPickerTreeOptions}
                    authFetch={authFetch}
                    onClose={() => setEditing(null)}
                    onSaved={async () => { await loadAll(); }}
                    showToast={showToast}
                />
            )}

            {printCard && (
                <PickListPrintModal
                    pl={printCard}
                    companyProfile={companyProfile}
                    onClose={() => setPrintCard(null)}
                />
            )}

        </ShellWindow>
    );
}

// ── SO picker ────────────────────────────────────────────────────────────────
// Due-date urgency, in the same 5-family language as StatusChip: red = late,
// amber = this week, grey = comfortable.
function dueChip(days: number | null | undefined) {
    if (days == null) return { bg: '#f0efe8', border: '#c0bdb5', fg: '#666', text: 'no date' };
    if (days < 0) return { bg: '#fbe4e4', border: '#c88', fg: '#900', text: `${-days}d late` };
    if (days === 0) return { bg: '#ffe9c7', border: '#d9a441', fg: '#7a4a00', text: 'due today' };
    if (days <= 7) return { bg: '#fff4e5', border: '#d9a441', fg: '#7a4a00', text: `in ${days}d` };
    return { bg: '#eef2ff', border: '#b0c8f8', fg: '#1a56c4', text: `in ${days}d` };
}

/**
 * Pick readiness board — the planner's release queue, a full tab rather than a
 * dialog because it is a work surface (sortable-width table, urgency chips,
 * coverage bars) that the planner reads alongside the pick list register, not a
 * one-question prompt.
 *
 * Orders are listed soonest-due first, each showing how much of what it still
 * owes is already packed into cartons — packing is upstream of picking, so an
 * order with nothing packed cannot be picked at all (the server rejects it too;
 * this just says so before the click).
 */
function SOPickerBoard({ pickableSOs, loading, tzDate, canManage, onRefresh, onPick }: any) {
    return (
        <>
            <div style={xpToolbar()}>
                <button style={xpBtn()} onClick={onRefresh} title="Re-score open orders">
                    <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
                </button>
                <span style={{ fontSize: 10, color: '#666', marginLeft: 8, maxWidth: 620, lineHeight: 1.3 }}>
                    Soonest delivery first. &quot;Ready&quot; counts whole cartons already packed and not on
                    another pick list — cartons are suggested oldest-first, and the last one may overshoot
                    since a carton is never split.
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#333', whiteSpace: 'nowrap' }}>
                    {pickableSOs.length.toLocaleString()} open order{pickableSOs.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#fff', minHeight: 0, fontFamily: xpFont }}>
                {loading
                    ? <div style={{ fontSize: 11, color: '#888', padding: '12px 8px' }}>Scoring open orders...</div>
                    : pickableSOs.length === 0
                    ? <XPEmptyState icon="bi-inbox" message="No open sales orders with anything outstanding." />
                    : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={xpTableHeader}>Sales Order</th>
                                    <th style={xpTableHeader}>Customer</th>
                                    <th style={xpTableHeader}>Delivery due</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}>Outstanding</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}>Ready</th>
                                    <th style={xpTableHeader}>Coverage</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pickableSOs.map((so: any, idx: number) => {
                                    const chip = dueChip(so.days_to_due);
                                    const ready = num(so.cartons_ready) > 0;
                                    const pct = num(so.qty_outstanding) > 0
                                        ? Math.min(100, Math.round(num(so.qty_ready) / num(so.qty_outstanding) * 100))
                                        : 0;
                                    return (
                                        <tr key={so.id} style={{ ...rowStyle(idx), opacity: ready ? 1 : 0.6 }}>
                                            <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>
                                                {so.po_number}
                                                {so.customer_po_ref && (
                                                    <div style={{ fontSize: 9, fontWeight: 'normal', color: '#888' }}>{so.customer_po_ref}</div>
                                                )}
                                            </td>
                                            <td style={td}>
                                                {so.customer_name}
                                                <div style={{ marginTop: 1 }}><StatusChip status={so.status} tint /></div>
                                            </td>
                                            <td style={td}>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 'bold', padding: '0 5px',
                                                    background: chip.bg, border: `1px solid ${chip.border}`, color: chip.fg,
                                                }}>{chip.text}</span>
                                                <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>
                                                    {so.due_date ? tzDate(so.due_date) : '—'}
                                                </div>
                                            </td>
                                            <td style={{ ...td, textAlign: 'right' }}>
                                                {num(so.qty_outstanding).toLocaleString()}
                                                <div style={{ fontSize: 9, color: '#888' }}>
                                                    {so.lines_outstanding} of {so.line_count} line{so.line_count === 1 ? '' : 's'}
                                                </div>
                                            </td>
                                            <td style={{ ...td, textAlign: 'right', color: ready ? '#0a3e0a' : '#999', fontWeight: 'bold' }}>
                                                {num(so.qty_ready).toLocaleString()}
                                                <div style={{ fontSize: 9, fontWeight: 'normal', color: '#888' }}>
                                                    {so.cartons_ready} carton{so.cartons_ready === 1 ? '' : 's'}
                                                </div>
                                            </td>
                                            <td style={td}>
                                                <div style={{ width: 70, height: 8, background: '#e6e4dc', border: '1px solid #aca899' }}>
                                                    <div style={{
                                                        width: `${pct}%`, height: '100%',
                                                        background: pct >= 100 ? '#4caf50' : '#5b8dd6',
                                                    }} />
                                                </div>
                                                <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>{pct}%</div>
                                            </td>
                                            <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {so.has_open_pick_list && (
                                                    <span style={{ fontSize: 9, color: '#b8860b', marginRight: 8 }}>open pick list</span>
                                                )}
                                                <button
                                                    style={{ ...xpBtnGreen(), opacity: ready && canManage ? 1 : 0.5, cursor: ready && canManage ? 'pointer' : 'not-allowed' }}
                                                    disabled={!ready || !canManage}
                                                    title={!canManage ? 'You do not have permission to create pick lists'
                                                        : ready ? 'Create a pick list for this order'
                                                        : 'Nothing packed for this order yet — pack cartons first'}
                                                    onClick={() => onPick(so)}
                                                >Pick</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
            </div>
        </>
    );
}

// ── editor ───────────────────────────────────────────────────────────────────
function PickListEditor({ pl: initialPl, itemById, locPickerTreeOptions, authFetch, onClose, onSaved, showToast }: any) {
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');

    // Lines are server-owned here: scanning mutates them on the backend and the
    // response replaces the local copy. Only header fields and bulk-line qty are
    // edited client-side, which keeps the scan (the source of pick truth) from
    // ever racing an unsaved local edit.
    const [pl, setPl] = useState<any>(initialPl);
    const readOnly = pl.status === 'DISPATCHED' || pl.status === 'CANCELLED' || !canManage;

    const [so, setSo] = useState<any | null>(null);
    const [soLoading, setSoLoading] = useState(true);
    const [remainingMap, setRemainingMap] = useState<Record<string, number>>({});
    const soLines: any[] = so?.lines || [];

    const [lines, setLines] = useState<any[]>(() => (initialPl.lines || []).map((l: any) => ({ ...l })));
    const [sourceLoc, setSourceLoc] = useState<string>(initialPl.source_location_id || '');
    const [qcPassed, setQcPassed] = useState<boolean>(!!initialPl.qc_passed);
    const [qcInspector, setQcInspector] = useState<string>(initialPl.qc_inspector || '');
    const [notes, setNotes] = useState<string>(initialPl.notes || '');
    const [saving, setSaving] = useState(false);
    const [scanCode, setScanCode] = useState('');
    const [scanning, setScanning] = useState(false);
    const scanRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setSoLoading(true);
            const soRes = await authFetch(`${API_BASE}/sales-orders/${initialPl.sales_order_id}`);
            const soData = soRes.ok ? await soRes.json() : null;
            if (cancelled) return;
            setSo(soData);
            setSoLoading(false);

            const remRes = await authFetch(`${API_BASE}/pick-lists/${initialPl.id}/remaining`);
            if (cancelled) return;
            if (remRes && remRes.ok) setRemainingMap(await remRes.json());
        })();
        return () => { cancelled = true; };
    }, [initialPl.sales_order_id, initialPl.id, authFetch]);

    useEffect(() => { if (!readOnly) scanRef.current?.focus(); }, [readOnly]);

    const applyServer = (fresh: any) => {
        setPl(fresh);
        setLines((fresh.lines || []).map((l: any) => ({ ...l })));
    };

    const buildPayload = () => ({
        source_location_id: sourceLoc || null,
        qc_passed: qcPassed, qc_inspector: qcInspector || null,
        notes: notes || null,
        lines: lines.map(l => ({
            sales_order_line_id: l.sales_order_line_id,
            item_id: l.item_id,
            qty_picked: num(l.qty_picked),
            source_location_id: l.source_location_id || null,
            batch_id: l.batch_id || null,
        })),
    });

    const save = async () => {
        setSaving(true);
        try {
            const res = await authFetch(`${API_BASE}/pick-lists/${pl.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload()),
            });
            if (res.ok) { applyServer(await res.json()); showToast('Saved', 'success'); await onSaved(); return true; }
            const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'save failed'}`, 'danger'); return false;
        } finally { setSaving(false); }
    };

    // Rebuilding lines on PUT drops picked_at, so scan BEFORE saving header edits
    // is the safe order — hence the scan box posts straight through and never
    // piggybacks the local payload.
    const scan = async (code: string) => {
        const trimmed = code.trim();
        if (!trimmed) return;
        setScanning(true);
        try {
            const res = await authFetch(`${API_BASE}/pick-lists/${pl.id}/scan`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: trimmed }),
            });
            if (res.ok) {
                applyServer(await res.json());
                setScanCode('');
                showToast(`${trimmed} confirmed`, 'success');
            } else {
                const e = await res.json().catch(() => ({}));
                showToast(`${e.detail || 'Scan failed'}`, 'danger');
            }
        } finally { setScanning(false); scanRef.current?.focus(); }
    };

    const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
    const setLineQty = (idx: number, v: any) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, qty_picked: v } : l));
    const setLineLoc = (idx: number, v: any) => setLines(prev => prev.map((l, i) => i === idx ? { ...l, source_location_id: v } : l));

    const linesBySoLine = useMemo(() => {
        const m: Record<string, any[]> = {};
        lines.forEach((l, idx) => {
            const k = String(l.sales_order_line_id);
            (m[k] = m[k] || []).push({ ...l, __idx: idx });
        });
        return m;
    }, [lines]);

    const cartonLines = lines.filter(l => l.batch_id);
    const scannedCount = cartonLines.filter(l => l.picked_at).length;

    const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 'bold', color: '#00309c', margin: '14px 0 6px', borderBottom: '1px solid #c8c4b8', paddingBottom: 3 };

    return (
        <ModalWrapper
            isOpen
            onClose={onClose}
            title={`Pick List ${pl.code} — SO ${pl.sales_order_code || so?.po_number || ''}`}
            size="xl"
            modeless
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <button style={xpBtn()} onClick={onClose}>Close</button>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {!readOnly && <button style={xpBtnGreen()} disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>}
                    </div>
                </div>
            }
        >
            <div style={{ fontFamily: xpFont }}>
                {readOnly && (
                    <div style={{ background: '#eef7ee', border: '1px solid #2d7a2d', color: '#0a3e0a', padding: '5px 10px', fontSize: 11, marginBottom: 10 }}>
                        This pick list is {pl.status} and read-only.
                    </div>
                )}

                {/* Header fields */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 200 }}>
                        <label style={xpLabel}>Default ship-from warehouse</label>
                        <TreeSelect options={locPickerTreeOptions} value={sourceLoc} onChange={setSourceLoc} disabled={readOnly} allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                    </div>
                    {/* Delivery-note fields (DN no., carrier, vehicle, driver) are
                        not here: they are loading-deck facts captured on the
                        Dispatch page when this pick list is staged. */}
                </div>

                {/* Scan */}
                {!readOnly && (
                    <>
                        <div style={sectionTitle}>Scan Cartons</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                ref={scanRef}
                                style={{ ...xpInput, width: 260 }}
                                placeholder="Scan or type carton number (PU-…)"
                                value={scanCode}
                                disabled={scanning}
                                onChange={e => setScanCode(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scan(scanCode); } }}
                            />
                            <button style={xpBtn()} disabled={scanning || !scanCode.trim()} onClick={() => scan(scanCode)}>
                                {scanning ? 'Scanning...' : 'Confirm'}
                            </button>
                            <span style={{ fontSize: 10, color: scannedCount === cartonLines.length && cartonLines.length > 0 ? '#0a3e0a' : '#c77800' }}>
                                {scannedCount}/{cartonLines.length} cartons scanned
                            </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                            Scanning a carton that was not suggested adds it, as long as the order includes that item.
                        </div>
                    </>
                )}

                {/* Lines */}
                <div style={sectionTitle}>Cartons to Pick</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #c8c4b8' }}>
                    <thead>
                        <tr>
                            <th style={xpTableHeader}>Item / Carton</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Ordered</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Remaining</th>
                            <th style={{ ...xpTableHeader, width: 110, textAlign: 'right' }}>Qty</th>
                            <th style={{ ...xpTableHeader, width: 160 }}>Pick-from</th>
                            <th style={{ ...xpTableHeader, width: 110 }}>Scanned</th>
                            <th style={{ ...xpTableHeader, width: 60 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {soLoading && (
                            <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#999' }}>Loading order lines...</td></tr>
                        )}
                        {soLines.map((sl: any) => {
                            const it = itemById[String(sl.item_id)];
                            const rows = linesBySoLine[String(sl.id)] || [];
                            const rem = remainingMap[String(sl.id)] ?? num(sl.qty);
                            const totalPicked = rows.reduce((s: number, r: any) => s + num(r.qty_picked), 0);
                            return (
                                <React.Fragment key={sl.id}>
                                    <tr style={{ background: '#f5f4ef' }}>
                                        <td style={{ ...td, fontWeight: 'bold' }}>
                                            {it?.name || sl.item_name || sl.item_id}
                                            <span style={{ fontSize: 9, color: '#888', marginLeft: 6 }}>{it?.code || sl.item_code}</span>
                                        </td>
                                        <td style={{ ...td, textAlign: 'right' }}>{num(sl.qty).toLocaleString()} {it?.uom}</td>
                                        <td style={{ ...td, textAlign: 'right', color: rem > 0 ? '#0a3e0a' : '#999' }}>{rem.toLocaleString()}</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 'bold' }}>{totalPicked.toLocaleString()}</td>
                                        <td style={td} colSpan={3}>
                                            {rows.length === 0 && <span style={{ fontSize: 10, color: '#c00' }}>No packed cartons available</span>}
                                        </td>
                                    </tr>
                                    {rows.map((r: any) => (
                                        <tr key={r.id || r.__idx}>
                                            <td style={{ ...td, paddingLeft: 22 }}>
                                                {r.batch_number
                                                    ? <span style={{ color: '#00309c' }}>{r.batch_number}{r.package_no ? ` · #${r.package_no}` : ''}</span>
                                                    : <span style={{ color: '#888' }}>Bulk (no carton)</span>}
                                            </td>
                                            <td style={td} />
                                            <td style={td} />
                                            <td style={{ ...td, textAlign: 'right' }}>
                                                <input type="number" min={0}
                                                    style={{ ...xpInput, width: '100%', textAlign: 'right' }}
                                                    disabled={readOnly || !!r.batch_id}
                                                    title={r.batch_id ? 'A carton ships whole — its qty comes from stock' : undefined}
                                                    value={r.qty_picked ?? ''} onChange={e => setLineQty(r.__idx, e.target.value)} />
                                            </td>
                                            <td style={td}>
                                                <TreeSelect options={locPickerTreeOptions} value={r.source_location_id || ''} onChange={id => setLineLoc(r.__idx, id)} disabled={readOnly || !!r.batch_id} allowEmpty emptyLabel="(default)" size="sm" style={{ width: '100%' }} />
                                            </td>
                                            <td style={td}>
                                                {!r.batch_id
                                                    ? <span style={{ fontSize: 10, color: '#bbb' }}>n/a</span>
                                                    : r.picked_at
                                                        ? <span style={{ fontSize: 10, color: '#0a3e0a' }}><i className="bi bi-check-lg" /> {r.picked_by || 'yes'}</span>
                                                        : <span style={{ fontSize: 10, color: '#c77800' }}>pending</span>}
                                            </td>
                                            <td style={{ ...td, textAlign: 'right' }}>
                                                {!readOnly && <button style={xpBtn({ color: '#a00' })} onClick={() => removeLine(r.__idx)}>Remove</button>}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>

                {/* QC */}
                <div style={sectionTitle}>Quality Control</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: readOnly ? 'default' : 'pointer' }}>
                        <input type="checkbox" checked={qcPassed} disabled={readOnly} onChange={e => setQcPassed(e.target.checked)} />
                        QC passed
                    </label>
                    <div>
                        <label style={xpLabel}>Inspector</label>
                        <input style={{ ...xpInput, width: 200 }} disabled={readOnly} value={qcInspector} onChange={e => setQcInspector(e.target.value)} />
                    </div>
                </div>

                <div style={sectionTitle}>Notes</div>
                <textarea style={{ ...xpInput, height: 50, width: '100%', resize: 'vertical' }} disabled={readOnly} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
        </ModalWrapper>
    );
}

