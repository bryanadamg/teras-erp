'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState, StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu } from '../shared/xpTheme';
import { LV_XP_FONT, lvBtn, lvInput, lvTh, lvTd, lvSep, lvLabel } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
const SuratJalanPrintModal = dynamic(() => import('./SuratJalanPrintModal'), { ssr: false });
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// ── Classic XP theme primitives (match StockOnHandView / LocationsView) ──────
// This view has no modern-theme branch yet (renders the classic look always,
// regardless of the user's theme setting) — pre-existing, tracked separately.
// Cell/input/button/label chrome below is sourced from the shared lv* helpers
// (pinned to classic=true) instead of re-declaring the same CSS; only the
// outer shell/title-bar/toolbar bevel stays local, matching every other view.
const xpFont = LV_XP_FONT;
const xpInput: React.CSSProperties = lvInput(true);
const xpSelect: React.CSSProperties = { ...xpInput, height: 22 };
const xpTableHeader: React.CSSProperties = {
    ...lvTh(true),
    background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
    position: 'sticky', top: 0,
};
const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => lvBtn(true, extra);
const xpBtnGreen = (extra: React.CSSProperties = {}) => xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold', ...extra });
const xpSep: React.CSSProperties = { ...lvSep(true), flexShrink: 0 };
const td: React.CSSProperties = lvTd(true);
const xpLabel: React.CSSProperties = lvLabel(true);

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const PKG_PAGE_SIZE = 20;

