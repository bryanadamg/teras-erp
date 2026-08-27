'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { usePaginatedFetch } from '../../context/usePaginatedList';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState, TableSkeleton, useTableSkeletonMetrics, StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu, FormSection, SectionTitle, FieldLabel, XPActionButton, LegendPanel, ExpandedRowPanel, ProgressBar, CodeChip, CODE_FONT, rowStateBg, CHIP_RADIUS, BTN_TONES, XP_BTN } from '../shared/xpTheme';
import { LV_XP_FONT, lvBtn, lvInput, lvTd, lvRow, lvSubTh, lvSubTd, lvSubRow, ExpanderCell, RowCheckbox, lvThSticky, lvPickerRow, lvSubTable } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar, ToolbarButton } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
import SearchableSelect from '../shared/SearchableSelect';
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';
import { useFinishedGoodsSearch } from '../shared/useEntitySearch';
import { LotChips, LotChip } from '../shared/LotChips';
import { machinesOfCenterType, toMachineOptions } from '../shared/workCenterTree';
import {
    BoxGroup, emptyBoxGroup, seedBoxGroups, expandBoxGroups, groupCount, groupTotal,
    filledBoxRows, hasUnweighedBox, uomIsKg, boxAltTotal, boxAltPayload,
} from '../shared/packingBoxes';
import { basePerAlt, altToBase, baseToAlt, orderBasePerAlt, formatAlt, lengthPerAlt } from '../shared/altUnit';
const PackingCardPrintModal = dynamic(() => import('./PackingCardPrintModal'), { ssr: false });
const PackedUnitLabelPrintModal = dynamic(() => import('./PackedUnitLabelPrintModal'), { ssr: false });

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// ── Classic XP theme primitives (match PickListView / StockOnHandView) ──────
const xpFont = LV_XP_FONT;
const xpInput: React.CSSProperties = lvInput(true);
const xpSelect: React.CSSProperties = { ...xpInput, height: 22 };
const xpTableHeader: React.CSSProperties = lvThSticky(true);
const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => lvBtn(true, 'default', extra);
const xpBtnGreen = (extra: React.CSSProperties = {}) => lvBtn(true, 'success', extra);
// Title-bar "create" button — same style as SalesOrderView / PartnersView / SampleRequestView.
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
    borderRadius: CHIP_RADIUS, padding: '0 5px', lineHeight: '14px',
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
    const { locations, attributes, companyProfile, itemIndex, workCenters, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { formatDate: tzDate, formatDateTime: tzDateTime } = useTimezone();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');

    // Page window, fetch, `loading` (true from first paint, so the list shows the
    // loader rather than "none yet") and the stale-response race guard all come from
    // the shared hook (context/usePaginatedList.ts). This list carries no search box
    // or filters; the footer's open/closed tallies are counted separately below.
    const {
        rows: orders, total, loading, page, setPage, refetch: reloadOrders,
    } = usePaginatedFetch<any>({
        endpoint: `${API_BASE}/packing`,
        authFetch,
        pageSize: PO_PAGE_SIZE,
    });
    const [openCount, setOpenCount] = useState(0);
    const [doneCount, setDoneCount] = useState(0);
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

    // Machine picker scope. Packing machines are the MACHINE rows running under a
    // PACKING centre type; a plant that has not declared that type yet gets every
    // machine rather than an empty list — the same "never hand back an empty
    // picker" rule WOCompletionModal applies to its process scope.
    const machineOptions = useMemo(
        () => toMachineOptions(machinesOfCenterType(workCenters || [], 'PACKING')),
        [workCenters],
    );
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
        reloadOrders();
        await loadCounts();
    }, [reloadOrders, loadCounts]);

    useEffect(() => { loadCounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Dense: this table shares its row with the other panes of the detail grid.
        const th = lvSubTh(true, true);
        const td = lvSubTd(true, true);
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
                                {infoRow('Machine', po.work_center_name || 'not assigned')}
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
                                {/* Same two figures in what the customer counts in. The base
                                    figures above stay first: they are what stock moves in. */}
                                {po.uom2 && orderBasePerAlt(po, it) && (() => {
                                    const f = orderBasePerAlt(po, it);
                                    return (
                                        <>
                                            {infoRow('Target', formatAlt(baseToAlt(num(po.qty_target), f), po.uom2))}
                                            {infoRow('Packed', formatAlt(baseToAlt(num(po.qty_packed), f), po.uom2))}
                                            {infoRow(`1 ${po.uom2}`, `${num(po.uom2_factor)} ${po.uom2_length_uom || 'Yard'} = ${f} ${uom}`)}
                                        </>
                                    );
                                })()}
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
                                                {/* The count that went in the box, when the order is
                                                    counted in one. Read off the carton, not divided out
                                                    of its qty. */}
                                                {u.alt_qty != null && po.uom2 && (
                                                    <span style={{ color: '#555' }}>{num(u.alt_qty)} {po.uom2}</span>
                                                )}
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
                                        <table style={{ ...lvSubTable(true), border: 'none' }}>
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
                                                {/* No zebra — the only row fill is the rejected-red
                                                    marker, which carries meaning. */}
                                                {comps.map((c: any, ci: number) => (
                                                    <React.Fragment key={c.id || ci}>
                                                        <tr style={lvSubRow(true, ci, { fill: c.rejected ? '#fbe4e4' : undefined })}>
                                                            <td style={{ ...td, color: '#666', whiteSpace: 'nowrap' }}>
                                                                {c.completed_at ? tzDateTime(c.completed_at) : '—'}
                                                            </td>
                                                            <td style={{
                                                                ...td, textAlign: 'right', fontWeight: 'bold',
                                                                color: c.rejected ? '#900' : '#000080',
                                                                textDecoration: c.rejected ? 'line-through' : 'none',
                                                            }} title={c.reject_reason || undefined}>
                                                                +{num(c.qty).toFixed(2)}
                                                            </td>
                                                            <td style={{ ...td, textAlign: 'right', color: '#555' }}>{c.package_count}</td>
                                                            <td style={{ ...td, color: '#555', fontFamily: c.source_batch_number ? CODE_FONT : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}
                                                                title={c.source_batch_number || undefined}>
                                                                {c.source_batch_number || '—'}
                                                            </td>
                                                            <td style={{ ...td, color: '#333' }}>
                                                                {c.operator || '—'}
                                                                {c.rejected && (
                                                                    <span style={{ borderRadius: CHIP_RADIUS, marginLeft: 5, fontSize: 8, fontWeight: 'bold', color: '#900', border: '1px solid #c88', background: '#fff', padding: '0 3px' }}>REJECTED</span>
                                                                )}
                                                                {/* Partial reject: the entry stays live with its qty already
                                                                    trimmed, so the scrapped part only shows as its own marker. */}
                                                                {!c.rejected && num(c.qty_rejected) > 0 && (
                                                                    <span title={c.reject_reason || 'Partially rejected'}
                                                                        style={{ borderRadius: CHIP_RADIUS, marginLeft: 5, fontSize: 8, fontWeight: 'bold', color: '#900', border: '1px solid #c88', background: '#fff', padding: '0 3px' }}>
                                                                        -{num(c.qty_rejected).toFixed(2)} REJ
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ ...td, padding: '1px 4px', textAlign: 'right' }}>
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
                                                            <tr>
                                                                <td colSpan={6} style={{ ...td, borderTop: 'none', padding: '0 5px 3px 12px', color: '#888', fontStyle: 'italic' }}>{c.notes}</td>
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
            />
            <div style={xpToolbar()}>
                <ToolbarButton classic tone="neutral" icon="bi-arrow-clockwise" onClick={loadAll}>Refresh</ToolbarButton>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#333' }}>
                    {total.toLocaleString()} order{total !== 1 ? 's' : ''}
                </span>
                {canManage && (
                    <ToolbarButton classic tone="create" icon="bi-plus-lg" title="Order finished goods packed into cartons" onClick={() => setCreating(true)}>
                        New Packing Order
                    </ToolbarButton>
                )}
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
                                    style={{ ...rowStyle(idx), ...(isExpanded ? { background: rowStateBg('expanded', true) } : {}), cursor: 'pointer' }}
                                    onClick={() => setExpandedId(prev => prev === String(po.id) ? null : String(po.id))}
                                >
                                    <ExpanderCell classic={CLASSIC} expanded={isExpanded} tdStyle={td} label="packing order detail"
                                        onToggle={() => setExpandedId(prev => prev === String(po.id) ? null : String(po.id))} />
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
                                    <td style={td}>{po.created_at ? tzDate(po.created_at) : '—'}</td>
                                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                        {/* Pack is the row's primary action — inline, same shape as
                                            "log production output" on the WO list, not buried in the menu. */}
                                        {canManage && !closed && (
                                            <>
                                                <span style={{ marginRight: 2 }}>
                                                    <XPActionButton
                                                        classic={CLASSIC}
                                                        tone="success"
                                                        icon="bi-plus-lg"
                                                        title="Pack — log cartons against this order"
                                                        onClick={() => setDetail(po)}
                                                    />
                                                </span>
                                                <span style={{ marginRight: 2 }}>
                                                    <XPActionButton
                                                        classic={CLASSIC}
                                                        tone="primary"
                                                        icon="bi-check2-square"
                                                        title="Close Order — no further cartons can be packed"
                                                        onClick={() => closeOrder(po)}
                                                    />
                                                </span>
                                            </>
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
                    machineOptions={machineOptions}
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
                    machineOptions={machineOptions}
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
function PackingOrderForm({ locPickerTreeOptions, machineOptions, defaultSourceLocId, defaultOutputLocId, authFetch, showToast, onClose, onCreated, initialValues }: any) {
    const { results: fgResults, onSearch: fgSearch } = useFinishedGoodsSearch();
    // UOM master for the alt-unit factor rows (Roll -> Yard = 50), and itemIndex
    // for the weight spec that turns a length into the item's stock UOM.
    const { uoms, itemIndex } = useData();
    const [itemId, setItemId] = useState(initialValues?.item_id || '');
    const [qtyTarget, setQtyTarget] = useState(initialValues?.qty_target != null ? String(initialValues.qty_target) : '');
    const [packSize, setPackSize] = useState('');
    const [packageLabel, setPackageLabel] = useState('Carton');
    // Alt (selling) unit — what the customer counts in (Pic = a roll, Pcs = a cut
    // piece). Snapshotted from the picked SO line so the packing order counts the
    // way the order was taken; picked by hand when packing to stock. `qtyTarget`
    // stays the canonical figure in the item's own UOM and is derived from these.
    const [qty2, setQty2] = useState('');
    const [uom2, setUom2] = useState('');
    const [uom2Factor, setUom2Factor] = useState<number | null>(null);
    const [uom2LengthUom, setUom2LengthUom] = useState('');
    const [altPerCarton, setAltPerCarton] = useState('');
    // Both stores default to the seeded ones: bulk FG waits in Quarantine until QC
    // releases it, sealed cartons land in the Finished Goods store. A Quarantine
    // Packing suggestion still names its own source and wins. Both stay editable —
    // these are only the defaults, not a fixed route.
    const [sourceLoc, setSourceLoc] = useState(initialValues?.source_location_id || defaultSourceLocId || '');
    const [outputLoc, setOutputLoc] = useState(defaultOutputLocId || '');
    // Which packing machine runs this order. Optional — an order cut before the
    // floor knows the machine is still packable, and the packer can name one at
    // log time — but naming it here is what pre-fills every pack event.
    const [workCenterId, setWorkCenterId] = useState(initialValues?.work_center_id || '');
    const [soId, setSoId] = useState(initialValues?.sales_order_id || '');
    const [soLineId, setSoLineId] = useState(initialValues?.sales_order_line_id || '');
    const [notes, setNotes] = useState('');
    const [materials, setMaterials] = useState<any[]>([]);
    const [sos, setSos] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await authFetch(`${API_BASE}/sales-orders?status=PENDING,READY,PARTIAL&limit=0`);
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
    // The item row behind the picked id — its UOM and g/y (or g/m) weight are what
    // convert an alt count into the stock figure. The search results win over the
    // index: a just-searched row is the freshest copy of the same item.
    const selectedItem = useMemo(
        () => (fgResults || []).find((i: any) => String(i.id) === String(itemId)) || itemIndex?.[String(itemId)],
        [fgResults, itemIndex, itemId],
    );
    const selectedUom2 = useMemo(
        () => (uoms || []).find((u: any) => u.name === uom2),
        [uoms, uom2],
    );
    // Base-UOM qty in one alt unit. Null means the chain can't be resolved (a gsm
    // weight needs the fabric width, a counted stock UOM has no length at all) —
    // the form then keeps base-only entry rather than inventing a factor.
    const altBaseFactor = useMemo(() => basePerAlt({
        factor: uom2Factor,
        lengthUom: uom2LengthUom,
        itemUom: selectedItem?.uom,
        weightPerUnit: selectedItem?.weight_per_unit,
        weightUnit: selectedItem?.weight_unit,
    }), [uom2Factor, uom2LengthUom, selectedItem]);

    // One place that pushes the alt figures down onto the canonical ones, so the
    // target and the carton size can never be derived two different ways.
    const applyAlt = (qty2Str: string, factorVal: number | null, lengthUom: string, perCartonStr: string) => {
        const factor = basePerAlt({
            factor: factorVal,
            lengthUom,
            itemUom: selectedItem?.uom,
            weightPerUnit: selectedItem?.weight_per_unit,
            weightUnit: selectedItem?.weight_unit,
        });
        if (!factor) return;
        const target = altToBase(num(qty2Str), factor);
        if (target !== null && num(qty2Str) > 0) setQtyTarget(String(target));
        const per = altToBase(num(perCartonStr), factor);
        if (per !== null && num(perCartonStr) > 0) setPackSize(String(per));
    };

    const onQty2Change = (val: string) => {
        setQty2(val);
        applyAlt(val, uom2Factor, uom2LengthUom, altPerCarton);
    };
    const onFactorPick = (factorVal: number | null, toUom: string) => {
        setUom2Factor(factorVal);
        setUom2LengthUom(toUom);
        applyAlt(qty2, factorVal, toUom, altPerCarton);
    };
    const onAltPerCartonChange = (val: string) => {
        setAltPerCarton(val);
        applyAlt(qty2, uom2Factor, uom2LengthUom, val);
    };

    const applySoLine = (lineId: string) => {
        setSoLineId(lineId);
        const line = soLines.find((l: any) => String(l.id) === lineId);
        if (line) {
            setItemId(String(line.item_id));
            if (!qtyTarget) setQtyTarget(String(line.qty));
            // Follow the order's own selling unit: the packer counts cartons in
            // whatever the customer ordered in. The factor's length unit lives on
            // the UOM master, so resolve it here rather than guessing later.
            if (line.uom2) {
                setUom2(line.uom2);
                const factor = line.uom2_factor != null ? parseFloat(String(line.uom2_factor)) : null;
                setUom2Factor(factor);
                const uomObj = (uoms || []).find((u: any) => u.name === line.uom2);
                const factorObj = (uomObj?.factors || []).find((f: any) => parseFloat(f.value) === factor);
                setUom2LengthUom(factorObj?.to_uom_name || '');
                if (line.qty2 != null && line.qty2 !== '') setQty2(String(line.qty2));
            }
        }
    };

    // Once an SO is picked (and the item is already fixed — from a Quarantine
    // Packing deep link, or a prior manual pick), auto-select the order line
    // that's unambiguous. Colour and combo are order/production-level picks,
    // never baked into item_id (Item.variant_type just says which library the
    // SO line's own color_id/attribute_values came from), so a style ordered in
    // several colours/combos as separate lines needs those matched too, same as
    // size. Each hint only narrows if the source lot actually carried it, and
    // never past zero candidates — a hint that doesn't match anything present
    // is dropped rather than blocking the match, since a stale attribute snapshot
    // shouldn't defeat an otherwise-exact match. Ties are left for the planner.
    useEffect(() => {
        if (!soId || !itemId || soLineId) return;
        let candidates = soLines.filter((l: any) => String(l.item_id) === String(itemId));
        if (!candidates.length) return;

        const narrow = (pred: (l: any) => boolean) => {
            const next = candidates.filter(pred);
            if (next.length) candidates = next;
        };
        const sizeHint = initialValues?.bom_size_id;
        const colorHint = initialValues?.color_id;
        const comboHint = initialValues?.combo_value_id;
        if (sizeHint) narrow((l: any) => l.bom_size_id && String(l.bom_size_id) === String(sizeHint));
        if (colorHint) narrow((l: any) => l.color_id && String(l.color_id) === String(colorHint));
        if (comboHint) narrow((l: any) => (l.attribute_value_ids || []).some((id: any) => String(id) === String(comboHint)));

        if (candidates.length === 1) applySoLine(String(candidates[0].id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [soId, itemId, soLines, soLineId]);

    // A native <select> can't render swatch chips, so this is the same identity
    // (item, size, combo, colour/labdip) as LotChips, flattened to plain text —
    // otherwise same-item lines that only differ by size/colour/combo are
    // indistinguishable in the dropdown.
    const soLineLabel = (l: any) => {
        const parts = [l.item_name || l.item_code || l.item_id];
        if (l.size_label) parts.push(l.size_label);
        const combo = (l.variant_attributes || []).find((a: any) => a.system_role === 'combo');
        if (combo) parts.push(combo.value);
        if (l.color_code || l.color_name) parts.push([l.color_code, l.color_name].filter(Boolean).join(' '));
        else if (l.labdip_variant_code) parts.push(`${l.labdip_variant_code} (pending)`);
        parts.push(num(l.qty).toLocaleString());
        return parts.join(' · ');
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
                // Alt unit as stated here (already inherited from the SO line when
                // one was picked). Sent explicitly rather than left for the server
                // to re-read off the line: an SO edited later must not re-scale an
                // order that is already being packed.
                qty2: qty2 === '' ? null : num(qty2),
                uom2: uom2 || null,
                uom2_factor: uom2Factor,
                uom2_length_uom: uom2LengthUom || null,
                source_location_id: sourceLoc || null,
                output_location_id: outputLoc || null,
                work_center_id: workCenterId || null,
                sales_order_id: soId || null,
                sales_order_line_id: soLineId || null,
                // A hand-typed variant is still never sent — the pack event resolves
                // it from the source lot's own StockBalance row. But a Quarantine
                // Packing deep link is not hand-typed: it carries the exact shade of
                // the MO group being packed, and stating it is what stops the order
                // from claiming (and offering) every other colour of the same FG
                // sitting in the same hold bin. Packing to stock with no hint keeps
                // the old variant-less behaviour.
                color_id: initialValues?.color_id || null,
                attribute_value_ids: initialValues?.combo_value_id ? [initialValues.combo_value_id] : [],
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
                    <button className={XP_BTN} style={xpBtn()} onClick={onClose}>Cancel</button>
                    <button className={XP_BTN} style={xpBtnGreen()} disabled={saving} onClick={submit}>{saving ? 'Creating...' : 'Create'}</button>
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
                                        <option key={l.id} value={l.id}>{soLineLabel(l)}</option>
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
                    {/* Alt (selling) unit. Its own row because the control is a compound
                        one (count + unit + factor), and because it drives the two fields
                        above rather than sitting beside them. */}
                    <div style={{ ...fieldGrid, gridTemplateColumns: 'minmax(220px, 1fr) 130px', marginTop: 8 }}>
                        <div>
                            <FieldLabel classic={CLASSIC}>Alt unit</FieldLabel>
                            <div style={{ display: 'flex' }}>
                                <input type="number" min={0}
                                    style={{ ...xpInput, flex: 1, minWidth: 0, borderRight: 'none', textAlign: 'right' }}
                                    placeholder="0" value={qty2} onChange={e => onQty2Change(e.target.value)} />
                                <select style={{ ...xpSelect, flexShrink: 0, width: 90 }} value={uom2}
                                    onChange={e => { setUom2(e.target.value); setUom2Factor(null); setUom2LengthUom(''); }}>
                                    <option value="">— none —</option>
                                    {(uoms || []).map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                                </select>
                            </div>
                            {uom2 && (selectedUom2?.factors || []).length > 0 && (
                                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {(selectedUom2?.factors || []).map((f: any) => {
                                        const fVal = parseFloat(f.value);
                                        const toUom = f.to_uom_name || 'Yard';
                                        const active = uom2Factor === fVal;
                                        return (
                                            <button key={f.id} type="button"
                                                style={{
                                                    fontFamily: xpFont, fontSize: 10, padding: '1px 6px', cursor: 'pointer',
                                                    borderRadius: 0,
                                                    border: active ? '1px solid #1a3a8a' : '1px solid #7f9db9',
                                                    background: active ? 'linear-gradient(to bottom,#4a9ae8,#1a5ec8)' : 'linear-gradient(to bottom,#fff,#e8e4d8)',
                                                    color: active ? '#fff' : '#000',
                                                }}
                                                onClick={() => onFactorPick(fVal, toUom)}
                                            >
                                                1 {uom2} = {fVal} {toUom}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {uom2 && (selectedUom2?.factors || []).length === 0 && (
                                <div style={{ ...hintText, marginTop: 3 }}>
                                    {uom2} has no conversion on the UOM master — add one there to convert it.
                                </div>
                            )}
                        </div>
                        <div>
                            <FieldLabel classic={CLASSIC}>{uom2 || 'Alt'} per carton</FieldLabel>
                            <input type="number" min={0} disabled={!uom2}
                                style={{ ...xpInput, width: '100%', textAlign: 'right', background: uom2 ? undefined : '#efeee9' }}
                                value={altPerCarton} onChange={e => onAltPerCartonChange(e.target.value)} />
                        </div>
                    </div>
                    <div style={hintText}>
                        Qty per carton splits the target — leave it empty to decide the carton count per pack event.
                    </div>
                    {uom2 && uom2Factor && !altBaseFactor && (
                        <div style={{ ...hintText, color: '#a00000', fontStyle: 'normal' }}>
                            {uom2} can&apos;t be converted into {selectedItem?.uom || 'the stock unit'}: a kg-stocked item
                            needs a g/y or g/m weight on the item (gsm needs the fabric width). Type the target in{' '}
                            {selectedItem?.uom || 'the stock unit'} instead.
                        </div>
                    )}
                    {altBaseFactor && (
                        <div style={hintText}>
                            1 {uom2} = {uom2Factor} {uom2LengthUom || 'Yard'} = {altBaseFactor} {selectedItem?.uom || ''}
                            {num(qty2) > 0 ? ` — target ${num(qtyTarget).toLocaleString()} ${selectedItem?.uom || ''}` : ''}
                        </div>
                    )}
                </FormSection>

                <FormSection title={<SectionTitle icon="bi-geo-alt">Locations &amp; Machine</SectionTitle>} classic={CLASSIC}>
                    <div style={{ ...fieldGrid, gridTemplateColumns: '1fr 1fr 1fr' }}>
                        <div>
                            <FieldLabel classic={CLASSIC} hint="Bulk finished goods are drawn from here">Pack from</FieldLabel>
                            <TreeSelect options={locPickerTreeOptions} value={sourceLoc} onChange={setSourceLoc} allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                        </div>
                        <div>
                            <FieldLabel classic={CLASSIC} hint="Sealed cartons land here">Store cartons at</FieldLabel>
                            <TreeSelect options={locPickerTreeOptions} value={outputLoc} onChange={setOutputLoc} allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                        </div>
                        <div>
                            <FieldLabel classic={CLASSIC} hint="Pre-fills every pack event">Machine</FieldLabel>
                            <SearchableSelect options={machineOptions || []} value={workCenterId} onChange={setWorkCenterId} placeholder="— none —" size="sm" />
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
function PackingOrderDetail({ po: initialPo, itemById, locationById, locPickerTreeOptions, machineOptions, authFetch, showToast, onClose, onChanged, onPrintCard, onPrintLabels }: any) {
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
    // Alt selling unit of this order (Pic = a roll, Pcs = a cut piece). When set,
    // the packer counts in it and every base figure is derived from it — `qty`,
    // the box qtys and the label's CONTENT line all follow the same factor.
    const altUom = po.uom2 || '';
    const altFactor = useMemo(() => orderBasePerAlt(po, it), [po, it]);
    const altLength = useMemo(
        () => lengthPerAlt({ factor: po.uom2_factor, lengthUom: po.uom2_length_uom }),
        [po.uom2_factor, po.uom2_length_uom],
    );
    const hasAlt = !!(altUom && altFactor);
    const [qtyAlt, setQtyAlt] = useState<string>('');
    const [boxSize, setBoxSize] = useState<string>(() => (num(po.pack_size) > 0 ? String(num(po.pack_size)) : ''));
    const [operator, setOperator] = useState('');
    // Seeded from the order's machine so the common case is one click of nothing;
    // an override here rides on this event only and never rewrites the order.
    const [workCenterId, setWorkCenterId] = useState<string>(String(initialPo.work_center_id || ''));
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

    // Persist the picked machine onto the order itself. The log picker alone only
    // stamps the event, which is right for a one-off swap; an order that will keep
    // running on this machine wants it stored so every later event pre-fills.
    const [savingMachine, setSavingMachine] = useState(false);
    const machineDirty = String(workCenterId || '') !== String(po.work_center_id || '');
    const saveMachine = async () => {
        setSavingMachine(true);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ work_center_id: workCenterId || null }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Could not save the machine');
            }
            setPo(await res.json());
            showToast('Machine assigned to this packing order', 'success');
            await onChanged();
        } catch (e: any) {
            showToast(e.message, 'danger');
        } finally { setSavingMachine(false); }
    };

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
                // `variant_key` scopes the fetch to the shade this order is packing.
                // Two MOs of the same FG in different colours share a hold bin, so
                // the unscoped (item, location) fetch offered the other colour's lots
                // as if they were packable — and the pack endpoint refuses them. The
                // match rule lives on the server (stock_service.variant_matches) so
                // the picker and the gate can't drift; an order with no variant of
                // its own (packing to stock) still sees the whole pool.
                const vq = po.variant_key ? `&variant_key=${encodeURIComponent(po.variant_key)}` : '';
                const res = await authFetch(
                    `${API_BASE}/batches?item_id=${po.item_id}&location_id=${po.source_location_id}${vq}&limit=200&with_source_lots=true`
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
    }, [po.item_id, po.source_location_id, po.variant_key, useLotPicker, authFetch, po.qty_packed]);

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

    // Boxes are edited against the combined total regardless of how many lots feed
    // it — the server is the one that works out which lot backs each box (splitting
    // a box across a lot boundary if needed), so the packer never has to think
    // about lot lines while boxing up.
    //
    // They are edited as `count × qty each` groups, not one row per box: 17 kg in
    // 5 kg boxes reads "3 × 5 kg, 1 × 2 kg = 17 kg" instead of a four-row list the
    // packer has to add up. `expandBoxGroups` flattens back to one entry per
    // physical carton for everything downstream, so the payload is unchanged.
    // `kg` stays per carton inside a group — it is the packer's scale reading and
    // the label's N.W. line, never derived from qty (the item's UOM may be yards,
    // and the same yardage weighs differently per lot).
    const [boxGroups, setBoxGroups] = useState<BoxGroup[]>([]);
    const [openGroups, setOpenGroups] = useState<Set<number>>(new Set());
    const boxRows = useMemo(() => expandBoxGroups(boxGroups), [boxGroups]);
    const packTotal = useLotPicker ? drawn : num(qty);

    // Seed once a qty is entered and no groups exist yet (a fresh form, or right
    // after Regenerate clears them) — after that, edits belong to the user.
    useEffect(() => {
        if (boxGroups.length === 0 && packTotal > 0) {
            setBoxGroups(seedBoxGroups(packTotal, num(boxSize), [], hasAlt ? altFactor : null));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [packTotal]);

    // Regenerate rebuilds the qty split but keeps weights already keyed in
    // positionally — re-splitting after a typo shouldn't wipe the scale readings.
    const regenerateBoxes = () =>
        setBoxGroups(prev => seedBoxGroups(packTotal, num(boxSize), prev, hasAlt ? altFactor : null));
    const updateGroup = (i: number, patch: Partial<BoxGroup>) =>
        setBoxGroups(prev => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
    const removeGroup = (i: number) => setBoxGroups(prev => prev.filter((_, idx) => idx !== i));
    const addGroup = () => setBoxGroups(prev => [...prev, emptyBoxGroup()]);
    const toggleGroup = (i: number) => setOpenGroups(prev => {
        const next = new Set(prev);
        next.has(i) ? next.delete(i) : next.add(i);
        return next;
    });
    // One carton's scale reading inside a group. Sparse by design — a group of 3
    // with only #2 weighed keeps ['', '4.95'] rather than inventing the other two.
    const setGroupWeight = (i: number, box: number, val: string) =>
        setBoxGroups(prev => prev.map((g, idx) => {
            if (idx !== i) return g;
            const kg = [...g.kg];
            while (kg.length <= box) kg.push('');
            kg[box] = val;
            return { ...g, kg };
        }));

    // Typing a count fills the base qty; typing a base qty only back-fills a count
    // that isn't there yet. That asymmetry is the point: on a kg item the packer
    // types 12 Pcs, the qty pre-fills at the theoretical 10.80, and then the scale
    // reading of 10.62 replaces it — which must not turn the count into 11.8.
    const setGroupAlt = (i: number, val: string) => {
        const derived = altToBase(num(val), altFactor);
        updateGroup(i, {
            alt: val,
            ...(derived !== null && num(val) > 0 ? { qty: String(derived) } : {}),
        });
    };
    const setGroupQty = (i: number, val: string) => {
        const g = boxGroups[i];
        const backfill = hasAlt && !(num(g?.alt) > 0) ? baseToAlt(num(val), altFactor) : null;
        updateGroup(i, {
            qty: val,
            ...(backfill !== null ? { alt: String(backfill) } : {}),
        });
    };

    // Qty to Pack, entered as a count. The base figure follows so the lot draw,
    // the box split and the stock movement all stay in the item's own UOM.
    const onQtyAltChange = (val: string) => {
        setQtyAlt(val);
        const derived = altToBase(num(val), altFactor);
        if (derived !== null && num(val) > 0) setQty(String(derived));
    };

    // Weights stay positional against the qtys the server receives, so both are
    // filtered in one pass. Every carton must carry one: the log is written after
    // the boxes are packed and weighed, so a blank would print a label with no
    // N.W. line — the server rejects an unweighed carton outright.
    const boxes = filledBoxRows(boxRows);
    const boxValues = boxes.map(b => num(b.qty));
    // A kg item is weighed once: the qty in the carton IS its net weight, so the
    // row shows a single input and the weight rides along from it (the server
    // derives the same way). Any other UOM is a count or a length, so its weight
    // is a separate scale reading and stays required.
    const qtyIsWeight = uomIsKg(uom);
    const boxWeights = qtyIsWeight ? boxValues : boxes.map(b => num(b.kg));
    // Positional against `boxes`; null where the packer stated no count, which the
    // server then derives for that carton alone.
    const boxAlts = hasAlt ? boxAltPayload(boxRows) : null;
    const altTotal = hasAlt ? boxAltTotal(boxRows) : 0;
    const weightsMissing = !qtyIsWeight && hasUnweighedBox(boxRows);
    const boxTotal = boxValues.reduce((s, v) => s + v, 0);
    const weightTotal = boxWeights.reduce((s: number, v) => s + v, 0);
    const boxMismatch = packTotal > 0 && Math.abs(boxTotal - packTotal) > 1e-3;

    const toggleLot = (id: string, on: boolean) =>
        setSelectedLots(prev => on ? [...prev, id] : prev.filter(x => x !== id));
    const allIds = lots.map((b: any) => String(b.id));
    const allSelected = allIds.length > 0 && selectedLots.length === allIds.length;

    // Why the log button is dead, in the order the submit handler checks. A
    // disabled button with no stated reason is the bug this exists to prevent —
    // the box-list footer alone was too far from the button to read as its cause.
    const logBlockedBy =
        locsMissing ? 'Set both locations on this order before packing'
        : locsDirty ? 'Save the location change before logging'
        : num(qty) <= 0 ? 'Enter a quantity to pack'
        : boxValues.length === 0 ? `Add at least one ${po.package_label.toLowerCase()}`
        : boxMismatch ? `${po.package_label}s total ${boxTotal.toFixed(2)} but ${packTotal.toFixed(2)} is being packed`
        : weightsMissing ? `Weigh every ${po.package_label.toLowerCase()} — the label prints its net weight`
        : useLotPicker && !selectedLots.length ? 'Select at least one lot to pack from'
        : useLotPicker && short ? `Selected lots hold only ${drawn.toFixed(2)} of the ${num(qty).toFixed(2)} needed`
        : null;

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
        if (weightsMissing) {
            showToast(`Weigh every ${po.package_label.toLowerCase()} — the label prints its net weight`, 'danger');
            return;
        }

        let body: any = {
            qty: q,
            boxes: boxValues,
            box_weights: boxWeights,
            box_alt_qtys: boxAlts,
            work_center_id: workCenterId || null,
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
                box_weights: boxWeights,
                box_alt_qtys: boxAlts,
                work_center_id: workCenterId || null,
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
                setQty(''); setQtyAlt(''); setPackNotes(''); setBoxGroups([]); setOpenGroups(new Set());
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
                    <button type="button" className={XP_BTN} onClick={onClose} style={xpBtn()}>Close</button>
                    <button type="button" className={XP_BTN} style={xpBtn()} onClick={() => onPrintCard(po)}>Packing Card</button>
                    <button type="button" className={XP_BTN} style={xpBtn()} disabled={!units.length} onClick={() => onPrintLabels(po, units)}>
                        Carton Labels
                    </button>
                    {/* Visible, not a tooltip: a disabled button dispatches no mouse
                        events in Chrome, so a `title` on it would never be read. */}
                    {!readOnly && logBlockedBy && (
                        <span style={{ fontFamily: xpFont, fontSize: 10, color: '#7a4a00', fontStyle: 'italic', marginLeft: 'auto', paddingRight: 6 }}>
                            {logBlockedBy}
                        </span>
                    )}
                    {!readOnly && (
                        <button type="submit" form="packing-log-form" className={XP_BTN}
                            disabled={logging || !!logBlockedBy}
                            title={logBlockedBy || undefined}
                            style={{ ...xpBtnGreen(), opacity: logging || logBlockedBy ? 0.6 : 1 }}>
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
                                    {hasAlt && (
                                        <span style={{ fontWeight: 'normal', color: '#888', fontSize: 9 }}>
                                            1 {altUom} = {po.uom2_factor} {altLength?.uom || 'Yd'} = {altFactor} {uom}
                                        </span>
                                    )}
                                </label>
                                {/* On an alt-unit order the count leads and the base figure
                                    follows it — the packer counts pieces, not kilos. The base
                                    input stays editable: it is what actually moves in stock. */}
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {hasAlt && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                                            <input
                                                type="number"
                                                style={{ ...xpInput, width: '100%', fontSize: 13, height: 22, textAlign: 'right' }}
                                                value={qtyAlt}
                                                onChange={e => onQtyAltChange(e.target.value)}
                                                min="0" step="any"
                                                placeholder={String(baseToAlt(remaining > 0 ? remaining : target, altFactor) ?? '')}
                                                autoFocus
                                            />
                                            <span style={uomChip}>{altUom}</span>
                                        </div>
                                    )}
                                    <input
                                        type="number"
                                        style={{ ...xpInput, flex: 1, fontSize: 13, height: 22 }}
                                        value={qty}
                                        onChange={e => setQty(e.target.value)}
                                        min="0.0001" step="any"
                                        placeholder={remaining > 0 ? remaining.toFixed(2) : String(target)}
                                        autoFocus={!hasAlt}
                                        required
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ ...xpFormLabel, fontWeight: 'bold' }}>
                                        Box size
                                        <span style={{ fontWeight: 'normal', color: '#888', marginLeft: 5 }}>
                                            — a shortcut for filling the lines below
                                        </span>
                                    </label>
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
                                    className={XP_BTN}
                                    onClick={regenerateBoxes}
                                    title={`Refill the lines below: as many full ${po.package_label.toLowerCase()}s of Box size as fit, plus one for the remainder`}
                                    style={{ ...xpBtn(), fontSize: 9, padding: '3px 8px', marginBottom: 1 }}
                                >
                                    Regenerate
                                </button>
                            </div>

                            <div>
                                <label style={{ ...xpFormLabel, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>
                                        {po.package_label}s to be Made
                                        <span style={{ fontWeight: 'normal', color: '#888', marginLeft: 5 }}>
                                            — count × qty each; the lines add up to the pack total
                                        </span>
                                        {hasAlt && (
                                            <span style={{ fontWeight: 'normal', color: '#888', marginLeft: 5 }}>
                                                ({altUom} per {po.package_label.toLowerCase()} sets its {uom})
                                            </span>
                                        )}
                                        {qtyIsWeight && (
                                            <span style={{ fontWeight: 'normal', color: '#888', marginLeft: 5 }}>
                                                (weighed in {uom}, so each {po.package_label.toLowerCase()}&apos;s qty is its net weight)
                                            </span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        className={XP_BTN}
                                        onClick={addGroup}
                                        style={{ ...xpBtn(), fontSize: 9, padding: '0 6px' }}
                                    >+ Add line</button>
                                </label>
                                <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: 168, overflowY: 'auto' }}>
                                    {boxGroups.length === 0 && (
                                        <div style={{ fontSize: 10, color: '#888', padding: '4px 5px' }}>
                                            Enter a quantity above to generate {po.package_label.toLowerCase()}s.
                                        </div>
                                    )}
                                    {boxGroups.length > 0 && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 5, padding: '1px 5px',
                                            fontSize: 9, color: '#888', fontVariant: 'all-small-caps', letterSpacing: 0.3,
                                            background: '#f7f6f0', borderBottom: '1px solid #d8d5cc',
                                            position: 'sticky', top: 0, zIndex: 1,
                                        }}>
                                            <span style={{ width: 46, flexShrink: 0, textAlign: 'right' }}>{po.package_label}s</span>
                                            <span style={{ width: 12, flexShrink: 0 }} />
                                            {hasAlt && <span style={{ width: 56 + 24 + 5, flexShrink: 0 }}>{altUom} each</span>}
                                            <span style={{ flex: 1, minWidth: 0 }}>{uom || 'Qty'} each</span>
                                            <span style={{ width: 78, flexShrink: 0, textAlign: 'right' }}>Line total</span>
                                            <span style={{ width: 40, flexShrink: 0 }} />
                                        </div>
                                    )}
                                    {boxGroups.map((g, i) => {
                                        const count = groupCount(g);
                                        const lineTotal = groupTotal(g);
                                        // Cartons before this line, so an expanded row numbers its
                                        // boxes the way the printed labels will be numbered.
                                        const offset = boxGroups.slice(0, i).reduce((s, p) => s + groupCount(p), 0);
                                        const weighed = Array.from({ length: count }, (_, k) => num(g.kg[k]) > 0).filter(Boolean).length;
                                        const open = openGroups.has(i);
                                        return (
                                            <React.Fragment key={i}>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 5, padding: '2px 5px',
                                                    borderBottom: open ? 'none' : '1px solid #eceae2',
                                                }}>
                                                    {/* How many identical cartons this line stands for — the
                                                        multiplier the packer actually counts on the floor. */}
                                                    <input
                                                        type="number"
                                                        style={{ ...xpInput, width: 46, textAlign: 'right', flexShrink: 0, fontWeight: 'bold' }}
                                                        value={g.count}
                                                        onChange={e => updateGroup(i, { count: e.target.value })}
                                                        min="0" step="1"
                                                        title={`How many ${po.package_label.toLowerCase()}s of this size`}
                                                    />
                                                    <span style={{ fontSize: 11, color: '#888', width: 12, flexShrink: 0, textAlign: 'center' }}>×</span>
                                                    {/* The count in each box, printed on the carton label. Stored
                                                        rather than divided back out of the qty, which on a kg item
                                                        is the scale reading. */}
                                                    {hasAlt && (
                                                        <>
                                                            <input
                                                                type="number"
                                                                style={{ ...xpInput, width: 56, textAlign: 'right' }}
                                                                value={g.alt}
                                                                onChange={e => setGroupAlt(i, e.target.value)}
                                                                min="0" step="any"
                                                                title={`How many ${altUom} go into each ${po.package_label.toLowerCase()} on this line — printed on the label`}
                                                            />
                                                            <span style={{ fontSize: 9, color: '#888', width: 24, flexShrink: 0 }}>{altUom}</span>
                                                        </>
                                                    )}
                                                    <input
                                                        type="number"
                                                        style={{ ...xpInput, flex: 1, minWidth: 0 }}
                                                        value={g.qty}
                                                        onChange={e => setGroupQty(i, e.target.value)}
                                                        min="0" step="any"
                                                        title={`${uom || 'Qty'} in each ${po.package_label.toLowerCase()} on this line`}
                                                    />
                                                    {/* The addition half: what this line contributes to the pack
                                                        total, so the packer never multiplies in their head. */}
                                                    <span style={{
                                                        width: 78, flexShrink: 0, textAlign: 'right', fontSize: 10,
                                                        fontWeight: 'bold', color: lineTotal > 0 ? '#2e7d32' : '#bbb',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        = {lineTotal.toFixed(2)}
                                                    </span>
                                                    {/* Per-carton scale readings live one level down: cartons of
                                                        the same size still weigh differently, and the label prints
                                                        each box's own N.W. A kg item has no such row — its qty
                                                        already IS that weight. */}
                                                    {!qtyIsWeight ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroup(i)}
                                                            style={{
                                                                background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                                                                fontSize: 9, width: 22, flexShrink: 0, whiteSpace: 'nowrap',
                                                                color: count > 0 && weighed < count ? '#9a6a00' : '#2e7d32',
                                                            }}
                                                            title={count > 0 && weighed < count
                                                                ? `${count - weighed} of ${count} still to weigh`
                                                                : `All ${count} weighed`}
                                                        >
                                                            <i className={`bi ${open ? 'bi-chevron-down' : 'bi-chevron-right'}`} />
                                                            {count > 0 && weighed < count && <span style={{ marginLeft: 1 }}>{weighed}/{count}</span>}
                                                        </button>
                                                    ) : <span style={{ width: 22, flexShrink: 0 }} />}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeGroup(i)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aa0000', fontSize: 13, fontWeight: 'bold', padding: '0 3px', flexShrink: 0 }}
                                                        title="Remove this line"
                                                    >×</button>
                                                </div>
                                                {open && !qtyIsWeight && (
                                                    <div style={{ borderBottom: '1px solid #eceae2', background: '#fbfaf6', padding: '2px 5px 3px 22px' }}>
                                                        {count === 0 && (
                                                            <div style={{ fontSize: 9, color: '#888' }}>
                                                                Set a {po.package_label.toLowerCase()} count to weigh.
                                                            </div>
                                                        )}
                                                        {Array.from({ length: count }, (_, k) => (
                                                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '1px 0' }}>
                                                                <span style={{ fontSize: 9, color: '#888', width: 30, flexShrink: 0 }}>#{offset + k + 1}</span>
                                                                <span style={{ fontSize: 9, color: '#999', flex: 1, minWidth: 0 }}>
                                                                    {num(g.qty) > 0 ? `${num(g.qty)} ${uom || ''}` : '—'}
                                                                </span>
                                                                <span style={{ fontSize: 9, color: '#888', flexShrink: 0 }}>net wt</span>
                                                                <input
                                                                    type="number"
                                                                    style={{ ...xpInput, width: 62, background: num(g.kg[k]) > 0 ? '#fff' : '#fffbe6' }}
                                                                    value={g.kg[k] || ''}
                                                                    onChange={e => setGroupWeight(i, k, e.target.value)}
                                                                    min="0" step="any"
                                                                    required
                                                                    placeholder="net wt"
                                                                    title="Net weight of this carton off the scale — printed as N.W. on the label"
                                                                />
                                                                <span style={{ fontSize: 9, color: '#888', width: 16, flexShrink: 0 }}>kg</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
                                    padding: '3px 5px', background: '#f0efe6', border: '1px solid #c0bdb5', borderTop: 'none',
                                }}>
                                    <span style={{
                                        width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                                        background: boxMismatch ? '#cc3300' : weightsMissing ? '#d9a441' : '#4caf50',
                                    }} />
                                    <span style={{ color: '#555' }}>Boxed:</span>
                                    <span style={{ fontWeight: 'bold', color: boxMismatch ? '#a00000' : '#2e7d32' }}>
                                        {boxTotal.toFixed(2)}
                                    </span>
                                    <span style={{ color: '#c0bdb5' }}>/</span>
                                    <span style={{ fontWeight: 'bold' }}>{packTotal.toFixed(2)} {uom}</span>
                                    {hasAlt && (
                                        <>
                                            <span style={{ color: '#c0bdb5' }}>|</span>
                                            <span style={{ color: '#555' }}>{altUom}:</span>
                                            <span style={{ fontWeight: 'bold' }}>{altTotal.toLocaleString()}</span>
                                        </>
                                    )}
                                    <span style={{ color: '#c0bdb5' }}>|</span>
                                    <span style={{ color: '#555' }}>{po.package_label}s:</span>
                                    <span style={{ fontWeight: 'bold' }}>{boxValues.length}</span>
                                    <span style={{ color: '#c0bdb5' }}>|</span>
                                    <span style={{ color: '#555' }}>Net wt:</span>
                                    <span style={{ fontWeight: 'bold', color: weightsMissing ? '#7a4a00' : undefined }}>
                                        {weightTotal.toFixed(2)} kg
                                    </span>
                                    {boxMismatch
                                        ? <span style={{ color: '#a00000', marginLeft: 'auto', fontStyle: 'italic' }}>Doesn&apos;t match qty to pack</span>
                                        : weightsMissing && <span style={{ color: '#7a4a00', marginLeft: 'auto', fontStyle: 'italic' }}>Weigh every {po.package_label.toLowerCase()}</span>}
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
                                    <button type="button" className={XP_BTN} onClick={saveLocations}
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
                                                    className={XP_BTN}
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
                                                    <label key={id} style={{ ...lvPickerRow(CLASSIC, on), fontSize: 10 }}>
                                                        <RowCheckbox classic={CLASSIC} checked={on} label={b.batch_number || 'lot'}
                                                            onChange={() => toggleLot(id, !on)} />
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                                <span style={{ fontFamily: CODE_FONT, fontWeight: 'bold' }}>{b.batch_number}</span>
                                                                <span style={{ color: '#555' }}>{Number(b.remaining ?? 0).toFixed(2)} {uom}</span>
                                                                {/* What this log takes off the lot — the rest stays on it for
                                                                    the next pack event. FIFO, so later lots may draw 0. */}
                                                                {on && (
                                                                    <span style={{ borderRadius: CHIP_RADIUS,
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
                                    <label style={{ ...xpFormLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                        <span>Machine</span>
                                        {machineDirty && workCenterId && (
                                            <XPActionButton
                                                classic tone="primary" icon="bi-pin-angle" label="Set on order"
                                                title="Store this machine on the packing order so later entries pre-fill with it"
                                                disabled={savingMachine}
                                                onClick={saveMachine}
                                            />
                                        )}
                                    </label>
                                    <SearchableSelect options={machineOptions || []} value={workCenterId}
                                        onChange={setWorkCenterId} placeholder="Select machine (optional)…" size="sm" />
                                </div>
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
                                            <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #aca899' }}>QC Reject</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Source lot</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Machine</th>
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
                                                <td style={{ padding: '2px 6px', color: '#555' }}>{c.work_center_name || '—'}</td>
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
                                        <button type="button" className={XP_BTN} style={xpBtn()} onClick={() => setRejectComp(null)}>Cancel</button>
                                        <button
                                            type="button"
                                            className={XP_BTN}
                                            style={{ ...xpBtn({ ...BTN_TONES.danger }), opacity: rejecting ? 0.6 : 1 }}
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
