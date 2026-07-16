'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import { useTheme } from '../../context/ThemeContext';
import { useConfirm } from '../../context/ConfirmContext';
import BagLabelPrintModal from '../manufacturing/BagLabelPrintModal';
import LotLabelPrintModal from '../manufacturing/LotLabelPrintModal';
import { useFloatingMenu, MenuTriggerButton, FloatingMenu } from '../shared/xpTheme';

const REJECT_TITLE = 'QC reject — lot drops out of good stock; produced qty returns to its MO';
const SPLIT_TITLE = 'Split — peel a portion off into a new lot (prints a label)';

// Split action — icon-only button; native title tooltip explains it.
function SplitIconButton({ classic, onClick }: { classic: boolean; onClick: () => void }) {
  if (classic) {
    return (
      <button
        onClick={onClick}
        title={SPLIT_TITLE}
        style={{
          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '2px 7px', cursor: 'pointer',
          background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
          border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000040',
          display: 'inline-flex', alignItems: 'center', borderRadius: 0,
        }}
      >
        <i className="bi bi-scissors" />
      </button>
    );
  }
  return (
    <button
      className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center"
      onClick={onClick}
      title={SPLIT_TITLE}
    >
      <i className="bi bi-scissors" />
    </button>
  );
}

// Reject action — icon-only button; native title tooltip explains it, matching
// the WO action buttons.
function RejectIconButton({ classic, onClick }: { classic: boolean; onClick: () => void }) {
  if (classic) {
    return (
      <button
        onClick={onClick}
        title={REJECT_TITLE}
        style={{
          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '2px 7px', cursor: 'pointer',
          background: 'linear-gradient(to bottom, #ffe0b0, #e0a050)',
          border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#663300',
          display: 'inline-flex', alignItems: 'center', borderRadius: 0,
        }}
      >
        <i className="bi bi-slash-circle" />
      </button>
    );
  }
  return (
    <button
      className="btn btn-sm btn-outline-warning d-inline-flex align-items-center"
      onClick={onClick}
      title={REJECT_TITLE}
    >
      <i className="bi bi-slash-circle" />
    </button>
  );
}

const DISPOSE_TITLE = 'Dispose rejected lot — physically write off its remaining stock (deducts from on-hand)';

// Dispose action — only on REJECTED lots; scraps remaining stock, like a consumed beam.
function DisposeIconButton({ classic, onClick }: { classic: boolean; onClick: () => void }) {
  if (classic) {
    return (
      <button
        onClick={onClick}
        title={DISPOSE_TITLE}
        style={{
          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '2px 7px', cursor: 'pointer',
          background: 'linear-gradient(to bottom, #f0d0d0, #c07070)',
          border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#600',
          display: 'inline-flex', alignItems: 'center', borderRadius: 0,
        }}
      >
        <i className="bi bi-trash" />
      </button>
    );
  }
  return (
    <button
      className="btn btn-sm btn-outline-danger d-inline-flex align-items-center"
      onClick={onClick}
      title={DISPOSE_TITLE}
    >
      <i className="bi bi-trash" />
    </button>
  );
}

interface Batch {
  id: string;
  batch_number: string;
  vendor_lot: string | null;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  ends: number | null;
  source_wo_id: string | null;
  remaining: number | null;
  location_id: string | null;
  location_name: string | null;
  quality_status?: string;   // GOOD | REJECTED
  // Production origin (beam batches)
  mo_id: string | null;
  mo_code: string | null;
  production_run_code: string | null;
  sales_order_code: string | null;
  // GR origin
  po_id: string | null;
  po_number: string | null;
}

interface BatchConsumption {
  id: string;
  manufacturing_order_id: string;
  mo_code: string | null;
  input_batch_id: string;
  output_batch_id: string | null;
  output_batch_number: string | null;
  qty_consumed: number;
  created_at: string;
}

interface Item {
  id: string;
  code: string;
  name: string;
}

interface ForwardNode {
  batch: Batch;
  consumptions: ForwardEdge[];
}

interface ForwardEdge extends BatchConsumption {
  child: ForwardNode | null;
}

interface RowTraceState {
  traceBack: any | null;
  forward: ForwardNode | null;
  loading: boolean;
}

interface BatchesViewProps {
  items: Item[];
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  apiBase: string;
}