export default function PackingView() {
    // partners/locations/attributes/companyProfile/itemIndex come from DataContext
    // master data (loaded on initial app load). Packing orders, sales orders and
    // stock balances are all fetched here scoped to what's actually on screen
    // (paginated list, per-editor SO/balance lookups) rather than in bulk.
    const { partners, locations, attributes, companyProfile, itemIndex, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { formatDate: tzDate } = useTimezone();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');

    const [packingOrders, setPackingOrders] = useState<any[]>([]);
    const [pkgTotal, setPkgTotal] = useState(0);
    const [draftCount, setDraftCount] = useState(0);
    const [dispatchedCount, setDispatchedCount] = useState(0);
    // packableSOs / draftSoIds are only needed while the SO picker is open — this
    // page no longer keeps every sales order (with full nested lines) in memory
    // just to populate that one modal.
    const [packableSOs, setPackableSOs] = useState<any[]>([]);
    const [draftSoIds, setDraftSoIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [picking, setPicking] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [printPO, setPrintPO] = useState<any | null>(null);
    const [pkgPage, setPkgPage] = useState(1);
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(160);

    // Built from the shared itemIndex (id/name/code/uom/lot_tracked) instead of a
    // dedicated /items?limit=10000 fetch — keep the `id` field so existing
    // itemById[x].id lookups (lot dedup) keep working unchanged.
    const itemById = useMemo(() => {
        const m: Record<string, any> = {};
        Object.entries(itemIndex || {}).forEach(([id, v]: [string, any]) => { m[id] = { id, ...v }; });
        return m;
    }, [itemIndex]);

    const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);

    // Real server-side pagination — only the visible page's packing orders (each
    // carrying nested lines/items/batches/packages) come over the wire, not every
    // packing order ever created.
    const loadPackingPage = useCallback(async (page: number) => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE}/packing?page=${page}&size=${PKG_PAGE_SIZE}`);
            if (res.ok) { const d = await res.json(); setPackingOrders(d.items || []); setPkgTotal(d.total || 0); }
        } finally { setLoading(false); }
    }, [authFetch]);

    // Cheap total-only lookups (size=1) for the status-bar counts — avoids pulling
    // every packing order just to count two statuses.
    const loadCounts = useCallback(async () => {
        const [dRes, sRes] = await Promise.all([
            authFetch(`${API_BASE}/packing?status=DRAFT&page=1&size=1`),
            authFetch(`${API_BASE}/packing?status=DISPATCHED&page=1&size=1`),
        ]);
        if (dRes.ok) { const d = await dRes.json(); setDraftCount(d.total || 0); }
        if (sRes.ok) { const d = await sRes.json(); setDispatchedCount(d.total || 0); }
    }, [authFetch]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            await Promise.all([loadPackingPage(pkgPage), loadCounts()]);
        } finally { setLoading(false); }
    }, [loadPackingPage, loadCounts, pkgPage]);

    // Split so page navigation doesn't also re-run the count queries: the pkgPage
    // effect alone covers the initial page-1 load, loadCounts runs once on mount.
    useEffect(() => { loadCounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { loadPackingPage(pkgPage); }, [pkgPage, loadPackingPage]);

    // SO picker needs only packable orders (small, status-bounded) plus which of
    // them already have an open DRAFT — fetched lazily when the modal opens rather
    // than kept loaded on every packaging page visit.
    useEffect(() => {
        if (!picking) return;
        (async () => {
            const [soRes, draftRes] = await Promise.all([
                authFetch(`${API_BASE}/sales-orders?status=PENDING,READY,PARTIAL`),
                authFetch(`${API_BASE}/packing?status=DRAFT&size=200`),
            ]);
            if (soRes.ok) { const d = await soRes.json(); setPackableSOs(Array.isArray(d) ? d : (d.items || [])); }
            if (draftRes.ok) {
                const d = await draftRes.json();
                setDraftSoIds(new Set((d.items || []).map((p: any) => String(p.sales_order_id))));
            }
        })();
    }, [picking, authFetch]);

    const createForSO = async (so: any) => {
        const res = await authFetch(`${API_BASE}/packing`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales_order_id: so.id }),
        });
        if (res.ok) {
            const po = await res.json();
            await loadAll();
            setPicking(false);
            setEditing({ ...po, __justCreated: true });
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(`Error: ${err.detail || 'could not create'}`, 'danger');
        }
    };

    const deletePO = async (po: any) => {
        const ok = await confirm({ title: 'Delete Packing Order', message: `Delete ${po.code}?`, confirmText: 'Delete', variant: 'danger' });
        if (!ok) return;
        const res = await authFetch(`${API_BASE}/packing/${po.id}`, { method: 'DELETE' });
        if (res.ok) { showToast('Packing order deleted', 'success'); loadAll(); }
        else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'failed'}`, 'danger'); }
    };

    const customerAddr = (name: string) => (partners || []).find((p: any) => p.name === name)?.address || '';

    const pkgPages = Math.max(1, Math.ceil(pkgTotal / PKG_PAGE_SIZE));
    const clampedPkgPage = Math.min(pkgPage, pkgPages);
    const pagedPackingOrders = packingOrders;

    return (
        <ShellWindow classic fill="page" className="fade-in" style={{ fontFamily: xpFont }}>
            <ShellTitleBar
                classic
                icon="bi-box2"
                title="Packing & Dispatch"
                right={<span style={{ fontSize: 10, opacity: 0.85 }}>{pkgTotal} orders</span>}
            />
                <div style={xpToolbar()}>
                    {canManage && (
                        <button style={xpBtnGreen()} onClick={() => setPicking(true)} title="Create a packing order for a sales order">
                            <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />New Packing Order
                        </button>
                    )}
                    <div style={xpSep} />
                    <button style={xpBtn()} onClick={loadAll} title="Refresh">
                        <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', background: '#fff', minHeight: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={xpTableHeader}>Code</th>
                                <th style={xpTableHeader}>Sales Order</th>
                                <th style={xpTableHeader}>Customer</th>
                                <th style={xpTableHeader}>Status</th>
                                <th style={{ ...xpTableHeader, textAlign: 'right' }}>Packages</th>
                                <th style={xpTableHeader}>Delivery Note</th>
                                <th style={xpTableHeader}>Dispatched</th>
                                <th style={{ ...xpTableHeader, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {packingOrders.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: 0 }}>
                                    <XPEmptyState icon="bi-box2" message={loading ? 'Loading...' : 'No packing orders yet. Click “New Packing Order” to pack an order — including partially-produced ones.'} />
                                </td></tr>
                            )}
                            {pagedPackingOrders.map((po: any) => (
                                <tr key={po.id}>
                                    <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{po.code}</td>
                                    <td style={td}>{po.sales_order_code || '-'}</td>
                                    <td style={td}>{po.customer_name || '-'}</td>
                                    <td style={td}><StatusChip status={po.status} /></td>
                                    <td style={{ ...td, textAlign: 'right' }}>{(po.packages || []).length}</td>
                                    <td style={td}>{po.delivery_note_number || '-'}</td>
                                    <td style={td}>{po.dispatched_at ? tzDate(po.dispatched_at) : '-'}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <MenuTriggerButton classic onClick={e => menuToggle(String(po.id), e)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pager page={clampedPkgPage} total={pkgTotal} pageSize={PKG_PAGE_SIZE} onPageChange={setPkgPage} hideWhenEmpty />

            {/* Row ⋯ menu: Edit/View, Surat Jalan, Delete */}
            {menuOpenId && (() => {
                const po = pagedPackingOrders.find((x: any) => String(x.id) === menuOpenId);
                if (!po) return null;
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            { key: 'edit', label: po.status === 'DRAFT' ? 'Edit' : 'View', icon: 'bi-pencil', onClick: () => { menuClose(); setEditing(po); } },
                            { key: 'print', label: 'Surat Jalan', icon: 'bi-printer', onClick: () => { menuClose(); setPrintPO(po); } },
                            { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, hidden: !(canManage && po.status !== 'DISPATCHED'), onClick: () => { menuClose(); deletePO(po); } },
                        ]}
                    />
                );
            })()}
            <XPStatusBar right={`${draftCount} draft · ${dispatchedCount} dispatched`}>
                {loading ? 'Loading...' : `${pkgTotal} packing order(s)`}
            </XPStatusBar>

            {picking && (
                <SOPickerModal
                    packableSOs={packableSOs}
                    draftSoIds={draftSoIds}
                    onClose={() => setPicking(false)}
                    onPick={createForSO}
                />
            )}

            {editing && (
                <PackingEditor
                    po={editing}
                    itemById={itemById}
                    locPickerTreeOptions={locPickerTreeOptions}
                    authFetch={authFetch}
                    onClose={() => setEditing(null)}
                    onSaved={async () => { await loadAll(); }}
                    onPrint={(draft: any) => setPrintPO(draft)}
                    showToast={showToast}
                />
            )}

            {printPO && (
                <SuratJalanPrintModal
                    po={printPO}
                    attributes={attributes}
                    companyProfile={companyProfile}
                    customerAddr={customerAddr}
                    currentStyle={uiStyle}
                    onClose={() => setPrintPO(null)}
                />
            )}
        </ShellWindow>
    );
}

