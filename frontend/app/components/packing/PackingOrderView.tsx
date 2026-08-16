'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState, TableSkeleton, useTableSkeletonMetrics, StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu, FormSection, SectionTitle, FieldLabel, XPActionButton, LegendPanel, ExpandedRowPanel, ProgressBar, CodeChip, CODE_FONT } from '../shared/xpTheme';
import { LV_XP_FONT, lvBtn, lvInput, lvTh, lvTd, lvRow, lvThead } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
import SearchableSelect from '../shared/SearchableSelect';
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';
import { useFinishedGoodsSearch } from '../shared/useEntitySearch';
import { LotChips, LotChip } from '../shared/LotChips';
const PackingCardPrintModal = dynamic(() => import('./PackingCardPrintModal'), { ssr: false });
const PackedUnitLabelPrintModal = dynamic(() => import('./PackedUnitLabelPrintModal'), { ssr: false });

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// ── Classic XP theme primitives (match PickListView / StockOnHandView) ──────
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
// Title-bar "create" button — same style as SalesOrderView / PartnersView / SampleRequestView.
const xpBtnCreate = xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' });
const rowStyle = (idx: number): React.CSSProperties => lvRow(true, idx);
const td: React.CSSProperties = lvTd(true);
// This view is classic-only chrome (ShellWindow classic), so the shared form
// primitives are always driven in their classic branch.
const CLASSIC = true;
// Form rows use fixed grid columns rather than flex-wrap so fields land in the
// same column on every row instead of reflowing to a ragged edge.
const fieldGrid: React.CSSProperties = { display: 'grid', gap: '8px 14px', alignItems: 'start' };
const hintText: React.CSSProperties = { fontFamily: xpFont, fontSize: 10, color: '#938c76', fontStyle: 'italic', marginTop: 6 };
// Operator-log-modal field label + UOM pill — copied from WOCompletionModal so the
// pack modal and the WO completion modal read as the same screen.
const xpFormLabel: React.CSSProperties = { fontFamily: xpFont, fontSize: 11, display: 'block', marginBottom: 2 };
const uomChip: React.CSSProperties = {
    fontSize: 9, fontWeight: 'bold', letterSpacing: 0.3, textTransform: 'uppercase',
    color: '#31569e', background: '#e8f0fe', border: '1px solid #a8c0f0',
    borderRadius: 2, padding: '0 5px', lineHeight: '14px',
};

// Inline label button in the expanded row — same chrome as the WO list's
// per-completion "Label" button, so the two logs read as one pattern.
const miniBtn: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 8, padding: '0 5px', cursor: 'pointer',
    background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid #808080',
    color: '#000040', textTransform: 'none', letterSpacing: 0,
};

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const PO_PAGE_SIZE = 20;

