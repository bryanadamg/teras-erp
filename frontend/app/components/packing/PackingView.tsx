'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState } from '../shared/xpTheme';
const SuratJalanPrintModal = dynamic(() => import('./SuratJalanPrintModal'), { ssr: false });
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// ── Classic XP theme primitives (match StockOnHandView / LocationsView) ──────
const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpBevel: React.CSSProperties = {
    border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0,
};
const xpTitleBar: React.CSSProperties = {
    background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#ffffff',
    fontFamily: xpFont, fontSize: 12, fontWeight: 'bold', padding: '4px 8px',
    borderBottom: '1px solid #003080', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', minHeight: 26,
};
const xpToolbar: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898',
    padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
};
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px',
    background: '#fff', color: '#000', height: 20, outline: 'none', boxSizing: 'border-box',
};
const xpSelect: React.CSSProperties = { ...xpInput, height: 22 };
const xpTableHeader: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
    fontSize: 10, fontWeight: 'bold', color: '#000', fontFamily: xpFont, textAlign: 'left',
    padding: '3px 8px', position: 'sticky', top: 0, whiteSpace: 'nowrap',
};
const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: xpFont, fontSize: 11, padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 0, ...extra,
});
const xpBtnGreen = (extra: React.CSSProperties = {}) => xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold', ...extra });
const xpSep: React.CSSProperties = { width: 1, height: 20, background: '#a0988c', margin: '0 2px', flexShrink: 0 };
const td: React.CSSProperties = { borderBottom: '1px solid #e6e6e6', padding: '3px 8px', fontFamily: xpFont, fontSize: 11, verticalAlign: 'middle' };
const xpLabel: React.CSSProperties = { fontFamily: xpFont, fontSize: 10, color: '#444', display: 'block', marginBottom: 2 };

// Status chip (classic), per statusChipStyle look
const chipStyle = (bg: string, bd: string, fg: string): React.CSSProperties => ({
    display: 'inline-block', fontSize: 9, fontWeight: 'bold', padding: '1px 6px', borderRadius: 0,
    border: `1px solid ${bd}`, background: bg, color: fg, fontFamily: xpFont, whiteSpace: 'nowrap',
});
const PKG_CHIP: Record<string, React.CSSProperties> = {
    DRAFT: chipStyle('#d4d0c8', '#808080', '#333'),
    DISPATCHED: chipStyle('#2d7a2d', '#1a5e1a', '#fff'),
    CANCELLED: chipStyle('#c00000', '#800000', '#fff'),
};
const SO_CHIP: Record<string, React.CSSProperties> = {
    PENDING: chipStyle('#d4d0c8', '#808080', '#333'),
    READY: chipStyle('#0058e6', '#003080', '#fff'),
    PARTIAL: chipStyle('#f0c419', '#b8860b', '#3a2e00'),
};

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function StatusChip({ status, map }: { status: string; map: Record<string, React.CSSProperties> }) {
    return <span style={map[status] || PKG_CHIP.DRAFT}>{status}</span>;
}