// ── SO picker ────────────────────────────────────────────────────────────────
function SOPickerModal({ packableSOs, draftSoIds, onClose, onPick }: any) {
    const hasOpenDraft = (soId: string) => draftSoIds.has(String(soId));
    return (
        <ModalWrapper isOpen onClose={onClose} title="Select an Order to Pack" size="lg" modeless>
            <div style={{ fontFamily: xpFont }}>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>
                    Partially-produced orders can be packed too — ship whatever finished stock is on hand now.
                </div>
                {packableSOs.length === 0
                    ? <XPEmptyState icon="bi-inbox" message="No packable sales orders." />
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
                                {packableSOs.map((so: any) => (
                                    <tr key={so.id}>
                                        <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{so.po_number}</td>
                                        <td style={td}><StatusChip status={so.status} /></td>
                                        <td style={td}>{so.customer_name}</td>
                                        <td style={{ ...td, color: '#666' }}>{(so.lines || []).length}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>
                                            {hasOpenDraft(so.id) && <span style={{ fontSize: 9, color: '#b8860b', marginRight: 8 }}>has draft</span>}
                                            <button style={xpBtnGreen()} onClick={() => onPick(so)}>Pack</button>
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
function PackingEditor({ po, itemById, locPickerTreeOptions, authFetch, onClose, onSaved, onPrint, showToast }: any) {
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');
    const readOnly = po.status !== 'DRAFT' || !canManage;

    // This SO (with full line detail), stock balances for just its items, and
    // per-line "packed by other orders" totals are all editor-scoped fetches —
    // the page no longer keeps every sales order / every stock balance in memory
    // just so one open editor can look them up.
    const [so, setSo] = useState<any | null>(null);
    const [soLoading, setSoLoading] = useState(true);
    const [availMap, setAvailMap] = useState<Record<string, number>>({});
    const [remainingMap, setRemainingMap] = useState<Record<string, number>>({});
    const soLines: any[] = so?.lines || [];

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setSoLoading(true);
            const soRes = await authFetch(`${API_BASE}/sales-orders/${po.sales_order_id}`);
            const soData = soRes.ok ? await soRes.json() : null;
            if (cancelled) return;
            setSo(soData);
            setSoLoading(false);

            const itemIds = Array.from(new Set((soData?.lines || []).map((l: any) => String(l.item_id))));
            const [balRes, remRes] = await Promise.all([
                itemIds.length ? authFetch(`${API_BASE}/stock/balance?item_ids=${itemIds.join(',')}`) : Promise.resolve(null),
                authFetch(`${API_BASE}/packing/${po.id}/remaining`),
            ]);
            if (cancelled) return;
            if (balRes && balRes.ok) {
                const balances = await balRes.json();
                const m: Record<string, number> = {};
                for (const b of (balances || [])) {
                    const attrs = [...(b.attribute_value_ids || [])].map(String).sort().join(',');
                    const key = `${b.item_id}|${b.location_id}|${attrs}`;
                    m[key] = (m[key] || 0) + num(b.qty);
                }
                setAvailMap(m);
            }
            if (remRes && remRes.ok) { setRemainingMap(await remRes.json()); }
        })();
        return () => { cancelled = true; };
    }, [po.sales_order_id, po.id, authFetch]);

    const availableFor = useCallback((itemId: string, locId: string, attrIds: string[]) => {
        if (!locId) return null;
        const attrs = [...(attrIds || [])].map(String).sort().join(',');
        return availMap[`${itemId}|${locId}|${attrs}`] || 0;
    }, [availMap]);

    const initLines = () => {
        const map: Record<string, any> = {};
        for (const l of (po.lines || [])) {
            map[String(l.sales_order_line_id)] = {
                qty_packed: num(l.qty_packed),
                source_location_id: l.source_location_id || '',
                batch_id: l.batch_id || '',
            };
        }
        return map;
    };

    const [lineState, setLineState] = useState<Record<string, any>>(initLines);
    const [sourceLoc, setSourceLoc] = useState<string>(po.source_location_id || '');
    const [qcPassed, setQcPassed] = useState<boolean>(!!po.qc_passed);
    const [qcInspector, setQcInspector] = useState<string>(po.qc_inspector || '');
    const [dn, setDn] = useState<string>(po.delivery_note_number || po.code || '');
    const [carrier, setCarrier] = useState<string>(po.carrier || '');
    const [vehicle, setVehicle] = useState<string>(po.vehicle_plate || '');
    const [driver, setDriver] = useState<string>(po.driver || '');
    const [notes, setNotes] = useState<string>(po.notes || '');
    const [packages, setPackages] = useState<any[]>(() =>
        (po.packages || []).map((p: any) => ({
            package_no: p.package_no, label: p.label || 'Carton', weight_kg: p.weight_kg ?? '',
            contents: (() => {
                const byLineId: Record<string, string> = {};
                (po.lines || []).forEach((l: any) => { byLineId[String(l.id)] = String(l.sales_order_line_id); });
                const c: Record<string, number> = {};
                (p.contents || []).forEach((ci: any) => { const sol = byLineId[String(ci.packing_line_id)]; if (sol) c[sol] = num(ci.qty); });
                return c;
            })(),
        }))
    );
    const [batchOptions, setBatchOptions] = useState<Record<string, any[]>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const lotItems = soLines.map(l => itemById[String(l.item_id)]).filter(it => it && it.lot_tracked);
        const uniq = Array.from(new Set(lotItems.map((it: any) => String(it.id))));
        uniq.forEach(async (iid) => {
            if (batchOptions[iid]) return;
            try {
                const res = await authFetch(`${API_BASE}/batches?item_id=${iid}`);
                if (res.ok) { const data = await res.json(); setBatchOptions(prev => ({ ...prev, [iid]: data || [] })); }
            } catch { /* ignore */ }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [soLines]);

    const setLine = (solId: string, patch: any) => setLineState(prev => ({ ...prev, [solId]: { ...prev[solId], ...patch } }));
    const remainingFor = (l: any) => remainingMap[String(l.id)] ?? num(l.qty);
    const effLoc = (l: any) => (lineState[String(l.id)]?.source_location_id) || sourceLoc || '';
    const availFor = (l: any) => availableFor(String(l.item_id), effLoc(l), l.attribute_value_ids || []);

    const fillFromAvailable = () => {
        setLineState(prev => {
            const next = { ...prev };
            for (const l of soLines) {
                const avail = availFor(l);
                if (avail == null) continue;
                const cap = Math.min(remainingFor(l), avail);
                next[String(l.id)] = { ...next[String(l.id)], qty_packed: cap > 0 ? cap : 0 };
            }
            return next;
        });
    };

    const buildPayload = () => {
        const lines = soLines
            .filter(l => num(lineState[String(l.id)]?.qty_packed) > 0)
            .map(l => ({
                sales_order_line_id: l.id,
                item_id: l.item_id,
                qty_packed: num(lineState[String(l.id)].qty_packed),
                source_location_id: lineState[String(l.id)].source_location_id || null,
                batch_id: lineState[String(l.id)].batch_id || null,
            }));
        const pkgs = packages.map((p, i) => ({
            package_no: p.package_no || i + 1,
            label: p.label || 'Carton',
            weight_kg: p.weight_kg === '' ? null : num(p.weight_kg),
            notes: p.notes || null,
            contents: Object.entries(p.contents || {})
                .filter(([, q]) => num(q) > 0)
                .map(([sol, q]) => ({ sales_order_line_id: sol, qty: num(q) })),
        }));
        return {
            source_location_id: sourceLoc || null,
            qc_passed: qcPassed, qc_inspector: qcInspector || null,
            delivery_note_number: dn || null,
            carrier: carrier || null, vehicle_plate: vehicle || null, driver: driver || null,
            notes: notes || null,
            lines, packages: pkgs,
        };
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload()),
            });
            if (res.ok) { showToast('Saved', 'success'); await onSaved(); return true; }
            const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'save failed'}`, 'danger'); return false;
        } finally { setSaving(false); }
    };

    const dispatch = async () => {
        if (!qcPassed) { showToast('Tick QC passed before dispatch', 'warning'); return; }
        const okSave = await save();
        if (!okSave) return;
        const res = await authFetch(`${API_BASE}/packing/${po.id}/dispatch`, { method: 'POST' });
        if (res.ok) { showToast('Dispatched — stock deducted', 'success'); await onSaved(); onClose(); }
        else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'dispatch failed'}`, 'danger'); }
    };

    const addPackage = () => setPackages(prev => [...prev, { package_no: prev.length + 1, label: 'Carton', weight_kg: '', contents: {} }]);
    const removePackage = (idx: number) => setPackages(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, package_no: i + 1 })));
    const setPkg = (idx: number, patch: any) => setPackages(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
    const setPkgContent = (idx: number, solId: string, qty: any) => setPackages(prev => prev.map((p, i) => i === idx ? { ...p, contents: { ...p.contents, [solId]: qty } } : p));

    const packedLines = soLines.filter(l => num(lineState[String(l.id)]?.qty_packed) > 0);
    const totalPackaged = (solId: string) => packages.reduce((s, p) => s + num(p.contents?.[solId]), 0);

    const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 'bold', color: '#00309c', margin: '14px 0 6px', borderBottom: '1px solid #c8c4b8', paddingBottom: 3 };

    return (
        <ModalWrapper
            isOpen
            onClose={onClose}
            title={`Packing Order ${po.code} — SO ${po.sales_order_code || so?.po_number || ''}`}
            size="xl"
            modeless
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <button style={xpBtn()} onClick={onClose}>Close</button>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button style={xpBtn()} onClick={() => onPrint(buildDraftForPrint(po, so, buildPayload()))}>Surat Jalan</button>
                        {!readOnly && <button style={xpBtn()} disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>}
                        {!readOnly && <button style={xpBtnGreen()} onClick={dispatch}>Confirm Dispatch</button>}
                    </div>
                </div>
            }
        >
            <div style={{ fontFamily: xpFont }}>
                {readOnly && (
                    <div style={{ background: '#eef7ee', border: '1px solid #2d7a2d', color: '#0a3e0a', padding: '5px 10px', fontSize: 11, marginBottom: 10 }}>
                        This packing order is {po.status} and read-only.
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

                {/* Lines */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ ...sectionTitle, flex: 1 }}>Items to Pack</div>
                    {!readOnly && (
                        <button style={{ ...xpBtn(), marginBottom: 6 }} title="Set packed = min(remaining, on-hand) for each line" onClick={fillFromAvailable}>
                            Fill from available
                        </button>
                    )}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #c8c4b8' }}>
                    <thead>
                        <tr>
                            <th style={xpTableHeader}>Item</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Ordered</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Remaining</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Available</th>
                            <th style={{ ...xpTableHeader, width: 110, textAlign: 'right' }}>Packed</th>
                            <th style={{ ...xpTableHeader, width: 160 }}>Ship-from override</th>
                            <th style={{ ...xpTableHeader, width: 170 }}>Lot</th>
                        </tr>
                    </thead>
                    <tbody>
                        {soLoading && (
                            <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#999' }}>Loading order lines...</td></tr>
                        )}
                        {soLines.map((l: any) => {
                            const it = itemById[String(l.item_id)];
                            const ls = lineState[String(l.id)] || {};
                            const rem = remainingFor(l);
                            const avail = availFor(l);
                            const over = avail != null && num(ls.qty_packed) > avail + 1e-6;
                            return (
                                <tr key={l.id}>
                                    <td style={td}>
                                        <div style={{ fontWeight: 'bold' }}>{it?.name || l.item_name || l.item_id}</div>
                                        <div style={{ fontSize: 9, color: '#888' }}>{it?.code || l.item_code}</div>
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>{num(l.qty).toLocaleString()} {it?.uom}</td>
                                    <td style={{ ...td, textAlign: 'right', color: rem > 0 ? '#0a3e0a' : '#999' }}>{rem.toLocaleString()}</td>
                                    <td style={{ ...td, textAlign: 'right', color: avail == null ? '#bbb' : (avail > 0 ? '#0a3e0a' : '#c00') }}
                                        title={avail == null ? 'Pick a ship-from warehouse to see on-hand' : 'On-hand at ship-from'}>
                                        {avail == null ? '—' : avail.toLocaleString()}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <input type="number" min={0} title={over ? 'Exceeds on-hand — dispatch will be blocked' : undefined}
                                            style={{ ...xpInput, width: '100%', textAlign: 'right', ...(over ? { borderColor: '#c77800', background: '#fff8e1' } : {}) }} disabled={readOnly}
                                            value={ls.qty_packed ?? ''} onChange={e => setLine(String(l.id), { qty_packed: e.target.value })} />
                                    </td>
                                    <td style={td}>
                                        <TreeSelect options={locPickerTreeOptions} value={ls.source_location_id || ''} onChange={id => setLine(String(l.id), { source_location_id: id })} disabled={readOnly} allowEmpty emptyLabel="(default)" size="sm" style={{ width: '100%' }} />
                                    </td>
                                    <td style={td}>
                                        {it?.lot_tracked ? (
                                            <select style={{ ...xpSelect, width: '100%' }} disabled={readOnly} value={ls.batch_id || ''} onChange={e => setLine(String(l.id), { batch_id: e.target.value })}>
                                                <option value="">— select lot —</option>
                                                {(batchOptions[String(l.item_id)] || []).map((b: any) => <option key={b.id} value={b.id}>{b.batch_number}</option>)}
                                            </select>
                                        ) : <span style={{ color: '#bbb', fontSize: 10 }}>n/a</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Packages */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ ...sectionTitle, flex: 1 }}>Packing List (Cartons)</div>
                    {!readOnly && <button style={{ ...xpBtn(), marginBottom: 6 }} onClick={addPackage}>+ Add Carton</button>}
                </div>
                {packages.length === 0 && <div style={{ fontSize: 10, color: '#999', padding: '4px 0' }}>No cartons added.</div>}
                {packages.map((p, idx) => (
                    <div key={idx} style={{ border: '1px solid #c8c4b8', marginBottom: 8, background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(to bottom,#f5f4ef,#e0dfd8)', padding: '4px 8px', borderBottom: '1px solid #c8c4b8' }}>
                            <strong style={{ color: '#00309c', fontSize: 11 }}>#{p.package_no}</strong>
                            <input style={{ ...xpInput, width: 90 }} placeholder="Label" disabled={readOnly} value={p.label} onChange={e => setPkg(idx, { label: e.target.value })} />
                            <span style={{ fontSize: 10, color: '#555' }}>Weight (kg):</span>
                            <input type="number" min={0} style={{ ...xpInput, width: 80, textAlign: 'right' }} disabled={readOnly} value={p.weight_kg} onChange={e => setPkg(idx, { weight_kg: e.target.value })} />
                            {!readOnly && <button style={{ ...xpBtn({ color: '#a00' }), marginLeft: 'auto' }} onClick={() => removePackage(idx)}>Remove</button>}
                        </div>
                        <div style={{ padding: '6px 8px' }}>
                            {packedLines.length === 0 && <div style={{ fontSize: 10, color: '#999' }}>Set packed quantities above first.</div>}
                            {packedLines.map((l: any) => {
                                const it = itemById[String(l.item_id)];
                                return (
                                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                        <span style={{ flex: 1, fontSize: 10 }}>{it?.name || l.item_name}</span>
                                        <input type="number" min={0} style={{ ...xpInput, width: 90, textAlign: 'right' }} disabled={readOnly}
                                            value={p.contents?.[String(l.id)] ?? ''} onChange={e => setPkgContent(idx, String(l.id), e.target.value)} />
                                        <span style={{ fontSize: 9, color: '#888', width: 40 }}>{it?.uom}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                {packedLines.map((l: any) => {
                    const it = itemById[String(l.item_id)];
                    const packaged = totalPackaged(String(l.id));
                    const packed = num(lineState[String(l.id)]?.qty_packed);
                    if (packaged === 0) return null;
                    const mismatch = Math.abs(packaged - packed) > 1e-6;
                    return mismatch ? (
                        <div key={l.id} style={{ fontSize: 10, color: '#c77800' }}>
                            ! {it?.name || l.item_name}: cartons total {packaged} vs packed {packed}
                        </div>
                    ) : null;
                })}

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

function buildDraftForPrint(po: any, so: any, payload: any) {
    const lineMeta: Record<string, any> = {};
    (so?.lines || []).forEach((l: any) => { lineMeta[String(l.id)] = l; });
    return {
        ...po,
        ...payload,
        sales_order_code: po.sales_order_code || so?.po_number,
        customer_name: po.customer_name || so?.customer_name,
        lines: (payload.lines || []).map((l: any) => ({
            ...l,
            item_id: l.item_id,
            attribute_value_ids: lineMeta[String(l.sales_order_line_id)]?.attribute_value_ids || [],
        })),
        packages: payload.packages || [],
    };
}

