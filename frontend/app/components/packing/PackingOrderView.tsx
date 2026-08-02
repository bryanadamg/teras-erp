'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
import SearchableSelect from '../shared/SearchableSelect';
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';
import { useFinishedGoodsSearch } from '../shared/useFinishedGoodsSearch';
const PackingCardPrintModal = dynamic(() => import('./PackingCardPrintModal'), { ssr: false });
const PackedUnitLabelPrintModal = dynamic(() => import('./PackedUnitLabelPrintModal'), { ssr: false });

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

// ── Classic XP theme primitives (match PickListView / StockOnHandView) ──────
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
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 'bold', color: '#00309c', margin: '14px 0 6px', borderBottom: '1px solid #c8c4b8', paddingBottom: 3 };

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const PO_PAGE_SIZE = 20;

export default function PackingOrderView() {
    const { locations, attributes, companyProfile, itemIndex, authFetch } = useData();
    const { uiStyle } = useTheme();
    const { formatDate: tzDate } = useTimezone();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { hasPermission } = useUser();
    const canManage = hasPermission('sales.manage');

    const [orders, setOrders] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [openCount, setOpenCount] = useState(0);
    const [doneCount, setDoneCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [detail, setDetail] = useState<any | null>(null);
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

    return (
        <ShellWindow classic fill="page" className="fade-in" style={{ fontFamily: xpFont }}>
            <ShellTitleBar
                classic
                icon="bi-box2"
                title="Packing Orders"
                right={<span style={{ fontSize: 10, opacity: 0.85 }}>{total} orders</span>}
            />
            <div style={xpToolbar()}>
                {canManage && (
                    <button style={xpBtnGreen()} onClick={() => setCreating(true)} title="Order finished goods packed into cartons">
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
                    <tbody>
                        {orders.length === 0 && (
                            <tr><td colSpan={9} style={{ padding: 0 }}>
                                <XPEmptyState icon="bi-box2" message={loading ? 'Loading...' : 'No packing orders yet. Click "New Packing Order" to pack finished goods into cartons.'} />
                            </td></tr>
                        )}
                        {orders.map((po: any) => {
                            const it = itemById[String(po.item_id)];
                            const shortfall = num(po.qty_packed) < num(po.qty_target);
                            return (
                                <tr key={po.id}>
                                    <td style={{ ...td, fontWeight: 'bold', color: '#00309c' }}>{po.code}</td>
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
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <MenuTriggerButton classic onClick={e => menuToggle(String(po.id), e)} />
                                    </td>
                                </tr>
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
                            { key: 'open', label: closed ? 'View' : 'Pack', icon: 'bi-box-seam', onClick: () => { menuClose(); setDetail(po); } },
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
                    attributes={attributes}
                    authFetch={authFetch}
                    showToast={showToast}
                    onClose={() => setCreating(false)}
                    onCreated={async (po: any) => { setCreating(false); await loadAll(); setDetail(po); }}
                />
            )}

            {detail && (
                <PackingOrderDetail
                    po={detail}
                    itemById={itemById}
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
function PackingOrderForm({ locPickerTreeOptions, attributes, authFetch, showToast, onClose, onCreated }: any) {
    const { results: fgResults, onSearch: fgSearch } = useFinishedGoodsSearch();
    const [itemId, setItemId] = useState('');
    const [qtyTarget, setQtyTarget] = useState('');
    const [packSize, setPackSize] = useState('');
    const [packageLabel, setPackageLabel] = useState('Carton');
    const [sourceLoc, setSourceLoc] = useState('');
    const [outputLoc, setOutputLoc] = useState('');
    const [soId, setSoId] = useState('');
    const [soLineId, setSoLineId] = useState('');
    const [notes, setNotes] = useState('');
    const [attrVals, setAttrVals] = useState<Record<string, string>>({});
    const [materials, setMaterials] = useState<any[]>([]);
    const [sos, setSos] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await authFetch(`${API_BASE}/sales-orders?status=PENDING,READY,PARTIAL`);
            if (res.ok) { const d = await res.json(); setSos(Array.isArray(d) ? d : (d.items || [])); }
        })();
    }, [authFetch]);

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
                attribute_value_ids: Object.values(attrVals).filter(Boolean),
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
                <div style={sectionTitle}>Demand</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 220 }}>
                        <label style={xpLabel}>Sales Order (optional)</label>
                        <select style={{ ...xpSelect, width: '100%' }} value={soId} onChange={e => { setSoId(e.target.value); setSoLineId(''); }}>
                            <option value="">— pack to stock —</option>
                            {sos.map((s: any) => <option key={s.id} value={s.id}>{s.po_number} · {s.customer_name}</option>)}
                        </select>
                    </div>
                    {soId && (
                        <div style={{ minWidth: 240 }}>
                            <label style={xpLabel}>Order line</label>
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
                    <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                        Colour and variant attributes are inherited from the order line.
                    </div>
                )}

                <div style={sectionTitle}>What to Pack</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 260 }}>
                        <label style={xpLabel}>Finished good</label>
                        <SearchableSelect options={fgOptions} value={itemId} onChange={setItemId} onSearch={fgSearch} placeholder="Search item..." size="sm" />
                    </div>
                    <div style={{ minWidth: 110 }}>
                        <label style={xpLabel}>Target qty</label>
                        <input type="number" min={0} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={qtyTarget} onChange={e => setQtyTarget(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 110 }}>
                        <label style={xpLabel}>Qty per carton</label>
                        <input type="number" min={0} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={packSize} onChange={e => setPackSize(e.target.value)} />
                    </div>
                    <div style={{ minWidth: 110 }}>
                        <label style={xpLabel}>Package type</label>
                        <input style={{ ...xpInput, width: '100%' }} value={packageLabel} onChange={e => setPackageLabel(e.target.value)} placeholder="Carton" />
                    </div>
                </div>

                {!soLineId && (
                    <>
                        <div style={sectionTitle}>Variant</div>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            {(attributes || []).map((a: any) => (
                                <div key={a.id} style={{ minWidth: 160 }}>
                                    <label style={xpLabel}>{a.name}</label>
                                    <select style={{ ...xpSelect, width: '100%' }} value={attrVals[a.id] || ''} onChange={e => setAttrVals(prev => ({ ...prev, [a.id]: e.target.value }))}>
                                        <option value="">— any —</option>
                                        {(a.values || []).map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                            Must match the variant the bulk stock is held under, or the source location will read as empty.
                        </div>
                    </>
                )}

                <div style={sectionTitle}>Locations</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 220 }}>
                        <label style={xpLabel}>Pack from (bulk FG)</label>
                        <TreeSelect options={locPickerTreeOptions} value={sourceLoc} onChange={setSourceLoc} allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                    </div>
                    <div style={{ minWidth: 220 }}>
                        <label style={xpLabel}>Store cartons at</label>
                        <TreeSelect options={locPickerTreeOptions} value={outputLoc} onChange={setOutputLoc} allowEmpty emptyLabel="— select —" size="sm" style={{ width: '100%' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div style={{ ...sectionTitle, flex: 1 }}>Packaging Materials (optional)</div>
                    <button style={{ ...xpBtn(), marginBottom: 6 }} onClick={addMaterial}>+ Add Material</button>
                </div>
                {materials.length === 0 && <div style={{ fontSize: 10, color: '#999', padding: '4px 0' }}>No packaging materials planned.</div>}
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

                <div style={sectionTitle}>Notes</div>
                <textarea style={{ ...xpInput, height: 50, width: '100%', resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
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
            <button style={xpBtn({ color: '#a00' })} onClick={onRemove}>Remove</button>
        </div>
    );
}

// ── detail / pack logging ────────────────────────────────────────────────────
function PackingOrderDetail({ po: initialPo, itemById, locPickerTreeOptions, authFetch, showToast, onClose, onChanged, onPrintCard, onPrintLabels }: any) {
    const { hasPermission } = useUser();
    const { formatDate: tzDate } = useTimezone();
    const canManage = hasPermission('sales.manage');
    const [po, setPo] = useState<any>(initialPo);
    const closed = po.status === 'COMPLETED' || po.status === 'CANCELLED';
    const readOnly = closed || !canManage;

    const it = itemById[String(po.item_id)];
    const remaining = Math.max(0, num(po.qty_target) - num(po.qty_packed));

    const [qty, setQty] = useState<string>(remaining ? String(remaining) : '');
    const [packageCount, setPackageCount] = useState<string>(() => {
        const ps = num(po.pack_size);
        return ps > 0 && remaining > 0 ? String(Math.max(1, Math.ceil(remaining / ps))) : '1';
    });
    const [sourceBatch, setSourceBatch] = useState('');
    const [operator, setOperator] = useState('');
    const [packNotes, setPackNotes] = useState('');
    const [lots, setLots] = useState<any[]>([]);
    const [logging, setLogging] = useState(false);

    useEffect(() => {
        (async () => {
            if (!it?.lot_tracked) return;
            const res = await authFetch(`${API_BASE}/batches?item_id=${po.item_id}`);
            if (res.ok) setLots(await res.json() || []);
        })();
    }, [po.item_id, it?.lot_tracked, authFetch]);

    // Keep cartons and qty consistent with the order's pack size as the operator
    // edits qty — the count is what mints carton rows, so a stale value silently
    // produces the wrong number of physical labels.
    const onQtyChange = (v: string) => {
        setQty(v);
        const ps = num(po.pack_size);
        if (ps > 0 && num(v) > 0) setPackageCount(String(Math.max(1, Math.ceil(num(v) / ps))));
    };

    const logPack = async () => {
        if (num(qty) <= 0) { showToast('Enter a quantity to pack', 'warning'); return; }
        if (num(packageCount) <= 0) { showToast('At least one carton is required', 'warning'); return; }
        setLogging(true);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}/complete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qty: num(qty),
                    package_count: parseInt(packageCount, 10),
                    source_batch_id: sourceBatch || null,
                    operator: operator || null,
                    notes: packNotes || null,
                }),
            });
            if (res.ok) {
                const fresh = await res.json();
                setPo(fresh);
                setQty(''); setPackNotes('');
                showToast(`${packageCount} ${po.package_label.toLowerCase()}(s) packed`, 'success');
                await onChanged();
            } else {
                const e = await res.json().catch(() => ({}));
                showToast(`Error: ${e.detail || 'pack failed'}`, 'danger');
            }
        } finally { setLogging(false); }
    };

    const units = po.packed_units || [];

    return (
        <ModalWrapper
            isOpen onClose={onClose}
            title={`Packing Order ${po.code} — ${po.item_name || it?.name || ''}`}
            size="xl" modeless
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <button style={xpBtn()} onClick={onClose}>Close</button>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button style={xpBtn()} onClick={() => onPrintCard(po)}>Packing Card</button>
                        <button style={xpBtn()} disabled={!units.length} onClick={() => onPrintLabels(po, units)}>Carton Labels</button>
                    </div>
                </div>
            }
        >
            <div style={{ fontFamily: xpFont }}>
                {closed && (
                    <div style={{ background: '#eef7ee', border: '1px solid #2d7a2d', color: '#0a3e0a', padding: '5px 10px', fontSize: 11, marginBottom: 10 }}>
                        This packing order is {po.status} and read-only.
                    </div>
                )}

                {/* Summary */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11 }}>
                    <Fact label="Sales Order" value={po.sales_order_code || 'to stock'} />
                    <Fact label="Status" value={<StatusChip status={po.status} />} />
                    <Fact label="Target" value={`${num(po.qty_target).toLocaleString()} ${po.item_uom || it?.uom || ''}`} />
                    <Fact label="Packed" value={`${num(po.qty_packed).toLocaleString()} ${po.item_uom || it?.uom || ''}`} />
                    <Fact label="Remaining" value={remaining.toLocaleString()} />
                    <Fact label="Cartons" value={String(po.package_count || 0)} />
                    <Fact label="Colour" value={po.color_name || '—'} />
                </div>

                {/* Log pack */}
                {!readOnly && (
                    <>
                        <div style={sectionTitle}>Log Packing</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ width: 110 }}>
                                <label style={xpLabel}>Qty packed</label>
                                <input type="number" min={0} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={qty} onChange={e => onQtyChange(e.target.value)} />
                            </div>
                            <div style={{ width: 100 }}>
                                <label style={xpLabel}>{po.package_label}s</label>
                                <input type="number" min={1} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={packageCount} onChange={e => setPackageCount(e.target.value)} />
                            </div>
                            <div style={{ width: 200 }}>
                                <label style={xpLabel}>Source lot</label>
                                {it?.lot_tracked ? (
                                    <select style={{ ...xpSelect, width: '100%' }} value={sourceBatch} onChange={e => setSourceBatch(e.target.value)}>
                                        <option value="">— select lot —</option>
                                        {lots.map((b: any) => <option key={b.id} value={b.id}>{b.batch_number}{b.remaining != null ? ` (${b.remaining})` : ''}</option>)}
                                    </select>
                                ) : <span style={{ fontSize: 10, color: '#bbb' }}>not lot-tracked</span>}
                            </div>
                            <div style={{ width: 150 }}>
                                <label style={xpLabel}>Operator</label>
                                <input style={{ ...xpInput, width: '100%' }} value={operator} onChange={e => setOperator(e.target.value)} />
                            </div>
                            <div style={{ flex: 1, minWidth: 180 }}>
                                <label style={xpLabel}>Notes</label>
                                <input style={{ ...xpInput, width: '100%' }} value={packNotes} onChange={e => setPackNotes(e.target.value)} />
                            </div>
                            <button style={xpBtnGreen()} disabled={logging} onClick={logPack}>{logging ? 'Packing...' : 'Pack'}</button>
                        </div>
                        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                            Quantity is split evenly across the cartons; packaging materials are deducted pro-rata from the plan.
                        </div>
                    </>
                )}

                {/* Materials */}
                {(po.materials || []).length > 0 && (
                    <>
                        <div style={sectionTitle}>Packaging Materials</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #c8c4b8' }}>
                            <thead>
                                <tr>
                                    <th style={xpTableHeader}>Material</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}>Planned</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}>Consumed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(po.materials || []).map((m: any) => (
                                    <tr key={m.id}>
                                        <td style={td}>{m.item_name || m.item_id} <span style={{ fontSize: 9, color: '#888' }}>{m.item_code}</span></td>
                                        <td style={{ ...td, textAlign: 'right' }}>{num(m.qty_planned).toLocaleString()} {m.item_uom}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{num(m.qty_consumed).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}

                {/* Cartons */}
                <div style={sectionTitle}>Cartons ({units.length})</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #c8c4b8' }}>
                    <thead>
                        <tr>
                            <th style={xpTableHeader}>#</th>
                            <th style={xpTableHeader}>Carton</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Qty in stock</th>
                            <th style={xpTableHeader}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {units.length === 0 && <tr><td colSpan={4} style={{ ...td, color: '#999' }}>No cartons packed yet.</td></tr>}
                        {units.map((u: any) => (
                            <tr key={u.id}>
                                <td style={td}>{u.package_no}</td>
                                <td style={{ ...td, color: '#00309c' }}>{u.batch_number}</td>
                                <td style={{ ...td, textAlign: 'right', color: num(u.qty) > 0 ? '#0a3e0a' : '#888' }}>
                                    {num(u.qty).toLocaleString()}
                                </td>
                                <td style={td}>{num(u.qty) > 0 ? <StatusChip status="IN_STOCK" /> : <StatusChip status="SENT" />}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Log */}
                <div style={sectionTitle}>Packing Log</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #c8c4b8' }}>
                    <thead>
                        <tr>
                            <th style={xpTableHeader}>When</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Qty</th>
                            <th style={{ ...xpTableHeader, textAlign: 'right' }}>Cartons</th>
                            <th style={xpTableHeader}>Source lot</th>
                            <th style={xpTableHeader}>Operator</th>
                            <th style={xpTableHeader}>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(po.completions || []).length === 0 && <tr><td colSpan={6} style={{ ...td, color: '#999' }}>Nothing packed yet.</td></tr>}
                        {(po.completions || []).map((c: any) => (
                            <tr key={c.id}>
                                <td style={td}>{c.completed_at ? tzDate(c.completed_at) : '-'}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{num(c.qty).toLocaleString()}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{c.package_count}</td>
                                <td style={td}>{c.source_batch_number || '-'}</td>
                                <td style={td}>{c.operator || '-'}</td>
                                <td style={td}>{c.notes || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </ModalWrapper>
    );
}

function Fact({ label, value }: any) {
    return (
        <div>
            <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontWeight: 'bold' }}>{value}</div>
        </div>
    );
}
