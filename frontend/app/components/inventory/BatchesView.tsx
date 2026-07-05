'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import ModalWrapper from '../shared/ModalWrapper';
import { useTheme } from '../../context/ThemeContext';
import { useConfirm } from '../../context/ConfirmContext';

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

interface BatchTrace {
  batch: Batch;
  consumptions: BatchConsumption[];
}

interface Item {
  id: string;
  code: string;
  name: string;
}

interface RowTraceState {
  trace: BatchTrace | null;
  traceBack: any | null;
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

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemFilter, setItemFilter] = useState('');
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
  const [rejecting, setRejecting] = useState(false);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const url = itemFilter
        ? `${apiBase}/batches?item_id=${itemFilter}&limit=200`
        : `${apiBase}/batches?limit=200`;
      const res = await authFetch(url);
      if (res.ok) setBatches(await res.json());
    } catch {
      showToast('Failed to load lots', 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBatches(); }, [itemFilter]);

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
    setRejecting(true);
    try {
      const res = await authFetch(`${apiBase}/batches/${rejectBatch.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() || null }),
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

  const toggleExpand = async (b: Batch) => {
    const wasOpen = !!expandedRows[b.id];
    setExpandedRows(prev => ({ ...prev, [b.id]: !wasOpen }));
    if (!wasOpen && !rowTraceData[b.id]) {
      setRowTraceData(prev => ({ ...prev, [b.id]: { trace: null, traceBack: null, loading: true } }));
      const [traceRes, traceBackRes] = await Promise.all([
        authFetch(`${apiBase}/batches/${b.id}/trace`),
        authFetch(`${apiBase}/batches/${b.id}/trace-back`),
      ]);
      const trace = traceRes.ok ? await traceRes.json() : null;
      const traceBack = traceBackRes.ok ? await traceBackRes.json() : null;
      setRowTraceData(prev => ({ ...prev, [b.id]: { trace, traceBack, loading: false } }));
    }
  };

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]));

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

  const renderExpandedPanel = (b: Batch) => {
    const state = rowTraceData[b.id];
    const fnt: React.CSSProperties = classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11 } : { fontSize: 13 };
    const label: React.CSSProperties = { ...fnt, fontWeight: 'bold', color: '#444', textTransform: 'uppercase' as const, fontSize: classic ? 9 : 11, marginBottom: 4 };
    const section: React.CSSProperties = { flex: 1, minWidth: 180, padding: '0 12px', borderRight: classic ? '1px solid #c8c8c8' : '1px solid #dee2e6' };
    const lastSection: React.CSSProperties = { flex: 1, minWidth: 180, padding: '0 12px' };

    const renderNode = (node: any, depth: number): React.ReactNode => (
      <div key={`${node.batch.id}-${depth}`}>
        <div style={{ paddingLeft: depth * 16, ...fnt }}>
          {depth > 0 && <span style={{ color: '#aaa' }}>{'+ '}</span>}
          <strong>{node.batch.batch_number}</strong>
          {node.batch.vendor_lot && <span style={{ color: '#888' }}> [{node.batch.vendor_lot}]</span>}
          <span style={{ color: '#666' }}> ({node.batch.item_code || itemMap[node.batch.item_id]?.code || '?'})</span>
          {node.qty_consumed != null && (
            <span style={{ color: '#444' }}> — {node.qty_consumed} used{node.mo_code ? ` in ${node.mo_code}` : ''}</span>
          )}
          {node.batch.po_number && <span style={{ color: classic ? '#7a4500' : '#856404', marginLeft: 6 }}>PO: {node.batch.po_number}</span>}
        </div>
        {(node.inputs || []).map((c: any) => renderNode(c, depth + 1))}
      </div>
    );

    return (
      <div style={{
        background: classic ? '#f0ede4' : '#f8f9fa',
        borderTop: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6',
        padding: '8px 12px',
        display: 'flex',
        gap: 0,
        ...fnt,
      }}>
        {/* Origin */}
        <div style={section}>
          <div style={label}>Origin</div>
          {b.po_number ? (
            <div>
              <div><span style={{ color: '#888' }}>PO:</span> <strong>{b.po_number}</strong></div>
              {b.vendor_lot
                ? <div><span style={{ color: '#888' }}>Supplier Lot:</span> <strong>{b.vendor_lot}</strong></div>
                : <div style={{ color: '#bbb', fontStyle: 'italic' }}>No supplier lot recorded</div>
              }
            </div>
          ) : b.mo_code || b.sales_order_code ? (
            <div>
              {b.sales_order_code && <div><span style={{ color: '#888' }}>SO:</span> <strong style={{ color: classic ? '#0058e6' : '#0d6efd' }}>{b.sales_order_code}</strong></div>}
              {b.production_run_code && <div><span style={{ color: '#888' }}>PR:</span> {b.production_run_code}</div>}
              {b.mo_code && <div><span style={{ color: '#888' }}>MO:</span> {b.mo_code}</div>}
            </div>
          ) : (
            <div style={{ color: '#bbb', fontStyle: 'italic' }}>No origin recorded</div>
          )}
        </div>

        {/* Used In (forward trace) */}
        <div style={section}>
          <div style={label}>Used In</div>
          {state?.loading && <div style={{ color: '#888' }}>Loading...</div>}
          {state && !state.loading && (!state.trace || state.trace.consumptions.length === 0) && (
            <div style={{ color: '#bbb', fontStyle: 'italic' }}>Not consumed yet</div>
          )}
          {state?.trace && state.trace.consumptions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {state.trace.consumptions.map(c => (
                <div key={c.id}>
                  <span style={{ fontFamily: 'monospace', color: classic ? '#0058e6' : '#0d6efd' }}>
                    {c.mo_code || c.manufacturing_order_id.slice(0, 8)}
                  </span>
                  <span style={{ color: '#888', marginLeft: 6 }}>{c.qty_consumed} used</span>
                  {c.output_batch_number && (
                    <span style={{ color: '#555', marginLeft: 6 }}>
                      {'→ '}<span style={{ fontFamily: 'monospace' }}>{c.output_batch_number}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Made From (backward trace) */}
        <div style={lastSection}>
          <div style={label}>Made From</div>
          {state?.loading && <div style={{ color: '#888' }}>Loading...</div>}
          {state && !state.loading && (!state.traceBack || state.traceBack.inputs.length === 0) && (
            <div style={{ color: '#bbb', fontStyle: 'italic' }}>No input lots recorded</div>
          )}
          {state?.traceBack && state.traceBack.inputs.length > 0 && (
            <div>{state.traceBack.inputs.map((n: any) => renderNode(n, 0))}</div>
          )}
        </div>
      </div>
    );
  };

  const filtered = batches.filter(b => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return b.batch_number.toLowerCase().includes(s) ||
      batchItemCode(b).toLowerCase().includes(s) ||
      batchItemName(b).toLowerCase().includes(s) ||
      (b.vendor_lot || '').toLowerCase().includes(s) ||
      (b.po_number || '').toLowerCase().includes(s);
  });

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

  const colSpan = 11; // Lot Number, Item Code, Item Name, Origin, Location, Remaining, Ends, Notes, Created By, Created At, Actions

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
            <input style={{ ...xpInput, width: 160 }} placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          {/* ── Table ── */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: '#ffffff' }}>
            <table style={xpTable}>
              <thead>
                <tr>
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
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={colSpan} style={{ ...xpTd(false), textAlign: 'center', padding: 8 }}>No lots found.</td></tr>
                )}
                {filtered.map((b, i) => (
                  <>
                    <tr key={b.id} style={{ background: expandedRows[b.id] ? '#d6e4f7' : i % 2 === 1 ? '#f0f0f8' : '#ffffff' }}>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>
                        <strong>{b.batch_number}</strong>
                        {b.quality_status === 'REJECTED' && (
                          <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 'bold', color: '#900', border: '1px solid #c88', background: '#fbe4e4', padding: '0 3px' }}>REJECTED</span>
                        )}
                      </td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{batchItemCode(b)}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{batchItemName(b)}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{originCell(b)}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.location_name || <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td style={{ ...xpTd(i % 2 === 1), textAlign: 'right', background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.remaining != null ? Number(b.remaining).toFixed(2) : '-'}</td>
                      <td style={{ ...xpTd(i % 2 === 1), textAlign: 'right', background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.ends ?? '-'}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.notes || '-'}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{b.created_by || '-'}</td>
                      <td style={{ ...xpTd(i % 2 === 1), background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>{new Date(b.created_at).toLocaleDateString()}</td>
                      <td style={{ ...xpTd(i % 2 === 1), whiteSpace: 'nowrap', background: expandedRows[b.id] ? '#d6e4f7' : undefined }}>
                        <button
                          style={{
                            ...xpBtn(), marginRight: 4, fontSize: 10, padding: '2px 7px',
                            background: expandedRows[b.id]
                              ? 'linear-gradient(to bottom,#d4d0c8,#fff)'
                              : 'linear-gradient(to bottom,#fff,#d4d0c8)',
                            borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                          }}
                          onClick={() => toggleExpand(b)}
                          title="Show lot details, trace and genealogy"
                        >
                          <i className={`bi ${expandedRows[b.id] ? 'bi-chevron-up' : 'bi-diagram-3'}`} style={{ marginRight: 3 }} />
                          {expandedRows[b.id] ? 'Hide' : 'Details'}
                        </button>
                        {b.quality_status !== 'REJECTED' && (
                          <button
                            style={xpBtn({ background: 'linear-gradient(to bottom, #ffe0b0, #e0a050)', fontSize: 10, padding: '2px 7px', marginRight: 4, color: '#663300' })}
                            onClick={() => { setRejectBatch(b); setRejectReason(''); }}
                            title="QC reject — lot drops out of good stock; produced qty returns to its MO"
                          >
                            Reject
                          </button>
                        )}
                        <button style={xpBtn({ background: 'linear-gradient(to bottom, #ffd0d0, #e08080)', fontSize: 10, padding: '2px 7px' })} onClick={() => handleDelete(b)}>
                          <i className="bi bi-trash" />
                        </button>
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
            <input className="form-control form-control-sm" style={{ width: 200 }} placeholder="Search lots..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          {/* ── Table ── */}
          <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <table className="table table-sm table-hover table-bordered mb-0">
              <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
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
                {!loading && filtered.length === 0 && <tr><td colSpan={colSpan} className="text-center text-muted">No lots found.</td></tr>}
                {filtered.map(b => (
                  <>
                    <tr key={b.id} className={expandedRows[b.id] ? 'table-primary bg-opacity-10' : ''}>
                      <td>
                        <strong>{b.batch_number}</strong>
                        {b.quality_status === 'REJECTED' && <span className="badge bg-danger ms-1">REJECTED</span>}
                      </td>
                      <td>{batchItemCode(b)}</td>
                      <td>{batchItemName(b)}</td>
                      <td>{originCell(b)}</td>
                      <td>{b.location_name || <span className="text-muted">—</span>}</td>
                      <td className="text-end">{b.remaining != null ? Number(b.remaining).toFixed(2) : '-'}</td>
                      <td className="text-end">{b.ends ?? '-'}</td>
                      <td>{b.notes || '-'}</td>
                      <td>{b.created_by || '-'}</td>
                      <td>{new Date(b.created_at).toLocaleDateString()}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          className={`btn btn-sm me-1 ${expandedRows[b.id] ? 'btn-secondary' : 'btn-outline-secondary'}`}
                          onClick={() => toggleExpand(b)}
                          title="Show lot details, trace and genealogy"
                        >
                          <i className={`bi ${expandedRows[b.id] ? 'bi-chevron-up' : 'bi-diagram-3'}`} />
                          {' '}Details
                        </button>
                        {b.quality_status !== 'REJECTED' && (
                          <button
                            className="btn btn-sm btn-outline-warning me-1"
                            onClick={() => { setRejectBatch(b); setRejectReason(''); }}
                            title="QC reject — lot drops out of good stock; produced qty returns to its MO"
                          >
                            Reject
                          </button>
                        )}
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(b)}>
                          <i className="bi bi-trash" />
                        </button>
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
      {rejectBatch && (
        <ModalWrapper
          isOpen={!!rejectBatch}
          onClose={() => setRejectBatch(null)}
          title={`Reject Lot ${rejectBatch.batch_number}`}
          size="sm"
          footer={<>
            <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setRejectBatch(null)}>Cancel</button>
            <button
              style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #f0b0b0, #d87070)', color: '#500', fontWeight: 'bold' }) : undefined}
              className={classic ? '' : 'btn btn-sm btn-danger'}
              onClick={handleReject}
              disabled={rejecting}
            >
              {rejecting ? 'Rejecting...' : 'Confirm Reject'}
            </button>
          </>}
        >
          <div className="mb-2" style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>
            <strong>{batchItemCode(rejectBatch)}</strong>
            {rejectBatch.remaining != null && <> — {Number(rejectBatch.remaining).toFixed(2)} remaining</>}
            {rejectBatch.mo_code && <> (MO {rejectBatch.mo_code})</>}
          </div>
          <div className="mb-3" style={classic ? { fontFamily: 'Tahoma', fontSize: 10, color: '#663300' } : { fontSize: 13, color: '#664d03' }}>
            The lot is marked REJECTED: it stays in stock but is excluded from
            availability and consumption. If it was produced by a work order log,
            that quantity is returned to the MO's progress — create a new WO to
            refill the shortfall.
          </div>
          <div className="mb-3">
            <label style={classic ? { fontFamily: 'Tahoma', fontSize: 11 } : {}}>Reason</label>
            <textarea
              className={classic ? '' : 'form-control form-control-sm mt-1'}
              style={classic ? { ...xpInput, width: '100%', height: 50, resize: 'vertical' } : {}}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Defect, shade off, width out of spec..."
              autoFocus
            />
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}
