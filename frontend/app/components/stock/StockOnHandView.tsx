import { useState, useMemo, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserContext';
import { SortMark, SortState, TableSkeleton, useTableSkeletonMetrics, XPActionButton, FormSection, FieldLabel, CodeChip, CODE_FONT, xpFont } from '../shared/xpTheme';
import { usePaginatedFetch } from '../../context/usePaginatedList';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar, xpToolbar as sharedXpToolbar, SearchField, ToolbarButton } from '../shared/shellTheme';
import { useToast } from '../shared/Toast';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import TreeSelect, { buildLocationFilterTree, buildLocationPickerTree, buildCategoryTree } from '../shared/TreeSelect';
import { lvThead } from '../shared/listViewTheme';

const STOCK_PAGE_SIZE = 50;

// Row actions are icon-only (project convention, see BatchesView) so the tooltip is
// the only label the operator gets — keep these explicit about what each one does.
const ADJUST_TITLE = 'Adjust quantity — cycle count or correction';
const MOVE_TITLE = 'Move — transfer this stock to another location';

interface StockOnHandViewProps {
    locations: any[];
    attributes: any[];
    categories: any[];
    items?: any[];
    onSearchItems?: (term: string) => void;
    /** DataContext-wide refresh, wired to the toolbar Refresh button alongside the
     *  grid's own refetch. The grid rows come from /stock/balance/paginated, NOT from
     *  DataContext's `stockBalance` (that array is the plant-wide lookup feed for
     *  manufacturing material availability and must stay unpaginated). */
    onRefresh: () => void;
    authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
    apiBase: string;
}

// Fixed px column widths + a table min-width: the grid scrolls horizontally instead of
// squeezing chip columns (Lot carries MO codes ~30 chars) into overlapping percentages.
const COL_W = {
    check: 34, item: 230, category: 140, location: 190, lot: 220, attrs: 150,
    qty: 110, uom: 60, packaging: 130, notes: 190, ends: 60, actions: 74,
};
const TABLE_MIN_WIDTH = Object.values(COL_W).reduce((a, b) => a + b, 0);

