'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { usePaginatedFetch } from '../../context/usePaginatedList';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import {
    XPStatusBar, XPEmptyState, TableSkeleton, useTableSkeletonMetrics, StatusChip,
    useFloatingMenu, MenuTriggerButton, FloatingMenu, ExpandedRowPanel, XPActionButton, CodeChip, CODE_FONT, rowStateBg,
} from '../shared/xpTheme';
import { LV_XP_FONT, lvBtn, lvInput, lvTh, lvTd, lvLabel, lvRow, lvThead, lvSubTh, lvSubTd, lvSubTable, useRowSelection, RowCheckbox, SelectAllCheckbox, LV_CHECK_COL_W } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar, SearchField, FilterChipBar, ToolbarCount } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
import { Tabs } from '../shared/Tabs';
import { qtyFmt, toNum as num } from '../shared/format';
const SuratJalanPrintModal = dynamic(() => import('./SuratJalanPrintModal'), { ssr: false });

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// Classic-XP primitives, same set PickListView uses — the two pages are read by
// the same warehouse staff minutes apart and must not drift apart visually.
const xpFont = LV_XP_FONT;
const xpInput: React.CSSProperties = lvInput(true);
const xpTableHeader: React.CSSProperties = { ...lvTh(true), ...lvThead(true), position: 'sticky', top: 0 };
const DECK_COLS = 8;
const SHP_COLS = 8;
const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => lvBtn(true, extra);
const xpBtnGreen = (extra: React.CSSProperties = {}) => xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold', ...extra });
const rowStyle = (idx: number): React.CSSProperties => lvRow(true, idx);
const td: React.CSSProperties = lvTd(true);
// Expanded-row sub-table (shipment contents) — subordinate chrome, not the
// main-list chrome above. Classic-only like the rest of this file.
const subTh: React.CSSProperties = lvSubTh(true);
const subTd: React.CSSProperties = lvSubTd(true);
const subTable: React.CSSProperties = lvSubTable(true);
const xpLabel: React.CSSProperties = lvLabel(true);

const fmtQty = qtyFmt(2, 'id-ID');   // the deck feeds a printed Surat Jalan
const PAGE_SIZE = 20;
// '' = no status filter; the bar renders it as the leading "All" segment.
const SHIPMENT_STATUS_FILTERS = [
    { value: '', label: 'All' },
    { value: 'STAGED' }, { value: 'VERIFIED' }, { value: 'DISPATCHED' }, { value: 'CANCELLED' },
];
type DispatchTab = 'deck' | 'shipments';

/**
 * Loading deck — the second half of the outbound flow.
 *
 * "Deck" is the inbox: finished pick lists waiting to be loaded. Staging one or
 * more of them onto a truck mints a Shipment and its Surat Jalan number; the
 * printout goes out with the goods, a *different* person counts the cartons
 * against it and verifies, and only then does dispatch post goods issue.
 *
 * The two tabs are two people. Deck is the loader's screen, Shipments is where
 * the checker works — but they are one page because they are one physical spot
 * in the warehouse, and the checker needs to see what is still un-staged.
 */