export default function PackingView() {
    // partners/locations/attributes/companyProfile come from DataContext master data
    // (loaded on initial app load). salesOrders + full items are NOT loaded on the
    // packaging route, so this view self-fetches them.
    const { partners, locations, attributes, companyProfile, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    const [packingOrders, setPackingOrders] = useState<any[]>([]);
    const [balances, setBalances] = useState<any[]>([]);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [picking, setPicking] = useState(false);
    const [editing, setEditing] = useState<any | null>(null);
    const [printPO, setPrintPO] = useState<any | null>(null);

    const itemById = useMemo(() => {
        const m: Record<string, any> = {};
        (items || []).forEach((i: any) => { m[String(i.id)] = i; });
        return m;
    }, [items]);

    const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);

    const loadPacking = useCallback(async () => {
        const [poRes, balRes] = await Promise.all([
            authFetch(`${API_BASE}/packing?size=500`),
            authFetch(`${API_BASE}/stock/balance`),
        ]);
        if (poRes.ok) { const d = await poRes.json(); setPackingOrders(d.items || []); }
        if (balRes.ok) { const b = await balRes.json(); setBalances(Array.isArray(b) ? b : (b.items || [])); }
    }, [authFetch]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [so, it] = await Promise.all([
                authFetch(`${API_BASE}/sales-orders`),
                authFetch(`${API_BASE}/items?limit=10000`),
            ]);
            if (so.ok) { const d = await so.json(); setSalesOrders(Array.isArray(d) ? d : (d.items || [])); }
            if (it.ok) { const d = await it.json(); setItems(Array.isArray(d) ? d : (d.items || [])); }
            await loadPacking();
        } finally { setLoading(false); }
    }, [authFetch, loadPacking]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const availMap = useMemo(() => {
        const m: Record<string, number> = {};
        for (const b of balances) {
            const attrs = [...(b.attribute_value_ids || [])].map(String).sort().join(',');
            const key = `${b.item_id}|${b.location_id}|${attrs}`;
            m[key] = (m[key] || 0) + num(b.qty);
        }
        return m;
    }, [balances]);

    const availableFor = useCallback((itemId: string, locId: string, attrIds: string[]) => {
        if (!locId) return null;
        const attrs = [...(attrIds || [])].map(String).sort().join(',');
        return availMap[`${itemId}|${locId}|${attrs}`] || 0;
    }, [availMap]);

    const packableSOs = useMemo(
        () => (salesOrders || []).filter((so: any) => ['PENDING', 'READY', 'PARTIAL'].includes(so.status)),
        [salesOrders]
    );

    const packedByOthers = useCallback((soLineId: string, excludePoId?: string) => {
        let sum = 0;
        for (const po of packingOrders) {
            if (po.status === 'CANCELLED') continue;
            if (excludePoId && String(po.id) === String(excludePoId)) continue;
            for (const l of (po.lines || [])) {
                if (String(l.sales_order_line_id) === String(soLineId)) sum += num(l.qty_packed);
            }
        }
        return sum;
    }, [packingOrders]);

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

    const drafts = packingOrders.filter((p: any) => p.status === 'DRAFT').length;
    const dispatched = packingOrders.filter((p: any) => p.status === 'DISPATCHED').length;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: xpFont }}>
            <div style={{ ...xpBevel, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div style={xpTitleBar}>
                    <span><i className="bi bi-box2" style={{ marginRight: 6 }} />Packing &amp; Dispatch</span>
                    <span style={{ fontSize: 10, opacity: 0.85 }}>{packingOrders.length} orders</span>
                </div>
                <div style={xpToolbar}>
                    <button style={xpBtnGreen()} onClick={() => setPicking(true)} title="Create a packing order for a sales order">
                        <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />New Packing Order
                    </button>
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
                            {packingOrders.map((po: any) => (
                                <tr key={po.id}>
                                    <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{po.code}</td>
                                    <td style={td}>{po.sales_order_code || '-'}</td>
                                    <td style={td}>{po.customer_name || '-'}</td>
                                    <td style={td}><StatusChip status={po.status} map={PKG_CHIP} /></td>
                                    <td style={{ ...td, textAlign: 'right' }}>{(po.packages || []).length}</td>
                                    <td style={td}>{po.delivery_note_number || '-'}</td>
                                    <td style={td}>{po.dispatched_at ? new Date(po.dispatched_at).toLocaleDateString() : '-'}</td>
                                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button style={{ ...xpBtn(), marginRight: 4 }} onClick={() => setEditing(po)}>
                                            {po.status === 'DRAFT' ? 'Edit' : 'View'}
                                        </button>
                                        <button style={{ ...xpBtn(), marginRight: 4 }} onClick={() => setPrintPO(po)}>Surat Jalan</button>
                                        {po.status !== 'DISPATCHED' && (
                                            <button style={xpBtn({ color: '#a00' })} onClick={() => deletePO(po)}>Delete</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <XPStatusBar right={`${drafts} draft · ${dispatched} dispatched`}>
                {loading ? 'Loading...' : `${packingOrders.length} packing order(s)`}
            </XPStatusBar>

            {picking && (
                <SOPickerModal
                    packableSOs={packableSOs}
                    packingOrders={packingOrders}
                    onClose={() => setPicking(false)}
                    onPick={createForSO}
                />
            )}

            {editing && (
                <PackingEditor
                    po={editing}
                    salesOrders={salesOrders}
                    itemById={itemById}
                    locPickerTreeOptions={locPickerTreeOptions}
                    packedByOthers={packedByOthers}
                    availableFor={availableFor}
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
                    salesOrders={salesOrders}
                    items={items}
                    attributes={attributes}
                    companyProfile={companyProfile}
                    customerAddr={customerAddr}
                    currentStyle={uiStyle}
                    onClose={() => setPrintPO(null)}
                />
            )}
        </div>
    );
}

// ── SO picker ────────────────────────────────────────────────────────────────
function SOPickerModal({ packableSOs, packingOrders, onClose, onPick }: any) {
    const hasOpenDraft = (soId: string) => packingOrders.some((p: any) => String(p.sales_order_id) === String(soId) && p.status === 'DRAFT');
    return (
        <Overlay onClose={onClose} title="Select an Order to Pack" width={660}>
            <div style={{ padding: 12, fontFamily: xpFont, overflowY: 'auto', background: '#fff' }}>
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
                                        <td style={td}><StatusChip status={so.status} map={SO_CHIP} /></td>
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
        </Overlay>
    );
}

// ── editor ───────────────────────────────────────────────────────────────────
function PackingEditor({ po, salesOrders, itemById, locPickerTreeOptions, packedByOthers, availableFor, authFetch, onClose, onSaved, onPrint, showToast }: any) {
    const readOnly = po.status !== 'DRAFT';
    const so = useMemo(() => (salesOrders || []).find((s: any) => String(s.id) === String(po.sales_order_id)), [salesOrders, po]);
    const soLines: any[] = so?.lines || [];

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
    const remainingFor = (l: any) => Math.max(0, num(l.qty) - packedByOthers(String(l.id), po.id));
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
        <Overlay onClose={onClose} title={`Packing Order ${po.code} — SO ${po.sales_order_code || so?.po_number || ''}`} width={940} tall>
            <div style={{ padding: 14, fontFamily: xpFont, overflowY: 'auto', flex: 1, background: '#f4f3ee' }}>
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

            {/* Footer */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid #b0a898', background: 'linear-gradient(to bottom,#f4f2ea,#e3e1d6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button style={xpBtn()} onClick={onClose}>Close</button>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button style={xpBtn()} onClick={() => onPrint(buildDraftForPrint(po, so, buildPayload()))}>Surat Jalan</button>
                    {!readOnly && <button style={xpBtn()} disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>}
                    {!readOnly && <button style={xpBtnGreen()} onClick={dispatch}>Confirm Dispatch</button>}
                </div>
            </div>
        </Overlay>
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

// ── generic XP dialog ────────────────────────────────────────────────────────
function Overlay({ children, onClose, title, width = 600, tall = false }: any) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ ...xpBevel, width: '94vw', maxWidth: width, maxHeight: '92vh', height: tall ? '92vh' : undefined, display: 'flex', flexDirection: 'column' }}>
                <div style={xpTitleBar}>
                    <span>{title}</span>
                    <button onClick={onClose} style={{ ...xpBtn({ padding: '0 6px', fontWeight: 'bold' }) }}>X</button>
                </div>
                {children}
            </div>
        </div>
    );
}