export default function StockOnHandView({ locations, attributes, categories, items = [], onSearchItems, onRefresh, authFetch, apiBase }: StockOnHandViewProps) {
    const { uiStyle } = useTheme();
    const { t } = useLanguage();
    const { showToast } = useToast();
    const { hasPermission, hasAnyPermission } = useUser();
    const canEntry = hasAnyPermission('stock_on_hand.create', 'stock_on_hand.adjust', 'stock_on_hand.move');
    const canRebuild = hasPermission('admin.access');
    const classic = uiStyle === 'classic';

    const [locationFilter, setLocationFilter] = useState('');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [selectedCat, setSelectedCat] = useState('');
    // QC-rejected lots stay physically in their location until disposed, so they are
    // shown by default (the table is the physical truth) but flagged, and hideable
    // for anyone reading the table as available stock.
    const [hideRejected, setHideRejected] = useState(false);
    // Sort is a server param (the grid only holds one page), so the column-header
    // toggle drives this state instead of useSortable's in-memory comparator.
    const [sort, setSort] = useState<SortState>(null);
    const toggleSort = (key: string) => setSort(prev =>
        prev?.key !== key ? { key, dir: 1 }
        : prev.dir === 1 ? { key, dir: -1 }
        : null
    );

    // Transfer modal state
    const [transferTarget, setTransferTarget] = useState<any>(null);
    const [transferToLoc, setTransferToLoc] = useState('');
    const [transferQty, setTransferQty] = useState('');
    const [transferCones, setTransferCones] = useState('');
    const [transferBoxes, setTransferBoxes] = useState('');
    const [transferDrums, setTransferDrums] = useState('');
    const [transferring, setTransferring] = useState(false);

    // Multi-select + combined move. Selection is keyed by the balance-row identity
    // (item + location + lot + variant) and holds the row object itself, so a pick
    // survives paging, sorting and filter changes.
    const [selected, setSelected] = useState<Record<string, any>>({});
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkToLoc, setBulkToLoc] = useState('');
    const [bulkQty, setBulkQty] = useState<Record<string, string>>({});
    const [bulkMoving, setBulkMoving] = useState(false);

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
            if (res.ok) { showToast('Stock balances rebuilt from ledger', 'success'); reload(); }
            else { showToast(`Rebuild failed (HTTP ${res.status})`, 'danger'); }
        } catch { showToast('Rebuild failed — network error', 'danger'); }
        finally { setRebuilding(false); }
    };

    // Mirrors the stock_balances grain: (item, location, variant, lot).
    const rowKey = (bal: any) =>
        `${bal.item_id}|${bal.location_id}|${bal.batch_key || ''}|${[...(bal.attribute_value_ids || [])].sort().join(',')}`;

    const selectedKeys = Object.keys(selected);
    const selectedRows = useMemo(
        () => selectedKeys.map(k => selected[k]),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selected]
    );
    // Only positive-qty rows can be moved; a zero/negative row has nothing to send.
    const movable = (bal: any) => bal.qty > 0;
    const toggleRow = (bal: any) => {
        const k = rowKey(bal);
        setSelected(prev => {
            const next = { ...prev };
            if (next[k]) delete next[k]; else next[k] = bal;
            return next;
        });
    };
    const clearSelection = () => setSelected({});

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
            reload();
        } catch (err: any) {
            showToast(err.message, 'danger');
        } finally {
            setTransferring(false);
        }
    };

    const openBulkMove = () => {
        const qtys: Record<string, string> = {};
        for (const k of selectedKeys) qtys[k] = String(selected[k].qty);
        setBulkQty(qtys);
        setBulkToLoc('');
        setBulkOpen(true);
    };

    const dropBulkRow = (k: string) => {
        setSelected(prev => { const n = { ...prev }; delete n[k]; return n; });
        setBulkQty(prev => { const n = { ...prev }; delete n[k]; return n; });
    };

    const handleBulkMove = async () => {
        if (!bulkToLoc) { showToast('Select a destination location', 'danger'); return; }
        const lines: any[] = [];
        for (const k of selectedKeys) {
            const bal = selected[k];
            const qty = parseFloat(bulkQty[k]);
            if (!qty || qty <= 0) { showToast(`${bal.item_name}: enter a positive quantity`, 'danger'); return; }
            if (qty > bal.qty) { showToast(`${bal.item_name}: only ${bal.qty} on hand`, 'danger'); return; }
            if (String(bal.location_id) === bulkToLoc) { showToast(`${bal.item_name} is already in the destination location`, 'danger'); return; }
            // Packaging tallies are independent counts, not derivable from a trimmed
            // qty — so they only ride along on a whole-row move. Partial moves that
            // need container counts go through the single-row Move dialog.
            const whole = qty === bal.qty;
            lines.push({
                item_id: bal.item_id,
                from_location_id: bal.location_id,
                qty,
                batch_id: bal.batch_key || null,
                attribute_value_ids: bal.attribute_value_ids || [],
                qty_cones: whole ? (bal.qty_cones || null) : null,
                qty_boxes: whole ? (bal.qty_boxes || null) : null,
                qty_drums: whole ? (bal.qty_drums || null) : null,
            });
        }
        if (!lines.length) { showToast('Nothing selected', 'danger'); return; }
        setBulkMoving(true);
        try {
            const res = await authFetch(`${apiBase}/stock/transfer/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_location_id: bulkToLoc, lines }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Combined move failed');
            }
            const body = await res.json().catch(() => ({}));
            showToast(body.message || `Moved ${lines.length} rows`, 'success');
            setBulkOpen(false);
            clearSelection();
            reload();
        } catch (err: any) {
            showToast(err.message, 'danger');
        } finally {
            setBulkMoving(false);
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
            reload();
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
            reload();
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

    // ── Server-paginated rows ─────────────────────────────────────────────────
    // The grid reads /stock/balance/paginated, NOT DataContext's `stockBalance`:
    // that array is the plant-wide lookup feed manufacturing nets material
    // availability from, so it must stay unpaginated (see the note on the endpoint).
    // Filtering, sorting and the page window are all applied in SQL; the footer
    // aggregates come back as envelope extras because they must describe the whole
    // filtered set, not this page.
    const categoryParam = useMemo(() => (catMatchSet ? Array.from(catMatchSet).join(',') : ''), [catMatchSet]);
    const {
        rows: pageRows, total, meta, loading, page, setPage,
        searchInput: search, setSearch, refetch,
    } = usePaginatedFetch<any>({
        endpoint: `${apiBase}/stock/balance/paginated`,
        authFetch,
        pageSize: STOCK_PAGE_SIZE,
        params: {
            location_id: locationFilter,
            warehouse_id: warehouseFilter,
            category_id: categoryParam,
            hide_rejected: hideRejected,
            sort_by: sort?.key,
            sort_dir: sort ? (sort.dir === 1 ? 'asc' : 'desc') : '',
        },
        onError: m => showToast(m, 'danger'),
    });
    // Post-mutation reload. The grid's own page is what the operator is looking at;
    // DataContext's shared feed follows the STOCK_UPDATE broadcast the mutation
    // endpoints emit, so it does not need a second full pull here.
    const reload = () => refetch();

    const negativeCount = Number(meta.negative_count || 0);
    const rejectedCount = Number(meta.rejected_count || 0);
    // Rejected qty is physically present but unusable — call the number out so the
    // row total is never read as available stock.
    const rejectedQty = Number(meta.rejected_qty || 0);
    // Unfiltered balance-row count ("Total: N SKUs"), served as an aggregate since the
    // client no longer holds every row.
    const totalRows = Number(meta.total_rows || 0);

    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them. Classic and modern
    // rows differ in height, so they cache under separate keys.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skel = useTableSkeletonMetrics(classic ? 'stock-on-hand-classic' : 'stock-on-hand', listBodyRef, pageRows.length > 0);

    // Header checkbox acts on the visible page only — selecting 4000 filtered rows
    // in one click is never what the operator meant.
    const pageMovable = useMemo(() => pageRows.filter(movable), [pageRows]);
    const allPageSelected = pageMovable.length > 0 && pageMovable.every((b: any) => selected[rowKey(b)]);
    const togglePageSelection = () => {
        setSelected(prev => {
            const next = { ...prev };
            if (allPageSelected) { for (const b of pageMovable) delete next[rowKey(b)]; }
            else { for (const b of pageMovable) next[rowKey(b)] = b; }
            return next;
        });
    };

    // ── XP style helpers ─────────────────────────────────────────────────────
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
        ...lvThead(true),
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

    // Identity block every stock modal opens with: which item/lot/location is being
    // touched, and how much of it is there right now.
    const stockContextSection = (bal: any, locPrefix: string, qtyLabel: string) => (
        <FormSection title="Stock" classic={classic}>
            <div style={{ fontWeight: 'bold' }}>{bal.item_name}</div>
            <div style={{ fontSize: 10, color: '#666' }}>
                {locPrefix}: {bal.location_name || getLocationName(bal.location_id)}
                {bal.batch_key ? ` · Lot: ${bal.batch_number || bal.batch_key}` : ''}
                {' · '}{qtyLabel}: {bal.qty} {bal.item_uom || ''}
            </div>
        </FormSection>
    );

    // Packaging tallies (cones/boxes/drums) are independent counts, never UOM conversions —
    // so the unit has to stay readable AFTER a number is typed. A placeholder alone vanishes
    // on the first keystroke and leaves three unlabelled boxes; every kind gets a real label.
    const packagingInputs = (rows: [string, string, (v: string) => void][], allowNegative = false) => (
        <div style={{ display: 'flex', gap: 6 }}>
            {rows.map(([lbl, val, set]) => (
                <div key={lbl} style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={classic
                            ? { fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#2b2822', marginBottom: 1 }
                            : undefined}
                        className={classic ? '' : 'form-label small fw-semibold mb-0'}
                    >
                        {lbl}
                    </div>
                    <input
                        type="number" step="1" min={allowNegative ? undefined : '0'} placeholder="0" title={lbl}
                        style={classic ? { ...xpInput, width: '100%' } : undefined}
                        className={classic ? '' : 'form-control form-control-sm'}
                        value={val}
                        onChange={e => set(e.target.value)}
                    />
                </div>
            ))}
        </div>
    );

    const renderRow = (bal: any, i: number) => {
        const batchLabel = bal.batch_key ? (bal.batch_number || bal.batch_key) : '-';
        // QC-rejected/disposed lots sit in the same bin as good stock — tint the row
        // and flag the lot so the qty is never mistaken for available.
        const qStatus: string = bal.quality_status && bal.quality_status !== 'GOOD' ? bal.quality_status : '';
        const qtyColor = bal.qty < 0 ? '#c00000' : qStatus ? '#8b0000' : '#00008b';
        const rk = rowKey(bal);
        const checkCell = (
            <input
                type="checkbox"
                style={{ margin: 0, cursor: movable(bal) ? 'pointer' : 'not-allowed' }}
                checked={!!selected[rk]}
                disabled={!movable(bal)}
                title={movable(bal) ? 'Select for a combined move' : 'Nothing on hand to move'}
                onChange={() => toggleRow(bal)}
            />
        );

        return (
            <tr key={`${bal.item_id}-${bal.location_id}-${bal.batch_key}-${i}`}
                className={classic ? undefined : (selected[rk] ? 'table-primary' : qStatus ? 'table-danger' : undefined)}
                title={qStatus ? `Lot is QC ${qStatus} — physically in stock but excluded from netting and consumption pickers` : undefined}
                style={classic ? { background: selected[rk] ? (i % 2 === 0 ? '#e8f0fb' : '#dee9f7') : qStatus ? (i % 2 === 0 ? '#fdf0f0' : '#f8e8e8') : (i % 2 === 0 ? '#ffffff' : '#f5f3ee'), borderBottom: '1px solid #c0bdb5' } : undefined}>
                <td className={classic ? undefined : 'text-center'} style={classic ? { padding: '4px 6px', textAlign: 'center', ...colDivider } : colDivider}>{checkCell}</td>
                <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, overflow: 'hidden', ...colDivider } : { overflow: 'hidden', ...colDivider }}>
                    <div title={bal.item_name}
                        style={classic ? { fontSize: '11px', fontWeight: 'bold', color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                        className={classic ? undefined : 'fw-medium text-truncate'}>{bal.item_name}</div>
                    <CodeChip code={bal.item_code} classic={classic} tier={2}
                        style={classic ? { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}
                        className={classic ? undefined : 'text-truncate d-block'} />
                    {(getComboLabel(bal) || bal.size_label) && (
                        <div style={classic ? { display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 } : undefined} className={classic ? undefined : 'd-flex flex-wrap gap-1 mt-1'}>
                            {getComboLabel(bal) && (
                                <span
                                    style={classic ? { fontSize: 8, padding: '0 4px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 2, fontWeight: 700, lineHeight: '14px' } : { fontSize: 9 }}
                                    className={classic ? undefined : 'badge bg-primary bg-opacity-10 text-primary'}
                                    title={`Combo: ${getComboLabel(bal)}`}>
                                    {getComboLabel(bal)}
                                </span>
                            )}
                            {bal.size_label && (
                                <span
                                    style={classic ? { fontSize: 8, padding: '0 4px', background: '#dcfce7', color: '#15803d', borderRadius: 2, fontWeight: 700, lineHeight: '14px' } : { fontSize: 9 }}
                                    className={classic ? undefined : 'badge bg-success bg-opacity-10 text-success'}
                                    title={`Size: ${bal.size_label}`}>
                                    <i className="bi bi-rulers me-1" style={classic ? { fontSize: 7 } : undefined}></i>{bal.size_label}
                                </span>
                            )}
                        </div>
                    )}
                </td>
                <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '11px', maxWidth: 140, ...colDivider } : { maxWidth: 140, ...colDivider }}>
                    {bal.item_category_name ? (
                        <span title={bal.item_category_name}
                            style={classic
                                ? { display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', background: '#e4eef0', border: '1px solid #8fb3bb', padding: '0 5px', fontSize: '10px', color: '#2a464a' }
                                : { display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
                            className={classic ? undefined : 'badge bg-info-subtle text-info-emphasis'}>
                            {bal.item_category_name}
                        </span>
                    ) : (
                        <span style={classic ? { fontSize: '10px', color: '#999', fontStyle: 'italic' } : undefined} className={classic ? undefined : 'text-muted'}>—</span>
                    )}
                </td>
                <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '11px', overflow: 'hidden', ...colDivider } : { overflow: 'hidden', ...colDivider }}>
                    <div style={classic ? { display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: '100%' } : { maxWidth: '100%' }} className={classic ? undefined : 'd-flex flex-wrap gap-1'}>
                        {getWarehouseName(bal.location_id) && (
                            <span title={getWarehouseName(bal.location_id)}
                                style={classic
                                    ? { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#eef0e4', border: '1px solid #b7bb8f', padding: '0 5px', fontSize: '10px', color: '#4a4a2a' }
                                    : { maxWidth: '100%' }}
                                className={classic ? undefined : 'badge bg-secondary-subtle text-secondary-emphasis text-truncate'}>
                                {getWarehouseName(bal.location_id)}
                            </span>
                        )}
                        <span title={bal.location_name || getLocationName(bal.location_id)}
                            style={classic
                                ? { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#e8e1f0', border: '1px solid #a890c0', padding: '0 5px', fontSize: '10px', color: '#3a2a4a' }
                                : { maxWidth: '100%' }}
                            className={classic ? undefined : 'badge bg-primary-subtle text-primary-emphasis text-truncate'}>
                            {bal.location_name || getLocationName(bal.location_id)}
                        </span>
                    </div>
                </td>
                <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '11px', overflow: 'hidden', ...colDivider } : { overflow: 'hidden', ...colDivider }}>
                    {bal.batch_key ? (
                        <div style={classic ? { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', maxWidth: '100%' } : { maxWidth: '100%' }}
                            className={classic ? undefined : 'd-flex flex-column gap-1 align-items-start'}>
                            <span title={batchLabel}
                                style={classic
                                    ? { display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', background: '#fff8dc', border: '1px solid #c8a000', padding: '0 5px', fontSize: '10px', color: '#5a3c00', whiteSpace: 'nowrap' }
                                    : { maxWidth: '100%' }}
                                className={classic ? undefined : 'badge bg-warning text-dark d-block text-truncate'}>
                                {batchLabel}
                            </span>
                            {bal.vendor_lot && (
                                <span title={`Supplier lot: ${bal.vendor_lot}`}
                                    style={classic
                                        ? { display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', background: '#f0ece0', border: '1px solid #b0a890', padding: '0 5px', fontFamily: CODE_FONT, fontSize: '10px', color: '#4a4438', whiteSpace: 'nowrap' }
                                        : { fontFamily: CODE_FONT, maxWidth: '100%' }}
                                    className={classic ? undefined : 'badge bg-secondary-subtle text-secondary-emphasis d-block text-truncate'}>
                                    SUP {bal.vendor_lot}
                                </span>
                            )}
                            {bal.mo_code && (
                                <span title={`Produced by MO ${bal.mo_code}${bal.wo_code ? ` (WO ${bal.wo_code})` : ''}`}
                                    style={classic
                                        ? { display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', background: '#e4f0e4', border: '1px solid #8fbb8f', padding: '0 5px', fontFamily: CODE_FONT, fontSize: '10px', color: '#2a4a2a', whiteSpace: 'nowrap' }
                                        : { fontFamily: CODE_FONT, maxWidth: '100%' }}
                                    className={classic ? undefined : 'badge bg-success-subtle text-success-emphasis d-block text-truncate'}>
                                    MO {bal.mo_code}
                                </span>
                            )}
                            {qStatus && (
                                <span title="QC rejected — not usable stock, excluded from netting and consumption pickers"
                                    style={classic
                                        ? { display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', background: '#f8d7d7', border: '1px solid #a03030', padding: '0 5px', fontSize: '10px', fontWeight: 'bold', color: '#7a1010', whiteSpace: 'nowrap' }
                                        : { maxWidth: '100%' }}
                                    className={classic ? undefined : 'badge bg-danger d-block text-truncate'}>
                                    <i className={classic ? 'bi bi-x-octagon-fill' : 'bi bi-x-octagon-fill me-1'} style={classic ? { marginRight: 3, fontSize: 9 } : undefined} />{qStatus}
                                </span>
                            )}
                        </div>
                    ) : (
                        <span style={classic ? { fontSize: '10px', color: '#999', fontStyle: 'italic' } : undefined} className={classic ? undefined : 'text-muted'}>-</span>
                    )}
                </td>
                <td style={classic ? { padding: '4px 8px', ...colDivider } : colDivider}>
                    <div style={classic ? { display: 'flex', flexWrap: 'wrap', gap: 3 } : undefined}>
                        {bal.attribute_value_ids?.length > 0 ? (
                            bal.attribute_value_ids.map((vid: string) => (
                                <span key={vid}
                                    style={classic ? { background: '#dde8f5', border: '1px solid #7f9db9', padding: '0 4px', fontFamily: xpFont, fontSize: '10px', color: '#333' } : undefined}
                                    className={classic ? undefined : 'badge bg-info text-dark me-1'}>
                                    {getAttrValueName(vid)}
                                </span>
                            ))
                        ) : (
                            <span style={classic ? { fontFamily: xpFont, fontSize: '10px', color: '#888', fontStyle: 'italic' } : undefined} className={classic ? undefined : 'text-muted small'}>Standard</span>
                        )}
                    </div>
                </td>
                <td className={classic ? undefined : 'text-end fw-bold'}
                    style={classic
                        ? { padding: '4px 8px', textAlign: 'right', fontFamily: CODE_FONT, fontSize: '11px', fontWeight: 'bold', color: qtyColor, whiteSpace: 'nowrap', ...colDivider }
                        : { color: qtyColor, whiteSpace: 'nowrap', fontFamily: CODE_FONT, ...colDivider }}>
                    {Number(bal.qty).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                </td>
                <td className={classic ? undefined : 'text-muted small'} style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', color: '#666', whiteSpace: 'nowrap', ...colDivider } : { whiteSpace: 'nowrap', ...colDivider }}>
                    {bal.item_uom || ''}
                </td>
                <td className={classic ? undefined : 'small'} style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', whiteSpace: 'nowrap', ...colDivider } : { whiteSpace: 'nowrap', ...colDivider }}>
                    {pkgParts(bal).length === 0
                        ? <span style={classic ? { color: '#999' } : undefined} className={classic ? undefined : 'text-muted'}>-</span>
                        : pkgParts(bal).map((p, idx) => (
                            <span key={idx}
                                style={classic ? { color: p.n < 0 ? '#c00000' : '#5a3c00' } : undefined}
                                className={classic ? undefined : (p.n < 0 ? 'text-danger' : '')}>
                                {idx > 0 ? ' / ' : ''}{p.n} {p.label}
                            </span>
                        ))}
                </td>
                <td className={classic ? undefined : 'small'} style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', color: '#444', overflow: 'hidden', ...colDivider } : { overflow: 'hidden', ...colDivider }}>
                    {bal.batch_notes ? (
                        <span title={bal.batch_notes}
                            style={classic ? { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : undefined}
                            className={classic ? undefined : 'd-block text-truncate'}>
                            {bal.batch_notes}
                        </span>
                    ) : (
                        <span style={classic ? { color: '#999' } : undefined} className={classic ? undefined : 'text-muted'}>-</span>
                    )}
                </td>
                <td className={classic ? undefined : 'text-end small'} style={classic ? { padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', color: '#444', whiteSpace: 'nowrap', ...colDivider } : { whiteSpace: 'nowrap', ...colDivider }}>
                    {bal.item_ends != null ? bal.item_ends : ''}
                </td>
                <td style={classic ? { padding: '2px 6px', whiteSpace: 'nowrap' } : undefined}>
                    <div style={classic ? { display: 'flex', gap: 4 } : undefined} className={classic ? undefined : 'd-flex gap-1'}>
                        {canEntry && (
                            <XPActionButton classic={classic} tone="warning" icon="bi-sliders" title={ADJUST_TITLE} onClick={() => openAdjust(bal)} />
                        )}
                        {canEntry && bal.qty > 0 && (
                            <XPActionButton classic={classic} tone="primary" icon="bi-arrow-left-right" title={MOVE_TITLE} onClick={() => openTransfer(bal)} />
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
                {stockContextSection(transferTarget, 'From', 'Available')}
                <FormSection title="Move" classic={classic}>
                    <div style={{ marginBottom: 8 }}>
                        <FieldLabel classic={classic}>Destination</FieldLabel>
                        <TreeSelect
                            options={buildLocationPickerTree(locations, transferTarget.location_id)}
                            value={transferToLoc}
                            onChange={setTransferToLoc}
                            placeholder="— select location —"
                            style={{ width: '100%' }}
                            size="sm"
                        />
                    </div>
                    <div>
                        <FieldLabel classic={classic}>Quantity{transferTarget.item_uom ? ` (${transferTarget.item_uom})` : ''}</FieldLabel>
                        <input
                            type="number" min="0.0001" step="any"
                            style={classic ? { ...xpInput, width: '100%' } : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={transferQty}
                            onChange={e => setTransferQty(e.target.value)}
                        />
                    </div>
                </FormSection>
                <FormSection title="Packaging to move" classic={classic}>
                    <FieldLabel classic={classic} hint="Optional — how many of each container moves with the quantity above.">Containers</FieldLabel>
                    {packagingInputs([
                        ['Cones', transferCones, setTransferCones],
                        ['Boxes', transferBoxes, setTransferBoxes],
                        ['Drums', transferDrums, setTransferDrums],
                    ])}
                </FormSection>
            </div>
        </ModalWrapper>
    );

    // Combined move — one destination, many source rows. Each line keeps its own
    // lot/variant/source, so this is not a merge: it's N transfers in one commit.
    const bulkMoveModal = bulkOpen && (
        <ModalWrapper
            isOpen={bulkOpen}
            modeless
            onClose={() => setBulkOpen(false)}
            title={`Combined Move — ${selectedKeys.length} row${selectedKeys.length === 1 ? '' : 's'}`}
            size="lg"
            footer={<>
                <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setBulkOpen(false)}>Cancel</button>
                <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-primary'} onClick={handleBulkMove} disabled={bulkMoving || !selectedKeys.length}>
                    {bulkMoving ? 'Moving...' : `Move ${selectedKeys.length} row${selectedKeys.length === 1 ? '' : 's'}`}
                </button>
            </>}
        >
            <div style={{ fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : undefined }}>
                <FormSection title="Destination" classic={classic}>
                    <FieldLabel classic={classic} hint="Every selected row moves here. Sources, lots and variants are kept as they are.">Move to</FieldLabel>
                    <TreeSelect
                        options={locPickerTreeOptions}
                        value={bulkToLoc}
                        onChange={setBulkToLoc}
                        placeholder="— select location —"
                        style={{ width: '100%' }}
                        size="sm"
                    />
                </FormSection>
                <FormSection title="Rows to move" classic={classic}>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }} className={classic ? '' : 'table table-sm mb-0'}>
                            <thead>
                                <tr>
                                    <th style={classic ? xpTableHeader : undefined}>Item</th>
                                    <th style={classic ? xpTableHeader : undefined}>From</th>
                                    <th style={classic ? xpTableHeader : undefined}>Lot</th>
                                    <th style={classic ? { ...xpTableHeader, textAlign: 'right' } : undefined} className={classic ? '' : 'text-end'}>On hand</th>
                                    <th style={classic ? { ...xpTableHeader, width: 110 } : { width: 110 }}>Qty to move</th>
                                    <th style={classic ? { ...xpTableHeader, width: 28 } : { width: 28 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedRows.map((bal: any) => {
                                    const k = rowKey(bal);
                                    const q = parseFloat(bulkQty[k]);
                                    const bad = !q || q <= 0 || q > bal.qty;
                                    return (
                                        <tr key={k} style={classic ? { borderBottom: '1px solid #c0bdb5' } : undefined}>
                                            <td style={{ padding: '3px 6px' }}>
                                                <div style={{ fontWeight: 'bold' }}>{bal.item_name}</div>
                                                <CodeChip code={bal.item_code} classic={classic} tier={2} />
                                            </td>
                                            <td style={{ padding: '3px 6px' }}>{bal.location_name || getLocationName(bal.location_id)}</td>
                                            <td style={{ padding: '3px 6px', fontFamily: CODE_FONT, fontSize: 10 }}>
                                                <div>{bal.batch_key ? (bal.batch_number || bal.batch_key) : '-'}</div>
                                                {bal.mo_code && <div style={{ color: '#2a4a2a' }}>MO {bal.mo_code}</div>}
                                            </td>
                                            <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: CODE_FONT }}>
                                                {Number(bal.qty).toLocaleString('en-US', { maximumFractionDigits: 3 })} {bal.item_uom || ''}
                                            </td>
                                            <td style={{ padding: '3px 6px' }}>
                                                <input
                                                    type="number" min="0.0001" step="any" max={bal.qty}
                                                    style={classic ? { ...xpInput, width: '100%', borderColor: bad ? '#a03030' : undefined } : undefined}
                                                    className={classic ? '' : `form-control form-control-sm ${bad ? 'is-invalid' : ''}`}
                                                    value={bulkQty[k] ?? ''}
                                                    onChange={e => setBulkQty(prev => ({ ...prev, [k]: e.target.value }))}
                                                />
                                            </td>
                                            <td style={{ padding: '3px 6px' }}>
                                                <XPActionButton classic={classic} tone="danger" icon="bi-x-lg" title="Remove from this move" onClick={() => dropBulkRow(k)} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ fontSize: 10, color: '#666', marginTop: 6 }}>
                        Container tallies (cones/boxes/drums) move with a row only when the full on-hand quantity is sent.
                        For a partial move that also splits containers, use the single-row Move action.
                    </div>
                </FormSection>
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
                    {stockContextSection(t, 'Location', 'On hand')}
                    <FormSection title="Adjustment" classic={classic}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            {modeBtn('set', 'Set to (count)')}
                            {modeBtn('delta', 'Adjust by (+/-)')}
                        </div>
                        <div>
                            <FieldLabel classic={classic}>
                                {adjustMode === 'set' ? 'Counted quantity' : 'Quantity change (+/-)'}
                                {t.item_uom ? ` (${t.item_uom})` : ''}
                            </FieldLabel>
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
                    </FormSection>
                    <FormSection title={pkgLabel} classic={classic}>
                        <FieldLabel classic={classic} hint={adjustMode === 'set' ? 'Optional — counted containers, blank to leave untouched.' : 'Optional — container change, may be negative.'}>Containers</FieldLabel>
                        {packagingInputs([
                            ['Cones', adjustCones, setAdjustCones],
                            ['Boxes', adjustBoxes, setAdjustBoxes],
                            ['Drums', adjustDrums, setAdjustDrums],
                        ], adjustMode === 'delta')}
                    </FormSection>
                    <FormSection title="Why" classic={classic}>
                        <div style={{ marginBottom: 8 }}>
                            <FieldLabel classic={classic}>Reason</FieldLabel>
                            <select
                                style={classic ? { ...xpSelect, width: '100%' } : undefined}
                                className={classic ? '' : 'form-select form-select-sm'}
                                value={adjustReason}
                                onChange={e => setAdjustReason(e.target.value)}
                            >
                                {ADJUST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <FieldLabel classic={classic} hint="Optional">Note</FieldLabel>
                            <input
                                type="text" placeholder="e.g. spoiled in transit"
                                style={classic ? { ...xpInput, width: '100%' } : undefined}
                                className={classic ? '' : 'form-control form-control-sm'}
                                value={adjustNote}
                                onChange={e => setAdjustNote(e.target.value)}
                            />
                        </div>
                    </FormSection>
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
                <FormSection title="Item" classic={classic}>
                    <div style={{ marginBottom: newBoundAttrs.length ? 8 : 0 }}>
                        <FieldLabel classic={classic}>Item</FieldLabel>
                        <SearchableSelect
                            options={items.map((it: any) => ({ value: it.code, label: it.name, subLabel: it.code }))}
                            onSearch={onSearchItems}
                            value={newItemCode}
                            onChange={(code: string) => { setNewItemCode(code); setNewAttrIds([]); }}
                            placeholder="Search item..."
                            size="sm"
                        />
                    </div>
                    {newBoundAttrs.map((attr: any, i: number) => (
                        <div key={attr.id} style={{ marginBottom: i === newBoundAttrs.length - 1 ? 0 : 6 }}>
                            <FieldLabel classic={classic}>{attr.name}</FieldLabel>
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
                </FormSection>
                <FormSection title="Quantity" classic={classic}>
                    <div style={{ marginBottom: 8 }}>
                        <FieldLabel classic={classic}>Location</FieldLabel>
                        <TreeSelect
                            options={locPickerTreeOptions}
                            value={newLocId}
                            onChange={setNewLocId}
                            placeholder="— select location —"
                            style={{ width: '100%' }}
                            size="sm"
                        />
                    </div>
                    <div>
                        <FieldLabel classic={classic} hint="Negative to subtract">Quantity</FieldLabel>
                        <input
                            type="number" step="any"
                            style={classic ? { ...xpInput, width: '100%' } : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={newQty}
                            onChange={e => setNewQty(e.target.value)}
                        />
                    </div>
                </FormSection>
                <FormSection title="Packaging" classic={classic}>
                    <FieldLabel classic={classic} hint="Optional — container tallies booked alongside the quantity.">Containers</FieldLabel>
                    {packagingInputs([
                        ['Cones', newCones, setNewCones],
                        ['Boxes', newBoxes, setNewBoxes],
                        ['Drums', newDrums, setNewDrums],
                    ], true)}
                </FormSection>
                <FormSection title="Why" classic={classic}>
                    <div style={{ marginBottom: 8 }}>
                        <FieldLabel classic={classic}>Reason</FieldLabel>
                        <select
                            style={classic ? { ...xpSelect, width: '100%' } : undefined}
                            className={classic ? '' : 'form-select form-select-sm'}
                            value={newReason}
                            onChange={e => setNewReason(e.target.value)}
                        >
                            {NEW_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <FieldLabel classic={classic} hint="Optional">Note</FieldLabel>
                        <input
                            type="text"
                            style={classic ? { ...xpInput, width: '100%' } : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={newNote}
                            onChange={e => setNewNote(e.target.value)}
                        />
                    </div>
                </FormSection>
            </div>
        </ModalWrapper>
    );

    // Bootstrap grid (col-md-*) vs the flat XP toolbar are genuinely different layout
    // scaffolding, not duplicated content — wrap each control once here so the actual
    // control props/handlers are defined a single time regardless of theme.
    const col = (cls: string, node: React.ReactNode) => classic ? node : <div className={cls}>{node}</div>;

    const toolbarControls = (
        <>
            {col('col-md-3',
                <SearchField classic={classic} value={search} onChange={setSearch}
                    placeholder={classic ? 'Search item, location, lot, MO, notes...' : 'Search item, location, category, lot, MO, notes...'}
                    width={classic ? 220 : 400}
                    {...(classic ? {} : { grow: true, style: { display: 'flex', width: '100%' } })}
                />
            )}
            {classic && <div style={xpSep} />}
            {col('col-md-3',
                <TreeSelect
                    options={catTreeOptions}
                    value={selectedCat}
                    onChange={setSelectedCat}
                    allowEmpty
                    emptyLabel="All Categories"
                    {...(classic ? { style: { width: 180 } } : { size: 'sm' as const })}
                />
            )}
            {(classic ? !!effectiveCat : true) && col('col-md-1',
                <button
                    style={classic ? xpBtn() : undefined}
                    className={classic ? undefined : 'btn btn-outline-secondary btn-sm w-100'}
                    onClick={clearCats}
                    disabled={classic ? undefined : !effectiveCat}
                    title="Clear category filter"
                >Clear</button>
            )}
            {classic && <div style={xpSep} />}
            {col('col-md-3',
                <TreeSelect
                    options={locFilterTreeOptions}
                    value={locSelectValue}
                    onChange={onLocSelect}
                    allowEmpty
                    emptyLabel="All Locations"
                    {...(classic ? { style: { width: 200 } } : { size: 'sm' as const })}
                />
            )}
            {classic && <div style={xpSep} />}
            {classic ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: xpFont, fontSize: '11px', color: '#000', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    title="Hide QC-rejected lots — they are physically in stock but not usable">
                    <input type="checkbox" checked={hideRejected} onChange={e => setHideRejected(e.target.checked)} style={{ margin: 0 }} />
                    Hide rejected
                </label>
            ) : col('col-md-2 d-flex align-items-center',
                <div className="form-check mb-0" title="Hide QC-rejected lots — they are physically in stock but not usable">
                    <input className="form-check-input" type="checkbox" id="sohHideRejected" checked={hideRejected} onChange={e => setHideRejected(e.target.checked)} />
                    <label className="form-check-label small" htmlFor="sohHideRejected">Hide rejected</label>
                </div>
            )}
            {canEntry && selectedKeys.length > 0 && (
                classic ? (
                    <>
                        <div style={xpSep} />
                        <button style={xpBtn({ background: 'linear-gradient(to bottom,#cfe3ff,#a9c9f0)', fontWeight: 'bold' })} onClick={openBulkMove}
                            title="Move every selected row to one destination in a single transaction">
                            <i className="bi bi-arrow-left-right" style={{ marginRight: 4 }} />Move {selectedKeys.length} selected
                        </button>
                        <button style={xpBtn()} onClick={clearSelection} title="Clear selection">Clear</button>
                    </>
                ) : col('col-md-3 d-flex gap-2', (
                    <>
                        <button className="btn btn-primary btn-sm flex-fill" onClick={openBulkMove}
                            title="Move every selected row to one destination in a single transaction">
                            <i className="bi bi-arrow-left-right me-1" />Move {selectedKeys.length} selected
                        </button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={clearSelection} title="Clear selection">Clear</button>
                    </>
                ))
            )}
            {classic && <div style={xpSep} />}
            {col('col-md-2',
                <button
                    style={classic ? xpBtn() : undefined}
                    className={classic ? undefined : 'btn btn-outline-secondary btn-sm w-100'}
                    onClick={() => { refetch(); onRefresh(); }}
                    title={classic ? 'Refresh' : undefined}
                >
                    <i className={classic ? 'bi bi-arrow-clockwise' : 'bi bi-arrow-clockwise me-1'} style={classic ? { marginRight: 4 } : undefined} />Refresh
                </button>
            )}
            {canRebuild && col('col-md-2',
                <button
                    style={classic ? xpBtn() : undefined}
                    className={classic ? undefined : 'btn btn-outline-secondary btn-sm w-100'}
                    onClick={handleRebuild} disabled={rebuilding}
                    title="Recompute stock balances from the ledger (use if balances look stale)"
                >
                    <i className={classic ? 'bi bi-arrow-repeat' : 'bi bi-arrow-repeat me-1'} style={classic ? { marginRight: 4 } : undefined} />{rebuilding ? 'Rebuilding...' : 'Rebuild'}
                </button>
            )}
            {canEntry && col('col-md-2 ms-auto',
                <ToolbarButton classic={classic} tone="create" icon="bi-plus-lg" style={classic ? { marginLeft: 'auto' } : { width: '100%' }} title="Add stock for an item (new manual entry)" onClick={openNew}>
                    New Entry
                </ToolbarButton>
            )}
        </>
    );

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(var(--app-vh) - 80px)' }}>
            <div
                style={classic ? { ...xpBevel, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                className={classic ? undefined : 'card shadow-sm border-0'}
            >
                <div style={classic ? xpTitleBar : undefined} className={classic ? undefined : 'card-header bg-primary bg-opacity-10 text-primary-emphasis d-flex justify-content-between align-items-center py-3'}>
                    {classic
                        ? <span><i className="bi bi-boxes" style={{ marginRight: 6 }} />{t('stock_on_hand') || 'Stock On-Hand'}</span>
                        : <h5 className="card-title mb-0"><i className="bi bi-boxes me-2" />{t('stock_on_hand') || 'Stock On-Hand'}</h5>}
                    <span style={classic ? { fontSize: '10px', opacity: 0.85 } : undefined} className={classic ? undefined : 'badge bg-primary bg-opacity-25 text-primary-emphasis'}>{total} records</span>
                </div>
                {classic ? (
                    <div style={xpToolbar}>{toolbarControls}</div>
                ) : (
                    <div className="card-body pb-0" style={{ flexShrink: 0 }}>
                        <div className="row g-2 mb-3">{toolbarControls}</div>
                    </div>
                )}
                <div style={classic ? { flex: 1, overflow: 'auto', background: '#ffffff', minHeight: 0 } : { flex: 1, overflow: 'auto', minHeight: 0 }} className={classic ? undefined : 'table-responsive'}>
                    <table style={classic ? { width: '100%', minWidth: TABLE_MIN_WIDTH, borderCollapse: 'collapse', tableLayout: 'fixed' } : { tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }} className={classic ? undefined : 'table table-hover table-sm mb-0'}>
                        <thead className={classic ? undefined : 'table-light'}>
                            <tr>
                                <th className={classic ? undefined : 'text-center'} style={classic ? { ...xpTableHeader, width: COL_W.check, textAlign: 'center' } : { width: COL_W.check, ...colDivider }} title={allPageSelected ? 'Clear selection on this page' : 'Select every movable row on this page'}>
                                    <input type="checkbox" style={{ margin: 0, cursor: 'pointer' }} checked={allPageSelected} disabled={!pageMovable.length} onChange={togglePageSelection} />
                                </th>
                                <th style={classic ? { ...xpTableHeader, cursor: 'pointer', width: COL_W.item } : { cursor: 'pointer', width: COL_W.item, ...colDivider }} onClick={() => toggleSort('item')} title="Sort">Item<SortMark sort={sort} colKey="item" /></th>
                                <th style={classic ? { ...xpTableHeader, cursor: 'pointer', width: COL_W.category } : { cursor: 'pointer', width: COL_W.category, ...colDivider }} onClick={() => toggleSort('itemCategory')} title="Sort">Item Category<SortMark sort={sort} colKey="itemCategory" /></th>
                                <th style={classic ? { ...xpTableHeader, cursor: 'pointer', width: COL_W.location } : { cursor: 'pointer', width: COL_W.location, ...colDivider }} onClick={() => toggleSort('location')} title="Sort">{t('locations') || 'Location'}<SortMark sort={sort} colKey="location" /></th>
                                <th style={classic ? { ...xpTableHeader, cursor: 'pointer', width: COL_W.lot } : { cursor: 'pointer', width: COL_W.lot, ...colDivider }} onClick={() => toggleSort('batch')} title="Sort">Lot<SortMark sort={sort} colKey="batch" /></th>
                                <th style={classic ? { ...xpTableHeader, width: COL_W.attrs } : { width: COL_W.attrs, ...colDivider }}>{t('attributes') || 'Attributes'}</th>
                                <th className={classic ? undefined : 'text-end'} style={classic ? { ...xpTableHeader, textAlign: 'right', cursor: 'pointer', width: COL_W.qty } : { cursor: 'pointer', width: COL_W.qty, ...colDivider }} onClick={() => toggleSort('qty')} title="Sort">{t('qty') || 'Qty'}<SortMark sort={sort} colKey="qty" /></th>
                                <th style={classic ? { ...xpTableHeader, width: COL_W.uom } : { width: COL_W.uom, ...colDivider }}>UOM</th>
                                <th style={classic ? { ...xpTableHeader, cursor: 'pointer', width: COL_W.packaging } : { cursor: 'pointer', width: COL_W.packaging, ...colDivider }} onClick={() => toggleSort('packaging')} title="Sort">Packaging<SortMark sort={sort} colKey="packaging" /></th>
                                <th style={classic ? { ...xpTableHeader, cursor: 'pointer', width: COL_W.notes } : { cursor: 'pointer', width: COL_W.notes, ...colDivider }} onClick={() => toggleSort('notes')} title="Sort">Notes<SortMark sort={sort} colKey="notes" /></th>
                                <th className={classic ? undefined : 'text-end'} style={classic ? { ...xpTableHeader, textAlign: 'right', width: COL_W.ends } : { width: COL_W.ends, ...colDivider }}>Ends</th>
                                <th style={classic ? { ...xpTableHeader, width: COL_W.actions, borderRight: 'none' } : { width: COL_W.actions }}></th>
                            </tr>
                        </thead>
                        <tbody ref={listBodyRef}>
                            {pageRows.map((bal: any, i: number) => renderRow(bal, i))}
                            {pageRows.length === 0 && (loading ? (
                                <TableSkeleton rows={8} cols={skel.cols ?? 12} classic={classic} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                            ) : classic ? (
                                <tr>
                                    <td colSpan={12} style={{ textAlign: 'center', padding: '24px' }}>
                                        <span style={{ fontFamily: xpFont, fontSize: '11px', color: '#666', fontStyle: 'italic' }}>No stock records found</span>
                                    </td>
                                </tr>
                            ) : (
                                <tr>
                                    <td colSpan={12} className="text-center text-muted py-4">No stock records found</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {classic ? (
                    <div style={{
                        background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                        padding: '2px 8px', display: 'flex', gap: 16,
                        fontFamily: xpFont, fontSize: '11px', color: '#333',
                    }}>
                        <span><b>{total}</b> rows</span>
                        {negativeCount > 0 && <span style={{ color: '#c00000' }}><b>{negativeCount}</b> negative</span>}
                        {rejectedCount > 0 && (
                            <span style={{ color: '#7a1010' }} title="QC-rejected lots included in the rows above — physically present, not usable">
                                <b>{rejectedCount}</b> rejected ({rejectedQty.toLocaleString('en-US', { maximumFractionDigits: 3 })})
                            </span>
                        )}
                        <span style={{ marginLeft: 'auto', color: '#666' }}>Total: {totalRows} SKUs</span>
                    </div>
                ) : (
                    <div className="card-footer text-muted d-flex gap-3 small" style={{ flexShrink: 0 }}>
                        <span><b>{total}</b> rows match</span>
                        {negativeCount > 0 && <span className="text-danger"><b>{negativeCount}</b> negative</span>}
                        {rejectedCount > 0 && (
                            <span className="text-danger" title="QC-rejected lots included in the rows above — physically present, not usable">
                                <b>{rejectedCount}</b> rejected ({rejectedQty.toLocaleString('en-US', { maximumFractionDigits: 3 })})
                            </span>
                        )}
                        <span className="ms-auto">Total: {totalRows} SKUs</span>
                    </div>
                )}
                <Pager page={page} total={total} pageSize={STOCK_PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
            </div>
            {transferModal}
            {bulkMoveModal}
            {adjustModal}
            {newEntryModal}
        </div>
    );
}