export default function DispatchView() {
    const { partners, attributes, companyProfile, itemIndex, authFetch } = useData();
    const { formatDate: tzDate, formatDateTime: tzDateTime } = useTimezone();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage') || hasPermission('shipment.create');
    const canVerify = hasPermission('shipment.verify');
    const canDispatch = hasPermission('sales.manage') || hasPermission('shipment.dispatch');

    const [tab, setTab] = useState<DispatchTab>('deck');
    const [deck, setDeck] = useState<any[]>([]);
    const [deckLoading, setDeckLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [staging, setStaging] = useState<any[] | null>(null);   // pick lists chosen to stage
    const [editing, setEditing] = useState<any | null>(null);     // shipment header edit
    const [verifying, setVerifying] = useState<any | null>(null);
    const [printShp, setPrintShp] = useState<any | null>(null);

    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(180);

    const customerAddr = (name: string) => (partners || []).find((p: any) => p.name === name)?.address || '';

    const loadDeck = useCallback(async () => {
        setDeckLoading(true);
        try {
            const res = await authFetch(`${API_BASE}/shipments/stageable`);
            if (res.ok) setDeck(await res.json());
        } finally { setDeckLoading(false); }
    }, [authFetch]);

    // Page window, the debounced server-backed search box, the loading flag and the
    // stale-response race guard all come from the shared hook
    // (context/usePaginatedList.ts) — the status chip bar rides in as a param, and
    // changing it restarts at page 1 on its own.
    const {
        rows: shipments, total, loading, page, setPage,
        searchInput, setSearch: setSearchInput, refetch: loadShipments,
    } = usePaginatedFetch<any>({
        endpoint: `${API_BASE}/shipments`,
        authFetch,
        pageSize: PAGE_SIZE,
        params: { status: statusFilter },
    });

    const skel = useTableSkeletonMetrics('shipments', listBodyRef, shipments.length > 0);

    useEffect(() => { loadDeck(); }, [loadDeck]);

    const refreshAll = useCallback(async () => {
        await Promise.all([loadDeck(), loadShipments()]);
    }, [loadDeck, loadShipments]);

    // Keeps the pick-list rows themselves — staging posts their ids and the header
    // count sums their cartons.
    const sel = useRowSelection<any>(deck, d => String(d.id));
    const selectedDeck = sel.items;
    // One Surat Jalan addresses one customer — the backend rejects a mixed set, so
    // the button is disabled rather than letting the user find out on submit.
    const mixedCustomers = useMemo(
        () => new Set(selectedDeck.map(d => d.customer_name || '')).size > 1,
        [selectedDeck],
    );

    const doStage = async (form: any) => {
        const res = await authFetch(`${API_BASE}/shipments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, pick_list_ids: selectedDeck.map(d => d.id) }),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            showToast(`Error: ${e.detail || 'could not stage'}`, 'danger');
            return;
        }
        const shp = await res.json();
        setStaging(null);
        sel.clear();
        await refreshAll();
        setTab('shipments');
        showToast(`Staged ${shp.code} — Surat Jalan ${shp.delivery_note_number}`, 'success');
        setPrintShp(shp);
    };

    const doVerify = async (shp: any, payload: any) => {
        const res = await authFetch(`${API_BASE}/shipments/${shp.id}/verify`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            showToast(`Error: ${e.detail || 'verify failed'}`, 'danger');
            return;
        }
        setVerifying(null);
        loadShipments();
        showToast(`${shp.code} verified`, 'success');
    };

    const doAction = async (shp: any, action: string, confirmText?: string) => {
        if (confirmText && !(await confirm({ title: 'Confirm', message: confirmText, variant: action === 'dispatch' ? 'success' : 'warning' }))) return;
        const res = await authFetch(`${API_BASE}/shipments/${shp.id}/${action}`, { method: 'POST' });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            showToast(`Error: ${e.detail || `${action} failed`}`, 'danger');
            return;
        }
        await refreshAll();
        showToast(`${shp.code} ${action === 'dispatch' ? 'dispatched' : action}ed`, 'success');
    };

    const doDelete = async (shp: any) => {
        if (!(await confirm({ title: 'Delete shipment', message: `Delete shipment ${shp.code}? Its pick lists return to the deck.`, variant: 'danger' }))) return;
        const res = await authFetch(`${API_BASE}/shipments/${shp.id}`, { method: 'DELETE' });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            showToast(`Error: ${e.detail || 'delete failed'}`, 'danger');
            return;
        }
        await refreshAll();
    };

    const openEdit = async (shp: any) => {
        // The list row already carries pick_lists; re-fetch anyway so the editor
        // never opens on a row that a WS refresh has since moved on.
        const res = await authFetch(`${API_BASE}/shipments/${shp.id}`);
        setEditing(res.ok ? await res.json() : shp);
    };

    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // ── Deck tab ───────────────────────────────────────────────────────────
    const deckTab = (
        <>
            <div style={{ ...xpToolbar(), gap: 8 }}>
                <span style={{ fontSize: 11 }}>
                    {selectedDeck.length > 0
                        ? `${selectedDeck.length} pick list(s) selected · ${selectedDeck.reduce((s, d) => s + num(d.carton_count), 0)} carton(s)`
                        : 'Select the pick lists loaded onto this vehicle'}
                </span>
                <div style={{ flex: 1 }} />
                {mixedCustomers && (
                    <span style={{ fontSize: 11, color: '#8e0000' }}>
                        One Surat Jalan = one customer
                    </span>
                )}
                {canManage && (
                    <button
                        style={xpBtnGreen()}
                        disabled={selectedDeck.length === 0 || mixedCustomers}
                        onClick={() => setStaging(selectedDeck)}
                    >
                        Stage on Deck
                    </button>
                )}
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: xpFont, fontSize: 11 }}>
                    <thead>
                        <tr>
                            <th style={{ ...xpTableHeader, width: LV_CHECK_COL_W, textAlign: 'center' }}>
                                <SelectAllCheckbox classic allSelected={sel.allPageSelected} someSelected={sel.someSelected}
                                    disabled={!sel.pageEligibleCount} onChange={sel.togglePage} />
                            </th>
                            <th style={xpTableHeader}>Pick List</th>
                            <th style={xpTableHeader}>SO</th>
                            <th style={xpTableHeader}>Customer PO</th>
                            <th style={xpTableHeader}>Customer</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Cartons</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Qty</th>
                            <th style={xpTableHeader}>Picked</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deck.length === 0 && (deckLoading ? (
                            <TableSkeleton rows={5} cols={skel.cols ?? DECK_COLS} classic tdStyle={td} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                        ) : (
                            <tr><td colSpan={DECK_COLS} style={{ padding: 0 }}>
                                <XPEmptyState icon="bi-truck" message="Deck is clear. Pick lists appear here once the floor has confirmed every carton." />
                            </td></tr>
                        ))}
                        {deck.map((d, i) => (
                            <tr key={String(d.id)} style={{ ...rowStyle(i), ...(sel.isSelected(d) ? { background: rowStateBg('selected', true) } : {}) }}>
                                <td style={{ ...td, textAlign: 'center' }}>
                                    <RowCheckbox classic checked={sel.isSelected(d)} onChange={() => sel.toggle(d)} label={`pick list ${d.code}`} />
                                </td>
                                <td style={td}><CodeChip code={d.code} classic tone="accent" /></td>
                                <td style={td}>{d.sales_order_code || '-'}</td>
                                <td style={td}>{d.customer_po_ref || '-'}</td>
                                <td style={td}>{d.customer_name || '-'}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{d.carton_count}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmtQty(d.total_qty)}</td>
                                <td style={td}>{d.picked_at ? tzDate(d.picked_at) : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );

    // ── Shipments tab ──────────────────────────────────────────────────────
    const shipmentsTab = (
        <>
            <div style={{ ...xpToolbar(), gap: 6 }}>
                <SearchField
                    classic
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder="Search SJ no, code, vehicle..."
                />
                <FilterChipBar
                    classic
                    options={SHIPMENT_STATUS_FILTERS}
                    value={statusFilter}
                    onChange={setStatusFilter}
                />
                <ToolbarCount classic right>{total} shipment(s)</ToolbarCount>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: xpFont, fontSize: 11 }}>
                    <thead>
                        <tr>
                            <th style={xpTableHeader}>Shipment</th>
                            <th style={xpTableHeader}>Surat Jalan</th>
                            <th style={xpTableHeader}>Customer</th>
                            <th style={xpTableHeader}>Vehicle</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Cartons</th>
                            <th style={xpTableHeader}>Status</th>
                            <th style={xpTableHeader}>Checked by</th>
                            <th style={{ ...xpTableHeader, width: 96, textAlign: 'right' }} />
                        </tr>
                    </thead>
                    <tbody ref={listBodyRef}>
                        {shipments.length === 0 && (loading ? (
                            <TableSkeleton rows={6} cols={skel.cols ?? SHP_COLS} classic tdStyle={td} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                        ) : (
                            <tr><td colSpan={SHP_COLS} style={{ padding: 0 }}>
                                <XPEmptyState icon="bi-truck" message="No shipments yet. Stage pick lists from the Deck tab to raise a Surat Jalan." />
                            </td></tr>
                        ))}
                        {shipments.map((shp, i) => {
                            const open = expandedId === String(shp.id);
                            return (
                                <React.Fragment key={String(shp.id)}>
                                    <tr
                                        style={{ ...rowStyle(i), ...(open ? { background: rowStateBg('expanded', true) } : {}), cursor: 'pointer' }}
                                        onClick={() => setExpandedId(open ? null : String(shp.id))}
                                    >
                                        <td style={td}><CodeChip code={shp.code} classic tone="accent" /></td>
                                        <td style={td}>{shp.delivery_note_number ? <CodeChip code={shp.delivery_note_number} classic /> : '—'}</td>
                                        <td style={td}>{shp.customer_name || '-'}</td>
                                        <td style={td}>{shp.vehicle_plate || '-'}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{shp.carton_count}</td>
                                        <td style={td}><StatusChip status={shp.status} /></td>
                                        <td style={td}>
                                            {shp.verified_by_name
                                                ? `${shp.verified_by_name}${shp.verified_with_discrepancy ? ' (discrepancy)' : ''}`
                                                : '-'}
                                        </td>
                                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                            {canVerify && shp.status === 'STAGED' && (
                                                <span style={{ marginRight: 2 }}>
                                                    <XPActionButton
                                                        classic
                                                        tone="success"
                                                        icon="bi-check2-square"
                                                        title="Verify Load"
                                                        onClick={() => setVerifying(shp)}
                                                    />
                                                </span>
                                            )}
                                            <span style={{ marginRight: 2 }}>
                                                <XPActionButton
                                                    classic
                                                    tone="neutral"
                                                    icon="bi-printer"
                                                    title="Print Surat Jalan"
                                                    onClick={() => setPrintShp(shp)}
                                                />
                                            </span>
                                            <MenuTriggerButton classic onClick={e => menuToggle(String(shp.id), e)} />
                                        </td>
                                    </tr>
                                    {open && (
                                        <tr>
                                            <td colSpan={SHP_COLS} style={{ padding: 0 }}>
                                                <ExpandedRowPanel classic>
                                                    <ShipmentDetail
                                                        shp={shp}
                                                        tzDateTime={tzDateTime}
                                                        itemIndex={itemIndex}
                                                    />
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
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
        </>
    );

    const menuShipment = shipments.find(s => String(s.id) === menuOpenId);

    return (
        <ShellWindow classic fill="page" className="fade-in" style={{ fontFamily: xpFont }}>
            <ShellTitleBar classic icon="bi-truck" title="Dispatch & Loading Deck" />
            <Tabs<DispatchTab>
                classic
                activeKey={tab}
                onChange={setTab}
                tabs={[
                    { key: 'deck' as const, label: `Deck${deck.length ? ` (${deck.length})` : ''}`, icon: 'bi-box-arrow-right' },
                    { key: 'shipments' as const, label: 'Shipments', icon: 'bi-truck' },
                ]}
            />
            {tab === 'deck' ? deckTab : shipmentsTab}

            <XPStatusBar right={`${deck.length} waiting · ${total} shipment(s)`}>
                Loading deck
            </XPStatusBar>

            {menuOpenId && menuShipment && (
                <FloatingMenu
                    pos={menuPos}
                    items={[
                        // Surat Jalan and Verify Load are promoted to the row's action
                        // column — the two things a deck user reaches for every time.
                        ...(canManage && ['DRAFT', 'STAGED'].includes(menuShipment.status)
                            ? [{ key: 'edit', label: 'Edit', icon: 'bi-pencil', onClick: () => { menuClose(); openEdit(menuShipment); } }] : []),
                        ...(canManage && menuShipment.status === 'VERIFIED'
                            ? [{ key: 'reopen', label: 'Reopen', icon: 'bi-arrow-counterclockwise', onClick: () => { menuClose(); doAction(menuShipment, 'reopen'); } }] : []),
                        ...(canDispatch && menuShipment.status === 'VERIFIED'
                            ? [{ key: 'dispatch', label: 'Confirm Dispatch', icon: 'bi-truck', onClick: () => { menuClose(); doAction(menuShipment, 'dispatch', `Dispatch ${menuShipment.code}? This posts goods issue and cannot be undone.`); } }] : []),
                        ...(canManage && menuShipment.status !== 'DISPATCHED'
                            ? [{ key: 'cancel', label: 'Cancel', icon: 'bi-x-circle', onClick: () => { menuClose(); doAction(menuShipment, 'cancel', `Cancel ${menuShipment.code}? Pick lists return to the deck.`); } }] : []),
                        ...(canManage && menuShipment.status !== 'DISPATCHED'
                            ? [{ key: 'delete', label: 'Delete', icon: 'bi-trash', onClick: () => { menuClose(); doDelete(menuShipment); } }] : []),
                    ]}
                />
            )}

            {staging && (
                <StageModal
                    picks={staging}
                    onClose={() => setStaging(null)}
                    onSubmit={doStage}
                />
            )}

            {editing && (
                <EditShipmentModal
                    shp={editing}
                    deck={deck}
                    authFetch={authFetch}
                    showToast={showToast}
                    onClose={() => setEditing(null)}
                    onSaved={async () => { setEditing(null); await refreshAll(); }}
                />
            )}

            {verifying && (
                <VerifyModal
                    shp={verifying}
                    onClose={() => setVerifying(null)}
                    onSubmit={(payload: any) => doVerify(verifying, payload)}
                />
            )}

            {printShp && (
                <SuratJalanPrintModal
                    shipment={printShp}
                    attributes={attributes}
                    companyProfile={companyProfile}
                    customerAddr={customerAddr}
                    onClose={() => setPrintShp(null)}
                />
            )}
        </ShellWindow>
    );
}

// ── Expanded row: what is physically on this truck ─────────────────────────
function ShipmentDetail({ shp, tzDateTime, itemIndex }: any) {
    const info = (k: string, v: any) => (
        <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
            <span style={{ ...xpLabel, minWidth: 110 }}>{k}</span>
            <span>{v ?? '—'}</span>
        </div>
    );
    return (
        <div style={{ display: 'flex', gap: 20, padding: '8px 12px', fontFamily: xpFont }}>
            <div style={{ minWidth: 260 }}>
                {info('Surat Jalan', shp.delivery_note_number)}
                {info('Delivery date', shp.delivery_date ? tzDateTime(shp.delivery_date) : null)}
                {info('Carrier', shp.carrier)}
                {info('Vehicle', shp.vehicle_plate)}
                {info('Driver', shp.driver)}
                {info('Staged by', shp.staged_by_name)}
                {info('Staged at', shp.staged_at ? tzDateTime(shp.staged_at) : null)}
                {info('Checked by', shp.verified_by_name)}
                {info('Checked at', shp.verified_at ? tzDateTime(shp.verified_at) : null)}
                {shp.verified_with_discrepancy && info('Discrepancy', 'Yes — passed with note')}
                {shp.verification_notes && info('Check notes', shp.verification_notes)}
                {info('Dispatched', shp.dispatched_at ? tzDateTime(shp.dispatched_at) : null)}
            </div>
            <div style={{ flex: 1 }}>
                {/* Sub-table chrome, not the main-list chrome it used to borrow —
                    dressed as the outer list it reads as a second grid. No zebra:
                    the index restarts per pick list, so the stripe was banding by
                    position-within-document rather than by row anyway. */}
                <table style={subTable}>
                    <thead>
                        <tr>
                            <th style={subTh}>Pick List</th>
                            <th style={subTh}>SO</th>
                            <th style={subTh}>Item</th>
                            <th style={subTh}>Colour</th>
                            <th style={subTh}>Carton</th>
                            <th style={{ ...subTh, textAlign: 'right' }}>Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(shp.pick_lists || []).flatMap((pl: any) =>
                            (pl.lines || []).map((l: any) => (
                                <tr key={`${pl.id}-${l.id}`}>
                                    <td style={subTd}><CodeChip code={pl.code} classic tier={2} /></td>
                                    <td style={subTd}>{pl.sales_order_code || '-'}</td>
                                    <td style={subTd}>{l.item_name || itemIndex?.[String(l.item_id)]?.name || '-'}</td>
                                    <td style={subTd}>
                                        {l.color_name ? `${l.color_name}${l.color_code ? ` (${l.color_code})` : ''}` : '-'}
                                    </td>
                                    <td style={subTd}>{l.batch_number ? <CodeChip code={l.batch_number} classic tier={2} /> : '—'}</td>
                                    <td style={{ ...subTd, textAlign: 'right' }}>{fmtQty(l.qty_picked)} {l.item_uom || ''}</td>
                                </tr>
                            )))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Stage: capture the loading-deck facts and mint the Surat Jalan ─────────
function StageModal({ picks, onClose, onSubmit }: any) {
    const { todayInput } = useTimezone();
    const [carrier, setCarrier] = useState('');
    const [vehicle, setVehicle] = useState('');
    const [driver, setDriver] = useState('');
    const [dn, setDn] = useState('');
    const [date, setDate] = useState(todayInput);
    const [notes, setNotes] = useState('');

    const cartons = picks.reduce((s: number, p: any) => s + num(p.carton_count), 0);

    const field = (label: string, node: React.ReactNode, hint?: string) => (
        <div style={{ marginBottom: 8 }}>
            <div style={xpLabel}>{label}</div>
            {node}
            {hint && <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{hint}</div>}
        </div>
    );

    return (
        <ModalWrapper
            isOpen
            onClose={onClose}
            title="Stage on Loading Deck"
            size="lg"
            modeless
            footer={
                <>
                    <button style={xpBtn()} onClick={onClose}>Cancel</button>
                    <button
                        style={xpBtnGreen()}
                        onClick={() => onSubmit({
                            carrier: carrier || null,
                            vehicle_plate: vehicle || null,
                            driver: driver || null,
                            delivery_note_number: dn || null,
                            delivery_date: date ? new Date(date).toISOString() : null,
                            notes: notes || null,
                        })}
                    >Stage &amp; Print</button>
                </>
            }
        >
            <div style={{ fontFamily: xpFont, fontSize: 11 }}>
                <div style={{ marginBottom: 10 }}>
                    <strong>{picks.length} pick list(s)</strong> · {cartons} carton(s) · {picks[0]?.customer_name}
                    <div style={{ marginTop: 4, fontFamily: CODE_FONT }}>
                        {picks.map((p: any) => p.code).join(', ')}
                    </div>
                </div>
                {field('Surat Jalan no.',
                    <input style={{ ...xpInput, width: '100%' }} value={dn} onChange={e => setDn(e.target.value)} placeholder="Auto" />,
                    'Leave blank to take the next number in the series.')}
                {field('Delivery date',
                    <input type="date" style={{ ...xpInput, width: '100%' }} value={date} onChange={e => setDate(e.target.value)} />)}
                {field('Carrier',
                    <input style={{ ...xpInput, width: '100%' }} value={carrier} onChange={e => setCarrier(e.target.value)} />)}
                {field('Vehicle no.',
                    <input style={{ ...xpInput, width: '100%' }} value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="B 9751 CCB" />)}
                {field('Driver',
                    <input style={{ ...xpInput, width: '100%' }} value={driver} onChange={e => setDriver(e.target.value)} />)}
                {field('Notes',
                    <input style={{ ...xpInput, width: '100%' }} value={notes} onChange={e => setNotes(e.target.value)} />)}
            </div>
        </ModalWrapper>
    );
}

// ── Edit a staged shipment's header / membership ───────────────────────────
function EditShipmentModal({ shp, deck, authFetch, showToast, onClose, onSaved }: any) {
    const [dn, setDn] = useState(shp.delivery_note_number || '');
    const [date, setDate] = useState(shp.delivery_date ? String(shp.delivery_date).slice(0, 10) : '');
    const [carrier, setCarrier] = useState(shp.carrier || '');
    const [vehicle, setVehicle] = useState(shp.vehicle_plate || '');
    const [driver, setDriver] = useState(shp.driver || '');
    const [notes, setNotes] = useState(shp.notes || '');
    const [members, setMembers] = useState<Record<string, boolean>>(
        () => Object.fromEntries((shp.pick_lists || []).map((p: any) => [String(p.id), true])),
    );

    // Current members plus anything still free on the deck for the same customer.
    const candidates = useMemo(() => {
        const own = (shp.pick_lists || []).map((p: any) => ({
            id: p.id, code: p.code, sales_order_code: p.sales_order_code,
            customer_name: p.customer_name, carton_count: p.carton_count,
        }));
        const ownIds = new Set(own.map((p: any) => String(p.id)));
        const free = (deck || []).filter((d: any) =>
            !ownIds.has(String(d.id)) && (!shp.customer_name || d.customer_name === shp.customer_name));
        return [...own, ...free];
    }, [shp, deck]);

    const save = async () => {
        const res = await authFetch(`${API_BASE}/shipments/${shp.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                delivery_note_number: dn || null,
                delivery_date: date ? new Date(date).toISOString() : null,
                carrier: carrier || null, vehicle_plate: vehicle || null, driver: driver || null,
                notes: notes || null,
                pick_list_ids: candidates.filter((c: any) => members[String(c.id)]).map((c: any) => c.id),
            }),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            showToast(`Error: ${e.detail || 'save failed'}`, 'danger');
            return;
        }
        onSaved();
    };

    return (
        <ModalWrapper
            isOpen onClose={onClose} title={`Edit ${shp.code}`} size="lg" modeless
            footer={<><button style={xpBtn()} onClick={onClose}>Cancel</button><button style={xpBtnGreen()} onClick={save}>Save</button></>}
        >
            <div style={{ fontFamily: xpFont, fontSize: 11, display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                    <div style={xpLabel}>Surat Jalan no.</div>
                    <input style={{ ...xpInput, width: '100%', marginBottom: 8 }} value={dn} onChange={e => setDn(e.target.value)} />
                    <div style={xpLabel}>Delivery date</div>
                    <input type="date" style={{ ...xpInput, width: '100%', marginBottom: 8 }} value={date} onChange={e => setDate(e.target.value)} />
                    <div style={xpLabel}>Carrier</div>
                    <input style={{ ...xpInput, width: '100%', marginBottom: 8 }} value={carrier} onChange={e => setCarrier(e.target.value)} />
                    <div style={xpLabel}>Vehicle no.</div>
                    <input style={{ ...xpInput, width: '100%', marginBottom: 8 }} value={vehicle} onChange={e => setVehicle(e.target.value)} />
                    <div style={xpLabel}>Driver</div>
                    <input style={{ ...xpInput, width: '100%', marginBottom: 8 }} value={driver} onChange={e => setDriver(e.target.value)} />
                    <div style={xpLabel}>Notes</div>
                    <input style={{ ...xpInput, width: '100%' }} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={xpLabel}>Pick lists on this shipment</div>
                    <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #b0a898', padding: 6, background: '#fff' }}>
                        {candidates.map((c: any) => (
                            <label key={String(c.id)} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}>
                                <RowCheckbox classic checked={!!members[String(c.id)]} label={`pick list ${c.code}`}
                                    onChange={() => setMembers(m => ({ ...m, [String(c.id)]: !m[String(c.id)] }))} />
                                <CodeChip code={c.code} classic tier={2} />
                                <span style={{ color: '#555' }}>{c.sales_order_code} · {c.carton_count} ctn</span>
                            </label>
                        ))}
                        {candidates.length === 0 && <div style={{ color: '#555' }}>Nothing available.</div>}
                    </div>
                </div>
            </div>
        </ModalWrapper>
    );
}

// ── The deck check ─────────────────────────────────────────────────────────
function VerifyModal({ shp, onClose, onSubmit }: any) {
    const [notes, setNotes] = useState('');
    const [discrepancy, setDiscrepancy] = useState(false);
    const [ticked, setTicked] = useState<Record<string, boolean>>({});

    const cartons = (shp.pick_lists || []).flatMap((pl: any) =>
        (pl.lines || []).filter((l: any) => l.batch_number).map((l: any) => ({ ...l, pl_code: pl.code })));
    const doneCount = cartons.filter((c: any) => ticked[String(c.id)]).length;
    const allTicked = cartons.length > 0 && doneCount === cartons.length;

    return (
        <ModalWrapper
            isOpen onClose={onClose} title={`Verify Load — ${shp.code}`} size="lg" modeless variant="success"
            footer={
                <>
                    <button style={xpBtn()} onClick={onClose}>Cancel</button>
                    <button
                        style={xpBtnGreen()}
                        disabled={!allTicked && !discrepancy}
                        onClick={() => onSubmit({ notes: notes || null, with_discrepancy: discrepancy })}
                    >Confirm Load</button>
                </>
            }
        >
            <div style={{ fontFamily: xpFont, fontSize: 11 }}>
                <div style={{ marginBottom: 8 }}>
                    Count the cartons on the deck against Surat Jalan{' '}
                    <strong style={{ fontFamily: CODE_FONT }}>{shp.delivery_note_number}</strong>. Tick each one you
                    have physically seen. You cannot verify a shipment you staged yourself.
                </div>
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #b0a898', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                            <tr>
                                <th style={{ ...xpTableHeader, width: LV_CHECK_COL_W, textAlign: 'center' }} />
                                <th style={xpTableHeader}>Carton</th>
                                <th style={xpTableHeader}>Item</th>
                                <th style={xpTableHeader}>Colour</th>
                                <th style={{ ...xpTableHeader, textAlign: 'right' }}>Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cartons.map((c: any, i: number) => (
                                <tr key={String(c.id)} style={rowStyle(i)}>
                                    <td style={{ ...td, textAlign: 'center' }}>
                                        {/* Ticked one carton at a time by design — a select-all
                                            would defeat the second count. */}
                                        <RowCheckbox classic checked={!!ticked[String(c.id)]} label={`carton ${c.batch_number}`}
                                            onChange={() => setTicked(t => ({ ...t, [String(c.id)]: !t[String(c.id)] }))} />
                                    </td>
                                    <td style={td}><CodeChip code={c.batch_number} classic tier={2} /></td>
                                    <td style={td}>{c.item_name}</td>
                                    <td style={td}>{c.color_name || '-'}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{fmtQty(c.qty_picked)} {c.item_uom || ''}</td>
                                </tr>
                            ))}
                            {cartons.length === 0 && (
                                <tr><td colSpan={5} style={{ ...td, color: '#555' }}>No cartons on this shipment.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: 8 }}>
                    {doneCount}/{cartons.length} counted
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                    <input type="checkbox" checked={discrepancy} onChange={e => setDiscrepancy(e.target.checked)} />
                    Pass with discrepancy (short or over load agreed with the customer)
                </label>
                <div style={{ ...xpLabel, marginTop: 8 }}>Check notes</div>
                <input style={{ ...xpInput, width: '100%' }} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder={discrepancy ? 'Required context for the discrepancy' : 'Optional'} />
            </div>
        </ModalWrapper>
    );
}
