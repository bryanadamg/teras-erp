'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState, TableSkeleton, useRowHeightProbe, StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu } from '../shared/xpTheme';
import { LV_XP_FONT, lvBtn, lvInput, lvTh, lvTd, lvLabel, lvRow, lvThead } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
const SuratJalanPrintModal = dynamic(() => import('./SuratJalanPrintModal'), { ssr: false });
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
// Title-bar "create" button — same style as SalesOrderView / PartnersView / SampleRequestView.
const xpBtnCreate = xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' });
const rowStyle = (idx: number): React.CSSProperties => lvRow(true, idx);
const td: React.CSSProperties = lvTd(true);
const xpLabel: React.CSSProperties = lvLabel(true);

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const PL_PAGE_SIZE = 20;
const OPEN_STATUSES = ['DRAFT', 'PICKING', 'PICKED'];

export default function PickListView() {
    // partners/locations/attributes/companyProfile/itemIndex come from DataContext
    // master data (loaded on initial app load). Pick lists, sales orders and stock
    // balances are all fetched here scoped to what's actually on screen.
    const { partners, locations, attributes, companyProfile, itemIndex, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { formatDate: tzDate } = useTimezone();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');

    const [pickLists, setPickLists] = useState<any[]>([]);
    const [plTotal, setPlTotal] = useState(0);
    const [openCount, setOpenCount] = useState(0);
    const [dispatchedCount, setDispatchedCount] = useState(0);
    // pickableSOs / openSoIds are only needed while the SO picker is open.
    const [pickableSOs, setPickableSOs] = useState<any[]>([]);
    const [openSoIds, setOpenSoIds] = useState<Set<string>>(new Set());
    // True from first paint so the list shows the loader, not "none yet".
    const [loading, setLoading] = useState(true);
    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skelRowH = useRowHeightProbe('pick-lists', listBodyRef, pickLists.length > 0);
    const [picking, setPicking] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [printPL, setPrintPL] = useState<any | null>(null);
    const [plPage, setPlPage] = useState(1);
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(160);

    const itemById = useMemo(() => {
        const m: Record<string, any> = {};
        Object.entries(itemIndex || {}).forEach(([id, v]: [string, any]) => { m[id] = { id, ...v }; });
        return m;
    }, [itemIndex]);

    const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);

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

    useEffect(() => {
        if (!picking) return;
        (async () => {
            const [soRes, openRes] = await Promise.all([
                authFetch(`${API_BASE}/sales-orders?status=PENDING,READY,PARTIAL`),
                authFetch(`${API_BASE}/pick-lists?status=DRAFT&size=200`),
            ]);
            if (soRes.ok) { const d = await soRes.json(); setPickableSOs(Array.isArray(d) ? d : (d.items || [])); }
            if (openRes.ok) {
                const d = await openRes.json();
                setOpenSoIds(new Set((d.items || []).map((p: any) => String(p.sales_order_id))));
            }
        })();
    }, [picking, authFetch]);

    const createForSO = async (so: any) => {
        const res = await authFetch(`${API_BASE}/pick-lists`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales_order_id: so.id }),
        });
        if (res.ok) {
            const pl = await res.json();
            await loadAll();
            setPicking(false);
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

    const customerAddr = (name: string) => (partners || []).find((p: any) => p.name === name)?.address || '';

    const plPages = Math.max(1, Math.ceil(plTotal / PL_PAGE_SIZE));
    const clampedPage = Math.min(plPage, plPages);

    const cartonProgress = (pl: any) => {
        const cartons = (pl.lines || []).filter((l: any) => l.batch_id);
        if (!cartons.length) return '—';
        return `${cartons.filter((l: any) => l.picked_at).length}/${cartons.length}`;
    };

    return (
        <ShellWindow classic fill="page" className="fade-in" style={{ fontFamily: xpFont }}>
            <ShellTitleBar
                classic
                icon="bi-clipboard-check"
                title="Pick Lists & Dispatch"
                right={canManage ? (
                    <button style={xpBtnCreate} onClick={() => setPicking(true)} title="Create a pick list for a sales order">
                        <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />New Pick List
                    </button>
                ) : undefined}
            />
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
                            <TableSkeleton rows={7} cols={8} classic tdStyle={td} rowHeight={skelRowH} />
                        ) : (
                            <tr><td colSpan={8} style={{ padding: 0 }}>
                                <XPEmptyState icon="bi-clipboard-check" message='No pick lists yet. Click "New Pick List" to pick packed cartons for an order.' />
                            </td></tr>
                        ))}
                        {pickLists.map((pl: any, idx: number) => (
                            <tr key={pl.id} style={rowStyle(idx)}>
                                <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{pl.code}</td>
                                <td style={td}>{pl.sales_order_code || '-'}</td>
                                <td style={td}>{pl.customer_name || '-'}</td>
                                <td style={td}><StatusChip status={pl.status} /></td>
                                <td style={{ ...td, textAlign: 'right' }}>{cartonProgress(pl)}</td>
                                <td style={td}>{pl.delivery_note_number || '-'}</td>
                                <td style={td}>{pl.dispatched_at ? tzDate(pl.dispatched_at) : '-'}</td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                    <MenuTriggerButton classic onClick={e => menuToggle(String(pl.id), e)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Pager page={clampedPage} total={plTotal} pageSize={PL_PAGE_SIZE} onPageChange={setPlPage} hideWhenEmpty />

            {menuOpenId && (() => {
                const pl = pickLists.find((x: any) => String(x.id) === menuOpenId);
                if (!pl) return null;
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            { key: 'edit', label: pl.status === 'DISPATCHED' ? 'View' : 'Pick', icon: 'bi-upc-scan', onClick: () => { menuClose(); setEditing(pl); } },
                            { key: 'print', label: 'Surat Jalan', icon: 'bi-printer', onClick: () => { menuClose(); setPrintPL(pl); } },
                            { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, hidden: !(canManage && pl.status !== 'DISPATCHED'), onClick: () => { menuClose(); deletePL(pl); } },
                        ]}
                    />
                );
            })()}
            <XPStatusBar right={`${openCount} open · ${dispatchedCount} dispatched`}>
                {loading ? 'Loading...' : `${plTotal} pick list(s)`}
            </XPStatusBar>

            {picking && (
                <SOPickerModal
                    pickableSOs={pickableSOs}
                    openSoIds={openSoIds}
                    onClose={() => setPicking(false)}
                    onPick={createForSO}
                />
            )}

            {editing && (
                <PickListEditor
                    pl={editing}
                    itemById={itemById}
                    locPickerTreeOptions={locPickerTreeOptions}
                    authFetch={authFetch}
                    onClose={() => setEditing(null)}
                    onSaved={async () => { await loadAll(); }}
                    onPrint={(draft: any) => setPrintPL(draft)}
                    showToast={showToast}
                />
            )}

            {printPL && (
                <SuratJalanPrintModal
                    pl={printPL}
                    attributes={attributes}
                    companyProfile={companyProfile}
                    customerAddr={customerAddr}
                    currentStyle={uiStyle}
                    onClose={() => setPrintPL(null)}
                />
            )}
        </ShellWindow>
    );
}