export default function PackingOrderView({ initialCreateState, onClearInitialState }: any = {}) {
    const { locations, attributes, companyProfile, itemIndex, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { formatDate: tzDate, formatDateTime: tzDateTime } = useTimezone();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');

    const [orders, setOrders] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [openCount, setOpenCount] = useState(0);
    const [doneCount, setDoneCount] = useState(0);
    // True from first paint so the list shows the loader, not "none yet".
    const [loading, setLoading] = useState(true);
    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skel = useTableSkeletonMetrics('packing-orders', listBodyRef, orders.length > 0);
    const [creating, setCreating] = useState(false);
    const [createInitialValues, setCreateInitialValues] = useState<any>(null);
    const [detail, setDetail] = useState<any | null>(null);
    // One row open at a time, same as the WO list — the panel is tall and two open
    // at once turns the list into a scroll hunt.
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [printCard, setPrintCard] = useState<any | null>(null);
    const [printLabels, setPrintLabels] = useState<{ order: any; units: any[] } | null>(null);
    const [page, setPage] = useState(1);
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(180);

    const itemById = useMemo(() => {
        const m: Record<string, any> = {};
        Object.entries(itemIndex || {}).forEach(([id, v]: [string, any]) => { m[id] = { id, ...v }; });
        return m;
    }, [itemIndex]);

    const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);
    // Seeded stores resolved by system_code, not by name — a plant may rename the
    // display name but the code is the stable handle (see SYSTEM_WAREHOUSES).
    const systemLocId = useCallback((code: string) => {
        const l = (locations || []).find((x: any) => x.system_code === code);
        return l ? String(l.id) : '';
    }, [locations]);
    const locationById = useMemo(() => {
        const m: Record<string, any> = {};
        (locations || []).forEach((l: any) => { m[String(l.id)] = l; });
        return m;
    }, [locations]);

    const loadPage = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE}/packing?page=${p}&size=${PO_PAGE_SIZE}`);
            if (res.ok) { const d = await res.json(); setOrders(d.items || []); setTotal(d.total || 0); }
        } finally { setLoading(false); }
    }, [authFetch]);

    const loadCounts = useCallback(async () => {
        const [pendRes, progRes, doneRes] = await Promise.all([
            authFetch(`${API_BASE}/packing?status=PENDING&page=1&size=1`),
            authFetch(`${API_BASE}/packing?status=IN_PROGRESS&page=1&size=1`),
            authFetch(`${API_BASE}/packing?status=COMPLETED&page=1&size=1`),
        ]);
        let open = 0;
        for (const r of [pendRes, progRes]) { if (r.ok) { const d = await r.json(); open += d.total || 0; } }
        setOpenCount(open);
        if (doneRes.ok) { const d = await doneRes.json(); setDoneCount(d.total || 0); }
    }, [authFetch]);

    const loadAll = useCallback(async () => {
        await Promise.all([loadPage(page), loadCounts()]);
    }, [loadPage, loadCounts, page]);

    useEffect(() => { loadCounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { loadPage(page); }, [page, loadPage]);

    // Deep-linked pre-fill from a Quarantine Packing "ready to pack" suggestion —
    // item/location/SO line are proposed, not committed; the form still opens for
    // the user to confirm or change before Create.
    useEffect(() => {
        if (initialCreateState) {
            setCreateInitialValues(initialCreateState);
            setCreating(true);
            onClearInitialState?.();
        }
    }, [initialCreateState, onClearInitialState]);

    const deleteOrder = async (po: any) => {
        const ok = await confirm({ title: 'Delete Packing Order', message: `Delete ${po.code}?`, confirmText: 'Delete', variant: 'danger' });
        if (!ok) return;
        const res = await authFetch(`${API_BASE}/packing/${po.id}`, { method: 'DELETE' });
        if (res.ok) { showToast('Packing order deleted', 'success'); loadAll(); }
        else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'failed'}`, 'danger'); }
    };

    const closeOrder = async (po: any) => {
        const ok = await confirm({
            title: 'Close Packing Order',
            message: `Close ${po.code}? No further cartons can be packed against it.`,
            confirmText: 'Close',
        });
        if (!ok) return;
        const res = await authFetch(`${API_BASE}/packing/${po.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'COMPLETED' }),
        });
        if (res.ok) { showToast('Packing order closed', 'success'); loadAll(); }
        else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'failed'}`, 'danger'); }
    };

    const pages = Math.max(1, Math.ceil(total / PO_PAGE_SIZE));
    const clampedPage = Math.min(page, pages);

    const PO_COLS = 10; // chevron + 8 data cols + actions

    // Expanded row — same three-pane shape as the WO list detail panel (info,
    // outputs, log), so a supervisor reads a packing order the way they read a WO.
    // Everything here is already on the list payload (`_load_options` eager-loads
    // completions, `_packed_units_for` decorates cartons) — no extra fetch.
    const renderPackDetail = (po: any) => {
        const it = itemById[String(po.item_id)];
        const uom = po.item_uom || it?.uom || '';
        // Newest first, matching the pack modal's Previous Entries.
        const comps = po.completions ? [...po.completions].reverse() : [];
        const units = po.packed_units || [];
        const srcName = locationById?.[String(po.source_location_id)]?.name || null;
        const outName = locationById?.[String(po.output_location_id)]?.name || null;

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
        // Cartons of one pack event — the label set for that log line, matching the
        // WO list's per-completion "Label" button.
        const unitsOfComp = (compId: string) =>
            units.filter((u: any) => String(u.packing_completion_id || '') === String(compId));

        return (
            <tr key={`${po.id}-detail`}>
                <td colSpan={PO_COLS} style={{ padding: 0 }}>
                    <ExpandedRowPanel classic={CLASSIC}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: '250px 230px minmax(260px, 1fr)',
                            border: '1px solid #7f9db9', fontFamily: xpFont, fontSize: 10,
                        }}>
                            {/* Info */}
                            <div style={{ borderRight: '1px solid #c0bdb5', padding: '6px 8px', background: '#f5f4ef' }}>
                                <div style={colHeader}>Info</div>
                                {infoRow('Item', po.item_code || it?.code || '—')}
                                {infoRow('Sales Order', po.sales_order_code || 'to stock')}
                                {po.color_name && infoRow('Colour', po.color_name)}
                                {infoRow(`${po.package_label} size`, num(po.pack_size) > 0 ? `${num(po.pack_size)} ${uom}` : 'per event')}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, margin: '2px 0' }}>
                                    <span style={{ color: '#888', fontSize: 9, minWidth: 60 }}>Route</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9 }}>
                                        <span style={{ background: '#e8f0fe', color: '#1a56c4', border: '1px solid #b0c8f8', padding: '0 4px' }}>{srcName || '?'}</span>
                                        <span style={{ color: '#888' }}>&#8594;</span>
                                        <span style={{ background: '#e6f4ea', color: '#1a6e2e', border: '1px solid #a8d8b0', padding: '0 4px' }}>{outName || '?'}</span>
                                    </span>
                                </div>
                                <div style={{ borderTop: '1px solid #e0ddd8', margin: '3px 0' }} />
                                {infoRow('Target', `${num(po.qty_target).toLocaleString()} ${uom}`)}
                                {infoRow('Packed', `${num(po.qty_packed).toLocaleString()} ${uom}`)}
                                {num(po.qty_rejected) > 0 && infoRow('QC reject', (
                                    <span style={{ color: '#a00000' }}>
                                        {num(po.qty_rejected).toFixed(2)}{po.package_count_rejected ? ` (${po.package_count_rejected})` : ''}
                                    </span>
                                ))}
                                <div style={{ borderTop: '1px solid #e0ddd8', margin: '3px 0' }} />
                                {infoRow('Created', po.created_at ? tzDateTime(po.created_at) : '—')}
                                {infoRow('Started', po.actual_start_date ? tzDateTime(po.actual_start_date) : '—')}
                                {infoRow('Reached target', po.actual_end_date ? tzDateTime(po.actual_end_date) : '—')}
                                {po.notes && (
                                    <div style={{ marginTop: 4, padding: '2px 5px', background: '#fffbe6', border: '1px solid #e0d080', fontSize: 9, fontStyle: 'italic', color: '#666' }}>
                                        {po.notes}
                                    </div>
                                )}
                            </div>

                            {/* Cartons minted by this order */}
                            <div style={{ borderRight: '1px solid #c0bdb5', padding: '6px 8px', background: '#f5f4ef', overflow: 'hidden' }}>
                                <div style={colHeader}>{po.package_label}s ({units.length})</div>
                                {units.length === 0 ? (
                                    <div style={{ color: '#aaa', fontStyle: 'italic', fontSize: 9 }}>Nothing packed yet.</div>
                                ) : (
                                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                        {units.map((u: any) => (
                                            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: 9, marginBottom: 2, paddingBottom: 2, borderBottom: '1px solid #e8e6e0' }}>
                                                <span style={{ color: '#888', width: 18, flexShrink: 0 }}>#{u.package_no}</span>
                                                <span style={{ fontFamily: CODE_FONT, color: '#00309c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={u.batch_number}>
                                                    {u.batch_number}
                                                </span>
                                                {/* Zero on hand = the carton has left on a pick list. */}
                                                <span style={{ fontWeight: 'bold', color: num(u.qty) > 0 ? '#0a3e0a' : '#999' }}>
                                                    {num(u.qty) > 0 ? num(u.qty).toFixed(2) : 'shipped'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Pack log — one row per PackingCompletion (one per lot per event) */}
                            <div style={{ padding: '6px 8px', background: '#f5f4ef', overflow: 'hidden' }}>
                                <div style={{ ...colHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                    <span>Pack Log ({comps.length})</span>
                                    {units.length > 0 && (
                                        <button type="button" onClick={() => setPrintLabels({ order: po, units })}
                                            style={miniBtn} title={`Print a label for every ${po.package_label.toLowerCase()} on this order`}>
                                            All Labels
                                        </button>
                                    )}
                                </div>
                                {comps.length === 0 ? (
                                    <div style={{ color: '#aaa', fontStyle: 'italic', fontSize: 9 }}>No entries yet.</div>
                                ) : (
                                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ ...th, width: 108 }}>Date / Time</th>
                                                    <th style={{ ...th, textAlign: 'right', width: 50 }}>Qty</th>
                                                    <th style={{ ...th, textAlign: 'right', width: 34 }}>{po.package_label.charAt(0)}s</th>
                                                    <th style={th}>Source lot</th>
                                                    <th style={th}>Operator</th>
                                                    <th style={{ ...th, width: 46 }} />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {comps.map((c: any, ci: number) => (
                                                    <React.Fragment key={c.id || ci}>
                                                        <tr style={{ background: c.rejected ? '#fbe4e4' : ci % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #e8e6e0' }}>
                                                            <td style={{ padding: '2px 5px', color: '#666', whiteSpace: 'nowrap' }}>
                                                                {c.completed_at ? tzDateTime(c.completed_at) : '—'}
                                                            </td>
                                                            <td style={{
                                                                padding: '2px 5px', textAlign: 'right', fontWeight: 'bold',
                                                                color: c.rejected ? '#900' : '#000080',
                                                                textDecoration: c.rejected ? 'line-through' : 'none',
                                                            }} title={c.reject_reason || undefined}>
                                                                +{num(c.qty).toFixed(2)}
                                                            </td>
                                                            <td style={{ padding: '2px 5px', textAlign: 'right', color: '#555' }}>{c.package_count}</td>
                                                            <td style={{ padding: '2px 5px', color: '#555', fontFamily: c.source_batch_number ? CODE_FONT : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}
                                                                title={c.source_batch_number || undefined}>
                                                                {c.source_batch_number || '—'}
                                                            </td>
                                                            <td style={{ padding: '2px 5px', color: '#333' }}>
                                                                {c.operator || '—'}
                                                                {c.rejected && (
                                                                    <span style={{ marginLeft: 5, fontSize: 8, fontWeight: 'bold', color: '#900', border: '1px solid #c88', background: '#fff', padding: '0 3px' }}>REJECTED</span>
                                                                )}
                                                                {/* Partial reject: the entry stays live with its qty already
                                                                    trimmed, so the scrapped part only shows as its own marker. */}
                                                                {!c.rejected && num(c.qty_rejected) > 0 && (
                                                                    <span title={c.reject_reason || 'Partially rejected'}
                                                                        style={{ marginLeft: 5, fontSize: 8, fontWeight: 'bold', color: '#900', border: '1px solid #c88', background: '#fff', padding: '0 3px' }}>
                                                                        -{num(c.qty_rejected).toFixed(2)} REJ
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '1px 4px', textAlign: 'right' }}>
                                                                {unitsOfComp(c.id).length > 0 && (
                                                                    <button type="button" style={miniBtn}
                                                                        onClick={() => setPrintLabels({ order: po, units: unitsOfComp(c.id) })}
                                                                        title={`Print labels for the ${unitsOfComp(c.id).length} ${po.package_label.toLowerCase()}(s) of this entry`}>
                                                                        Labels
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                        {c.notes && (
                                                            <tr style={{ background: ci % 2 === 0 ? '#fafaf7' : '#f0efe8', borderBottom: '1px solid #e8e6e0' }}>
                                                                <td colSpan={6} style={{ padding: '1px 5px 3px 12px', color: '#888', fontStyle: 'italic' }}>{c.notes}</td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
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
                icon="bi-box2"
                title="Packing Orders"
                right={canManage ? (
                    <button style={xpBtnCreate} onClick={() => setCreating(true)} title="Order finished goods packed into cartons">
                        <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />New Packing Order
                    </button>
                ) : undefined}
            />
            <div style={xpToolbar()}>
                <button style={xpBtn()} onClick={loadAll} title="Refresh">
                    <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#333' }}>
                    {total.toLocaleString()} order{total !== 1 ? 's' : ''}
                </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#fff', minHeight: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ ...xpTableHeader, width: 22 }} />
                            <th style={xpTableHeader}>Code</th>
                            <th style={xpTableHeader}>Item</th>
                            <th style={xpTableHeader}>Sales Order</th>
                            <th style={xpTableHeader}>Status</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Target</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Packed</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Cartons</th>
                            <th style={xpTableHeader}>Created</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody ref={listBodyRef}>
                        {orders.length === 0 && (loading ? (
                            <TableSkeleton rows={7} cols={skel.cols ?? PO_COLS} classic tdStyle={td} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                        ) : (
                            <tr><td colSpan={PO_COLS} style={{ padding: 0 }}>
                                <XPEmptyState icon="bi-box2" message='No packing orders yet. Click "New Packing Order" to pack finished goods into cartons.' />
                            </td></tr>
                        ))}
                        {orders.map((po: any, idx: number) => {
                            const it = itemById[String(po.item_id)];
                            const shortfall = num(po.qty_packed) < num(po.qty_target);
                            const closed = po.status === 'COMPLETED' || po.status === 'CANCELLED';
                            const isExpanded = expandedId === String(po.id);
                            return (
                                <React.Fragment key={po.id}>
                                <tr
                                    style={{ ...rowStyle(idx), ...(isExpanded ? { background: '#eef2ff' } : {}), cursor: 'pointer' }}
                                    onClick={() => setExpandedId(prev => prev === String(po.id) ? null : String(po.id))}
                                >
                                    <td style={{ ...td, padding: '3px 4px', textAlign: 'center' }}>
                                        <span style={{ fontSize: 10, color: '#555', lineHeight: 1 }}>{isExpanded ? '▼' : '►'}</span>
                                    </td>
                                    <td style={td}><CodeChip code={po.code} classic={CLASSIC} tone="accent" style={{ fontWeight: 'bold' }} /></td>
                                    <td style={td}>
                                        <div>{po.item_name || it?.name || po.item_id}</div>
                                        <div style={{ fontSize: 9, color: '#888' }}>{po.item_code || it?.code}</div>
                                    </td>
                                    <td style={td}>{po.sales_order_code || <span style={{ color: '#888' }}>to stock</span>}</td>
                                    <td style={td}><StatusChip status={po.status} /></td>
                                    <td style={{ ...td, textAlign: 'right' }}>{num(po.qty_target).toLocaleString()} {po.item_uom || it?.uom}</td>
                                    <td style={{ ...td, textAlign: 'right', color: shortfall ? '#c77800' : '#0a3e0a' }}>{num(po.qty_packed).toLocaleString()}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{po.package_count || 0}</td>
                                    <td style={td}>{po.created_at ? tzDate(po.created_at) : '-'}</td>
                                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                        {/* Pack is the row's primary action — inline, same shape as
                                            "log production output" on the WO list, not buried in the menu. */}
                                        {canManage && !closed && (
                                            <span style={{ marginRight: 2 }}>
                                                <XPActionButton
                                                    classic={CLASSIC}
                                                    tone="success"
                                                    icon="bi-plus-lg"
                                                    title="Pack — log cartons against this order"
                                                    onClick={() => setDetail(po)}
                                                />
                                            </span>
                                        )}
                                        <MenuTriggerButton classic onClick={e => menuToggle(String(po.id), e)} />
                                    </td>
                                </tr>
                                {isExpanded && renderPackDetail(po)}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pager page={clampedPage} total={total} pageSize={PO_PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />

            {menuOpenId && (() => {
                const po = orders.find((x: any) => String(x.id) === menuOpenId);
                if (!po) return null;
                const closed = po.status === 'COMPLETED' || po.status === 'CANCELLED';
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            // Open/Pack is inline on the row for anyone who can pack; the menu
                            // still carries it for closed orders and read-only users.
                            { key: 'open', label: closed ? 'View' : 'Pack', icon: 'bi-box-seam', hidden: canManage && !closed, onClick: () => { menuClose(); setDetail(po); } },
                            { key: 'card', label: 'Print Packing Card', icon: 'bi-printer', onClick: () => { menuClose(); setPrintCard(po); } },
                            { key: 'labels', label: 'Print Carton Labels', icon: 'bi-tags', hidden: !(po.packed_units || []).length, onClick: () => { menuClose(); setPrintLabels({ order: po, units: po.packed_units || [] }); } },
                            { key: 'close', label: 'Close Order', icon: 'bi-check2-square', hidden: !(canManage && !closed), onClick: () => { menuClose(); closeOrder(po); } },
                            { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, hidden: !(canManage && !(po.completions || []).length), onClick: () => { menuClose(); deleteOrder(po); } },
                        ]}
                    />
                );
            })()}
            <XPStatusBar right={`${openCount} open · ${doneCount} closed`}>
                {loading ? 'Loading...' : `${total} packing order(s)`}
            </XPStatusBar>

            {creating && (
                <PackingOrderForm
                    locPickerTreeOptions={locPickerTreeOptions}
                    defaultSourceLocId={systemLocId('QC')}
                    defaultOutputLocId={systemLocId('FG')}
                    authFetch={authFetch}
                    showToast={showToast}
                    initialValues={createInitialValues}
                    onClose={() => { setCreating(false); setCreateInitialValues(null); }}
                    onCreated={async (po: any) => { setCreating(false); setCreateInitialValues(null); await loadAll(); setDetail(po); }}
                />
            )}

            {detail && (
                <PackingOrderDetail
                    po={detail}
                    itemById={itemById}
                    locationById={locationById}
                    locPickerTreeOptions={locPickerTreeOptions}
                    authFetch={authFetch}
                    showToast={showToast}
                    onClose={() => setDetail(null)}
                    onChanged={loadAll}
                    onPrintCard={(o: any) => setPrintCard(o)}
                    onPrintLabels={(o: any, units: any[]) => setPrintLabels({ order: o, units })}
                />
            )}

            {printCard && (
                <PackingCardPrintModal
                    po={printCard}
                    attributes={attributes}
                    companyProfile={companyProfile}
                    currentStyle={uiStyle}
                    authFetch={authFetch}
                    onClose={() => setPrintCard(null)}
                />
            )}

            {printLabels && (
                <PackedUnitLabelPrintModal
                    po={printLabels.order}
                    units={printLabels.units}
                    companyProfile={companyProfile}
                    onClose={() => setPrintLabels(null)}
                />
            )}
        </ShellWindow>
    );
}

// ── create form ──────────────────────────────────────────────────────────────
function PackingOrderForm({ locPickerTreeOptions, defaultSourceLocId, defaultOutputLocId, authFetch, showToast, onClose, onCreated, initialValues }: any) {
    const { results: fgResults, onSearch: fgSearch } = useFinishedGoodsSearch();
    const [itemId, setItemId] = useState(initialValues?.item_id || '');
    const [qtyTarget, setQtyTarget] = useState(initialValues?.qty_target != null ? String(initialValues.qty_target) : '');
    const [packSize, setPackSize] = useState('');
    const [packageLabel, setPackageLabel] = useState('Carton');
    // Both stores default to the seeded ones: bulk FG waits in Quarantine until QC
    // releases it, sealed cartons land in the Finished Goods store. A Quarantine
    // Packing suggestion still names its own source and wins. Both stay editable —
    // these are only the defaults, not a fixed route.
    const [sourceLoc, setSourceLoc] = useState(initialValues?.source_location_id || defaultSourceLocId || '');
    const [outputLoc, setOutputLoc] = useState(defaultOutputLocId || '');
    const [soId, setSoId] = useState(initialValues?.sales_order_id || '');
    const [soLineId, setSoLineId] = useState(initialValues?.sales_order_line_id || '');
    const [notes, setNotes] = useState('');
    const [materials, setMaterials] = useState<any[]>([]);
    const [sos, setSos] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await authFetch(`${API_BASE}/sales-orders?status=PENDING,READY,PARTIAL`);
            if (res.ok) { const d = await res.json(); setSos(Array.isArray(d) ? d : (d.items || [])); }
        })();
    }, [authFetch]);

    // Locations come from DataContext, which may still be loading when this modal
    // opens — backfill the defaults once they arrive, without clobbering a pick.
    useEffect(() => {
        if (defaultSourceLocId) setSourceLoc((v: string) => v || defaultSourceLocId);
        if (defaultOutputLocId) setOutputLoc((v: string) => v || defaultOutputLocId);
    }, [defaultSourceLocId, defaultOutputLocId]);

    // A pre-filled item (from a Quarantine Packing suggestion) is only an id —
    // the combobox can't show its name/code until a search has actually returned
    // it, so seed one from whatever identifying text the suggestion carried.
    useEffect(() => {
        if (initialValues?.item_id) fgSearch(initialValues.item_code || initialValues.item_name || '');
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const selectedSO = useMemo(() => sos.find((s: any) => String(s.id) === soId), [sos, soId]);
    const soLines = selectedSO?.lines || [];

    // Picking an SO line fixes what is being packed — item and variant both come
    // from the order, so they are not asked for twice.
    const applySoLine = (lineId: string) => {
        setSoLineId(lineId);
        const line = soLines.find((l: any) => String(l.id) === lineId);
        if (line) {
            setItemId(String(line.item_id));
            if (!qtyTarget) setQtyTarget(String(line.qty));
        }
    };

    const fgOptions = useMemo(
        () => (fgResults || []).map((i: any) => ({ value: String(i.id), label: i.name, subLabel: i.code })),
        [fgResults]
    );

    const addMaterial = () => setMaterials(prev => [...prev, { item_id: '', qty_planned: '', location_id: '' }]);
    const setMaterial = (idx: number, patch: any) => setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
    const removeMaterial = (idx: number) => setMaterials(prev => prev.filter((_, i) => i !== idx));

    const submit = async () => {
        if (!itemId) { showToast('Pick an item to pack', 'warning'); return; }
        if (num(qtyTarget) <= 0) { showToast('Target quantity must be greater than zero', 'warning'); return; }
        // The line link is what credits these cartons to the order — without it the
        // SO can never reach READY, so an SO with no line picked is a silent dead end.
        if (soId && !soLineId) { showToast('Pick which order line this packs', 'warning'); return; }
        // Both are hard-required by the pack endpoint, so catching it here beats
        // creating an order that can never be packed.
        if (!sourceLoc) { showToast('Pick where the bulk goods are packed from', 'warning'); return; }
        if (!outputLoc) { showToast('Pick where the finished cartons are stored', 'warning'); return; }
        setSaving(true);
        try {
            const body = {
                item_id: itemId,
                qty_target: num(qtyTarget),
                pack_size: packSize === '' ? null : num(packSize),
                package_label: packageLabel || 'Carton',
                source_location_id: sourceLoc || null,
                output_location_id: outputLoc || null,
                sales_order_id: soId || null,
                sales_order_line_id: soLineId || null,
                // Variant is deliberately not sent: it is resolved from the source
                // lot's own StockBalance row at pack time (the SO-line inheritance
                // path on the server still fills it when packing to order).
                notes: notes || null,
                materials: materials
                    .filter(m => m.item_id && num(m.qty_planned) > 0)
                    .map(m => ({ item_id: m.item_id, qty_planned: num(m.qty_planned), location_id: m.location_id || null })),
            };
            const res = await authFetch(`${API_BASE}/packing`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            if (res.ok) { showToast('Packing order created', 'success'); onCreated(await res.json()); }
            else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'create failed'}`, 'danger'); }
        } finally { setSaving(false); }
    };

    return (
        <ModalWrapper
            isOpen onClose={onClose} title="New Packing Order" size="lg" modeless
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <button style={xpBtn()} onClick={onClose}>Cancel</button>
                    <button style={xpBtnGreen()} disabled={saving} onClick={submit}>{saving ? 'Creating...' : 'Create'}</button>
                </div>
            }
        >
            <div style={{ fontFamily: xpFont }}>
                <FormSection title={<SectionTitle icon="bi-receipt">Demand</SectionTitle>} classic={CLASSIC}>
                    <div style={{ ...fieldGrid, gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                            <FieldLabel classic={CLASSIC} hint="Leave empty to pack to stock">Sales Order</FieldLabel>
                            <select style={{ ...xpSelect, width: '100%' }} value={soId} onChange={e => { setSoId(e.target.value); setSoLineId(''); }}>
                                <option value="">— pack to stock —</option>
                                {sos.map((s: any) => <option key={s.id} value={s.id}>{s.po_number} · {s.customer_name}</option>)}
                            </select>
                        </div>
                        {soId && (
                            <div>
                                <FieldLabel classic={CLASSIC} hint="Fixes the item being packed">Order line</FieldLabel>
                                <select style={{ ...xpSelect, width: '100%' }} value={soLineId} onChange={e => applySoLine(e.target.value)}>
                                    <option value="">— select line —</option>
                                    {soLines.map((l: any) => (
                                        <option key={l.id} value={l.id}>{l.item_name || l.item_code || l.item_id} · {num(l.qty).toLocaleString()}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    {soLineId && (
                        <div style={hintText}>Colour and variant attributes are inherited from the order line.</div>
                    )}
                </FormSection>

                <FormSection title={<SectionTitle icon="bi-box2">What to Pack</SectionTitle>} classic={CLASSIC}>
                    {/* Fixed columns, and no per-field hints in this row: FieldLabel puts a
                        hint between the label and the input, so hinting only one field of a
                        row pushes that input a line below its neighbours. */}
                    <div style={{ ...fieldGrid, gridTemplateColumns: 'minmax(200px, 1fr) 100px 100px 120px' }}>
                        <div>
                            <FieldLabel classic={CLASSIC}>Finished good</FieldLabel>
                            <SearchableSelect options={fgOptions} value={itemId} onChange={setItemId} onSearch={fgSearch} placeholder="Search item..." size="sm" />
                        </div>
                        <div>
                            <FieldLabel classic={CLASSIC}>Target qty</FieldLabel>
                            <input type="number" min={0} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={qtyTarget} onChange={e => setQtyTarget(e.target.value)} />
                        </div>
                        <div>
                            <FieldLabel classic={CLASSIC}>Qty per carton</FieldLabel>
                            <input type="number" min={0} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={packSize} onChange={e => setPackSize(e.target.value)} />
                        </div>
                        <div>
                            <FieldLabel classic={CLASSIC}>Package type</FieldLabel>
                            <input style={{ ...xpInput, width: '100%' }} value={packageLabel} onChange={e => setPackageLabel(e.target.value)} placeholder="Carton" />
                        </div>
                    </div>
                    <div style={hintText}>
                        Qty per carton splits the target — leave it empty to decide the carton count per pack event.
                    </div>
                </FormSection>

                <FormSection title={<SectionTitle icon="bi-geo-alt">Locations</SectionTitle>} classic={CLASSIC}>
                    <div style={{ ...fieldGrid, gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                            <FieldLabel classic={CLASSIC} hint="Bulk finished goods are drawn from here">Pack from</FieldLabel>
                            <TreeSelect options={locPickerTreeOptions} value={sourceLoc} onChange={setSourceLoc} allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                        </div>
                        <div>
                            <FieldLabel classic={CLASSIC} hint="Sealed cartons land here">Store cartons at</FieldLabel>
                            <TreeSelect options={locPickerTreeOptions} value={outputLoc} onChange={setOutputLoc} allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                        </div>
                    </div>
                    <div style={hintText}>
                        The variant is not asked for here — the packer picks the source lots at pack time,
                        and each lot&apos;s own stock row states its variant.
                    </div>
                </FormSection>

                <FormSection
                    classic={CLASSIC}
                    title={
                        <SectionTitle
                            icon="bi-boxes"
                            right={<XPActionButton classic={CLASSIC} icon="bi-plus-lg" label="Add Material" onClick={addMaterial} />}
                        >
                            Packaging Materials (optional)
                        </SectionTitle>
                    }
                >
                    {materials.length === 0 && <div style={hintText}>No packaging materials planned.</div>}
                    {materials.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                            <div style={{ flex: 1, minWidth: 200 }}><FieldLabel classic={CLASSIC}>Material</FieldLabel></div>
                            <div style={{ width: 100 }}><FieldLabel classic={CLASSIC}>Qty</FieldLabel></div>
                            <div style={{ width: 180 }}><FieldLabel classic={CLASSIC}>Take from</FieldLabel></div>
                            <div style={{ width: 26 }} />
                        </div>
                    )}
                    {materials.map((m, idx) => (
                        <MaterialRow
                            key={idx}
                            row={m}
                            authFetch={authFetch}
                            locPickerTreeOptions={locPickerTreeOptions}
                            onChange={(patch: any) => setMaterial(idx, patch)}
                            onRemove={() => removeMaterial(idx)}
                        />
                    ))}
                </FormSection>

                <FormSection title={<SectionTitle icon="bi-sticky">Notes</SectionTitle>} classic={CLASSIC}>
                    <textarea style={{ ...xpInput, height: 50, width: '100%', resize: 'vertical', boxSizing: 'border-box' }} value={notes} onChange={e => setNotes(e.target.value)} />
                </FormSection>
            </div>
        </ModalWrapper>
    );
}

// Packaging materials are any item (cartons, poly bags, labels), not a scoped
// category — so this uses the generic item search rather than the FG/RM hooks.
function MaterialRow({ row, authFetch, locPickerTreeOptions, onChange, onRemove }: any) {
    const [results, setResults] = useState<any[]>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchResults = useCallback(async (search = '') => {
        const q = search ? `&search=${encodeURIComponent(search)}` : '';
        const res = await authFetch(`${API_BASE}/items?limit=50${q}`);
        if (res.ok) { const d = await res.json(); setResults(Array.isArray(d) ? d : (d.items || [])); }
    }, [authFetch]);

    useEffect(() => {
        fetchResults();
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [fetchResults]);

    const onSearch = (term: string) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fetchResults(term), 300);
    };

    const options = useMemo(
        () => (results || []).map((i: any) => ({ value: String(i.id), label: i.name, subLabel: i.code })),
        [results]
    );

    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
                <SearchableSelect options={options} value={row.item_id} onChange={v => onChange({ item_id: v })} onSearch={onSearch} placeholder="Search material..." size="sm" />
            </div>
            <input type="number" min={0} style={{ ...xpInput, width: 100, textAlign: 'right' }} placeholder="Qty"
                value={row.qty_planned} onChange={e => onChange({ qty_planned: e.target.value })} />
            <div style={{ width: 180 }}>
                <TreeSelect options={locPickerTreeOptions} value={row.location_id || ''} onChange={(id: string) => onChange({ location_id: id })} allowEmpty emptyLabel="(pack-from)" size="sm" style={{ width: '100%' }} />
            </div>
            <XPActionButton classic={CLASSIC} tone="danger" icon="bi-trash" title="Remove material" onClick={onRemove} />
        </div>
    );
}

// ── pack logging ─────────────────────────────────────────────────────────────
// Deliberately shaped like WOCompletionModal: same header progress panel, same
// big "qty" entry, same "Lots to Consume" checkbox list with FIFO take-chips,
// same legend-panel groupboxes and Previous-Entries table. Packing is the same
// motion as logging WO output for the operator, so it reads the same. Keep the
// two in step — a change to one of these patterns belongs in both.
function PackingOrderDetail({ po: initialPo, itemById, locationById, locPickerTreeOptions, authFetch, showToast, onClose, onChanged, onPrintCard, onPrintLabels }: any) {
    const { hasPermission } = useUser();
    const { formatDateTime: tzDateTime } = useTimezone();
    const canManage = hasPermission('sales.manage');
    const [po, setPo] = useState<any>(initialPo);
    const closed = po.status === 'COMPLETED' || po.status === 'CANCELLED';
    const readOnly = closed || !canManage;

    const it = itemById[String(po.item_id)];
    const uom = po.item_uom || it?.uom || '';
    const target = num(po.qty_target);
    const packed = num(po.qty_packed);
    const remaining = Math.max(0, target - packed);
    const pct = target > 0 ? Math.min(100, Math.round((packed / target) * 100)) : 0;

    const [qty, setQty] = useState<string>('');
    const [boxSize, setBoxSize] = useState<string>(() => (num(po.pack_size) > 0 ? String(num(po.pack_size)) : ''));
    const [operator, setOperator] = useState('');
    const [packNotes, setPackNotes] = useState('');
    const [lots, setLots] = useState<any[]>([]);
    const [heldLotCount, setHeldLotCount] = useState(0);
    const [lotsLoading, setLotsLoading] = useState(false);
    const [selectedLots, setSelectedLots] = useState<string[]>([]);
    const [logging, setLogging] = useState(false);

    // QC reject of an already-logged pack event. Same split as a WO completion
    // reject: whole event by default, or name cartons for a partial. The rejected
    // qty leaves qty_packed and the cartons move to the defect store.
    const [rejectComp, setRejectComp] = useState<any>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectUsable, setRejectUsable] = useState(false);
    const [rejectUnitIds, setRejectUnitIds] = useState<string[]>([]);
    const [rejecting, setRejecting] = useState(false);

    const useLotPicker = !!it?.lot_tracked;
    const outputLocName = locationById?.[String(po.output_location_id)]?.name || null;
    const sourceLocName = locationById?.[String(po.source_location_id)]?.name || null;

    // Locations are editable here, not just on the create form: /complete hard-
    // requires both, and an order created without them (a Quarantine Packing
    // suggestion names only a source) is otherwise dead — no other edit path exists.
    const [srcDraft, setSrcDraft] = useState<string>(String(po.source_location_id || ''));
    const [outDraft, setOutDraft] = useState<string>(String(po.output_location_id || ''));
    const [savingLocs, setSavingLocs] = useState(false);
    const locsDirty = srcDraft !== String(po.source_location_id || '') || outDraft !== String(po.output_location_id || '');
    const locsMissing = !po.source_location_id || !po.output_location_id;

    const saveLocations = async () => {
        if (!srcDraft || !outDraft) { showToast('Both locations are required', 'danger'); return; }
        setSavingLocs(true);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_location_id: srcDraft, output_location_id: outDraft }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Could not save locations');
            }
            setPo(await res.json());
            showToast('Locations updated', 'success');
            await onChanged();
        } catch (e: any) {
            showToast(e.message, 'danger');
        } finally { setSavingLocs(false); }
    };

    // The packer picks lots exactly as a stager picks material for a WO: the lot
    // pins the StockBalance row being drawn, which is what makes the order's
    // variant redundant — the server reads the variant back off that row.
    // Scoping the fetch to the order's source location makes /batches drop lots
    // with no stock there, so only packable lots are ever offered.
    useEffect(() => {
        if (!useLotPicker || !po.source_location_id) { setLots([]); return; }
        let alive = true;
        setLotsLoading(true);
        (async () => {
            try {
                const res = await authFetch(
                    `${API_BASE}/batches?item_id=${po.item_id}&location_id=${po.source_location_id}&limit=200&with_source_lots=true`
                );
                const list = res.ok ? (await res.json() || []) : [];
                if (!alive) return;
                const withStock = (list || []).filter((b: any) => (b.remaining ?? 0) > 0 && b.quality_status !== 'REJECTED');
                // Held lots are excluded here rather than merely flagged — the server
                // hard-blocks packing them anyway (assert_lots_released), so offering
                // them as selectable would just be a checkbox that always 400s on submit.
                setHeldLotCount(withStock.filter((b: any) => b.held).length);
                const available = withStock.filter((b: any) => !b.held);
                setLots(available);
                // Default to every ready lot combined — the packer normally wants the
                // whole released pool, not to hand-pick which lot each box comes from.
                setSelectedLots(available.map((b: any) => String(b.id)));
            } finally {
                if (alive) setLotsLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [po.item_id, po.source_location_id, useLotPicker, authFetch, po.qty_packed]);

    const selSet = new Set(selectedLots);
    const selAvailable = lots.filter((b: any) => selSet.has(String(b.id)))
        .reduce((s: number, b: any) => s + (b.remaining ?? 0), 0);

    // Spread the logged qty FIFO across the checked lots — oldest first, each
    // capped at its own remaining. /batches returns newest-first, hence reverse.
    // Same rule as WOCompletionModal's multi-lot consume.
    const lotAllocation = (): { batch_id: string; qty: number }[] => {
        let need = num(qty);
        if (need <= 0 || !selectedLots.length) return [];
        const out: { batch_id: string; qty: number }[] = [];
        for (const b of lots.filter((x: any) => selSet.has(String(x.id))).slice().reverse()) {
            if (need <= 1e-9) break;
            const take = Math.min(need, b.remaining ?? 0);
            if (take <= 0) continue;
            out.push({ batch_id: String(b.id), qty: Number(take.toFixed(4)) });
            need -= take;
        }
        return out;
    };
    const alloc = lotAllocation();
    const drawn = alloc.reduce((s, l) => s + l.qty, 0);
    const short = num(qty) > 0 && drawn + 1e-6 < num(qty);
    const takeByBatch: Record<string, number> = {};
    for (const l of alloc) takeByBatch[l.batch_id] = l.qty;

    // Mirrors packing_service.split_qty on the backend: fixed-size boxes plus one
    // remainder box, never an even split. Only used to *seed* the editable rows
    // below — once seeded, the rows are the user's own to edit, add to, or remove.
    const splitBoxes = (total: number, size: number): number[] => {
        if (total <= 0) return [];
        if (!(size > 0)) return [Number(total.toFixed(4))];
        const full = Math.floor(total / size + 1e-9);
        const remainder = Number((total - full * size).toFixed(4));
        const parts = Array(full).fill(Number(size.toFixed(4)));
        if (remainder > 1e-6) parts.push(remainder);
        return parts.length ? parts : [Number(total.toFixed(4))];
    };

    // Boxes are edited as one flat list against the combined total, regardless
    // of how many lots feed it — the server is the one that works out which lot
    // backs each box (splitting a box across a lot boundary if needed), so the
    // packer never has to think about lot lines while boxing up.
    // `kg` is the scale reading for that physical carton, entered by the packer —
    // it is the label's N.W. line and is never derived from qty (the item's UOM
    // may be yards, and the same yardage weighs differently per lot).
    type BoxRow = { qty: string; kg: string };
    const [boxRows, setBoxRows] = useState<BoxRow[]>([]);
    const packTotal = useLotPicker ? drawn : num(qty);

    // Seed once a qty is entered and no rows exist yet (a fresh form, or right
    // after Regenerate clears them) — after that, edits belong to the user.
    useEffect(() => {
        if (boxRows.length === 0 && packTotal > 0) {
            setBoxRows(splitBoxes(packTotal, num(boxSize)).map(q => ({ qty: String(q), kg: '' })));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [packTotal]);

    // Regenerate rebuilds the qty split but keeps weights already keyed in
    // positionally — re-splitting after a typo shouldn't wipe the scale readings.
    const regenerateBoxes = () => setBoxRows(prev =>
        splitBoxes(packTotal, num(boxSize)).map((q, i) => ({ qty: String(q), kg: prev[i]?.kg || '' })));
    const updateBoxRow = (i: number, patch: Partial<BoxRow>) =>
        setBoxRows(prev => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
    const removeBoxRow = (i: number) => setBoxRows(prev => prev.filter((_, idx) => idx !== i));
    const addBoxRow = () => setBoxRows(prev => [...prev, { qty: '', kg: '' }]);

    // Weights stay positional against the qtys the server receives, so filter both
    // in one pass — a blank weight travels as null, not as a dropped position.
    const boxes = boxRows.filter(b => num(b.qty) > 0);
    const boxValues = boxes.map(b => num(b.qty));
    const boxWeights = boxes.map(b => (num(b.kg) > 0 ? num(b.kg) : null));
    const anyWeights = boxWeights.some(w => w !== null);
    const boxTotal = boxValues.reduce((s, v) => s + v, 0);
    const weightTotal = boxWeights.reduce((s: number, v) => s + (v || 0), 0);
    const boxMismatch = packTotal > 0 && Math.abs(boxTotal - packTotal) > 1e-3;

    const toggleLot = (id: string, on: boolean) =>
        setSelectedLots(prev => on ? [...prev, id] : prev.filter(x => x !== id));
    const allIds = lots.map((b: any) => String(b.id));
    const allSelected = allIds.length > 0 && selectedLots.length === allIds.length;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = num(qty);
        if (locsMissing) { showToast('Set both locations on this order before packing', 'danger'); return; }
        if (locsDirty) { showToast('Save the location change before logging', 'danger'); return; }
        if (q <= 0) { showToast('Enter a positive quantity', 'danger'); return; }
        if (boxValues.length <= 0) { showToast(`At least one ${po.package_label.toLowerCase()} is required`, 'danger'); return; }
        if (boxMismatch) {
            showToast(
                `Boxes total ${boxTotal.toFixed(2)} but ${packTotal.toFixed(2)} is being packed — fix the box list`,
                'danger',
            );
            return;
        }

        let body: any = {
            qty: q,
            boxes: boxValues,
            box_weights: anyWeights ? boxWeights : null,
            operator: operator || null,
            notes: packNotes || null,
        };
        if (useLotPicker) {
            if (!selectedLots.length) { showToast('Select at least one lot to pack from', 'danger'); return; }
            if (short) {
                showToast(
                    `Selected lots hold only ${drawn.toFixed(2)} of the ${q.toFixed(2)} needed — select more lots`,
                    'danger',
                );
                return;
            }
            body = {
                lots: alloc,
                boxes: boxValues,
                box_weights: anyWeights ? boxWeights : null,
                operator: operator || null,
                notes: packNotes || null,
            };
        }

        setLogging(true);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}/complete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const fresh = await res.json();
                setPo(fresh);
                setQty(''); setPackNotes(''); setBoxRows([]);
                showToast(`Packed ${q} into ${boxValues.length} ${po.package_label.toLowerCase()}(s) — total ${num(fresh.qty_packed).toFixed(2)} / ${target}`, 'success');
                await onChanged();
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Pack failed', 'danger');
            }
        } finally { setLogging(false); }
    };

    const units = po.packed_units || [];
    const completions = po.completions ? [...po.completions].reverse() : [];

    // Good cartons of one pack event — the choices for a partial reject.
    const goodUnitsOf = (compId: string) => units.filter((u: any) =>
        String(u.packing_completion_id || '') === String(compId)
        && u.quality_status !== 'REJECTED' && u.quality_status !== 'REJECT_USABLE' && u.quality_status !== 'DISPOSED');

    const openReject = (c: any) => {
        setRejectComp(c);
        setRejectReason('');
        setRejectUsable(false);
        setRejectUnitIds([]);   // empty = whole event
    };

    const submitReject = async () => {
        if (!rejectComp) return;
        setRejecting(true);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}/completions/${rejectComp.id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: rejectReason.trim() || null,
                    packed_unit_ids: rejectUnitIds,
                    usable: rejectUsable,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Reject failed');
            }
            const fresh = await res.json();
            setPo(fresh);
            setRejectComp(null);
            showToast(
                `QC rejected ${rejectUnitIds.length || goodUnitsOf(rejectComp.id).length || rejectComp.package_count} ${po.package_label.toLowerCase()}(s)`,
                'success',
            );
            await onChanged();
        } catch (e: any) {
            showToast(e.message, 'danger');
        } finally { setRejecting(false); }
    };

    return (
        <ModalWrapper
            isOpen onClose={onClose}
            title={`Pack ${po.code} — ${po.item_name || it?.name || ''}`}
            size="md" modeless
            footer={
                <>
                    <button type="button" onClick={onClose} style={xpBtn()}>Close</button>
                    <button type="button" style={xpBtn()} onClick={() => onPrintCard(po)}>Packing Card</button>
                    <button type="button" style={xpBtn()} disabled={!units.length} onClick={() => onPrintLabels(po, units)}>
                        Carton Labels
                    </button>
                    {!readOnly && (
                        <button type="submit" form="packing-log-form" disabled={logging || boxMismatch || locsMissing || locsDirty}
                            style={{ ...xpBtnGreen(), opacity: logging || boxMismatch || locsMissing || locsDirty ? 0.6 : 1 }}>
                            {logging ? 'Packing...' : 'Log Packing'}
                        </button>
                    )}
                </>
            }
        >
            <form id="packing-log-form" onSubmit={handleSubmit} style={{ fontFamily: xpFont }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Order info + progress */}
                    <div style={{ border: '1px solid #aca899', padding: '8px 10px', background: '#f5f4ee', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: 11, fontWeight: 'bold', color: '#000080' }}>{po.item_name || po.item_code}</span>
                            <span style={{ fontSize: 10, color: '#555' }}>{po.code}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 'bold', color: '#555', width: 26, flexShrink: 0 }}>PCK</span>
                            <ProgressBar pct={pct} tone={pct >= 100 ? 'green' : 'blue'} hatched height={14} label="inside" />
                            <span style={{ fontSize: 9, color: '#555', whiteSpace: 'nowrap', width: 90, flexShrink: 0, textAlign: 'right' }}>
                                {packed.toFixed(2)} / {target}
                            </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#555', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span>Remaining: <strong style={{ color: '#b46a00' }}>{remaining.toFixed(2)}</strong></span>
                            <span>{po.package_label}s: <strong>{po.package_count || 0}</strong></span>
                            {num(po.qty_rejected) > 0 && (
                                <span title="QC-rejected cartons — quarantined in the defect store, not part of packed qty">
                                    QC reject: <strong style={{ color: '#a00000' }}>{num(po.qty_rejected).toFixed(2)}</strong>
                                    {po.package_count_rejected ? ` (${po.package_count_rejected})` : ''}
                                </span>
                            )}
                            <span>{po.sales_order_code ? <>SO: <strong>{po.sales_order_code}</strong></> : 'to stock'}</span>
                            {po.color_name && <span>Colour: <strong>{po.color_name}</strong></span>}
                            <StatusChip status={po.status} tint />
                        </div>
                    </div>

                    {closed && (
                        <div style={{ background: '#eef7ee', border: '1px solid #2d7a2d', color: '#0a3e0a', padding: '4px 8px', fontSize: 10 }}>
                            This packing order is {po.status} — read-only.
                        </div>
                    )}

                    {readOnly && (outputLocName || sourceLocName) && (
                        <div style={{ background: '#f5f4ee', border: '1px solid #aca899', padding: '4px 8px', fontSize: 10, color: '#555' }}>
                            {sourceLocName && <span>Packed from <strong>{sourceLocName}</strong></span>}
                            {outputLocName && <span style={{ marginLeft: sourceLocName ? 8 : 0 }}>{po.package_label}s stored at <strong>{outputLocName}</strong></span>}
                        </div>
                    )}

                    {/* Entry fields */}
                    {!readOnly && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div>
                                <label style={{ ...xpFormLabel, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>Qty to Pack</span>
                                    {uom && <span style={uomChip}>{uom}</span>}
                                </label>
                                <input
                                    type="number"
                                    style={{ ...xpInput, width: '100%', fontSize: 13, height: 22 }}
                                    value={qty}
                                    onChange={e => setQty(e.target.value)}
                                    min="0.0001" step="any"
                                    placeholder={remaining > 0 ? remaining.toFixed(2) : String(target)}
                                    autoFocus
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ ...xpFormLabel, fontWeight: 'bold' }}>Box size</label>
                                    <input
                                        type="number"
                                        style={{ ...xpInput, width: '100%' }}
                                        value={boxSize}
                                        onChange={e => setBoxSize(e.target.value)}
                                        min="0" step="any"
                                        placeholder="whole qty in one box"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={regenerateBoxes}
                                    title="Reset the box list below from Qty to Pack ÷ Box size"
                                    style={{ ...xpBtn(), fontSize: 9, padding: '3px 8px', marginBottom: 1 }}
                                >
                                    Regenerate
                                </button>
                            </div>

                            <div>
                                <label style={{ ...xpFormLabel, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{po.package_label}s to be Made</span>
                                    <button
                                        type="button"
                                        onClick={addBoxRow}
                                        style={{ ...xpBtn(), fontSize: 9, padding: '0 6px' }}
                                    >+ Add {po.package_label.toLowerCase()}</button>
                                </label>
                                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: 140, overflowY: 'auto' }}>
                                    {boxRows.length === 0 && (
                                        <div style={{ fontSize: 10, color: '#888', padding: '4px 5px' }}>
                                            Enter a quantity above to generate boxes.
                                        </div>
                                    )}
                                    {boxRows.map((b, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: 5, padding: '2px 5px',
                                            borderBottom: '1px solid #eceae2',
                                        }}>
                                            <span style={{ fontSize: 9, color: '#888', width: 26, flexShrink: 0 }}>#{i + 1}</span>
                                            <input
                                                type="number"
                                                style={{ ...xpInput, flex: 1, minWidth: 0 }}
                                                value={b.qty}
                                                onChange={e => updateBoxRow(i, { qty: e.target.value })}
                                                min="0" step="any"
                                            />
                                            {uom && <span style={{ fontSize: 9, color: '#888', width: 26, flexShrink: 0 }}>{uom}</span>}
                                            {/* Net weight off the scale — prints as N.W. on the carton label. */}
                                            <input
                                                type="number"
                                                style={{ ...xpInput, width: 62, background: num(b.kg) > 0 ? '#fff' : '#fffbe6' }}
                                                value={b.kg}
                                                onChange={e => updateBoxRow(i, { kg: e.target.value })}
                                                min="0" step="any"
                                                placeholder="net wt"
                                                title="Net weight of this carton off the scale — printed as N.W. on the label"
                                            />
                                            <span style={{ fontSize: 9, color: '#888', width: 16, flexShrink: 0 }}>kg</span>
                                            <button
                                                type="button"
                                                onClick={() => removeBoxRow(i)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aa0000', fontSize: 13, fontWeight: 'bold', padding: '0 3px' }}
                                                title="Remove"
                                            >×</button>
                                        </div>
                                    ))}
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
                                    padding: '3px 5px', background: '#f0efe6', border: '1px solid #c0bdb5', borderTop: 'none',
                                }}>
                                    <span style={{
                                        width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                                        background: boxMismatch ? '#cc3300' : '#4caf50',
                                    }} />
                                    <span style={{ color: '#555' }}>Boxed:</span>
                                    <span style={{ fontWeight: 'bold', color: boxMismatch ? '#a00000' : '#2e7d32' }}>
                                        {boxTotal.toFixed(2)}
                                    </span>
                                    <span style={{ color: '#c0bdb5' }}>/</span>
                                    <span style={{ fontWeight: 'bold' }}>{packTotal.toFixed(2)} {uom}</span>
                                    <span style={{ color: '#c0bdb5' }}>|</span>
                                    <span style={{ color: '#555' }}>{po.package_label}s:</span>
                                    <span style={{ fontWeight: 'bold' }}>{boxValues.length}</span>
                                    {anyWeights && (
                                        <>
                                            <span style={{ color: '#c0bdb5' }}>|</span>
                                            <span style={{ color: '#555' }}>Net wt:</span>
                                            <span style={{ fontWeight: 'bold' }}>{weightTotal.toFixed(2)} kg</span>
                                        </>
                                    )}
                                    {boxMismatch && <span style={{ color: '#a00000', marginLeft: 'auto', fontStyle: 'italic' }}>Doesn&apos;t match qty to pack</span>}
                                </div>
                            </div>
                            <div style={{
                                background: locsMissing ? '#fff4e5' : '#eef7ee',
                                border: `1px solid ${locsMissing ? '#d9a441' : '#9cc79c'}`,
                                padding: '5px 8px', fontSize: 10,
                                display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap',
                            }}>
                                <div style={{ flex: 1, minWidth: 150 }}>
                                    <label style={{ ...xpFormLabel, fontSize: 9, color: '#555' }}>Pack from</label>
                                    <TreeSelect options={locPickerTreeOptions} value={srcDraft} onChange={setSrcDraft}
                                        allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 150 }}>
                                    <label style={{ ...xpFormLabel, fontSize: 9, color: '#555' }}>{po.package_label}s stored at</label>
                                    <TreeSelect options={locPickerTreeOptions} value={outDraft} onChange={setOutDraft}
                                        allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                                </div>
                                {(locsDirty || locsMissing) && (
                                    <button type="button" onClick={saveLocations}
                                        disabled={savingLocs || !srcDraft || !outDraft}
                                        style={{ ...xpBtn(), fontSize: 9, padding: '3px 8px', marginBottom: 1, opacity: savingLocs || !srcDraft || !outDraft ? 0.6 : 1 }}>
                                        {savingLocs ? 'Saving...' : 'Save Locations'}
                                    </button>
                                )}
                                {locsMissing && (
                                    <div style={{ flexBasis: '100%', color: '#7a4a00' }}>
                                        Both locations are required before packing can be logged.
                                    </div>
                                )}
                                {locsDirty && !locsMissing && (
                                    <div style={{ flexBasis: '100%', color: '#7a4a00' }}>
                                        Unsaved location change — save before logging.
                                    </div>
                                )}
                            </div>

                            {useLotPicker && (
                                !po.source_location_id ? (
                                    <div style={{ background: '#fff4e5', border: '1px solid #d9a441', color: '#7a4a00', padding: '4px 8px', fontSize: 10 }}>
                                        Set a pack-from location on this order before packing.
                                    </div>
                                ) : (
                                    <div>
                                        <label style={{ ...xpFormLabel, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Lots to Pack From — {po.item_code || it?.code || ''}</span>
                                            <span style={{ fontWeight: 'normal', color: short ? '#900' : '#555' }}>
                                                {selectedLots.length} lot{selectedLots.length === 1 ? '' : 's'} · {selAvailable.toFixed(2)} available · drawing{' '}
                                                <strong>{drawn.toFixed(2)}</strong>{short ? ` of ${num(qty).toFixed(2)}` : ''}
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedLots(allSelected ? [] : allIds)}
                                                    style={{ ...xpBtn(), fontSize: 9, padding: '0 6px', marginLeft: 6 }}
                                                >{allSelected ? 'None' : 'All'}</button>
                                            </span>
                                        </label>
                                        <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: 150, overflowY: 'auto' }}>
                                            {lotsLoading && <div style={{ fontSize: 10, color: '#888', padding: '3px 5px' }}>Loading lots...</div>}
                                            {!lotsLoading && lots.length === 0 && (
                                                <div style={{ fontSize: 10, color: '#888', padding: '3px 5px' }}>
                                                    {heldLotCount > 0
                                                        ? `${heldLotCount} lot${heldLotCount === 1 ? '' : 's'} here ${heldLotCount === 1 ? 'is' : 'are'} held in quarantine — release on the Quarantine Packing page before packing.`
                                                        : 'No lots of this item in stock at the pack-from location.'}
                                                </div>
                                            )}
                                            {lots.map((b: any) => {
                                                const id = String(b.id);
                                                const on = selSet.has(id);
                                                return (
                                                    <label key={id} style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: 5, padding: '3px 5px',
                                                        fontSize: 10, cursor: 'pointer', borderBottom: '1px solid #eceae2',
                                                        background: on ? '#e6f0ff' : 'transparent',
                                                    }}>
                                                        <input type="checkbox" style={{ marginTop: 1 }} checked={on}
                                                            onChange={e => toggleLot(id, e.target.checked)} />
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                                <span style={{ fontFamily: CODE_FONT, fontWeight: 'bold' }}>{b.batch_number}</span>
                                                                <span style={{ color: '#555' }}>{Number(b.remaining ?? 0).toFixed(2)} {uom}</span>
                                                                {/* What this log takes off the lot — the rest stays on it for
                                                                    the next pack event. FIFO, so later lots may draw 0. */}
                                                                {on && (
                                                                    <span style={{
                                                                        fontSize: 9, fontWeight: 'bold', color: takeByBatch[id] ? '#0a3e0a' : '#777',
                                                                        background: takeByBatch[id] ? '#d0f0d0' : '#eceae2',
                                                                        border: '1px solid #aca899', padding: '0 4px',
                                                                    }}>
                                                                        take {(takeByBatch[id] || 0).toFixed(2)}
                                                                    </span>
                                                                )}
                                                                {b.location_name && <span style={{ color: '#0058e6' }}>@ {b.location_name}</span>}
                                                            </div>
                                                            <LotChips batch={b} showOrder />
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                                            Each lot is logged as its own pack event, so no carton ever mixes two lots.
                                            The variant is read from the lot&apos;s own stock row.
                                            {heldLotCount > 0 && (
                                                <span style={{ color: '#7a4a00' }}>
                                                    {' '}· {heldLotCount} more lot{heldLotCount === 1 ? '' : 's'} held in quarantine, not shown.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            )}
                            {!useLotPicker && (
                                <div style={{ fontSize: 9, color: '#888' }}>
                                    This item is not lot-tracked — the variant is taken from the stock at the pack-from location.
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={xpFormLabel}>Operator</label>
                                    <input type="text" style={{ ...xpInput, width: '100%' }} value={operator}
                                        onChange={e => setOperator(e.target.value)} placeholder="Name (optional)" />
                                </div>
                                <div style={{ flex: 2 }}>
                                    <label style={xpFormLabel}>Notes</label>
                                    <input type="text" style={{ ...xpInput, width: '100%' }} value={packNotes}
                                        onChange={e => setPackNotes(e.target.value)} placeholder="Shift, remarks..." />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Packaging materials */}
                    {(po.materials || []).length > 0 && (
                        <LegendPanel title="Packaging Materials">
                            <div style={{ padding: '4px 8px 8px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                    <thead>
                                        <tr style={{ background: '#dddbd0' }}>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Material</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #aca899', width: 90 }}>Planned</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #aca899', width: 90 }}>Consumed</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(po.materials || []).map((m: any, idx: number) => (
                                            <tr key={m.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f5f4ee' }}>
                                                <td style={{ padding: '2px 6px' }}>
                                                    <span style={{ fontWeight: 500 }}>{m.item_code || m.item_id}</span>
                                                    {m.item_name && <span style={{ color: '#666', marginLeft: 4 }}>{m.item_name}</span>}
                                                </td>
                                                <td style={{ padding: '2px 6px', textAlign: 'right', color: '#555' }}>
                                                    {num(m.qty_planned).toLocaleString()} {m.item_uom}
                                                </td>
                                                <td style={{ padding: '2px 6px', textAlign: 'right' }}>{num(m.qty_consumed).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div style={{ fontSize: 9, color: '#888', marginTop: 4 }}>
                                    Planned is the free-entry plan; Consumed rolls up what each pack event actually took.
                                </div>
                            </div>
                        </LegendPanel>
                    )}

                    {/* Cartons */}
                    {units.length > 0 && (
                        <LegendPanel title={`${po.package_label}s (${units.length})`}>
                            <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                    <thead>
                                        <tr style={{ background: '#dddbd0' }}>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899', width: 34 }}>#</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Lot</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #aca899', width: 90 }}>In stock</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899', width: 90 }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {units.map((u: any, idx: number) => (
                                            <tr key={u.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f5f4ee' }}>
                                                <td style={{ padding: '2px 6px' }}>{u.package_no}</td>
                                                <td style={{ padding: '2px 6px', fontFamily: CODE_FONT, color: '#00309c' }}>{u.batch_number}</td>
                                                <td style={{ padding: '2px 6px', textAlign: 'right', color: num(u.qty) > 0 ? '#0a3e0a' : '#888' }}>
                                                    {num(u.qty).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '2px 6px' }}>
                                                    {num(u.qty) > 0 ? <StatusChip status="IN_STOCK" tint /> : <StatusChip status="SENT" tint />}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </LegendPanel>
                    )}

                    {/* History */}
                    {completions.length > 0 && (
                        <LegendPanel title="Previous Entries">
                            <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                    <thead>
                                        <tr style={{ background: '#dddbd0' }}>
                                            <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #aca899' }}>Qty</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #aca899' }}>{po.package_label}s</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Source lot</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #aca899' }}>QC Reject</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Operator</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Notes</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Time</th>
                                            {!readOnly && <th style={{ padding: '2px 6px', borderBottom: '1px solid #aca899', width: 26 }} />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {completions.map((c: any, i: number) => (
                                            <tr key={c.id} style={{ background: c.rejected ? '#fbeaea' : i % 2 === 0 ? '#fff' : '#f5f4ee', opacity: c.rejected ? 0.75 : 1 }}>
                                                <td style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 'bold', textDecoration: c.rejected ? 'line-through' : undefined }}>
                                                    {num(c.qty).toFixed(2)}
                                                </td>
                                                <td style={{ padding: '2px 6px', textAlign: 'right', color: '#555' }}>{c.package_count}</td>
                                                <td style={{ padding: '2px 6px', textAlign: 'right', color: num(c.qty_rejected) ? '#a00000' : '#aaa', fontWeight: num(c.qty_rejected) ? 'bold' : 'normal' }}
                                                    title={c.reject_reason || undefined}>
                                                    {num(c.qty_rejected) ? num(c.qty_rejected).toFixed(2) : '—'}
                                                    {c.package_count_rejected ? <span style={{ fontWeight: 'normal', fontSize: 9 }}> ({c.package_count_rejected})</span> : null}
                                                </td>
                                                <td style={{ padding: '2px 6px', color: '#555', fontFamily: c.source_batch_number ? CODE_FONT : undefined }}>
                                                    {c.source_batch_number || '—'}
                                                </td>
                                                <td style={{ padding: '2px 6px', color: '#555' }}>{c.operator || '—'}</td>
                                                <td style={{ padding: '2px 6px', color: '#555' }}>{c.notes || '—'}</td>
                                                <td style={{ padding: '2px 6px', color: '#555' }}>{c.completed_at ? tzDateTime(c.completed_at) : '—'}</td>
                                                {!readOnly && (
                                                    <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                                                        {!c.rejected && goodUnitsOf(c.id).length > 0 && (
                                                            <XPActionButton
                                                                classic tone="warning" icon="bi-slash-circle"
                                                                title="QC reject cartons from this pack event"
                                                                onClick={() => openReject(c)}
                                                            />
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </LegendPanel>
                    )}

                    {/* QC reject of a logged pack event — modeless panel, same shape as
                        the lot reject on the Lot Management page. */}
                    {rejectComp && (() => {
                        const candidates = goodUnitsOf(rejectComp.id);
                        const partial = rejectUnitIds.length > 0 && rejectUnitIds.length < candidates.length;
                        const rejectingCount = rejectUnitIds.length || candidates.length;
                        return (
                            <LegendPanel title={`QC Reject — ${num(rejectComp.qty).toFixed(2)} packed ${rejectComp.completed_at ? `on ${tzDateTime(rejectComp.completed_at)}` : ''}`}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10 }}>
                                    <div style={{ color: '#555' }}>
                                        Rejecting <strong>{rejectingCount}</strong> of {candidates.length} {po.package_label.toLowerCase()}(s).
                                        {partial
                                            ? ' The log stays active for its good cartons.'
                                            : ' The whole pack event drops out of packed qty.'}
                                        {' '}Cartons move to the defect store routed from this item&apos;s default reject location.
                                    </div>
                                    <div style={{ maxHeight: 96, overflowY: 'auto', border: '1px solid #aca899', background: '#fff', padding: 4 }}>
                                        {candidates.length === 0 ? (
                                            <div style={{ color: '#888' }}>No good cartons left on this event.</div>
                                        ) : candidates.map((u: any) => (
                                            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '1px 0' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={rejectUnitIds.includes(String(u.id))}
                                                    onChange={e => setRejectUnitIds(prev => e.target.checked
                                                        ? [...prev, String(u.id)]
                                                        : prev.filter(x => x !== String(u.id)))}
                                                />
                                                <span style={{ fontFamily: CODE_FONT }}>{u.batch_number}</span>
                                                <span style={{ color: '#777' }}>{num(u.qty).toFixed(2)} {uom}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div style={{ color: '#666' }}>Leave every box unticked to reject the whole event.</div>
                                    <input
                                        type="text"
                                        style={{ ...xpInput, width: '100%' }}
                                        value={rejectReason}
                                        onChange={e => setRejectReason(e.target.value)}
                                        placeholder="Reason — crushed carton, wrong count, damp..."
                                    />
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <input type="checkbox" checked={rejectUsable} onChange={e => setRejectUsable(e.target.checked)} />
                                        Still usable (downgrade, not scrap)
                                    </label>
                                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                                        <button type="button" style={xpBtn()} onClick={() => setRejectComp(null)}>Cancel</button>
                                        <button
                                            type="button"
                                            style={{ ...xpBtn({ background: 'linear-gradient(to bottom, #f0b0b0, #d87070)', color: '#500', fontWeight: 'bold' }), opacity: rejecting ? 0.6 : 1 }}
                                            disabled={rejecting || candidates.length === 0}
                                            onClick={submitReject}
                                        >
                                            {rejecting ? 'Rejecting...' : partial ? 'Reject Selected' : 'Reject Whole Entry'}
                                        </button>
                                    </div>
                                </div>
                            </LegendPanel>
                        );
                    })()}
                </div>
            </form>
        </ModalWrapper>
    );
}
