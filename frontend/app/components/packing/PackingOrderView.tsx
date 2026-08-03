'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState, StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu, FormSection, SectionTitle, FieldLabel, XPActionButton } from '../shared/xpTheme';
import { LV_XP_FONT, lvBtn, lvInput, lvTh, lvTd, lvRow } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
import SearchableSelect from '../shared/SearchableSelect';
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';
import { useFinishedGoodsSearch } from '../shared/useFinishedGoodsSearch';
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
    background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
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
                        {orders.map((po: any, idx: number) => {
                            const it = itemById[String(po.item_id)];
                            const shortfall = num(po.qty_packed) < num(po.qty_target);
                            return (
                                <tr key={po.id} style={rowStyle(idx)}>
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
function PackingOrderForm({ locPickerTreeOptions, authFetch, showToast, onClose, onCreated }: any) {
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
    const [operator, setOperator] = useState('');
    const [packNotes, setPackNotes] = useState('');
    const [lots, setLots] = useState<any[]>([]);
    const [lotsLoading, setLotsLoading] = useState(false);
    const [selectedLots, setSelectedLots] = useState<string[]>([]);
    const [lotQty, setLotQty] = useState<Record<string, string>>({});
    const [lotCartons, setLotCartons] = useState<Record<string, string>>({});
    const [logging, setLogging] = useState(false);

    // The packer picks lots exactly as a stager picks material for a WO: the lot
    // pins the StockBalance row being drawn, which is what makes the order's
    // variant redundant — the server reads the variant back off that row.
    // Scoping the fetch to the order's source location makes /batches drop lots
    // with no stock there, so only packable lots are ever offered.
    useEffect(() => {
        if (!it?.lot_tracked || !po.source_location_id) { setLots([]); return; }
        let alive = true;
        setLotsLoading(true);
        (async () => {
            try {
                const res = await authFetch(
                    `${API_BASE}/batches?item_id=${po.item_id}&location_id=${po.source_location_id}&limit=200&with_source_lots=true`
                );
                const list = res.ok ? (await res.json() || []) : [];
                if (!alive) return;
                setLots((list || []).filter((b: any) => (b.remaining ?? 0) > 0 && b.quality_status !== 'REJECTED'));
            } finally {
                if (alive) setLotsLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [po.item_id, po.source_location_id, it?.lot_tracked, authFetch, po.qty_packed]);

    const cartonsFor = useCallback((q: number) => {
        const ps = num(po.pack_size);
        return ps > 0 && q > 0 ? String(Math.max(1, Math.ceil(q / ps))) : '1';
    }, [po.pack_size]);

    const selectedQty = selectedLots.reduce((s, id) => s + num(lotQty[id]), 0);
    const selectedCartons = selectedLots.reduce((s, id) => s + (parseInt(lotCartons[id] || '0', 10) || 0), 0);

    // Checking a lot defaults its qty to whatever is still needed, capped by what
    // the lot actually holds — so a full pack run is one click per lot.
    const toggleLot = (b: any) => {
        const id = String(b.id);
        if (selectedLots.includes(id)) {
            setSelectedLots(prev => prev.filter(x => x !== id));
            return;
        }
        const stillNeeded = Math.max(0, remaining - selectedQty);
        const q = Math.min(b.remaining ?? 0, stillNeeded > 0 ? stillNeeded : (b.remaining ?? 0));
        setSelectedLots(prev => [...prev, id]);
        setLotQty(prev => ({ ...prev, [id]: String(q) }));
        setLotCartons(prev => ({ ...prev, [id]: cartonsFor(q) }));
    };

    // Cartons follow qty via pack_size — the count is what mints carton rows, so
    // a stale value silently produces the wrong number of physical labels.
    const setLotQtyAndCartons = (id: string, v: string) => {
        setLotQty(prev => ({ ...prev, [id]: v }));
        if (num(v) > 0) setLotCartons(prev => ({ ...prev, [id]: cartonsFor(num(v)) }));
    };

    const onQtyChange = (v: string) => {
        setQty(v);
        const ps = num(po.pack_size);
        if (ps > 0 && num(v) > 0) setPackageCount(String(Math.max(1, Math.ceil(num(v) / ps))));
    };

    const useLotPicker = !!it?.lot_tracked;

    const logPack = async () => {
        let body: any;
        if (useLotPicker) {
            if (!selectedLots.length) { showToast('Select the lots to pack from', 'warning'); return; }
            const over = selectedLots.find(id => {
                const b = lots.find((x: any) => String(x.id) === id);
                return b && num(lotQty[id]) > (b.remaining ?? 0) + 1e-6;
            });
            if (over) {
                const b = lots.find((x: any) => String(x.id) === over);
                showToast(`${b?.batch_number} only has ${(b?.remaining ?? 0).toLocaleString()} left`, 'warning');
                return;
            }
            if (selectedQty <= 0) { showToast('Enter a quantity for each selected lot', 'warning'); return; }
            body = {
                lots: selectedLots.map(id => ({
                    batch_id: id,
                    qty: num(lotQty[id]),
                    package_count: parseInt(lotCartons[id] || '1', 10) || 1,
                })),
                operator: operator || null,
                notes: packNotes || null,
            };
        } else {
            if (num(qty) <= 0) { showToast('Enter a quantity to pack', 'warning'); return; }
            if (num(packageCount) <= 0) { showToast('At least one carton is required', 'warning'); return; }
            body = {
                qty: num(qty),
                package_count: parseInt(packageCount, 10),
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
                const packed = useLotPicker ? selectedCartons : parseInt(packageCount, 10);
                setPo(fresh);
                setQty(''); setPackNotes('');
                setSelectedLots([]); setLotQty({}); setLotCartons({});
                showToast(`${packed} ${po.package_label.toLowerCase()}(s) packed`, 'success');
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

                <FormSection title={<SectionTitle icon="bi-info-circle">Summary</SectionTitle>} classic={CLASSIC}>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11 }}>
                        <Fact label="Sales Order" value={po.sales_order_code || 'to stock'} />
                        <Fact label="Status" value={<StatusChip status={po.status} />} />
                        <Fact label="Target" value={`${num(po.qty_target).toLocaleString()} ${po.item_uom || it?.uom || ''}`} />
                        <Fact label="Packed" value={`${num(po.qty_packed).toLocaleString()} ${po.item_uom || it?.uom || ''}`} />
                        <Fact label="Remaining" value={remaining.toLocaleString()} />
                        <Fact label="Cartons" value={String(po.package_count || 0)} />
                        <Fact label="Colour" value={po.color_name || '—'} />
                    </div>
                </FormSection>

                {!readOnly && (
                    <FormSection
                        classic={CLASSIC}
                        title={
                            <SectionTitle
                                icon="bi-box-seam"
                                right={useLotPicker && selectedLots.length
                                    ? `${selectedQty.toLocaleString()} ${po.item_uom || it?.uom || ''} · ${selectedCartons} ${po.package_label.toLowerCase()}(s) selected`
                                    : undefined}
                            >
                                Log Packing
                            </SectionTitle>
                        }
                    >
                        {useLotPicker ? (
                            <>
                                <FieldLabel classic={CLASSIC} hint={`Pick the lots to draw from — ${remaining.toLocaleString()} still to pack`}>
                                    Source lots
                                </FieldLabel>
                                {!po.source_location_id ? (
                                    <div style={hintText}>Set a pack-from location on this order before packing.</div>
                                ) : (
                                    <div style={{ border: '1px solid #7f9db9', background: '#fff', maxHeight: 240, overflowY: 'auto' }}>
                                        {lotsLoading && <div style={{ ...hintText, padding: '4px 6px', marginTop: 0 }}>Loading lots...</div>}
                                        {!lotsLoading && lots.length === 0 && (
                                            <div style={{ ...hintText, padding: '4px 6px', marginTop: 0 }}>
                                                No lots of this item in stock at the pack-from location.
                                            </div>
                                        )}
                                        {lots.map((b: any) => {
                                            const id = String(b.id);
                                            const checked = selectedLots.includes(id);
                                            return (
                                                <div key={id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '3px 6px', borderBottom: '1px solid #eceae2',
                                                    background: checked ? '#e6f0ff' : 'transparent',
                                                }}>
                                                    <input type="checkbox" checked={checked} onChange={() => toggleLot(b)} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 11 }}>{b.batch_number}</span>
                                                            <LotChip tone="qty" title="Quantity remaining">{(b.remaining ?? 0).toLocaleString()}</LotChip>
                                                            {b.location_name ? (
                                                                <LotChip tone="location" title="Current location">
                                                                    <i className="bi bi-geo-alt" />{b.location_name}
                                                                </LotChip>
                                                            ) : null}
                                                        </div>
                                                        <LotChips batch={b} showOrder />
                                                    </div>
                                                    <div style={{ width: 90 }}>
                                                        <input
                                                            type="number" min={0} step="any" disabled={!checked}
                                                            placeholder="Qty"
                                                            style={{ ...xpInput, width: '100%', textAlign: 'right' }}
                                                            value={checked ? (lotQty[id] || '') : ''}
                                                            onChange={e => setLotQtyAndCartons(id, e.target.value)}
                                                        />
                                                    </div>
                                                    <div style={{ width: 70 }}>
                                                        <input
                                                            type="number" min={1} disabled={!checked}
                                                            title={`${po.package_label}s from this lot`}
                                                            style={{ ...xpInput, width: '100%', textAlign: 'right' }}
                                                            value={checked ? (lotCartons[id] || '') : ''}
                                                            onChange={e => setLotCartons(prev => ({ ...prev, [id]: e.target.value }))}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div style={{ width: 110 }}>
                                    <FieldLabel classic={CLASSIC}>Qty packed</FieldLabel>
                                    <input type="number" min={0} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={qty} onChange={e => onQtyChange(e.target.value)} />
                                </div>
                                <div style={{ width: 100 }}>
                                    <FieldLabel classic={CLASSIC}>{po.package_label}s</FieldLabel>
                                    <input type="number" min={1} style={{ ...xpInput, width: '100%', textAlign: 'right' }} value={packageCount} onChange={e => setPackageCount(e.target.value)} />
                                </div>
                                <div style={{ fontSize: 10, color: '#938c76', fontStyle: 'italic', paddingBottom: 3 }}>
                                    This item is not lot-tracked — the variant is taken from the stock at the pack-from location.
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                            <div style={{ width: 150 }}>
                                <FieldLabel classic={CLASSIC}>Operator</FieldLabel>
                                <input style={{ ...xpInput, width: '100%' }} value={operator} onChange={e => setOperator(e.target.value)} />
                            </div>
                            <div style={{ flex: 1, minWidth: 180 }}>
                                <FieldLabel classic={CLASSIC}>Notes</FieldLabel>
                                <input style={{ ...xpInput, width: '100%' }} value={packNotes} onChange={e => setPackNotes(e.target.value)} />
                            </div>
                            <button style={xpBtnGreen()} disabled={logging} onClick={logPack}>{logging ? 'Packing...' : 'Pack'}</button>
                        </div>
                        <div style={hintText}>
                            Each lot is logged as its own pack event, so every carton keeps the lot it came from.
                            Quantity is split evenly across that lot&apos;s cartons; packaging materials are deducted
                            pro-rata from the plan.
                        </div>
                    </FormSection>
                )}

                {(po.materials || []).length > 0 && (
                    <FormSection title={<SectionTitle icon="bi-boxes">Packaging Materials</SectionTitle>} classic={CLASSIC}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #c8c4b8' }}>
                            <thead>
                                <tr>
                                    <th style={xpTableHeader}>Material</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}>Planned</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}>Consumed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(po.materials || []).map((m: any, idx: number) => (
                                    <tr key={m.id} style={rowStyle(idx)}>
                                        <td style={td}>{m.item_name || m.item_id} <span style={{ fontSize: 9, color: '#888' }}>{m.item_code}</span></td>
                                        <td style={{ ...td, textAlign: 'right' }}>{num(m.qty_planned).toLocaleString()} {m.item_uom}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{num(m.qty_consumed).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </FormSection>
                )}

                <FormSection title={<SectionTitle icon="bi-box2-fill" right={`${units.length} total`}>Cartons</SectionTitle>} classic={CLASSIC}>
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
                            {units.map((u: any, idx: number) => (
                                <tr key={u.id} style={rowStyle(idx)}>
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
                </FormSection>

                <FormSection title={<SectionTitle icon="bi-clock-history">Packing Log</SectionTitle>} classic={CLASSIC}>
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
                            {(po.completions || []).map((c: any, idx: number) => (
                                <tr key={c.id} style={rowStyle(idx)}>
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
                </FormSection>
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