// ── SO picker ────────────────────────────────────────────────────────────────
function SOPickerModal({ pickableSOs, openSoIds, onClose, onPick }: any) {
    const hasOpen = (soId: string) => openSoIds.has(String(soId));
    return (
        <ModalWrapper isOpen onClose={onClose} title="Select an Order to Pick" size="lg" modeless>
            <div style={{ fontFamily: xpFont }}>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>
                    Cartons are suggested oldest-first from packed stock. Partially-produced orders can be picked too.
                </div>
                {pickableSOs.length === 0
                    ? <XPEmptyState icon="bi-inbox" message="No pickable sales orders." />
                    : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={xpTableHeader}>Sales Order</th>
                                    <th style={xpTableHeader}>Status</th>
                                    <th style={xpTableHeader}>Customer</th>
                                    <th style={xpTableHeader}>Lines</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pickableSOs.map((so: any, idx: number) => (
                                    <tr key={so.id} style={rowStyle(idx)}>
                                        <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{so.po_number}</td>
                                        <td style={td}><StatusChip status={so.status} /></td>
                                        <td style={td}>{so.customer_name}</td>
                                        <td style={{ ...td, color: '#666' }}>{(so.lines || []).length}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>
                                            {hasOpen(so.id) && <span style={{ fontSize: 9, color: '#b8860b', marginRight: 8 }}>has draft</span>}
                                            <button style={xpBtnGreen()} onClick={() => onPick(so)}>Pick</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>
        </ModalWrapper>
    );
}

// ── editor ───────────────────────────────────────────────────────────────────
function PickListEditor({ pl: initialPl, itemById, locPickerTreeOptions, authFetch, onClose, onSaved, onPrint, showToast }: any) {
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
    const [dn, setDn] = useState<string>(initialPl.delivery_note_number || initialPl.code || '');
    const [carrier, setCarrier] = useState<string>(initialPl.carrier || '');
    const [vehicle, setVehicle] = useState<string>(initialPl.vehicle_plate || '');
    const [driver, setDriver] = useState<string>(initialPl.driver || '');
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
        delivery_note_number: dn || null,
        carrier: carrier || null, vehicle_plate: vehicle || null, driver: driver || null,
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

    const dispatch = async () => {
        if (!qcPassed) { showToast('Tick QC passed before dispatch', 'warning'); return; }
        const okSave = await save();
        if (!okSave) return;
        const res = await authFetch(`${API_BASE}/pick-lists/${pl.id}/dispatch`, { method: 'POST' });
        if (res.ok) { showToast('Dispatched — stock deducted', 'success'); await onSaved(); onClose(); }
        else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'dispatch failed'}`, 'danger'); }
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
                        <button style={xpBtn()} onClick={() => onPrint(buildDraftForPrint(pl, so, buildPayload(), lines))}>Surat Jalan</button>
                        {!readOnly && <button style={xpBtn()} disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>}
                        {!readOnly && <button style={xpBtnGreen()} onClick={dispatch}>Confirm Dispatch</button>}
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
                    <div style={{ minWidth: 160 }}>
                        <label style={xpLabel}>Delivery Note No.</label>
                        <input style={{ ...xpInput, width: '100%' }} value={dn} disabled={readOnly} onChange={e => setDn(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 150 }}>
                        <label style={xpLabel}>Carrier</label>
                        <input style={{ ...xpInput, width: '100%' }} value={carrier} disabled={readOnly} onChange={e => setCarrier(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 120 }}>
                        <label style={xpLabel}>Vehicle Plate</label>
                        <input style={{ ...xpInput, width: '100%' }} value={vehicle} disabled={readOnly} onChange={e => setVehicle(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 140 }}>
                        <label style={xpLabel}>Driver</label>
                        <input style={{ ...xpInput, width: '100%' }} value={driver} disabled={readOnly} onChange={e => setDriver(e.target.value)} />
                    </div>
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

// `stateLines` is the same array buildPayload() mapped over, so index i lines up
// even after a local Remove — reading carton labels off pl.lines instead would
// drift by one for every removed row.
function buildDraftForPrint(pl: any, so: any, payload: any, stateLines: any[]) {
    const lineMeta: Record<string, any> = {};
    (so?.lines || []).forEach((l: any) => { lineMeta[String(l.id)] = l; });
    return {
        ...pl,
        ...payload,
        sales_order_code: pl.sales_order_code || so?.po_number,
        customer_name: pl.customer_name || so?.customer_name,
        lines: (payload.lines || []).map((l: any, i: number) => ({
            ...l,
            batch_number: stateLines[i]?.batch_number,
            package_no: stateLines[i]?.package_no,
            attribute_value_ids: lineMeta[String(l.sales_order_line_id)]?.attribute_value_ids || [],
        })),
    };
}
