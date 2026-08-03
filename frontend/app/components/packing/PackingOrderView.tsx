'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { XPStatusBar, XPEmptyState, StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu, FormSection, SectionTitle, FieldLabel, XPActionButton, LegendPanel, ProgressBar } from '../shared/xpTheme';
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
// Operator-log-modal field label + UOM pill — copied from WOCompletionModal so the
// pack modal and the WO completion modal read as the same screen.
const xpFormLabel: React.CSSProperties = { fontFamily: xpFont, fontSize: 11, display: 'block', marginBottom: 2 };
const uomChip: React.CSSProperties = {
    fontSize: 9, fontWeight: 'bold', letterSpacing: 0.3, textTransform: 'uppercase',
    color: '#31569e', background: '#e8f0fe', border: '1px solid #a8c0f0',
    borderRadius: 2, padding: '0 5px', lineHeight: '14px',
};

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
                            const closed = po.status === 'COMPLETED' || po.status === 'CANCELLED';
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
                                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
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
                    locationById={locationById}
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

// ── pack logging ─────────────────────────────────────────────────────────────
// Deliberately shaped like WOCompletionModal: same header progress panel, same
// big "qty" entry, same "Lots to Consume" checkbox list with FIFO take-chips,
// same legend-panel groupboxes and Previous-Entries table. Packing is the same
// motion as logging WO output for the operator, so it reads the same. Keep the
// two in step — a change to one of these patterns belongs in both.
function PackingOrderDetail({ po: initialPo, itemById, locationById, authFetch, showToast, onClose, onChanged, onPrintCard, onPrintLabels }: any) {
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
    const [packageCount, setPackageCount] = useState<string>('1');
    const [operator, setOperator] = useState('');
    const [packNotes, setPackNotes] = useState('');
    const [lots, setLots] = useState<any[]>([]);
    const [lotsLoading, setLotsLoading] = useState(false);
    const [selectedLots, setSelectedLots] = useState<string[]>([]);
    const [logging, setLogging] = useState(false);

    const useLotPicker = !!it?.lot_tracked;
    const outputLocName = locationById?.[String(po.output_location_id)]?.name || null;
    const sourceLocName = locationById?.[String(po.source_location_id)]?.name || null;

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
                setLots((list || []).filter((b: any) => (b.remaining ?? 0) > 0 && b.quality_status !== 'REJECTED'));
            } finally {
                if (alive) setLotsLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [po.item_id, po.source_location_id, useLotPicker, authFetch, po.qty_packed]);

    // Cartons follow qty via pack_size — the count is what mints carton rows, so
    // a stale value silently produces the wrong number of physical labels.
    const onQtyChange = (v: string) => {
        setQty(v);
        const ps = num(po.pack_size);
        if (ps > 0 && num(v) > 0) setPackageCount(String(Math.max(1, Math.ceil(num(v) / ps))));
    };

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

    // Cartons are entered as one total, then split across the drawing lots in
    // proportion to their qty (largest remainder, at least one each) — a carton
    // never straddles two lots, which is what keeps carton genealogy exact.
    const splitCartons = (total: number): number[] => {
        const n = alloc.length;
        if (n === 0) return [];
        if (total <= n) return alloc.map(() => 1);
        const exact = alloc.map(l => (l.qty / drawn) * total);
        const base = exact.map(v => Math.max(1, Math.floor(v)));
        let left = total - base.reduce((s, v) => s + v, 0);
        const order = exact
            .map((v, i) => ({ i, frac: v - Math.floor(v) }))
            .sort((a, b) => b.frac - a.frac);
        for (let k = 0; left > 0; k = (k + 1) % n) { base[order[k].i] += 1; left -= 1; }
        return base;
    };

    const toggleLot = (id: string, on: boolean) =>
        setSelectedLots(prev => on ? [...prev, id] : prev.filter(x => x !== id));
    const allIds = lots.map((b: any) => String(b.id));
    const allSelected = allIds.length > 0 && selectedLots.length === allIds.length;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = num(qty);
        const cartons = parseInt(packageCount, 10) || 0;
        if (q <= 0) { showToast('Enter a positive quantity', 'danger'); return; }
        if (cartons <= 0) { showToast(`At least one ${po.package_label.toLowerCase()} is required`, 'danger'); return; }

        let body: any = { qty: q, package_count: cartons, operator: operator || null, notes: packNotes || null };
        if (useLotPicker) {
            if (!selectedLots.length) { showToast('Select at least one lot to pack from', 'danger'); return; }
            if (short) {
                showToast(
                    `Selected lots hold only ${drawn.toFixed(2)} of the ${q.toFixed(2)} needed — select more lots`,
                    'danger',
                );
                return;
            }
            const perLot = splitCartons(cartons);
            body = {
                lots: alloc.map((l, i) => ({ ...l, package_count: perLot[i] })),
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
                setQty(''); setPackageCount('1'); setPackNotes(''); setSelectedLots([]);
                showToast(`Packed ${q} into ${cartons} ${po.package_label.toLowerCase()}(s) — total ${num(fresh.qty_packed).toFixed(2)} / ${target}`, 'success');
                await onChanged();
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Pack failed', 'danger');
            }
        } finally { setLogging(false); }
    };

    const units = po.packed_units || [];
    const completions = po.completions ? [...po.completions].reverse() : [];

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
                        <button type="submit" form="packing-log-form" disabled={logging}
                            style={{ ...xpBtnGreen(), opacity: logging ? 0.6 : 1 }}>
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
                                    onChange={e => onQtyChange(e.target.value)}
                                    min="0.0001" step="any"
                                    placeholder={remaining > 0 ? remaining.toFixed(2) : String(target)}
                                    autoFocus
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ ...xpFormLabel, fontWeight: 'bold' }}>{po.package_label}s</label>
                                    <input type="number" style={{ ...xpInput, width: '100%' }} value={packageCount}
                                        onChange={e => setPackageCount(e.target.value)} min="1" step="1" required />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={xpFormLabel}>Qty per {po.package_label.toLowerCase()}</label>
                                    <div style={{ fontSize: 11, paddingTop: 3, color: '#555' }}>
                                        {num(po.pack_size) > 0 ? `${num(po.pack_size).toLocaleString()} ${uom}` : 'not set — enter the count'}
                                    </div>
                                </div>
                            </div>
                            {outputLocName && (
                                <div style={{ background: '#eef7ee', border: '1px solid #9cc79c', padding: '4px 8px', fontSize: 10 }}>
                                    <span style={{ color: '#1a5e1a', fontWeight: 'bold' }}>{po.package_label}s stored at: {outputLocName}</span>
                                    {sourceLocName && <span style={{ color: '#555', marginLeft: 6 }}>packed from {sourceLocName}</span>}
                                </div>
                            )}

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
                                                    No lots of this item in stock at the pack-from location.
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
                                                                <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{b.batch_number}</span>
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
                                                <td style={{ padding: '2px 6px', fontFamily: 'monospace', color: '#00309c' }}>{u.batch_number}</td>
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
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Operator</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Notes</th>
                                            <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {completions.map((c: any, i: number) => (
                                            <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f4ee' }}>
                                                <td style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 'bold' }}>{num(c.qty).toFixed(2)}</td>
                                                <td style={{ padding: '2px 6px', textAlign: 'right', color: '#555' }}>{c.package_count}</td>
                                                <td style={{ padding: '2px 6px', color: '#555', fontFamily: c.source_batch_number ? 'monospace' : undefined }}>
                                                    {c.source_batch_number || '—'}
                                                </td>
                                                <td style={{ padding: '2px 6px', color: '#555' }}>{c.operator || '—'}</td>
                                                <td style={{ padding: '2px 6px', color: '#555' }}>{c.notes || '—'}</td>
                                                <td style={{ padding: '2px 6px', color: '#555' }}>{c.completed_at ? tzDateTime(c.completed_at) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </LegendPanel>
                    )}
                </div>
            </form>
        </ModalWrapper>
    );
}