export default function BatchesView({ items, authFetch, apiBase }: BatchesViewProps) {
  const { showToast } = useToast();
  const { uiStyle } = useTheme();
  const { confirm } = useConfirm();
  const classic = uiStyle === 'classic';

  const PAGE_SIZE = 50;
  const [batches, setBatches] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [itemFilter, setItemFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'depleted'>('active');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Create form
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createItemId, setCreateItemId] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Expandable row trace state
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [rowTraceData, setRowTraceData] = useState<Record<string, RowTraceState>>({});

  // QC reject
  const [rejectBatch, setRejectBatch] = useState<Batch | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectQty, setRejectQty] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const openReject = (b: Batch) => {
    setRejectBatch(b);
    setRejectReason('');
    setRejectQty(b.remaining != null ? String(Number(b.remaining)) : '');
  };

  // Split — peel a portion of a lot into a new GOOD sub-lot, then offer to print
  // its label. Same /batches/{id}/split the dyeing stager uses for leftovers.
  const [splitBatch, setSplitBatch] = useState<Batch | null>(null);
  const [splitQty, setSplitQty] = useState('');
  const [splitReason, setSplitReason] = useState('');
  const [splitting, setSplitting] = useState(false);
  const [lotLabels, setLotLabels] = useState<any[] | null>(null);

  const openSplit = (b: Batch) => {
    setSplitBatch(b);
    setSplitQty('');
    setSplitReason('');
  };

  const handleSplit = async () => {
    if (!splitBatch) return;
    const rem = Number(splitBatch.remaining ?? 0);
    const q = parseFloat(splitQty);
    if (isNaN(q) || q <= 0) { showToast('Split qty must be positive', 'warning'); return; }
    if (q >= rem - 1e-9) { showToast(`Split qty must be less than remaining (${rem.toFixed(2)})`, 'warning'); return; }
    setSplitting(true);
    try {
      const res = await authFetch(`${apiBase}/batches/${splitBatch.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: q, reason: splitReason.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Split failed');
      }
      const sub = await res.json();
      showToast(`Split ${q.toFixed(2)} off → ${sub.batch_number}`, 'success');
      setSplitBatch(null);
      fetchBatches();
      setLotLabels([sub]);   // auto-open the print preview for the new leftover lot
    } catch (e: any) {
      showToast(e.message, 'danger');
    } finally {
      setSplitting(false);
    }
  };

  // Bag-label reprint. GRG (greige) lots are born as weaving MOCompletions; fetch
  // the origin MO, find the completion that produced this lot, and hand it to the
  // same BagLabelPrintModal the WO page uses — full-fidelity label, no new payload.
  const [labelData, setLabelData] = useState<{ bags: any[]; wo: any; mo: any; seqStart: number } | null>(null);
  const { openId, pos, toggle, close } = useFloatingMenu(160);

  const openBatchLabel = async (b: Batch) => {
    // Try for the rich weaving bag label (Warna/Lebar/Rak/bag#), which needs the
    // originating MOCompletion. Split leftovers (GRG-…-S1) and manual lots have no
    // completion of their own — fall back to the generic lot label off the Batch.
    if (b.mo_id) {
      const res = await authFetch(`${apiBase}/manufacturing-orders/${b.mo_id}`);
      if (res.ok) {
        const mo = await res.json();
        const comps = (mo.completions || []).filter((c: any) => !c.rejected && c.output_batch_number);
        const comp = comps.find((c: any) => String(c.output_batch_id || '') === String(b.id))
          || comps.find((c: any) => c.output_batch_number === b.batch_number);
        if (comp) {
          const wo = (mo.work_orders || []).find((w: any) => String(w.id) === String(comp.work_order_id || b.source_wo_id || '')) || null;
          // Bag sequence = this completion's order among its WO's non-rejected lotted bags.
          const woBags = comps
            .filter((c: any) => String(c.work_order_id || '') === String(comp.work_order_id || ''))
            .sort((a: any, c: any) => new Date(a.created_at).getTime() - new Date(c.created_at).getTime());
          const seqStart = Math.max(1, woBags.findIndex((c: any) => String(c.id) === String(comp.id)) + 1);
          setLabelData({ bags: [comp], wo, mo, seqStart });
          return;
        }
      }
    }
    // Fallback: plain lot sticker straight off the Batch (split leftovers etc.).
    setLotLabels([b]);
  };

  // Debounce the search box 350ms before it drives a server fetch (matches item search).
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchInput), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [itemFilter, statusFilter, searchTerm]);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (itemFilter) params.set('item_id', itemFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (searchTerm) params.set('search', searchTerm);
      const res = await authFetch(`${apiBase}/batches/paginated?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data.items || []);
        setTotal(data.total ?? 0);
      }
    } catch {
      showToast('Failed to load lots', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBatches(); }, [itemFilter, statusFilter, searchTerm, page]);

  const handleCreate = async () => {
    if (!createItemId) { showToast('Select an item', 'warning'); return; }
    setCreating(true);
    try {
      const res = await authFetch(`${apiBase}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: createItemId, notes: createNotes || null }),
      });
      if (res.ok) {
        showToast('Lot created', 'success');
        setIsCreateOpen(false);
        setCreateItemId('');
        setCreateNotes('');
        fetchBatches();
      } else {
        const err = await res.json();
        showToast(err.detail || 'Failed to create lot', 'danger');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (batch: Batch) => {
    const ok = await confirm({
      title: 'Delete Lot',
      message: `Delete lot ${batch.batch_number}? Stock linked to this lot will lose its lot reference.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    const res = await authFetch(`${apiBase}/batches/${batch.id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Deleted', 'success'); fetchBatches(); }
    else showToast('Delete failed', 'danger');
  };

  // QC disposition: lot flagged REJECTED (drops out of good stock/pickers);
  // if it was born from a production log, that qty returns to the MO's progress.
  const handleReject = async () => {
    if (!rejectBatch) return;
    const remaining = Number(rejectBatch.remaining ?? 0);
    const q = parseFloat(rejectQty);
    if (rejectQty !== '' && (isNaN(q) || q <= 0)) { showToast('Reject qty must be positive', 'warning'); return; }
    if (!isNaN(q) && q > remaining + 1e-9) { showToast(`Reject qty exceeds remaining (${remaining})`, 'warning'); return; }
    // Omit qty (full reject) when the field is blank or covers the whole balance.
    const partial = rejectQty !== '' && !isNaN(q) && q < remaining - 1e-9;
    setRejecting(true);
    try {
      const res = await authFetch(`${apiBase}/batches/${rejectBatch.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() || null, qty: partial ? q : null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to reject lot');
      }
      showToast(`Lot ${rejectBatch.batch_number} rejected`, 'success');
      setRejectBatch(null);
      setRejectReason('');
      fetchBatches();
    } catch (err: any) {
      showToast(err.message, 'danger');
    } finally {
      setRejecting(false);
    }
  };

  // Dispose a rejected lot: physically write off its remaining stock (deducts
  // from on-hand), like a consumed beam. Only offered on REJECTED lots.
  const handleDispose = async (batch: Batch) => {
    const rem = Number(batch.remaining ?? 0);
    const ok = await confirm({
      title: 'Dispose Rejected Lot',
      message: `Dispose lot ${batch.batch_number}? Its remaining ${rem.toFixed(2)} will be physically written off and deducted from stock on-hand. This cannot be undone.`,
      confirmText: 'Dispose',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await authFetch(`${apiBase}/batches/${batch.id}/dispose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to dispose lot');
      }
      showToast(`Lot ${batch.batch_number} disposed`, 'success');
      fetchBatches();
    } catch (err: any) {
      showToast(err.message, 'danger');
    }
  };

  // The forward endpoint only returns one hop (this batch -> what consumed it).
  // To show the full downstream pipeline (Beam -> Greige -> Dyed Lot -> ...) we
  // chase each resulting output batch's own /trace recursively, client-side —
  // mirrors what trace-back already does server-side for the backward direction.
  const fetchForwardTree = async (batchId: string, depth = 0, visited: Set<string> = new Set()): Promise<ForwardNode | null> => {
    if (depth >= 6 || visited.has(batchId)) return null;
    visited.add(batchId);
    const res = await authFetch(`${apiBase}/batches/${batchId}/trace`);
    if (!res.ok) return null;
    const data = await res.json();
    const consumptions: BatchConsumption[] = data.consumptions || [];
    const edges: ForwardEdge[] = await Promise.all(consumptions.map(async c => ({
      ...c,
      child: c.output_batch_id ? await fetchForwardTree(c.output_batch_id, depth + 1, visited) : null,
    })));
    return { batch: data.batch, consumptions: edges };
  };

  const toggleExpand = async (b: Batch) => {
    const wasOpen = !!expandedRows[b.id];
    setExpandedRows(prev => ({ ...prev, [b.id]: !wasOpen }));
    if (!wasOpen && !rowTraceData[b.id]) {
      setRowTraceData(prev => ({ ...prev, [b.id]: { traceBack: null, forward: null, loading: true } }));
      const [traceBackRes, forward] = await Promise.all([
        authFetch(`${apiBase}/batches/${b.id}/trace-back`),
        fetchForwardTree(b.id),
      ]);
      const traceBack = traceBackRes.ok ? await traceBackRes.json() : null;
      setRowTraceData(prev => ({ ...prev, [b.id]: { traceBack, forward, loading: false } }));
    }
  };

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));

  const isDepleted = (b: Batch) => (b.remaining ?? 0) <= 0;

  const batchItemCode = (b: Batch) => b.item_code || itemMap[b.item_id]?.code || '-';
  const batchItemName = (b: Batch) => b.item_name || itemMap[b.item_id]?.name || '-';

  const originCell = (b: Batch) => {
    if (b.po_number) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
          <span style={{ fontWeight: 'bold', color: classic ? '#7a4500' : '#856404', fontSize: classic ? 10 : undefined }}>
            PO: {b.po_number}
          </span>
          {b.vendor_lot && (
            <span style={{ color: '#666', fontFamily: 'monospace', fontSize: classic ? 9 : 11 }}>
              Supplier Lot: {b.vendor_lot}
            </span>
          )}
        </div>
      );
    }
    if (!b.sales_order_code && !b.production_run_code && !b.mo_code) {
      return <span style={{ color: '#ccc' }}>—</span>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
        {b.sales_order_code && (
          <span style={{ fontWeight: 'bold', color: classic ? '#0058e6' : '#0d6efd', fontSize: classic ? 10 : undefined }}>
            SO: {b.sales_order_code}
          </span>
        )}
        {b.mo_code && (
          <span style={{ color: '#555', fontFamily: 'monospace', fontSize: classic ? 9 : 11 }}>
            {b.mo_code}{b.production_run_code ? ` · ${b.production_run_code}` : ''}
          </span>
        )}
        {!b.sales_order_code && !b.mo_code && b.production_run_code && (
          <span style={{ color: '#888', fontSize: classic ? 9 : 11 }}>PR: {b.production_run_code}</span>
        )}
      </div>
    );
  };

  // Stage classification purely from the batch-number prefix — the manufacturing
  // completion route stamps GR- (goods receipt), BM- (beam), GRG- (greige/weaving),
  // DYE- (dyed lot), LOT-/BAT- (generic). Colors mirror the work-center chip
  // palette used elsewhere (getChipStyle in WorkOrderPanel.tsx) for consistency.
  type StageMeta = { label: string; bg: string; fg: string; border: string; icon: string };
  const STAGE_META: Record<string, StageMeta> = {
    GR:  { label: 'Goods Receipt', bg: '#fdf3d8', fg: '#7a4500', border: '#e0c080', icon: 'bi-truck' },
    BM:  { label: 'Beam',          bg: '#fce8ff', fg: '#660088', border: '#dda8f0', icon: 'bi-record-circle' },
    GRG: { label: 'Greige',        bg: '#e8d8ff', fg: '#440099', border: '#c4a8ee', icon: 'bi-layers' },
    DYE: { label: 'Dyed Lot',      bg: '#cce4ff', fg: '#004b99', border: '#99c4ee', icon: 'bi-droplet-half' },
    PACK:{ label: 'Packaging',     bg: '#d4f0d4', fg: '#005500', border: '#99cc99', icon: 'bi-box-seam' },
  };
  const DEFAULT_STAGE: StageMeta = { label: 'Lot', bg: '#e4e2dc', fg: '#444444', border: '#c4c2ba', icon: 'bi-tag' };
  const classifyLot = (batchNumber?: string | null): StageMeta => {
    const prefix = (batchNumber || '').split('-')[0].toUpperCase();
    return STAGE_META[prefix] || DEFAULT_STAGE;
  };

  // Flatten a recursive tree into left-to-right levels via BFS, so each level
  // renders as one column of connected boxes regardless of branching.
  const levelsFrom = (roots: any[], getChildren: (n: any) => any[]): any[][] => {
    const levels: any[][] = [];
    let frontier = roots;
    let guard = 0;
    while (frontier.length && guard < 6) {
      levels.push(frontier);
      frontier = frontier.flatMap(getChildren);
      guard++;
    }
    return levels;
  };

  const renderExpandedPanel = (b: Batch) => {
    const state = rowTraceData[b.id];
    const fnt: React.CSSProperties = classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11 } : { fontSize: 13 };
    const focalMeta = classifyLot(b.batch_number);

    // Ancestor levels: level 0 = immediate inputs, deepest last — reversed for
    // left-to-right display (oldest/rawest material first).
    const backLevels = levelsFrom(state?.traceBack?.inputs || [], (n: any) => n.inputs || []);
    const ancestorLevels = [...backLevels].reverse();

    // Descendant levels: level 0 = immediate consumption edges.
    const fwdLevels = levelsFrom(state?.forward?.consumptions || [], (e: ForwardEdge) => e.child?.consumptions || []);
    const lastFwdBatches = fwdLevels.length ? fwdLevels[fwdLevels.length - 1].map((e: ForwardEdge) => e.output_batch_number) : [];
    const showPackagingGhost = focalMeta === STAGE_META.DYE && fwdLevels.length === 0;
    const showPackagingContinuation = lastFwdBatches.some((n: string | null) => classifyLot(n) === STAGE_META.DYE);

    const NodeBox = ({ meta, title, subtitle, tag, ghost, focal }: {
      meta: StageMeta; title: React.ReactNode; subtitle?: React.ReactNode; tag?: React.ReactNode;
      ghost?: boolean; focal?: boolean;
    }) => (
      <div style={{
        ...fnt,
        minWidth: 128, maxWidth: 168,
        border: `1px solid ${ghost ? '#c8c8c8' : meta.border}`,
        borderStyle: ghost ? 'dashed' : 'solid',
        borderWidth: focal ? 2 : 1,
        background: ghost ? (classic ? '#f0ede4' : '#f8f9fa') : meta.bg,
        opacity: ghost ? 0.75 : 1,
        boxShadow: focal ? '0 0 0 2px rgba(0,88,230,0.25)' : classic ? '1px 1px 2px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.08)',
        padding: '5px 8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: classic ? 8 : 9, fontWeight: 'bold', textTransform: 'uppercase', color: ghost ? '#999' : meta.fg, letterSpacing: 0.3, marginBottom: 2 }}>
          <i className={`bi ${meta.icon}`} />
          {meta.label}
        </div>
        <div style={{ fontWeight: 'bold', color: ghost ? '#999' : '#000', fontStyle: ghost ? 'italic' : 'normal', wordBreak: 'break-word' }}>
          {title}
        </div>
        {subtitle && <div style={{ color: '#666', fontSize: classic ? 9 : 11, marginTop: 1 }}>{subtitle}</div>}
        {tag && <div style={{ color: '#888', fontSize: classic ? 9 : 11, marginTop: 1 }}>{tag}</div>}
      </div>
    );

    const Connector = () => (
      <div style={{ display: 'flex', alignItems: 'center', color: '#aaa', fontSize: 16, flexShrink: 0, alignSelf: 'center' }}>
        <i className="bi bi-chevron-right" />
      </div>
    );

    const Column = ({ children }: { children: React.ReactNode }) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>{children}</div>
    );

    return (
      <div style={{
        background: classic ? '#f0ede4' : '#f8f9fa',
        borderTop: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6',
        padding: '12px 14px',
        ...fnt,
      }}>
        <div style={{ fontWeight: 'bold', color: '#555', fontSize: classic ? 9 : 11, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 }}>
          Lineage
        </div>
        {state?.loading ? (
          <div style={{ color: '#888', padding: 8 }}>Loading lineage...</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {/* Ancestors: rawest material first, flowing toward the focal lot */}
            {ancestorLevels.map((level, li) => (
              <React.Fragment key={`anc-${li}`}>
                <Column>
                  {level.map((n: any, ni: number) => {
                    const meta = classifyLot(n.batch.batch_number);
                    return (
                      <NodeBox
                        key={`${n.batch.id}-${ni}`}
                        meta={meta}
                        title={n.batch.batch_number}
                        subtitle={n.batch.item_code || itemMap[n.batch.item_id]?.code}
                        tag={n.batch.po_number
                          ? `PO ${n.batch.po_number}`
                          : n.qty_consumed != null
                            ? `${n.qty_consumed} used${n.mo_code ? ` in ${n.mo_code}` : ''}`
                            : undefined}
                      />
                    );
                  })}
                </Column>
                <Connector />
              </React.Fragment>
            ))}

            {/* Focal lot — this row */}
            <NodeBox
              focal
              meta={focalMeta}
              title={b.batch_number}
              subtitle={batchItemCode(b)}
              tag={b.remaining != null ? `${Number(b.remaining).toFixed(2)} remaining` : undefined}
            />

            {/* Descendants: what this lot became, hop by hop */}
            {fwdLevels.map((level, li) => (
              <React.Fragment key={`fwd-${li}`}>
                <Connector />
                <Column>
                  {level.map((e: ForwardEdge, ei: number) => {
                    if (!e.output_batch_number) {
                      return (
                        <NodeBox
                          key={e.id || ei}
                          ghost
                          meta={DEFAULT_STAGE}
                          title="Consumed"
                          subtitle={e.mo_code || undefined}
                          tag={`${e.qty_consumed} used — no output lot`}
                        />
                      );
                    }
                    const meta = classifyLot(e.output_batch_number);
                    return (
                      <NodeBox
                        key={e.id || ei}
                        meta={meta}
                        title={e.output_batch_number}
                        subtitle={e.mo_code || undefined}
                        tag={`${e.qty_consumed} used`}
                      />
                    );
                  })}
                </Column>
              </React.Fragment>
            ))}

            {/* Future stage placeholder — Packaging isn't tracked as lots yet */}
            {(showPackagingGhost || showPackagingContinuation) && (
              <>
                <Connector />
                <NodeBox ghost meta={STAGE_META.PACK} title="Packaging" tag="Coming soon" />
              </>
            )}

            {!ancestorLevels.length && !fwdLevels.length && !showPackagingGhost && (
              <div style={{ color: '#bbb', fontStyle: 'italic', alignSelf: 'center', padding: '0 8px' }}>
                No linked lots — nothing consumed to make this, not yet consumed by anything.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const xpBevel: React.CSSProperties = classic ? {
    border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0,
  } : {};

  const xpTitleBar: React.CSSProperties = classic ? {
    background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
    color: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '12px',
    fontWeight: 'bold', padding: '4px 8px', borderBottom: '1px solid #003080',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '26px',
  } : {};

  const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => classic ? ({
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '2px 10px',
    cursor: 'pointer', background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000000',
    borderRadius: 0, ...extra,
  }) : { cursor: 'pointer', ...extra };

  const xpInput: React.CSSProperties = classic ? {
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', border: '1px solid #7f9db9',
    padding: '1px 6px', background: '#ffffff', color: '#000000', height: '20px', outline: 'none',
  } : {};

  const xpTable: React.CSSProperties = classic ? {
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', width: '100%', borderCollapse: 'collapse',
  } : { width: '100%' };

  const xpTh: React.CSSProperties = classic ? {
    background: 'linear-gradient(to bottom, #f0ede4, #d8d4c8)', border: '1px solid #9090a0',
    padding: '2px 6px', fontWeight: 'bold', textAlign: 'left', whiteSpace: 'nowrap',
    position: 'sticky', top: 0,
  } : {};

  const xpTd = (alt: boolean): React.CSSProperties => classic ? {
    border: '1px solid #c8c8c8', padding: '2px 6px',
    background: alt ? '#f0f0f8' : '#ffffff', verticalAlign: 'middle',
  } : { verticalAlign: 'middle' };

  const colSpan = 12; // Chevron, Lot Number, Item Code, Item Name, Origin, Location, Remaining, Ends, Notes, Created By, Created At, Actions

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      {classic ? (
        <div style={{ ...xpBevel, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* ── Header ── */}
          <div style={xpTitleBar}>
            <span>Lot Management</span>
          </div>
          <div style={{ padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', flexShrink: 0 }}>
            <button style={xpBtn()} onClick={() => setIsCreateOpen(true)}>
              <i className="bi bi-plus" /> New Lot
            </button>
            <button style={xpBtn()} onClick={fetchBatches}>
              <i className="bi bi-arrow-clockwise" /> Refresh
            </button>
            <span style={{ marginLeft: 8, fontFamily: 'Tahoma', fontSize: 11 }}>Filter by Item:</span>
            <select style={{ ...xpInput, width: 200 }} value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
              <option value="">All Items</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
            </select>
            <span style={{ fontFamily: 'Tahoma', fontSize: 11 }}>Status:</span>
            <select style={{ ...xpInput, width: 110 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="active">Active</option>
              <option value="depleted">Depleted</option>
              <option value="">All</option>
            </select>
            <input style={{ ...xpInput, width: 160 }} placeholder="Search..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>

          {/* ── Table ── */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: '#ffffff', scrollbarGutter: 'stable' } as React.CSSProperties}>
            <table style={xpTable}>
              <thead>
                <tr>
                  <th style={{ ...xpTh, width: 20 }}></th>
                  <th style={xpTh}>Lot Number</th>
                  <th style={xpTh}>Item Code</th>
                  <th style={xpTh}>Item Name</th>
                  <th style={xpTh}>Origin</th>
                  <th style={xpTh}>Location</th>
                  <th style={{ ...xpTh, textAlign: 'right' }}>Remaining</th>
                  <th style={{ ...xpTh, textAlign: 'right' }}>Ends</th>
                  <th style={xpTh}>Notes</th>
                  <th style={xpTh}>Created By</th>
                  <th style={xpTh}>Created At</th>
                  <th style={xpTh}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={colSpan} style={{ ...xpTd(false), textAlign: 'center', padding: 8 }}>Loading...</td></tr>
                )}
                {!loading && batches.length === 0 && (
                  <tr><td colSpan={colSpan} style={{ ...xpTd(false), textAlign: 'center', padding: 8 }}>No lots found.</td></tr>
                )}
                {batches.map((b, i) => (
                  <>
                    <tr
                      key={b.id}
                      style={{ background: expandedRows[b.id] ? '#d6e4f7' : i % 2 === 1 ? '#f0f0f8' : '#ffffff', cursor: 'pointer', color: isDepleted(b) ? '#9a9a9a' : undefined }}
                      onClick={() => toggleExpand(b)}
                      title={isDepleted(b) ? 'Depleted lot — 0 remaining' : 'Show lot lineage'}
                    >
                      <td style={{ ...xpTd(i % 2 === 1), textAlign: 'center', background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>
                        <span style={{ fontSize: 10, color: '#555' }}>{expandedRows[b.id] ? '▼' : '►'}</span>
                      </td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>
                        <strong>{b.batch_number}</strong>
                        {b.quality_status === 'REJECTED' && (
                          <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 'bold', color: '#900', border: '1px solid #c88', background: '#fbe4e4', padding: '0 3px' }}>REJECTED</span>
                        )}
                        {b.quality_status === 'DISPOSED' && (
                          <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 'bold', color: '#555', border: '1px solid #aaa', background: '#eee', padding: '0 3px' }}>DISPOSED</span>
                        )}
                      </td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{batchItemCode(b)}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{batchItemName(b)}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{originCell(b)}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.location_name || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ ...xpTd(i % 2 === 1), textAlign: 'right', background: expandedRows[b.id] ? '#d6e4f7' : undefined, whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 5, verticalAlign: 'middle', background: isDepleted(b) ? '#b8b8b8' : '#3a9b3a', border: isDepleted(b) ? '1px solid #999' : '1px solid #2a7a2a' }} />
                        {b.remaining != null ? Number(b.remaining).toFixed(2) : '-'}
                      </td>
                      <td style={{ ...xpTd(i % 2 === 1), textAlign: 'right', background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.ends ?? '-'}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.notes || '-'}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.created_by || '-'}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{new Date(b.created_at).toLocaleDateString()}</td>
                      <td style={{ ...xpTd(i % 2 === 1), whiteSpace: 'nowrap', textAlign: 'right', background: expandedRows[b.id] ? '#d6e4f7' : undefined }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          {b.quality_status !== 'REJECTED' && (b.remaining ?? 0) > 0 && (
                            <SplitIconButton classic onClick={() => openSplit(b)} />
                          )}
                          {b.quality_status !== 'REJECTED' && b.quality_status !== 'DISPOSED' && (
                            <RejectIconButton classic onClick={() => openReject(b)} />
                          )}
                          {b.quality_status === 'REJECTED' && (b.remaining ?? 0) > 0 && (
                            <DisposeIconButton classic onClick={() => handleDispose(b)} />
                          )}
                          <MenuTriggerButton classic onClick={e => toggle(b.id, e)} />
                        </div>
                      </td>
                    </tr>
                    {expandedRows[b.id] && (
                      <tr key={`${b.id}-detail`}>
                        <td colSpan={colSpan} style={{ padding: 0, border: '1px solid #c0bdb5' }}>
                          {renderExpandedPanel(b)}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
        </div>
      ) : (
        <div className="card shadow-sm border-0" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* ── Header ── */}
          <div className="card-header d-flex align-items-center gap-2 flex-wrap" style={{ flexShrink: 0 }}>
            <h5 className="mb-0 fw-bold">Lot Management</h5>
            <button className="btn btn-sm btn-primary" onClick={() => setIsCreateOpen(true)}>
              <i className="bi bi-plus" /> New Lot
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={fetchBatches}>
              <i className="bi bi-arrow-clockwise" />
            </button>
            <select className="form-select form-select-sm" style={{ width: 200 }} value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
              <option value="">All Items</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
            </select>
            <select className="form-select form-select-sm" style={{ width: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="active">Active</option>
              <option value="depleted">Depleted</option>
              <option value="">All statuses</option>
            </select>
            <input className="form-control form-control-sm" style={{ width: 200 }} placeholder="Search lots..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>

          {/* ── Table ── */}
          <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarGutter: 'stable' } as React.CSSProperties}>
            <table className="table table-sm table-hover table-bordered mb-0">
              <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ width: 24 }}></th>
                  <th>Lot Number</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Origin</th>
                  <th>Location</th>
                  <th className="text-end">Remaining</th>
                  <th className="text-end">Ends</th>
                  <th>Notes</th>
                  <th>Created By</th>
                  <th>Created At</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={colSpan} className="text-center">Loading...</td></tr>}
                {!loading && batches.length === 0 && <tr><td colSpan={colSpan} className="text-center text-muted">No lots found.</td></tr>}
                {batches.map(b => (
                  <>
                    <tr
                      key={b.id}
                      className={expandedRows[b.id] ? 'table-primary bg-opacity-10' : ''}
                      style={{ cursor: 'pointer', color: isDepleted(b) ? '#9a9a9a' : undefined }}
                      onClick={() => toggleExpand(b)}
                      title={isDepleted(b) ? 'Depleted lot — 0 remaining' : 'Show lot lineage'}
                    >
                      <td className="text-center text-muted">
                        <i className={`bi ${expandedRows[b.id] ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: 11 }} />
                      </td>
                      <td>
                        <strong>{b.batch_number}</strong>
                        {b.quality_status === 'REJECTED' && <span className="badge bg-danger ms-1">REJECTED</span>}
                        {b.quality_status === 'DISPOSED' && <span className="badge bg-secondary ms-1">DISPOSED</span>}
                      </td>
                      <td>{batchItemCode(b)}</td>
                      <td>{batchItemName(b)}</td>
                      <td>{originCell(b)}</td>
                      <td>{b.location_name || <span className="text-muted">—</span>}</td>
                      <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 5, verticalAlign: 'middle', background: isDepleted(b) ? '#b8b8b8' : '#3a9b3a' }} />
                        {b.remaining != null ? Number(b.remaining).toFixed(2) : '-'}
                      </td>
                      <td className="text-end">{b.ends ?? '-'}</td>
                      <td>{b.notes || '-'}</td>
                      <td>{b.created_by || '-'}</td>
                      <td>{new Date(b.created_at).toLocaleDateString()}</td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div className="d-inline-flex align-items-center gap-1 justify-content-end">
                          {b.quality_status !== 'REJECTED' && (b.remaining ?? 0) > 0 && (
                            <SplitIconButton classic={false} onClick={() => openSplit(b)} />
                          )}
                          {b.quality_status !== 'REJECTED' && b.quality_status !== 'DISPOSED' && (
                            <RejectIconButton classic={false} onClick={() => openReject(b)} />
                          )}
                          {b.quality_status === 'REJECTED' && (b.remaining ?? 0) > 0 && (
                            <DisposeIconButton classic={false} onClick={() => handleDispose(b)} />
                          )}
                          <MenuTriggerButton classic={false} onClick={e => toggle(b.id, e)} />
                        </div>
                      </td>
                    </tr>
                    {expandedRows[b.id] && (
                      <tr key={`${b.id}-detail`}>
                        <td colSpan={colSpan} style={{ padding: 0 }}>
                          {renderExpandedPanel(b)}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
        </div>
      )}

      {/* ── Create Modal ── */}
      {isCreateOpen && (
        <ModalWrapper
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="New Lot"
          size="sm"
          footer={<>
            <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setIsCreateOpen(false)}>Cancel</button>
            <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-primary'} onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Lot'}
            </button>
          </>}
        >
          <div className="mb-3">
            <label style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>Item</label>
            <select
              className={classic ? '' : 'form-select form-select-sm mt-1'}
              style={classic ? { ...xpInput, width: '100%', height: 22 } : {}}
              value={createItemId}
              onChange={e => setCreateItemId(e.target.value)}
            >
              <option value="">-- Select Item --</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>Notes (optional)</label>
            <textarea
              className={classic ? '' : 'form-control form-control-sm mt-1'}
              style={classic ? { ...xpInput, width: '100%', height: 60, resize: 'vertical' } : {}}
              value={createNotes}
              onChange={e => setCreateNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
        </ModalWrapper>
      )}

      {/* ── QC Reject Modal ── */}
      {rejectBatch && (() => {
        const rem = Number(rejectBatch.remaining ?? 0);
        const q = parseFloat(rejectQty);
        const partial = rejectQty !== '' && !isNaN(q) && q > 0 && q < rem - 1e-9;
        const goodLeft = partial ? rem - q : 0;
        return (
        <ModalWrapper
          isOpen={!!rejectBatch}
          onClose={() => setRejectBatch(null)}
          title={`Reject Lot ${rejectBatch.batch_number}`}
          size="sm"
          modeless
          footer={<>
            <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setRejectBatch(null)}>Cancel</button>
            <button
              style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #f0b0b0, #d87070)', color: '#500', fontWeight: 'bold' }) : undefined}
              className={classic ? '' : 'btn btn-sm btn-danger'}
              onClick={handleReject}
              disabled={rejecting}
            >
              {rejecting ? 'Rejecting...' : partial ? 'Reject Portion' : 'Reject Whole Lot'}
            </button>
          </>}
        >
          <div className="mb-2" style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>
            <strong>{batchItemCode(rejectBatch)}</strong>
            {rejectBatch.remaining != null && <> — {rem.toFixed(2)} remaining</>}
            {rejectBatch.mo_code && <> (MO {rejectBatch.mo_code})</>}
          </div>
          <div className="mb-3">
            <label style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>Reject quantity</label>
            <input
              type="number"
              min={0}
              max={rem}
              step="any"
              className={classic ? '' : 'form-control form-control-sm mt-1'}
              style={classic ? { ...xpInput, width: '100%', height: 22 } : {}}
              value={rejectQty}
              onChange={e => setRejectQty(e.target.value)}
            />
            <div style={classic ? { fontFamily: 'Tahoma', fontSize: 10, color: '#555', marginTop: 2 } : { fontSize: 12, color: '#666', marginTop: 2 }}>
              {partial
                ? `Splits off ${q.toFixed(2)} into a REJECTED sub-lot; ${goodLeft.toFixed(2)} stays active.`
                : 'Full quantity — rejects the whole lot.'}
            </div>
          </div>
          <div className="mb-3" style={classic ? { fontFamily: 'Tahoma', fontSize: 10, color: '#663300' } : { fontSize: 13, color: '#664d03' }}>
            {partial
              ? `The rejected ${q.toFixed(2)} moves to a new REJECTED sub-lot (excluded from availability/consumption) and is physically pulled out; the rest stays GOOD. If produced by a work order, that qty returns to the MO's progress — add a WO to refill.`
              : `The lot is marked REJECTED: it stays in stock but is excluded from availability and consumption. If it was produced by a work order log, that quantity is returned to the MO's progress — create a new WO to refill the shortfall.`}
          </div>
          <div className="mb-3">
            <label style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>Reason</label>
            <textarea
              className={classic ? '' : 'form-control form-control-sm mt-1'}
              style={classic ? { ...xpInput, width: '100%', height: 50, resize: 'vertical' } : {}}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Defect, shade off, width out of spec..."
            />
          </div>
        </ModalWrapper>
        );
      })()}

      {/* ── Split Modal ── */}
      {splitBatch && (() => {
        const rem = Number(splitBatch.remaining ?? 0);
        const q = parseFloat(splitQty);
        const valid = !isNaN(q) && q > 0 && q < rem - 1e-9;
        const origLeft = valid ? rem - q : rem;
        return (
        <ModalWrapper
          isOpen={!!splitBatch}
          onClose={() => setSplitBatch(null)}
          title={`Split Lot ${splitBatch.batch_number}`}
          size="sm"
          modeless
          footer={<>
            <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setSplitBatch(null)}>Cancel</button>
            <button
              style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', fontWeight: 'bold' }) : undefined}
              className={classic ? '' : 'btn btn-sm btn-primary'}
              onClick={handleSplit}
              disabled={splitting || !valid}
            >
              {splitting ? 'Splitting...' : 'Split & Print Label'}
            </button>
          </>}
        >
          <div className="mb-2" style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>
            <strong>{batchItemCode(splitBatch)}</strong>
            {splitBatch.remaining != null && <> — {rem.toFixed(2)} remaining</>}
          </div>
          <div className="mb-3">
            <label style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>Quantity to peel off</label>
            <input
              type="number"
              min={0}
              max={rem}
              step="any"
              className={classic ? '' : 'form-control form-control-sm mt-1'}
              style={classic ? { ...xpInput, width: '100%', height: 22 } : {}}
              value={splitQty}
              onChange={e => setSplitQty(e.target.value)}
              placeholder={`0 – ${rem.toFixed(2)}`}
            />
            <div style={classic ? { fontFamily: 'Tahoma', fontSize: 10, color: '#555', marginTop: 2 } : { fontSize: 12, color: '#666', marginTop: 2 }}>
              {valid
                ? `Peels ${q.toFixed(2)} into a new GOOD lot; original keeps ${origLeft.toFixed(2)}.`
                : `Enter a qty between 0 and ${rem.toFixed(2)}.`}
            </div>
          </div>
          <div className="mb-3">
            <label style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>Reason (optional)</label>
            <textarea
              className={classic ? '' : 'form-control form-control-sm mt-1'}
              style={classic ? { ...xpInput, width: '100%', height: 50, resize: 'vertical' } : {}}
              value={splitReason}
              onChange={e => setSplitReason(e.target.value)}
              placeholder="Leftover after partial use..."
            />
          </div>
        </ModalWrapper>
        );
      })()}

      {/* ── Row ⋯ menu: Print Label (GRG only) + Delete ── */}
      {openId && (() => {
        const b = batches.find(x => x.id === openId);
        if (!b) return null;
        const canLabel = classifyLot(b.batch_number) === STAGE_META.GRG;
        return (
          <FloatingMenu
            pos={pos}
            items={[
              { key: 'label', label: 'Print Label', icon: 'bi-printer', hidden: !canLabel, title: "Print this greige bag's label", onClick: () => { close(); openBatchLabel(b); } },
              { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, onClick: () => { close(); handleDelete(b); } },
            ]}
          />
        );
      })()}

      {/* ── Bag Label Print (greige lots) ── */}
      {labelData && (
        <BagLabelPrintModal
          bags={labelData.bags}
          workOrder={labelData.wo}
          parentMO={labelData.mo}
          seqStart={labelData.seqStart}
          onClose={() => setLabelData(null)}
        />
      )}

      {/* ── Lot Label Print (split leftovers) ── */}
      {lotLabels && (
        <LotLabelPrintModal lots={lotLabels} onClose={() => setLotLabels(null)} />
      )}
    </div>
  );
}
