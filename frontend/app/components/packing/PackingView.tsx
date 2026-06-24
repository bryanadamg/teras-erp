'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import SuratJalanPrintModal from './SuratJalanPrintModal';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// --- shared XP-ish styles --------------------------------------------------
const font = 'Tahoma, "Segoe UI", sans-serif';
const card: React.CSSProperties = { background: '#fff', border: '1px solid #c0ccee', borderTop: '3px solid #316ac5' };
const th: React.CSSProperties = { background: '#eef2fb', borderBottom: '1px solid #c0ccee', padding: '5px 8px', textAlign: 'left', fontWeight: 'bold', color: '#00309c', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { borderBottom: '1px solid #e6e6e6', padding: '4px 8px', verticalAlign: 'middle' };
const input: React.CSSProperties = { fontFamily: font, fontSize: 11, padding: '2px 5px', border: '1px solid #7f9db9', boxSizing: 'border-box', width: '100%' };
const btnGrey: React.CSSProperties = { fontFamily: font, fontSize: 11, padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer', color: '#000' };
const btnBlue: React.CSSProperties = { fontFamily: font, fontSize: 11, padding: '3px 12px', background: 'linear-gradient(to bottom,#4a90e2,#1f5fc0)', border: '1px solid', borderColor: '#1a4e9a #0a2e6a #0a2e6a #1a4e9a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' };
const btnGreen: React.CSSProperties = { fontFamily: font, fontSize: 11, padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' };

const STATUS_COLORS: Record<string, { bg: string; bd: string; fg: string }> = {
    DRAFT: { bg: '#fff3cd', bd: '#c77800', fg: '#4a3000' },
    DISPATCHED: { bg: '#d6f5d6', bd: '#2d7a2d', fg: '#0a3e0a' },
    CANCELLED: { bg: '#f0f0f0', bd: '#999', fg: '#555' },
};

function StatusBadge({ status }: { status: string }) {
    const c = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
    return (
        <span style={{ fontSize: 9, fontWeight: 'bold', background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, padding: '1px 6px' }}>
            {status}
        </span>
    );
}

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

export default function PackingView() {
    const { salesOrders, items, partners, locations, attributes, companyProfile, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    const [packingOrders, setPackingOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [picking, setPicking] = useState(false);          // SO picker modal
    const [editing, setEditing] = useState<any | null>(null); // PO being edited
    const [printPO, setPrintPO] = useState<any | null>(null);

    const itemById = useMemo(() => {
        const m: Record<string, any> = {};
        (items || []).forEach((i: any) => { m[String(i.id)] = i; });
        return m;
    }, [items]);

    // Leaf locations only (stock lives in leaves)
    const leafLocations = useMemo(
        () => (locations || []).filter((l: any) => !(locations || []).some((c: any) => String(c.parent_id) === String(l.id))),
        [locations]
    );

    const loadPacking = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_BASE}/packing?size=500`);
            if (res.ok) {
                const data = await res.json();
                setPackingOrders(data.items || []);
            }
        } finally { setLoading(false); }
    }, [authFetch]);

    useEffect(() => { loadPacking(); }, [loadPacking]);

    const readySOs = useMemo(() => (salesOrders || []).filter((so: any) => so.status === 'READY'), [salesOrders]);

    // qty already packed (non-cancelled) per SO line across ALL packing orders
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
            await loadPacking();
            setPicking(false);
            setEditing(po);
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(`Error: ${err.detail || 'could not create'}`, 'danger');
        }
    };

    const deletePO = async (po: any) => {
        const ok = await confirm({ title: 'Delete Packing Order', message: `Delete ${po.code}?`, confirmText: 'Delete', variant: 'danger' });
        if (!ok) return;
        const res = await authFetch(`${API_BASE}/packing/${po.id}`, { method: 'DELETE' });
        if (res.ok) { showToast('Packing order deleted', 'success'); loadPacking(); }
        else { const e = await res.json().catch(() => ({})); showToast(`Error: ${e.detail || 'failed'}`, 'danger'); }
    };

    const customerAddr = (name: string) => (partners || []).find((p: any) => p.name === name)?.address || '';

    return (
        <div style={{ padding: '18px 22px', fontFamily: font }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <i className="bi bi-box2" style={{ fontSize: 20, color: '#316ac5' }} />
                    <span style={{ fontSize: 16, fontWeight: 'bold', color: '#00309c' }}>Packing &amp; Dispatch</span>
                </div>
                <button style={btnBlue} onClick={() => setPicking(true)}>+ New Packing Order</button>
            </div>

            <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                        <tr>
                            <th style={th}>Code</th>
                            <th style={th}>Sales Order</th>
                            <th style={th}>Customer</th>
                            <th style={th}>Status</th>
                            <th style={th}>Packages</th>
                            <th style={th}>Delivery Note</th>
                            <th style={th}>Dispatched</th>
                            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {packingOrders.length === 0 && (
                            <tr><td style={{ ...td, textAlign: 'center', color: '#888', padding: 18 }} colSpan={8}>
                                {loading ? 'Loading...' : 'No packing orders yet. Click “New Packing Order” to pack a READY sales order.'}
                            </td></tr>
                        )}
                        {packingOrders.map((po: any) => (
                            <tr key={po.id}>
                                <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{po.code}</td>
                                <td style={td}>{po.sales_order_code || '-'}</td>
                                <td style={td}>{po.customer_name || '-'}</td>
                                <td style={td}><StatusBadge status={po.status} /></td>
                                <td style={td}>{(po.packages || []).length}</td>
                                <td style={td}>{po.delivery_note_number || '-'}</td>
                                <td style={td}>{po.dispatched_at ? new Date(po.dispatched_at).toLocaleDateString() : '-'}</td>
                                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <button style={{ ...btnGrey, marginRight: 4 }} onClick={() => setEditing(po)}>
                                        {po.status === 'DRAFT' ? 'Edit' : 'View'}
                                    </button>
                                    <button style={{ ...btnGrey, marginRight: 4 }} onClick={() => setPrintPO(po)}>Surat Jalan</button>
                                    {po.status !== 'DISPATCHED' && (
                                        <button style={{ ...btnGrey, color: '#a00' }} onClick={() => deletePO(po)}>Delete</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {picking && (
                <SOPickerModal
                    readySOs={readySOs}
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
                    leafLocations={leafLocations}
                    packedByOthers={packedByOthers}
                    authFetch={authFetch}
                    onClose={() => setEditing(null)}
                    onSaved={async () => { await loadPacking(); }}
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

// --- SO picker -------------------------------------------------------------
function SOPickerModal({ readySOs, packingOrders, onClose, onPick }: any) {
    const hasOpenDraft = (soId: string) => packingOrders.some((p: any) => String(p.sales_order_id) === String(soId) && p.status === 'DRAFT');
    return (
        <Overlay onClose={onClose} title="Select a READY Sales Order" width={640}>
            <div style={{ padding: 14, fontFamily: font }}>
                {readySOs.length === 0 && <div style={{ color: '#888', padding: 12 }}>No sales orders in READY status.</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <tbody>
                        {readySOs.map((so: any) => (
                            <tr key={so.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 'bold', color: '#00309c' }}>{so.po_number}</td>
                                <td style={{ padding: '6px 8px' }}>{so.customer_name}</td>
                                <td style={{ padding: '6px 8px', color: '#666' }}>{(so.lines || []).length} line(s)</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                    {hasOpenDraft(so.id) && <span style={{ fontSize: 9, color: '#c77800', marginRight: 8 }}>has draft</span>}
                                    <button style={btnBlue} onClick={() => onPick(so)}>Pack</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Overlay>
    );
}

// --- editor ----------------------------------------------------------------
function PackingEditor({ po, salesOrders, itemById, leafLocations, packedByOthers, authFetch, onClose, onSaved, onPrint, showToast }: any) {
    const readOnly = po.status !== 'DRAFT';
    const so = useMemo(() => (salesOrders || []).find((s: any) => String(s.id) === String(po.sales_order_id)), [salesOrders, po]);
    const soLines: any[] = so?.lines || [];

    // editor line state keyed by sales_order_line_id
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
            // contents keyed by sales_order_line_id (resolve via packing_line_id -> existing line)
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

    // Fetch lots for lot-tracked items
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

    const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 'bold', color: '#00309c', margin: '14px 0 6px' };
    const lbl: React.CSSProperties = { fontSize: 10, color: '#555', display: 'block', marginBottom: 2 };

    return (
        <Overlay onClose={onClose} title={`Packing Order ${po.code} — SO ${po.sales_order_code || so?.po_number || ''}`} width={920} tall>
            <div style={{ padding: 16, fontFamily: font, overflowY: 'auto', flex: 1 }}>
                {readOnly && (
                    <div style={{ background: '#eef7ee', border: '1px solid #2d7a2d', color: '#0a3e0a', padding: '6px 10px', fontSize: 11, marginBottom: 10 }}>
                        This packing order is {po.status} and read-only.
                    </div>
                )}

                {/* Header fields */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 200 }}>
                        <label style={lbl}>Default ship-from warehouse</label>
                        <select style={input} value={sourceLoc} disabled={readOnly} onChange={e => setSourceLoc(e.target.value)}>
                            <option value="">— select —</option>
                            {leafLocations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div style={{ minWidth: 160 }}>
                        <label style={lbl}>Delivery Note No.</label>
                        <input style={input} value={dn} disabled={readOnly} onChange={e => setDn(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 150 }}>
                        <label style={lbl}>Carrier</label>
                        <input style={input} value={carrier} disabled={readOnly} onChange={e => setCarrier(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 120 }}>
                        <label style={lbl}>Vehicle Plate</label>
                        <input style={input} value={vehicle} disabled={readOnly} onChange={e => setVehicle(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 140 }}>
                        <label style={lbl}>Driver</label>
                        <input style={input} value={driver} disabled={readOnly} onChange={e => setDriver(e.target.value)} />
                    </div>
                </div>

                {/* Lines */}
                <div style={sectionTitle}>Items to Pack</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                        <tr>
                            <th style={th}>Item</th>
                            <th style={{ ...th, textAlign: 'right' }}>Ordered</th>
                            <th style={{ ...th, textAlign: 'right' }}>Remaining</th>
                            <th style={{ ...th, width: 110, textAlign: 'right' }}>Packed</th>
                            <th style={{ ...th, width: 160 }}>Ship-from override</th>
                            <th style={{ ...th, width: 170 }}>Lot</th>
                        </tr>
                    </thead>
                    <tbody>
                        {soLines.map((l: any) => {
                            const it = itemById[String(l.item_id)];
                            const ls = lineState[String(l.id)] || {};
                            const rem = remainingFor(l);
                            return (
                                <tr key={l.id}>
                                    <td style={td}>
                                        <div style={{ fontWeight: 'bold' }}>{it?.name || l.item_name || l.item_id}</div>
                                        <div style={{ fontSize: 9, color: '#888' }}>{it?.code || l.item_code}</div>
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>{num(l.qty).toLocaleString()} {it?.uom}</td>
                                    <td style={{ ...td, textAlign: 'right', color: rem > 0 ? '#0a3e0a' : '#999' }}>{rem.toLocaleString()}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <input type="number" min={0} style={{ ...input, textAlign: 'right' }} disabled={readOnly}
                                            value={ls.qty_packed ?? ''} onChange={e => setLine(String(l.id), { qty_packed: e.target.value })} />
                                    </td>
                                    <td style={td}>
                                        <select style={input} disabled={readOnly} value={ls.source_location_id || ''} onChange={e => setLine(String(l.id), { source_location_id: e.target.value })}>
                                            <option value="">(default)</option>
                                            {leafLocations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                                        </select>
                                    </td>
                                    <td style={td}>
                                        {it?.lot_tracked ? (
                                            <select style={input} disabled={readOnly} value={ls.batch_id || ''} onChange={e => setLine(String(l.id), { batch_id: e.target.value })}>
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

                {/* Packages / packing list */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={sectionTitle}>Packing List (Cartons)</div>
                    {!readOnly && <button style={btnGrey} onClick={addPackage}>+ Add Carton</button>}
                </div>
                {packages.length === 0 && <div style={{ fontSize: 10, color: '#999', padding: '4px 0' }}>No cartons added.</div>}
                {packages.map((p, idx) => (
                    <div key={idx} style={{ border: '1px solid #c0ccee', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#eef2fb', padding: '4px 8px' }}>
                            <strong style={{ color: '#00309c', fontSize: 11 }}>#{p.package_no}</strong>
                            <input style={{ ...input, width: 90 }} placeholder="Label" disabled={readOnly} value={p.label} onChange={e => setPkg(idx, { label: e.target.value })} />
                            <span style={{ fontSize: 10, color: '#555' }}>Weight (kg):</span>
                            <input type="number" min={0} style={{ ...input, width: 80, textAlign: 'right' }} disabled={readOnly} value={p.weight_kg} onChange={e => setPkg(idx, { weight_kg: e.target.value })} />
                            {!readOnly && <button style={{ ...btnGrey, color: '#a00', marginLeft: 'auto' }} onClick={() => removePackage(idx)}>Remove</button>}
                        </div>
                        <div style={{ padding: '6px 8px' }}>
                            {packedLines.length === 0 && <div style={{ fontSize: 10, color: '#999' }}>Set packed quantities above first.</div>}
                            {packedLines.map((l: any) => {
                                const it = itemById[String(l.item_id)];
                                return (
                                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                        <span style={{ flex: 1, fontSize: 10 }}>{it?.name || l.item_name}</span>
                                        <input type="number" min={0} style={{ ...input, width: 90, textAlign: 'right' }} disabled={readOnly}
                                            value={p.contents?.[String(l.id)] ?? ''} onChange={e => setPkgContent(idx, String(l.id), e.target.value)} />
                                        <span style={{ fontSize: 9, color: '#888', width: 40 }}>{it?.uom}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                {/* Carton total vs packed sanity hint */}
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
                        <label style={lbl}>Inspector</label>
                        <input style={{ ...input, width: 200 }} disabled={readOnly} value={qcInspector} onChange={e => setQcInspector(e.target.value)} />
                    </div>
                </div>

                <div style={sectionTitle}>Notes</div>
                <textarea style={{ ...input, height: 50, resize: 'vertical' }} disabled={readOnly} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {/* Footer */}
            <div style={{ padding: '8px 14px', borderTop: '1px solid #c0ccee', background: '#f5f8ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button style={btnGrey} onClick={onClose}>Close</button>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button style={btnGrey} onClick={() => onPrint(buildDraftForPrint(po, so, buildPayload()))}>Surat Jalan</button>
                    {!readOnly && <button style={btnBlue} disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>}
                    {!readOnly && <button style={btnGreen} onClick={dispatch}>Confirm Dispatch</button>}
                </div>
            </div>
        </Overlay>
    );
}

// Build a print-ready PO object from current draft (so preview reflects unsaved edits)
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

// --- generic overlay -------------------------------------------------------
function Overlay({ children, onClose, title, width = 600, tall = false }: any) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', width: '94vw', maxWidth: width, maxHeight: '92vh', height: tall ? '92vh' : undefined, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid #003080' }}>
                <div style={{ background: 'linear-gradient(to right,#0058e6,#08a5ff)', color: '#fff', fontFamily: font, fontWeight: 'bold', fontSize: 12, padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{title}</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 15, cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                </div>
                {children}
            </div>
        </div>
    );
}
