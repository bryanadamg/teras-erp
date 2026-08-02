import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserContext';
import { useSortable, SortMark, XPLoading, XPActionButton } from '../shared/xpTheme';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar, xpToolbar as sharedXpToolbar } from '../shared/shellTheme';
import { useToast } from '../shared/Toast';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import TreeSelect, { buildLocationFilterTree, buildLocationPickerTree, buildCategoryTree } from '../shared/TreeSelect';

const STOCK_PAGE_SIZE = 50;

// Row actions are icon-only (project convention, see BatchesView) so the tooltip is
// the only label the operator gets — keep these explicit about what each one does.
const ADJUST_TITLE = 'Adjust quantity — cycle count or correction';
const MOVE_TITLE = 'Move — transfer this stock to another location';

interface StockOnHandViewProps {
    locations: any[];
    stockBalance: any[];
    attributes: any[];
    categories: any[];
    items?: any[];
    onSearchItems?: (term: string) => void;
    onRefresh: () => void;
    authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
    apiBase: string;
    loading?: boolean;
}

const UNCAT = '__uncat__';

export default function StockOnHandView({ locations, stockBalance, attributes, categories, items = [], onSearchItems, onRefresh, authFetch, apiBase, loading = false }: StockOnHandViewProps) {
    const { uiStyle } = useTheme();
    const { t } = useLanguage();
    const { showToast } = useToast();
    const { hasPermission } = useUser();
    const canEntry = hasPermission('stock.entry');
    const canRebuild = hasPermission('admin.access');
    const classic = uiStyle === 'classic';

    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [selectedCat, setSelectedCat] = useState('');
    // QC-rejected lots stay physically in their location until disposed, so they are
    // shown by default (the table is the physical truth) but flagged, and hideable
    // for anyone reading the table as available stock.
    const [hideRejected, setHideRejected] = useState(false);
    const [page, setPage] = useState(1);

    // Transfer modal state
    const [transferTarget, setTransferTarget] = useState<any>(null);
    const [transferToLoc, setTransferToLoc] = useState('');
    const [transferQty, setTransferQty] = useState('');
    const [transferCones, setTransferCones] = useState('');
    const [transferBoxes, setTransferBoxes] = useState('');
    const [transferDrums, setTransferDrums] = useState('');
    const [transferring, setTransferring] = useState(false);

    // Adjust modal state
    const ADJUST_REASONS = ['Cycle count', 'Damaged / Loss', 'Correction', 'Found stock', 'Scrap', 'Other'];
    const [adjustTarget, setAdjustTarget] = useState<any>(null);
    const [adjustMode, setAdjustMode] = useState<'set' | 'delta'>('set');
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustCones, setAdjustCones] = useState('');
    const [adjustBoxes, setAdjustBoxes] = useState('');
    const [adjustDrums, setAdjustDrums] = useState('');
    const [adjustReason, setAdjustReason] = useState(ADJUST_REASONS[0]);
    const [adjustNote, setAdjustNote] = useState('');
    const [adjusting, setAdjusting] = useState(false);

    // New manual entry modal state (covers items with no existing balance row)
    const NEW_REASONS = ['Opening balance', 'Manual entry', 'Correction', 'Found stock', 'Other'];
    const [newOpen, setNewOpen] = useState(false);
    const [newItemCode, setNewItemCode] = useState('');
    const [newLocId, setNewLocId] = useState('');
    const [newAttrIds, setNewAttrIds] = useState<string[]>([]);
    const [newQty, setNewQty] = useState('');
    const [newCones, setNewCones] = useState('');
    const [newBoxes, setNewBoxes] = useState('');
    const [newDrums, setNewDrums] = useState('');
    const [newReason, setNewReason] = useState(NEW_REASONS[0]);
    const [newNote, setNewNote] = useState('');
    const [savingNew, setSavingNew] = useState(false);

    const [rebuilding, setRebuilding] = useState(false);
    const handleRebuild = async () => {
        if (rebuilding) return;
        setRebuilding(true);
        try {
            const res = await authFetch(`${apiBase}/stock/balances/rebuild`, { method: 'POST' });
            if (res.ok) { showToast('Stock balances rebuilt from ledger', 'success'); onRefresh(); }
            else { showToast(`Rebuild failed (HTTP ${res.status})`, 'danger'); }
        } catch { showToast('Rebuild failed — network error', 'danger'); }
        finally { setRebuilding(false); }
    };

    const openTransfer = (bal: any) => {
        setTransferTarget(bal);
        setTransferToLoc('');
        setTransferQty(String(bal.qty));
        // Default packaging counts to the full holding; operator trims as needed.
        setTransferCones(bal.qty_cones ? String(bal.qty_cones) : '');
        setTransferBoxes(bal.qty_boxes ? String(bal.qty_boxes) : '');
        setTransferDrums(bal.qty_drums ? String(bal.qty_drums) : '');
    };

    const handleTransfer = async () => {
        if (!transferTarget) return;
        const qty = parseFloat(transferQty);
        if (!qty || qty <= 0) { showToast('Enter a positive quantity', 'danger'); return; }
        if (!transferToLoc) { showToast('Select a destination location', 'danger'); return; }
        setTransferring(true);
        try {
            const res = await authFetch(`${apiBase}/stock/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: transferTarget.item_id,
                    from_location_id: transferTarget.location_id,
                    to_location_id: transferToLoc,
                    qty,
                    batch_id: transferTarget.batch_key || null,
                    attribute_value_ids: transferTarget.attribute_value_ids || [],
                    qty_cones: transferCones ? parseInt(transferCones, 10) : null,
                    qty_boxes: transferBoxes ? parseInt(transferBoxes, 10) : null,
                    qty_drums: transferDrums ? parseInt(transferDrums, 10) : null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Transfer failed');
            }
            showToast('Transfer recorded', 'success');
            setTransferTarget(null);
            onRefresh();
        } catch (err: any) {
            showToast(err.message, 'danger');
        } finally {
            setTransferring(false);
        }
    };

    // Prefill the adjust modal. 'set' mode shows current values (operator overwrites
    // with the counted figure); 'delta' mode starts blank (operator enters +/- change).
    const fillAdjust = (bal: any, mode: 'set' | 'delta') => {
        setAdjustMode(mode);
        if (mode === 'set') {
            setAdjustQty(String(bal.qty));
            setAdjustCones(bal.qty_cones != null ? String(bal.qty_cones) : '');
            setAdjustBoxes(bal.qty_boxes != null ? String(bal.qty_boxes) : '');
            setAdjustDrums(bal.qty_drums != null ? String(bal.qty_drums) : '');
        } else {
            setAdjustQty('');
            setAdjustCones(''); setAdjustBoxes(''); setAdjustDrums('');
        }
    };
    const openAdjust = (bal: any) => {
        setAdjustTarget(bal);
        setAdjustReason(ADJUST_REASONS[0]);
        setAdjustNote('');
        fillAdjust(bal, 'set');
    };

    const num = (s: string, d = 0) => { const n = parseFloat(s); return isNaN(n) ? d : n; };
    const int = (s: string, d = 0) => { const n = parseInt(s, 10); return isNaN(n) ? d : n; };

    const handleAdjust = async () => {
        if (!adjustTarget) return;
        const t = adjustTarget;
        const curCones = t.qty_cones || 0, curBoxes = t.qty_boxes || 0, curDrums = t.qty_drums || 0;
        let qtyDelta: number, coneDelta: number, boxDelta: number, drumDelta: number;
        if (adjustMode === 'set') {
            qtyDelta = num(adjustQty, t.qty) - t.qty;
            coneDelta = int(adjustCones, curCones) - curCones;
            boxDelta = int(adjustBoxes, curBoxes) - curBoxes;
            drumDelta = int(adjustDrums, curDrums) - curDrums;
        } else {
            qtyDelta = num(adjustQty, 0);
            coneDelta = int(adjustCones, 0);
            boxDelta = int(adjustBoxes, 0);
            drumDelta = int(adjustDrums, 0);
        }
        if (!qtyDelta && !coneDelta && !boxDelta && !drumDelta) {
            showToast('Nothing to adjust — no change entered', 'danger'); return;
        }
        if (!adjustReason) { showToast('Select a reason', 'danger'); return; }
        const locationCode = locMap[t.location_id]?.code;
        if (!locationCode) { showToast('Cannot resolve location code', 'danger'); return; }
        setAdjusting(true);
        try {
            const res = await authFetch(`${apiBase}/stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_code: t.item_code,
                    location_code: locationCode,
                    attribute_value_ids: t.attribute_value_ids || [],
                    qty: qtyDelta,
                    qty_cones: coneDelta || null,
                    qty_boxes: boxDelta || null,
                    qty_drums: drumDelta || null,
                    reference_type: 'adjustment',
                    reference_id: adjustNote.trim() ? `${adjustReason}: ${adjustNote.trim()}` : adjustReason,
                    batch_id: t.batch_key || null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Adjustment failed');
            }
            showToast('Stock adjusted', 'success');
            setAdjustTarget(null);
            onRefresh();
        } catch (err: any) {
            showToast(err.message, 'danger');
        } finally {
            setAdjusting(false);
        }
    };

    // Attributes bound to the selected item (mirrors Stock Entry form).
    const newItem = useMemo(() => items.find((i: any) => i.code === newItemCode), [items, newItemCode]);
    const newBoundAttrs = useMemo(() => {
        if (!newItem?.attribute_ids) return [];
        return attributes.filter((a: any) => newItem.attribute_ids.includes(a.id));
    }, [newItem, attributes]);

    const openNew = () => {
        setNewItemCode(''); setNewLocId(''); setNewAttrIds([]);
        setNewQty(''); setNewCones(''); setNewBoxes(''); setNewDrums('');
        setNewReason(NEW_REASONS[0]); setNewNote('');
        setNewOpen(true);
    };
    const setNewAttrValue = (valId: string, attrId: string) => {
        const attr = attributes.find((a: any) => a.id === attrId);
        if (!attr) return;
        const others = newAttrIds.filter(vid => !attr.values.some((v: any) => v.id === vid));
        setNewAttrIds(valId ? [...others, valId] : others);
    };

    const handleNewEntry = async () => {
        if (!newItemCode) { showToast('Select an item', 'danger'); return; }
        const newLoc = locations.find((l: any) => l.id === newLocId);
        if (!newLocId || !newLoc) { showToast('Select a location', 'danger'); return; }
        const qty = num(newQty, NaN);
        if (isNaN(qty) || qty === 0) { showToast('Enter a non-zero quantity', 'danger'); return; }
        setSavingNew(true);
        try {
            const res = await authFetch(`${apiBase}/stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_code: newItemCode,
                    location_code: newLoc.code,
                    attribute_value_ids: newAttrIds,
                    qty,
                    qty_cones: int(newCones, 0) || null,
                    qty_boxes: int(newBoxes, 0) || null,
                    qty_drums: int(newDrums, 0) || null,
                    reference_type: 'manual',
                    reference_id: newNote.trim() ? `${newReason}: ${newNote.trim()}` : newReason,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Entry failed');
            }
            showToast('Stock entry recorded', 'success');
            setNewOpen(false);
            onRefresh();
        } catch (err: any) {
            showToast(err.message, 'danger');
        } finally {
            setSavingNew(false);
        }
    };

    const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;

    const locMap = useMemo(() => {
        const m: Record<string, any> = {};
        for (const l of (locations || [])) m[l.id] = l;
        return m;
    }, [locations]);
    // Walk up to the root warehouse (handles 2-level zone and 3-level bin).
    const getWarehouseId = (locId: string): string | null => {
        const loc = locMap[locId];
        if (!loc?.parent_id) return null;
        const parent = locMap[String(loc.parent_id)];
        if (!parent?.parent_id) return String(loc.parent_id); // parent is warehouse
        return String(parent.parent_id); // grandparent is warehouse (bin case)
    };
    const getWarehouseName = (locId: string): string => {
        const wid = getWarehouseId(locId);
        return wid ? (locMap[wid]?.name || '') : '';
    };

    // Combined Warehouse → Location dropdown. Top-level locations with children
    // are warehouse groups; childless top-level locations hold stock directly and
    // fall under "No Warehouse".
    const byName = (a: any, b: any) => (a.name || '').localeCompare(b.name || '');
    const topLevel = useMemo(() => (locations || []).filter((l: any) => !l.parent_id), [locations]);
    const childrenByWh = useMemo(() => {
        const m: Record<string, any[]> = {};
        for (const l of (locations || [])) {
            if (l.parent_id) (m[l.parent_id] ||= []).push(l);
        }
        for (const k of Object.keys(m)) m[k].sort(byName);
        return m;
    }, [locations]);
    const warehouseGroups = useMemo(
        () => topLevel.filter((w: any) => (childrenByWh[w.id] || []).length > 0).sort(byName),
        [topLevel, childrenByWh]
    );
    const standaloneLocs = useMemo(
        () => topLevel.filter((w: any) => (childrenByWh[w.id] || []).length === 0).sort(byName),
        [topLevel, childrenByWh]
    );

    // Encode warehouse-vs-location into one select value; the two filter states
    // stay mutually exclusive (a specific location overrides a whole-warehouse pick).
    const locSelectValue = locationFilter ? `loc:${locationFilter}` : warehouseFilter ? `wh:${warehouseFilter}` : '';
    const onLocSelect = (val: string) => {
        if (!val) { setWarehouseFilter(''); setLocationFilter(''); }
        else if (val.startsWith('wh:')) { setWarehouseFilter(val.slice(3)); setLocationFilter(''); }
        else if (val.startsWith('loc:')) { setLocationFilter(val.slice(4)); setWarehouseFilter(''); }
    };
    const locFilterTreeOptions = useMemo(() => buildLocationFilterTree(locations || []), [locations]);
    const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);

    const getAttrValueName = (valId: string) => {
        for (const attr of attributes) {
            const v = attr.values?.find((v: any) => v.id === valId);
            if (v) return v.value;
        }
        return valId;
    };

    // Combo (system_role='combo') value carried by a balance row, if any — surfaced
    // as its own badge since it's the variant identity for shared greige/base stock.
    const comboValueIds = useMemo(() => {
        const attr = (attributes || []).find((a: any) => a.system_role === 'combo');
        return new Set((attr?.values || []).map((v: any) => String(v.id)));
    }, [attributes]);
    const getComboLabel = (bal: any): string | null => {
        const id = (bal.attribute_value_ids || []).find((vid: string) => comboValueIds.has(String(vid)));
        return id ? getAttrValueName(id) : null;
    };

    // Packaging counts (no UOM conversion) — show only nonzero units.
    const pkgParts = (bal: any): { n: number; label: string }[] => {
        const out: { n: number; label: string }[] = [];
        const c = bal.qty_cones || 0, b = bal.qty_boxes || 0, d = bal.qty_drums || 0;
        if (c) out.push({ n: c, label: c === 1 || c === -1 ? 'cone' : 'cones' });
        if (b) out.push({ n: b, label: b === 1 || b === -1 ? 'box' : 'boxes' });
        if (d) out.push({ n: d, label: d === 1 || d === -1 ? 'drum' : 'drums' });
        return out;
    };
    const pkgTotal = (bal: any) => Math.abs(bal.qty_cones || 0) + Math.abs(bal.qty_boxes || 0) + Math.abs(bal.qty_drums || 0);

    // ── Category filter ───────────────────────────────────────────────────────
    const cats = categories || [];
    const catTreeOptions = useMemo(() => buildCategoryTree(cats), [cats]);
    const effectiveCat = selectedCat;

    // A row matches when its item_category_id is the selected category or any
    // descendant of it. Precompute the descendant-inclusive id set once.
    const catMatchSet = useMemo(() => {
        if (!effectiveCat) return null;
        const childrenOf: Record<string, string[]> = {};
        for (const c of cats) {
            if (!c.parent_id) continue;
            (childrenOf[c.parent_id] ||= []).push(c.id);
        }
        const set = new Set<string>();
        const stack = [effectiveCat];
        while (stack.length) {
            const id = stack.pop()!;
            if (set.has(id)) continue;
            set.add(id);
            for (const child of (childrenOf[id] || [])) stack.push(child);
        }
        return set;
    }, [cats, effectiveCat]);

    const clearCats = () => setSelectedCat('');

    const filtered = useMemo(() => {
        const s = search.toLowerCase();
        return (stockBalance || []).filter((bal: any) => {
            if (locationFilter) {
                if (bal.location_id !== locationFilter) {
                    // Also match bins under a selected zone
                    const childIds = new Set((childrenByWh[locationFilter] || []).map((c: any) => String(c.id)));
                    if (!childIds.has(String(bal.location_id))) return false;
                }
            }
            if (warehouseFilter) {
                const wid = getWarehouseId(bal.location_id);
                if (warehouseFilter === UNCAT) { if (wid) return false; }
                else if (wid !== warehouseFilter) return false;
            }
            if (catMatchSet && !(bal.item_category_id && catMatchSet.has(bal.item_category_id))) return false;
            if (hideRejected && bal.quality_status && bal.quality_status !== 'GOOD') return false;
            if (!s) return true;
            const name = (bal.item_name || '').toLowerCase();
            const code = (bal.item_code || '').toLowerCase();
            const itemCat = (bal.item_category_name || '').toLowerCase();
            const loc = (bal.location_name || getLocationName(bal.location_id)).toLowerCase();
            const wh = getWarehouseName(bal.location_id).toLowerCase();
            const batch = bal.batch_key ? (bal.batch_number || bal.batch_key).toLowerCase() : '';
            const vendorLot = (bal.vendor_lot || '').toLowerCase();
            const notes = (bal.batch_notes || '').toLowerCase();
            return name.includes(s) || code.includes(s) || itemCat.includes(s) || loc.includes(s) || wh.includes(s) || batch.includes(s) || vendorLot.includes(s) || notes.includes(s);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stockBalance, search, locationFilter, warehouseFilter, catMatchSet, locMap, hideRejected]);

    const negativeCount = filtered.filter((b: any) => b.qty < 0).length;
    const rejectedCount = filtered.filter((b: any) => b.quality_status && b.quality_status !== 'GOOD').length;
    // Rejected qty is physically present but unusable — call the number out so the
    // row total is never read as available stock.
    const rejectedQty = filtered.reduce((s: number, b: any) => (
        b.quality_status && b.quality_status !== 'GOOD' ? s + Number(b.qty || 0) : s
    ), 0);

    const sortCols = useMemo(() => ({
        item:        (b: any) => b.item_name || b.item_code,
        itemCategory: (b: any) => b.item_category_name || '',
        location: (b: any) => b.location_name || getLocationName(b.location_id),
        warehouse: (b: any) => getWarehouseName(b.location_id) || '',
        batch:    (b: any) => b.batch_key ? (b.batch_number || b.batch_key) : null,
        qty:      (b: any) => b.qty,
        packaging: (b: any) => pkgTotal(b),
        notes:    (b: any) => b.batch_notes || null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [locations, locMap]);
    const { sorted: sortedRows, sort, toggle: toggleSort } = useSortable(filtered, sortCols);

    // Client-side pagination — the fetch is still whole-table (DataContext), but
    // only one page of rows hits the DOM at a time instead of the entire result.
    useEffect(() => { setPage(1); }, [search, locationFilter, warehouseFilter, selectedCat, hideRejected]);
    const pageCount = Math.max(1, Math.ceil(sortedRows.length / STOCK_PAGE_SIZE));
    const clampedPage = Math.min(page, pageCount);
    const pageRows = sortedRows.slice((clampedPage - 1) * STOCK_PAGE_SIZE, clampedPage * STOCK_PAGE_SIZE);

    // ── XP style helpers ─────────────────────────────────────────────────────
    const xpFont = 'Tahoma, "Segoe UI", sans-serif';
    const xpBevel: React.CSSProperties = sharedXpBevel();
    const xpTitleBar: React.CSSProperties = sharedXpTitleBar();
    const xpToolbar: React.CSSProperties = sharedXpToolbar({ gap: '6px' });
    const xpInput: React.CSSProperties = {
        fontFamily: xpFont, fontSize: '11px', border: '1px solid #7f9db9',
        boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px',
        background: '#ffffff', color: '#000000', height: '20px', outline: 'none',
    };
    const xpSelect: React.CSSProperties = { ...xpInput, height: '22px' };
    const xpTableHeader: React.CSSProperties = {
        background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
        borderRight: '1px solid #a8a29a',
        fontSize: '10px', fontWeight: 'bold', color: '#000000', fontFamily: xpFont,
        padding: '3px 8px', position: 'sticky' as const, top: 0,
    };
    const colDivider: React.CSSProperties = { borderRight: '1px solid #c0bdb5' };
    const xpBtn = (extra: any = {}): React.CSSProperties => ({
        fontFamily: xpFont, fontSize: '11px', padding: '2px 10px', cursor: 'pointer',
        background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid',
        borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000000', borderRadius: 0, ...extra,
    });
    const xpSep: React.CSSProperties = {
        width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0,
    };

    const renderRow = (bal: any, i: number) => {
        const batchLabel = bal.batch_key ? (bal.batch_number || bal.batch_key) : '-';
        // QC-rejected/disposed lots sit in the same bin as good stock — tint the row
        // and flag the lot so the qty is never mistaken for available.
        const qStatus: string = bal.quality_status && bal.quality_status !== 'GOOD' ? bal.quality_status : '';
        const qtyColor = bal.qty < 0 ? '#c00000' : qStatus ? '#8b0000' : '#00008b';

        if (classic) {
            return (
                <tr key={`${bal.item_id}-${bal.location_id}-${bal.batch_key}-${i}`}
                    title={qStatus ? `Lot is QC ${qStatus} — physically in stock but excluded from netting and consumption pickers` : undefined}
                    style={{ background: qStatus ? (i % 2 === 0 ? '#fdf0f0' : '#f8e8e8') : (i % 2 === 0 ? '#ffffff' : '#f5f3ee'), borderBottom: '1px solid #c0bdb5' }}>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, overflow: 'hidden', ...colDivider }}>
                        <div title={bal.item_name} style={{ fontSize: '11px', fontWeight: 'bold', color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bal.item_name}</div>
                        <div style={{ fontSize: '10px', color: '#666', fontVariant: 'all-small-caps', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bal.item_code}</div>
                        {(getComboLabel(bal) || bal.size_label) && (
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                                {getComboLabel(bal) && (
                                    <span style={{ fontSize: 8, padding: '0 4px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 2, fontWeight: 700, lineHeight: '14px' }} title={`Combo: ${getComboLabel(bal)}`}>
                                        {getComboLabel(bal)}
                                    </span>
                                )}
                                {bal.size_label && (
                                    <span style={{ fontSize: 8, padding: '0 4px', background: '#dcfce7', color: '#15803d', borderRadius: 2, fontWeight: 700, lineHeight: '14px' }} title={`Size: ${bal.size_label}`}>
                                        <i className="bi bi-rulers me-1" style={{ fontSize: 7 }}></i>{bal.size_label}
                                    </span>
                                )}
                            </div>
                        )}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px', maxWidth: 140, ...colDivider }}>
                        {bal.item_category_name ? (
                            <span title={bal.item_category_name} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', background: '#e4eef0', border: '1px solid #8fb3bb', padding: '0 5px', fontSize: '10px', color: '#2a464a' }}>
                                {bal.item_category_name}
                            </span>
                        ) : (
                            <span style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>—</span>
                        )}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px', ...colDivider }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {getWarehouseName(bal.location_id) && (
                                <span style={{ background: '#eef0e4', border: '1px solid #b7bb8f', padding: '0 5px', fontSize: '10px', color: '#4a4a2a' }}>
                                    {getWarehouseName(bal.location_id)}
                                </span>
                            )}
                            <span style={{ background: '#e8e1f0', border: '1px solid #a890c0', padding: '0 5px', fontSize: '10px', color: '#3a2a4a' }}>
                                {bal.location_name || getLocationName(bal.location_id)}
                            </span>
                        </div>
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px', whiteSpace: 'nowrap', ...colDivider }}>
                        {bal.batch_key ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                                <span style={{ background: '#fff8dc', border: '1px solid #c8a000', padding: '0 5px', fontSize: '10px', color: '#5a3c00', whiteSpace: 'nowrap' }}>
                                    {batchLabel}
                                </span>
                                {bal.vendor_lot && (
                                    <span title={`Supplier lot: ${bal.vendor_lot}`} style={{ background: '#f0ece0', border: '1px solid #b0a890', padding: '0 5px', fontFamily: '"Courier New", Courier, monospace', fontSize: '10px', color: '#4a4438', whiteSpace: 'nowrap' }}>
                                        SUP {bal.vendor_lot}
                                    </span>
                                )}
                                {qStatus && (
                                    <span title="QC rejected — not usable stock, excluded from netting and consumption pickers" style={{ background: '#f8d7d7', border: '1px solid #a03030', padding: '0 5px', fontSize: '10px', fontWeight: 'bold', color: '#7a1010', whiteSpace: 'nowrap' }}>
                                        <i className="bi bi-x-octagon-fill" style={{ marginRight: 3, fontSize: 9 }} />{qStatus}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>-</span>
                        )}
                    </td>
                    <td style={{ padding: '4px 8px', ...colDivider }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {bal.attribute_value_ids?.length > 0 ? (
                                bal.attribute_value_ids.map((vid: string) => (
                                    <span key={vid} style={{ background: '#dde8f5', border: '1px solid #7f9db9', padding: '0 4px', fontFamily: xpFont, fontSize: '10px', color: '#333' }}>
                                        {getAttrValueName(vid)}
                                    </span>
                                ))
                            ) : (
                                <span style={{ fontFamily: xpFont, fontSize: '10px', color: '#888', fontStyle: 'italic' }}>Standard</span>
                            )}
                        </div>
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: '"Courier New", Courier, monospace', fontSize: '11px', fontWeight: 'bold', color: qtyColor, whiteSpace: 'nowrap', ...colDivider }}>
                        {Number(bal.qty).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', color: '#666', whiteSpace: 'nowrap', ...colDivider }}>
                        {bal.item_uom || ''}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', whiteSpace: 'nowrap', ...colDivider }}>
                        {pkgParts(bal).length === 0
                            ? <span style={{ color: '#999' }}>-</span>
                            : pkgParts(bal).map((p, idx) => (
                                <span key={idx} style={{ color: p.n < 0 ? '#c00000' : '#5a3c00' }}>
                                    {idx > 0 ? ' / ' : ''}{p.n} {p.label}
                                </span>
                            ))}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', color: '#444', overflow: 'hidden', ...colDivider }}>
                        {bal.batch_notes ? (
                            <span title={bal.batch_notes} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {bal.batch_notes}
                            </span>
                        ) : (
                            <span style={{ color: '#999' }}>-</span>
                        )}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', color: '#444', whiteSpace: 'nowrap', ...colDivider }}>
                        {bal.item_ends != null ? bal.item_ends : ''}
                    </td>
                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {canEntry && (
                                <XPActionButton classic tone="warning" icon="bi-sliders" title={ADJUST_TITLE} onClick={() => openAdjust(bal)} />
                            )}
                            {canEntry && bal.qty > 0 && (
                                <XPActionButton classic tone="primary" icon="bi-arrow-left-right" title={MOVE_TITLE} onClick={() => openTransfer(bal)} />
                            )}
                        </div>
                    </td>
                </tr>
            );
        }

        return (
            <tr key={`${bal.item_id}-${bal.location_id}-${bal.batch_key}-${i}`}
                className={qStatus ? 'table-danger' : undefined}
                title={qStatus ? `Lot is QC ${qStatus} — physically in stock but excluded from netting and consumption pickers` : undefined}>
                <td style={{ overflow: 'hidden', ...colDivider }}>
                    <div title={bal.item_name} className="fw-medium text-truncate">{bal.item_name}</div>
                    <small className="text-muted font-monospace text-truncate d-block">{bal.item_code}</small>
                    {(getComboLabel(bal) || bal.size_label) && (
                        <div className="d-flex flex-wrap gap-1 mt-1">
                            {getComboLabel(bal) && (
                                <span className="badge bg-primary bg-opacity-10 text-primary" style={{ fontSize: 9 }} title={`Combo: ${getComboLabel(bal)}`}>
                                    {getComboLabel(bal)}
                                </span>
                            )}
                            {bal.size_label && (
                                <span className="badge bg-success bg-opacity-10 text-success" style={{ fontSize: 9 }} title={`Size: ${bal.size_label}`}>
                                    <i className="bi bi-rulers me-1" />{bal.size_label}
                                </span>
                            )}
                        </div>
                    )}
                </td>
                <td style={{ maxWidth: 140, ...colDivider }}>
                    {bal.item_category_name ? (
                        <span title={bal.item_category_name} className="badge bg-info-subtle text-info-emphasis" style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{bal.item_category_name}</span>
                    ) : (
                        <span className="text-muted">—</span>
                    )}
                </td>
                <td style={colDivider}>
                    <div className="d-flex flex-wrap gap-1">
                        {getWarehouseName(bal.location_id) && (
                            <span className="badge bg-secondary-subtle text-secondary-emphasis">{getWarehouseName(bal.location_id)}</span>
                        )}
                        <span className="badge bg-primary-subtle text-primary-emphasis">{bal.location_name || getLocationName(bal.location_id)}</span>
                    </div>
                </td>
                <td style={{ whiteSpace: 'nowrap', ...colDivider }}>
                    {bal.batch_key ? (
                        <div className="d-flex flex-column gap-1 align-items-start">
                            <span className="badge bg-warning text-dark">{batchLabel}</span>
                            {bal.vendor_lot && (
                                <span className="badge bg-secondary-subtle text-secondary-emphasis font-monospace" title={`Supplier lot: ${bal.vendor_lot}`}>
                                    SUP {bal.vendor_lot}
                                </span>
                            )}
                            {qStatus && (
                                <span className="badge bg-danger" title="QC rejected — not usable stock, excluded from netting and consumption pickers">
                                    <i className="bi bi-x-octagon-fill me-1" />{qStatus}
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="text-muted">-</span>
                    )}
                </td>
                <td style={colDivider}>
                    {bal.attribute_value_ids?.length > 0 ? (
                        bal.attribute_value_ids.map((vid: string) => (
                            <span key={vid} className="badge bg-info text-dark me-1">{getAttrValueName(vid)}</span>
                        ))
                    ) : (
                        <span className="text-muted small">Standard</span>
                    )}
                </td>
                <td className="text-end fw-bold" style={{ color: qtyColor, whiteSpace: 'nowrap', fontFamily: '"Courier New", Courier, monospace', ...colDivider }}>{Number(bal.qty).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
                <td className="text-muted small" style={{ whiteSpace: 'nowrap', ...colDivider }}>{bal.item_uom || ''}</td>
                <td className="small" style={{ whiteSpace: 'nowrap', ...colDivider }}>
                    {pkgParts(bal).length === 0
                        ? <span className="text-muted">-</span>
                        : pkgParts(bal).map((p, idx) => (
                            <span key={idx} className={p.n < 0 ? 'text-danger' : ''}>
                                {idx > 0 ? ' / ' : ''}{p.n} {p.label}
                            </span>
                        ))}
                </td>
                <td className="small" style={{ overflow: 'hidden', ...colDivider }}>
                    {bal.batch_notes
                        ? <span title={bal.batch_notes} className="d-block text-truncate">{bal.batch_notes}</span>
                        : <span className="text-muted">-</span>}
                </td>
                <td className="text-end small" style={{ whiteSpace: 'nowrap', ...colDivider }}>{bal.item_ends != null ? bal.item_ends : ''}</td>
                <td>
                    <div className="d-flex gap-1">
                        {canEntry && (
                            <XPActionButton classic={false} tone="warning" icon="bi-sliders" title={ADJUST_TITLE} onClick={() => openAdjust(bal)} />
                        )}
                        {canEntry && bal.qty > 0 && (
                            <XPActionButton classic={false} tone="primary" icon="bi-arrow-left-right" title={MOVE_TITLE} onClick={() => openTransfer(bal)} />
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    const transferModal = transferTarget && (
        <ModalWrapper
            isOpen={!!transferTarget}
            modeless
            onClose={() => setTransferTarget(null)}
            title="Transfer Stock"
            size="sm"
            footer={<>
                <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setTransferTarget(null)}>Cancel</button>
                <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-primary'} onClick={handleTransfer} disabled={transferring}>
                    {transferring ? 'Moving...' : 'Transfer'}
                </button>
            </>}
        >
            <div style={{ fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : undefined }}>
                <div style={{ marginBottom: 8 }}>
                    <strong>{transferTarget.item_name}</strong>
                    <div style={{ fontSize: 10, color: '#666' }}>
                        From: {transferTarget.location_name || getLocationName(transferTarget.location_id)}
                        {transferTarget.batch_key ? ` · Lot: ${transferTarget.batch_number || transferTarget.batch_key}` : ''}
                        {' · '}Available: {transferTarget.qty} {transferTarget.item_uom || ''}
                    </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Destination</label>
                    <TreeSelect
                        options={buildLocationPickerTree(locations, transferTarget.location_id)}
                        value={transferToLoc}
                        onChange={setTransferToLoc}
                        placeholder="— select location —"
                        style={{ width: '100%' }}
                        size="sm"
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Quantity</label>
                    <input
                        type="number" min="0.0001" step="any"
                        style={classic ? { ...xpInput, width: '100%' } : undefined}
                        className={classic ? '' : 'form-control form-control-sm'}
                        value={transferQty}
                        onChange={e => setTransferQty(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 4 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>
                        Packaging to move <span style={{ color: '#888', fontWeight: 'normal' }}>(optional)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {([
                            ['Cones', transferCones, setTransferCones],
                            ['Boxes', transferBoxes, setTransferBoxes],
                            ['Drums', transferDrums, setTransferDrums],
                        ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                            <div key={lbl} style={{ flex: 1 }}>
                                <input
                                    type="number" min="0" step="1" placeholder={lbl}
                                    title={lbl}
                                    style={classic ? { ...xpInput, width: '100%' } : undefined}
                                    className={classic ? '' : 'form-control form-control-sm'}
                                    value={val}
                                    onChange={e => set(e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </ModalWrapper>
    );

    const adjustModal = adjustTarget && (() => {
        const t = adjustTarget;
        const newQty = adjustMode === 'set' ? num(adjustQty, t.qty) : t.qty + num(adjustQty, 0);
        const delta = newQty - t.qty;
        const modeBtn = (m: 'set' | 'delta', label: string) => {
            const active = adjustMode === m;
            if (classic) {
                return (
                    <button key={m} style={xpBtn({ fontSize: '11px', flex: 1, fontWeight: active ? 'bold' : 'normal', background: active ? 'linear-gradient(to bottom,#cfe3ff,#a9c9f0)' : undefined })}
                        onClick={() => fillAdjust(t, m)}>{label}</button>
                );
            }
            return (
                <button key={m} className={`btn btn-sm flex-fill ${active ? 'btn-warning' : 'btn-outline-secondary'}`} onClick={() => fillAdjust(t, m)}>{label}</button>
            );
        };
        const pkgLabel = adjustMode === 'set' ? 'Counted packaging' : 'Packaging change (+/-)';
        return (
            <ModalWrapper
                isOpen={true}
                modeless
                onClose={() => setAdjustTarget(null)}
                title="Adjust Stock"
                size="sm"
                footer={<>
                    <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setAdjustTarget(null)}>Cancel</button>
                    <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-warning'} onClick={handleAdjust} disabled={adjusting}>
                        {adjusting ? 'Saving...' : 'Save Adjustment'}
                    </button>
                </>}
            >
                <div style={{ fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : undefined }}>
                    <div style={{ marginBottom: 8 }}>
                        <strong>{t.item_name}</strong>
                        <div style={{ fontSize: 10, color: '#666' }}>
                            {t.location_name || getLocationName(t.location_id)}
                            {t.batch_key ? ` · Lot: ${t.batch_number || t.batch_key}` : ''}
                            {' · '}On hand: {t.qty} {t.item_uom || ''}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        {modeBtn('set', 'Set to (count)')}
                        {modeBtn('delta', 'Adjust by (+/-)')}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>
                            {adjustMode === 'set' ? 'Counted quantity' : 'Quantity change (+/-)'}
                        </label>
                        <input
                            type="number" step="any"
                            style={classic ? { ...xpInput, width: '100%' } : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={adjustQty}
                            onChange={e => setAdjustQty(e.target.value)}
                        />
                        <div style={{ fontSize: 10, color: delta < 0 ? '#c00000' : '#2d7a2d', marginTop: 2 }}>
                            New on hand: <b>{newQty}</b> {t.item_uom || ''} ({delta >= 0 ? '+' : ''}{delta})
                        </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>
                            {pkgLabel} <span style={{ color: '#888', fontWeight: 'normal' }}>(optional)</span>
                        </label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {([
                                ['Cones', adjustCones, setAdjustCones],
                                ['Boxes', adjustBoxes, setAdjustBoxes],
                                ['Drums', adjustDrums, setAdjustDrums],
                            ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                                <div key={lbl} style={{ flex: 1 }}>
                                    <input
                                        type="number" step="1" placeholder={lbl} title={lbl}
                                        style={classic ? { ...xpInput, width: '100%' } : undefined}
                                        className={classic ? '' : 'form-control form-control-sm'}
                                        value={val}
                                        onChange={e => set(e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Reason</label>
                        <select
                            style={classic ? { ...xpSelect, width: '100%' } : undefined}
                            className={classic ? '' : 'form-select form-select-sm'}
                            value={adjustReason}
                            onChange={e => setAdjustReason(e.target.value)}
                        >
                            {ADJUST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div style={{ marginBottom: 4 }}>
                        <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>
                            Note <span style={{ color: '#888', fontWeight: 'normal' }}>(optional)</span>
                        </label>
                        <input
                            type="text" placeholder="e.g. spoiled in transit"
                            style={classic ? { ...xpInput, width: '100%' } : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={adjustNote}
                            onChange={e => setAdjustNote(e.target.value)}
                        />
                    </div>
                </div>
            </ModalWrapper>
        );
    })();

    const newEntryModal = newOpen && (
        <ModalWrapper
            isOpen={newOpen}
            modeless
            onClose={() => setNewOpen(false)}
            title="New Stock Entry"
            size="sm"
            footer={<>
                <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setNewOpen(false)}>Cancel</button>
                <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-success'} onClick={handleNewEntry} disabled={savingNew}>
                    {savingNew ? 'Saving...' : 'Save Entry'}
                </button>
            </>}
        >
            <div style={{ fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : undefined }}>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Item</label>
                    <SearchableSelect
                        options={items.map((it: any) => ({ value: it.code, label: it.name, subLabel: it.code }))}
                        onSearch={onSearchItems}
                        value={newItemCode}
                        onChange={(code: string) => { setNewItemCode(code); setNewAttrIds([]); }}
                        placeholder="Search item..."
                        size="sm"
                    />
                </div>
                {newBoundAttrs.map((attr: any) => (
                    <div key={attr.id} style={{ marginBottom: 6 }}>
                        <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>{attr.name}</label>
                        <select
                            style={classic ? { ...xpSelect, width: '100%' } : undefined}
                            className={classic ? '' : 'form-select form-select-sm'}
                            value={newAttrIds.find(vid => attr.values.some((v: any) => v.id === vid)) || ''}
                            onChange={e => setNewAttrValue(e.target.value, attr.id)}
                        >
                            <option value="">Select {attr.name}...</option>
                            {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                        </select>
                    </div>
                ))}
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Location</label>
                    <TreeSelect
                        options={locPickerTreeOptions}
                        value={newLocId}
                        onChange={setNewLocId}
                        placeholder="— select location —"
                        style={{ width: '100%' }}
                        size="sm"
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Quantity <span style={{ color: '#888', fontWeight: 'normal' }}>(negative to subtract)</span></label>
                    <input
                        type="number" step="any"
                        style={classic ? { ...xpInput, width: '100%' } : undefined}
                        className={classic ? '' : 'form-control form-control-sm'}
                        value={newQty}
                        onChange={e => setNewQty(e.target.value)}
                    />
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>
                        Packaging <span style={{ color: '#888', fontWeight: 'normal' }}>(optional)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {([
                            ['Cones', newCones, setNewCones],
                            ['Boxes', newBoxes, setNewBoxes],
                            ['Drums', newDrums, setNewDrums],
                        ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                            <div key={lbl} style={{ flex: 1 }}>
                                <input
                                    type="number" step="1" placeholder={lbl} title={lbl}
                                    style={classic ? { ...xpInput, width: '100%' } : undefined}
                                    className={classic ? '' : 'form-control form-control-sm'}
                                    value={val}
                                    onChange={e => set(e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Reason</label>
                    <select
                        style={classic ? { ...xpSelect, width: '100%' } : undefined}
                        className={classic ? '' : 'form-select form-select-sm'}
                        value={newReason}
                        onChange={e => setNewReason(e.target.value)}
                    >
                        {NEW_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <div style={{ marginBottom: 4 }}>
                    <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Note <span style={{ color: '#888', fontWeight: 'normal' }}>(optional)</span></label>
                    <input
                        type="text"
                        style={classic ? { ...xpInput, width: '100%' } : undefined}
                        className={classic ? '' : 'form-control form-control-sm'}
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                    />
                </div>
            </div>
        </ModalWrapper>
    );

    if (classic) {
        return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
                <div style={{ ...xpBevel, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={xpTitleBar}>
                        <span><i className="bi bi-boxes" style={{ marginRight: 6 }} />{t('stock_on_hand') || 'Stock On-Hand'}</span>
                        <span style={{ fontSize: '10px', opacity: 0.85 }}>{filtered.length} records</span>
                    </div>
                    <div style={xpToolbar}>
                        <i className="bi bi-search" style={{ fontSize: '11px', color: '#666' }} />
                        <input
                            style={{ ...xpInput, width: 180 }}
                            placeholder="Search item, location, lot, notes..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <div style={xpSep} />
                        <TreeSelect
                            options={catTreeOptions}
                            value={selectedCat}
                            onChange={setSelectedCat}
                            allowEmpty
                            emptyLabel="All Categories"
                            style={{ width: 180 }}
                        />
                        {effectiveCat && <button style={xpBtn()} onClick={clearCats} title="Clear category filter">Clear</button>}
                        <div style={xpSep} />
                        <TreeSelect
                            options={locFilterTreeOptions}
                            value={locSelectValue}
                            onChange={onLocSelect}
                            allowEmpty
                            emptyLabel="All Locations"
                            style={{ width: 200 }}
                        />
                        <div style={xpSep} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: xpFont, fontSize: '11px', color: '#000', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            title="Hide QC-rejected lots — they are physically in stock but not usable">
                            <input type="checkbox" checked={hideRejected} onChange={e => setHideRejected(e.target.checked)} style={{ margin: 0 }} />
                            Hide rejected
                        </label>
                        <div style={xpSep} />
                        <button style={xpBtn()} onClick={onRefresh} title="Refresh">
                            <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
                        </button>
                        {canRebuild && (
                            <button style={xpBtn()} onClick={handleRebuild} disabled={rebuilding} title="Recompute stock balances from the ledger (use if balances look stale)">
                                <i className="bi bi-arrow-repeat" style={{ marginRight: 4 }} />{rebuilding ? 'Rebuilding...' : 'Rebuild'}
                            </button>
                        )}
                        {canEntry && (
                            <button style={xpBtn({ background: 'linear-gradient(to bottom,#d8f0d8,#8fc98f)', fontWeight: 'bold' })} onClick={openNew} title="Add stock for an item (new manual entry)">
                                <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />New Entry
                            </button>
                        )}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff', minHeight: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer', width: '15%' }} onClick={() => toggleSort('item')} title="Sort">Item<SortMark sort={sort} colKey="item" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer', width: '9%' }} onClick={() => toggleSort('itemCategory')} title="Sort">Item Category<SortMark sort={sort} colKey="itemCategory" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer', width: '12%' }} onClick={() => toggleSort('location')} title="Sort">{t('locations') || 'Location'}<SortMark sort={sort} colKey="location" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer', width: '9%' }} onClick={() => toggleSort('batch')} title="Sort">Lot<SortMark sort={sort} colKey="batch" /></th>
                                    <th style={{ ...xpTableHeader, width: '10%' }}>{t('attributes') || 'Attributes'}</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right', cursor: 'pointer', width: '8%' }} onClick={() => toggleSort('qty')} title="Sort">{t('qty') || 'Qty'}<SortMark sort={sort} colKey="qty" /></th>
                                    <th style={{ ...xpTableHeader, width: '5%' }}>UOM</th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer', width: '9%' }} onClick={() => toggleSort('packaging')} title="Sort">Packaging<SortMark sort={sort} colKey="packaging" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer', width: '13%' }} onClick={() => toggleSort('notes')} title="Sort">Notes<SortMark sort={sort} colKey="notes" /></th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right', width: '5%' }}>Ends</th>
                                    <th style={{ ...xpTableHeader, width: '5%', borderRight: 'none' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map((bal: any, i: number) => renderRow(bal, i))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={11} style={{ textAlign: 'center', padding: '24px' }}>
                                            {loading ? <XPLoading label="Loading stock balances..." /> : (
                                                <span style={{ fontFamily: xpFont, fontSize: '11px', color: '#666', fontStyle: 'italic' }}>No stock records found</span>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div style={{
                        background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                        padding: '2px 8px', display: 'flex', gap: 16,
                        fontFamily: xpFont, fontSize: '11px', color: '#333',
                    }}>
                        <span><b>{filtered.length}</b> rows</span>
                        {negativeCount > 0 && <span style={{ color: '#c00000' }}><b>{negativeCount}</b> negative</span>}
                        {rejectedCount > 0 && (
                            <span style={{ color: '#7a1010' }} title="QC-rejected lots included in the rows above — physically present, not usable">
                                <b>{rejectedCount}</b> rejected ({rejectedQty.toLocaleString('en-US', { maximumFractionDigits: 3 })})
                            </span>
                        )}
                        <span style={{ marginLeft: 'auto', color: '#666' }}>Total: {(stockBalance || []).length} SKUs</span>
                    </div>
                    <Pager page={clampedPage} total={sortedRows.length} pageSize={STOCK_PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
                </div>
                {transferModal}
                {adjustModal}
                {newEntryModal}
            </div>
        );
    }

    // ── Modern (Bootstrap) mode ───────────────────────────────────────────────
    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
            <div className="card shadow-sm border-0" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <div className="card-header bg-primary bg-opacity-10 text-primary-emphasis d-flex justify-content-between align-items-center py-3">
                    <h5 className="card-title mb-0"><i className="bi bi-boxes me-2" />{t('stock_on_hand') || 'Stock On-Hand'}</h5>
                    <span className="badge bg-primary bg-opacity-25 text-primary-emphasis">{filtered.length} records</span>
                </div>
                <div className="card-body pb-0" style={{ flexShrink: 0 }}>
                    <div className="row g-2 mb-3">
                        <div className="col-md-3">
                            <input
                                className="form-control form-control-sm"
                                placeholder="Search item, location, category, lot, notes..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="col-md-3">
                            <TreeSelect
                                options={catTreeOptions}
                                value={selectedCat}
                                onChange={setSelectedCat}
                                allowEmpty
                                emptyLabel="All Categories"
                                size="sm"
                            />
                        </div>
                        <div className="col-md-1">
                            <button className="btn btn-outline-secondary btn-sm w-100" onClick={clearCats} disabled={!effectiveCat} title="Clear category filter">Clear</button>
                        </div>
                        <div className="col-md-3">
                            <TreeSelect
                                options={locFilterTreeOptions}
                                value={locSelectValue}
                                onChange={onLocSelect}
                                allowEmpty
                                emptyLabel="All Locations"
                                size="sm"
                            />
                        </div>
                        <div className="col-md-2 d-flex align-items-center">
                            <div className="form-check mb-0" title="Hide QC-rejected lots — they are physically in stock but not usable">
                                <input className="form-check-input" type="checkbox" id="sohHideRejected" checked={hideRejected} onChange={e => setHideRejected(e.target.checked)} />
                                <label className="form-check-label small" htmlFor="sohHideRejected">Hide rejected</label>
                            </div>
                        </div>
                        <div className="col-md-2">
                            <button className="btn btn-outline-secondary btn-sm w-100" onClick={onRefresh}>
                                <i className="bi bi-arrow-clockwise me-1" />Refresh
                            </button>
                        </div>
                        {canRebuild && (
                            <div className="col-md-2">
                                <button className="btn btn-outline-secondary btn-sm w-100" onClick={handleRebuild} disabled={rebuilding} title="Recompute stock balances from the ledger (use if balances look stale)">
                                    <i className="bi bi-arrow-repeat me-1" />{rebuilding ? 'Rebuilding...' : 'Rebuild'}
                                </button>
                            </div>
                        )}
                        {canEntry && (
                            <div className="col-md-2">
                                <button className="btn btn-success btn-sm w-100" onClick={openNew} title="Add stock for an item (new manual entry)">
                                    <i className="bi bi-plus-lg me-1" />New Entry
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    <table className="table table-hover table-sm mb-0" style={{ tableLayout: 'fixed' }}>
                        <thead className="table-light">
                            <tr>
                                <th style={{ cursor: 'pointer', width: '15%', ...colDivider }} onClick={() => toggleSort('item')} title="Sort">Item<SortMark sort={sort} colKey="item" /></th>
                                <th style={{ cursor: 'pointer', width: '9%', ...colDivider }} onClick={() => toggleSort('itemCategory')} title="Sort">Item Category<SortMark sort={sort} colKey="itemCategory" /></th>
                                <th style={{ cursor: 'pointer', width: '12%', ...colDivider }} onClick={() => toggleSort('location')} title="Sort">{t('locations') || 'Location'}<SortMark sort={sort} colKey="location" /></th>
                                <th style={{ cursor: 'pointer', width: '9%', ...colDivider }} onClick={() => toggleSort('batch')} title="Sort">Lot<SortMark sort={sort} colKey="batch" /></th>
                                <th style={{ width: '10%', ...colDivider }}>{t('attributes') || 'Attributes'}</th>
                                <th className="text-end" style={{ cursor: 'pointer', width: '8%', ...colDivider }} onClick={() => toggleSort('qty')} title="Sort">{t('qty') || 'Qty'}<SortMark sort={sort} colKey="qty" /></th>
                                <th style={{ width: '5%', ...colDivider }}>UOM</th>
                                <th style={{ cursor: 'pointer', width: '9%', ...colDivider }} onClick={() => toggleSort('packaging')} title="Sort">Packaging<SortMark sort={sort} colKey="packaging" /></th>
                                <th style={{ cursor: 'pointer', width: '13%', ...colDivider }} onClick={() => toggleSort('notes')} title="Sort">Notes<SortMark sort={sort} colKey="notes" /></th>
                                <th className="text-end" style={{ width: '5%', ...colDivider }}>Ends</th>
                                <th style={{ width: '5%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageRows.map((bal: any, i: number) => renderRow(bal, i))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="text-center text-muted py-4">
                                        {loading ? <XPLoading label="Loading stock balances..." /> : 'No stock records found'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="card-footer text-muted d-flex gap-3 small" style={{ flexShrink: 0 }}>
                    <span><b>{filtered.length}</b> rows match</span>
                    {negativeCount > 0 && <span className="text-danger"><b>{negativeCount}</b> negative</span>}
                    {rejectedCount > 0 && (
                        <span className="text-danger" title="QC-rejected lots included in the rows above — physically present, not usable">
                            <b>{rejectedCount}</b> rejected ({rejectedQty.toLocaleString('en-US', { maximumFractionDigits: 3 })})
                        </span>
                    )}
                    <span className="ms-auto">Total: {(stockBalance || []).length} SKUs</span>
                </div>
                <Pager page={clampedPage} total={sortedRows.length} pageSize={STOCK_PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
            </div>
            {transferModal}
            {adjustModal}
            {newEntryModal}
        </div>
    );
}
