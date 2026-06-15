'use client';
import React, { useState, useMemo } from 'react';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';

// ── XP style constants (consistent with DyeingSettingView) ──────────────────
const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 6px', outline: 'none', height: 20,
};
const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: xpFont, fontSize: 11, padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000',
    ...extra,
});
const xpGroupBox: React.CSSProperties = {
    border: '1px solid #c0bdb5', boxShadow: 'inset 1px 1px 0 #fff, 1px 1px 0 #c0bdb5', marginBottom: 10,
};
const xpGroupHeader: React.CSSProperties = {
    background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)',
    color: '#fff', fontFamily: xpFont, fontSize: 10, fontWeight: 'bold',
    padding: '3px 8px', letterSpacing: '0.5px', textTransform: 'uppercase' as const,
};
const xpGroupBody: React.CSSProperties = { background: '#fff', padding: '10px' };
const xpLbl: React.CSSProperties = { fontFamily: xpFont, fontSize: 11, color: '#000', display: 'block', marginBottom: 2 };
const xpThCell: React.CSSProperties = {
    padding: '3px 6px', borderRight: '1px solid #b0aaa0', textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const, fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#000',
};
const tdBase: React.CSSProperties = {
    padding: '4px 6px', borderRight: '1px solid #c0bdb5', borderBottom: '1px solid #d0cdc8',
    verticalAlign: 'middle' as const, fontFamily: xpFont, fontSize: 11,
};

const REQUEST_TYPES = ['NEW', 'RESUBMIT', 'STRIKE_OFF'];
const STATUS_FILTERS = ['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
const REQUEST_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];

const statusStyle = (status: string): React.CSSProperties => {
    const map: Record<string, { bg: string; border: string; color: string }> = {
        APPROVED:  { bg: '#d4edda', border: '#27713a', color: '#0c3a1a' },
        REJECTED:  { bg: '#f8d7da', border: '#a01a1a', color: '#4a0000' },
        SUBMITTED: { bg: '#dce4f5', border: '#3a5faa', color: '#0d2a6e' },
        RESUBMIT:  { bg: '#fff3cd', border: '#b8860b', color: '#3e2000' },
        PENDING:   { bg: '#e8e8e8', border: '#7a7a7a', color: '#111' },
    };
    const s = map[status] || { bg: '#e8e8e8', border: '#7a7a7a', color: '#111' };
    return { background: s.bg, border: `1px solid ${s.border}`, color: s.color, padding: '1px 5px', fontSize: 9, fontFamily: xpFont, fontWeight: 'bold', whiteSpace: 'nowrap' as const };
};

const today = () => new Date().toISOString().split('T')[0];

const emptyForm = () => ({
    request_date: today(),
    customer_id: '',
    base_item_id: '',
    approved_recipe_id: '',
    season: '',
    customer_article_code: '',
    internal_article_code: '',
    substrate: '',
    color_standard: '',
    request_type: 'NEW',
    due_date: '',
    estimated_completion_date: '',
    notes: '',
    dips: [] as { id?: string; color_name: string; submission_round: number; recipe_ref?: string }[],
});

export default function LabDipRequestView({
    labDips, customers, items, recipes, attributes,
    onCreate, onEdit, onUpdateStatus, onUpdateDipStatus, onDelete,
}: any) {
    const { confirm } = useConfirm();
    useToast();

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const [pendingColor, setPendingColor] = useState('');
    const [pendingRound, setPendingRound] = useState(1);

    const colorOptions = useMemo(() => {
        const attr = (attributes as any[]).find((a: any) => a.system_role === 'color');
        return (attr?.values ?? []).map((v: any) => ({ value: v.value, label: v.value }));
    }, [attributes]);

    const itemOptions = useMemo(() =>
        (items || []).map((it: any) => ({ value: it.id, label: it.code ? `${it.code} — ${it.name}` : it.name })),
    [items]);

    const recipeOptions = useMemo(() =>
        (recipes || []).map((r: any) => ({ value: r.id, label: r.code ? `${r.code} — ${r.name}` : r.name })),
    [recipes]);

    const customerOptions = useMemo(() =>
        [{ value: '', label: 'No Customer (Internal)' }, ...(customers || []).map((c: any) => ({ value: c.id, label: c.name }))],
    [customers]);

    const getCustomerName = (id: string) => (customers || []).find((c: any) => c.id === id)?.name || '—';

    const toggleExpand = (id: string) =>
        setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setPendingColor(''); setPendingRound(1); setIsModalOpen(true); };

    const openEdit = (r: any) => {
        setEditing(r);
        setForm({
            request_date: r.request_date || today(),
            customer_id: r.customer_id || '',
            base_item_id: r.base_item_id || '',
            approved_recipe_id: r.approved_recipe_id || '',
            season: r.season || '',
            customer_article_code: r.customer_article_code || '',
            internal_article_code: r.internal_article_code || '',
            substrate: r.substrate || '',
            color_standard: r.color_standard || '',
            request_type: r.request_type || 'NEW',
            due_date: r.due_date || '',
            estimated_completion_date: r.estimated_completion_date || '',
            notes: r.notes || '',
            dips: (r.dips || []).map((d: any) => ({ id: d.id, color_name: d.color_name, submission_round: d.submission_round, recipe_ref: d.recipe_ref || '' })),
        });
        setPendingColor(''); setPendingRound(1);
        setIsModalOpen(true);
    };

    const addPendingDip = () => {
        if (!pendingColor.trim()) return;
        setForm(prev => ({ ...prev, dips: [...prev.dips, { color_name: pendingColor.trim(), submission_round: pendingRound, recipe_ref: '' }] }));
        setPendingColor('');
    };
    const removeDip = (idx: number) => setForm(prev => ({ ...prev, dips: prev.dips.filter((_, i) => i !== idx) }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            ...form,
            customer_id: form.customer_id || null,
            base_item_id: form.base_item_id || null,
            approved_recipe_id: form.approved_recipe_id || null,
            due_date: form.due_date || null,
            estimated_completion_date: form.estimated_completion_date || null,
            dips: form.dips.filter(d => d.color_name.trim() !== ''),
        };
        if (editing) onEdit(editing.id, payload); else onCreate(payload);
        setIsModalOpen(false);
        setEditing(null);
        setForm(emptyForm());
    };

    const handleApproveDip = async (reqId: string, lineId: string, name: string) => {
        const ok = await confirm({
            title: 'Approve Dip',
            message: `Approve "${name}"? Status will be locked and cannot be changed after approval.`,
            confirmText: 'Approve',
            variant: 'success',
        });
        if (ok) onUpdateDipStatus(reqId, lineId, 'APPROVED');
    };

    const filtered = (labDips || []).filter((r: any) => {
        const matchSearch = !searchTerm ||
            r.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.color_standard && r.color_standard.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (r.customer_article_code && r.customer_article_code.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

    // ── Dip status buttons (mirror SampleColor approval UI) ──
    const dipBtn = (active: boolean, kind: 'reject' | 'resubmit'): React.CSSProperties => {
        const palette = kind === 'reject'
            ? { on: 'linear-gradient(to bottom, #d32f2f, #8b0000)', border: '#7f0000 #4a0000 #4a0000 #7f0000', color: '#fff' }
            : { on: 'linear-gradient(to bottom, #ffe082, #c77800)', border: '#a06000 #603000 #603000 #a06000', color: '#3e2000' };
        return {
            fontFamily: xpFont, fontSize: 10, padding: '1px 7px', cursor: 'pointer', border: '1px solid',
            borderRight: 'none', whiteSpace: 'nowrap' as const,
            background: active ? palette.on : 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
            borderColor: active ? palette.border : '#d0cfc8 #a0a09a #a0a09a #d0cfc8',
            color: active ? palette.color : '#666', fontWeight: active ? 'bold' : 'normal',
        };
    };
    const approveBtn = (): React.CSSProperties => ({
        fontFamily: xpFont, fontSize: 10, padding: '1px 7px', cursor: 'pointer', border: '1px solid',
        whiteSpace: 'nowrap' as const, background: 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
        borderColor: '#d0cfc8 #a0a09a #a0a09a #d0cfc8', color: '#666',
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: xpFont, border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#ece9d8' }}>
            {/* Title bar */}
            <div style={{ background: 'linear-gradient(to right, #001060, #111133)', color: '#fff', padding: '6px 12px', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <i className="bi bi-droplet" style={{ fontSize: 14 }} />
                Lab Dip Requests
            </div>

            {/* Toolbar */}
            <div style={{ background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, flexShrink: 0 }}>
                <button style={xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', fontWeight: 'bold' })} onClick={openCreate}>
                    <i className="bi bi-plus-lg" /> New Lab Dip Request
                </button>
                <span style={{ width: 1, height: 20, background: '#a0988c', margin: '0 2px' }} />
                <input style={{ ...xpInput, width: 200 }} placeholder="Search code, color standard, article…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <span style={{ width: 1, height: 20, background: '#a0988c', margin: '0 2px' }} />
                {STATUS_FILTERS.map(s => (
                    <button key={s} style={statusFilter === s ? xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', fontWeight: 'bold' }) : xpBtn()} onClick={() => setStatusFilter(s)}>
                        {s}
                    </button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#333' }}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, background: '#fff', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={{ background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }}>
                        <tr>
                            <th style={{ ...xpThCell, width: 140 }}>Request Code</th>
                            <th style={{ ...xpThCell, width: 120 }}>Customer</th>
                            <th style={xpThCell}>Target / Article</th>
                            <th style={{ ...xpThCell, width: 90 }}>Type</th>
                            <th style={{ ...xpThCell, width: 110 }}>Status</th>
                            <th style={{ ...xpThCell, width: 90 }}>Dips</th>
                            <th style={{ ...xpThCell, width: 130, textAlign: 'right' as const, borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={7} style={{ ...tdBase, textAlign: 'center' as const, color: '#888', fontStyle: 'italic', padding: 20 }}>No lab dip requests yet.</td></tr>
                        )}
                        {filtered.map((r: any, idx: number) => {
                            const approved = (r.dips || []).filter((d: any) => d.status === 'APPROVED').length;
                            const total = (r.dips || []).length;
                            return (
                                <React.Fragment key={r.id}>
                                    <tr onClick={() => toggleExpand(r.id)} style={{ background: idx % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5', cursor: 'pointer' }}>
                                        <td style={tdBase}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <button onClick={e => { e.stopPropagation(); toggleExpand(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 10, color: '#333' }}>
                                                    {expandedIds.has(r.id) ? '▼' : '▶'}
                                                </button>
                                                <div>
                                                    <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 'bold', color: '#0047c8', fontSize: 10 }}>{r.code}</div>
                                                    <div style={{ fontSize: 9, color: '#555' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={tdBase}>
                                            {r.customer_id ? getCustomerName(r.customer_id) : <span style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>Internal</span>}
                                        </td>
                                        <td style={tdBase}>
                                            {r.color_standard && <div style={{ fontWeight: 'bold', fontSize: 11 }}>{r.color_standard}</div>}
                                            {r.customer_article_code && <div style={{ fontSize: 9, color: '#555' }}>{r.customer_article_code}</div>}
                                            {!r.color_standard && !r.customer_article_code && <span style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>—</span>}
                                        </td>
                                        <td style={tdBase}><span style={{ fontSize: 10 }}>{r.request_type}</span></td>
                                        <td style={tdBase}><span style={statusStyle(r.status)}>{r.status}</span></td>
                                        <td style={tdBase}>
                                            {total > 0 ? (
                                                <span style={{ fontSize: 11 }}>
                                                    <span style={{ fontWeight: 'bold', color: approved === total ? '#1a6e1a' : approved > 0 ? '#0047c8' : '#777' }}>{approved}</span>
                                                    <span style={{ color: '#777' }}>/{total}</span>
                                                    <span style={{ fontSize: 9, color: '#555', marginLeft: 3 }}>approved</span>
                                                </span>
                                            ) : <span style={{ fontSize: 9, color: '#888', fontStyle: 'italic' }}>—</span>}
                                        </td>
                                        <td style={{ ...tdBase, borderRight: 'none', textAlign: 'right' as const }}>
                                            <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <button title="Edit" onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: '#555', fontSize: 13 }}>
                                                    <i className="bi bi-pencil" />
                                                </button>
                                                <button title="Delete" onClick={e => { e.stopPropagation(); onDelete(r.id); }} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: '#a00', fontSize: 13 }}>
                                                    <i className="bi bi-trash" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedIds.has(r.id) && (
                                        <tr>
                                            <td colSpan={7} style={{ padding: 0, borderBottom: '2px solid #9a9690' }}>
                                                <div style={{ background: '#ece9d8', borderTop: '2px solid #0058e6', padding: 10, display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
                                                    {/* Request status control */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginBottom: 6 }}>
                                                        <span style={{ fontSize: 10, fontWeight: 'bold', color: '#111' }}>Request Status:</span>
                                                        <select style={{ ...xpInput, width: 130 }} value={r.status} onChange={e => onUpdateStatus(r.id, e.target.value)}>
                                                            {REQUEST_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                        {r.substrate && <span style={{ fontSize: 10, color: '#444' }}>Substrate: <b>{r.substrate}</b></span>}
                                                        {r.approved_recipe_id && (
                                                            <span style={{ fontSize: 10, color: '#1b5e20' }}>
                                                                Recipe: <b>{recipeOptions.find((o: any) => o.value === r.approved_recipe_id)?.label || 'linked'}</b>
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Dips table */}
                                                    <div style={{ width: '100%', background: '#fff', border: '1px solid #b0a898' }}>
                                                        <div style={{ background: 'linear-gradient(to bottom, #e4e1d8, #d5d2c8)', borderBottom: '1px solid #9a9690', padding: '2px 8px', fontSize: 10, fontWeight: 'bold', color: '#111' }}>
                                                            <i className="bi bi-palette" /> Dips — {total} total · {approved} approved
                                                        </div>
                                                        {total > 0 ? (
                                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                <thead>
                                                                    <tr>
                                                                        <th style={{ ...xpThCell, fontSize: 9 }}>Color / Shade</th>
                                                                        <th style={{ ...xpThCell, fontSize: 9, width: 80 }}>Round</th>
                                                                        <th style={{ ...xpThCell, fontSize: 9, width: 140 }}>Recipe Ref</th>
                                                                        <th style={{ ...xpThCell, fontSize: 9, width: 90 }}>Status</th>
                                                                        <th style={{ ...xpThCell, fontSize: 9, textAlign: 'center' as const, borderRight: 'none', width: 230 }}>Update Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {(r.dips || []).map((d: any) => {
                                                                        const st = d.status || 'PENDING';
                                                                        const isApproved = st === 'APPROVED';
                                                                        return (
                                                                            <tr key={d.id} style={{ borderBottom: '1px solid #e8e5e0' }}>
                                                                                <td style={{ ...tdBase, fontWeight: 'bold' }}>{d.color_name}</td>
                                                                                <td style={tdBase}>#{d.submission_round}</td>
                                                                                <td style={tdBase}>{d.recipe_ref || <span style={{ color: '#aaa' }}>—</span>}</td>
                                                                                <td style={tdBase}><span style={statusStyle(st)}>{st}</span></td>
                                                                                <td style={{ ...tdBase, borderRight: 'none', textAlign: 'center' as const }}>
                                                                                    {isApproved ? (
                                                                                        <span style={{ fontSize: 10, color: '#1b5e20', fontWeight: 'bold' }}>Approved</span>
                                                                                    ) : (
                                                                                        <div style={{ display: 'inline-flex' }}>
                                                                                            <button type="button" style={dipBtn(st === 'RESUBMIT', 'resubmit')} onClick={() => onUpdateDipStatus(r.id, d.id, st === 'RESUBMIT' ? 'PENDING' : 'RESUBMIT')}>Resubmit</button>
                                                                                            <button type="button" style={{ ...approveBtn(), borderRight: 'none' }} onClick={() => handleApproveDip(r.id, d.id, d.color_name)}>Approve</button>
                                                                                            <button type="button" style={dipBtn(st === 'REJECTED', 'reject')} onClick={() => onUpdateDipStatus(r.id, d.id, st === 'REJECTED' ? 'PENDING' : 'REJECTED')}>Reject</button>
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <div style={{ padding: 10, fontSize: 11, color: '#888', fontStyle: 'italic' }}>No dips on this request.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Create / Edit modal */}
            <ModalWrapper
                isOpen={isModalOpen}
                modeless
                onClose={() => { setIsModalOpen(false); setEditing(null); }}
                title={editing ? <><i className="bi bi-pencil me-2" />Edit Lab Dip Request — {editing.code}</> : <><i className="bi bi-droplet me-2" />New Lab Dip Request</>}
                variant="primary"
                size="lg"
                footer={
                    <>
                        <button type="button" style={xpBtn()} onClick={() => { setIsModalOpen(false); setEditing(null); }}>Cancel</button>
                        <button type="button" style={xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#fff', fontWeight: 'bold' })} onClick={handleSubmit as any}>
                            {editing ? 'Save Changes' : 'Create Request'}
                        </button>
                    </>
                }
            >
                <form onSubmit={handleSubmit} id="create-lab-dip-form">
                    {/* ① Identity */}
                    <div style={xpGroupBox}>
                        <div style={xpGroupHeader}>① Identity</div>
                        <div style={xpGroupBody}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                                <div>
                                    <label style={xpLbl}>Request Code</label>
                                    <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const, background: '#f0f0f0', color: '#666' }} value={editing ? editing.code : 'Auto-generated (LD-…)'} readOnly />
                                </div>
                                <div>
                                    <label style={xpLbl}>Request Date <span style={{ color: '#a00' }}>*</span></label>
                                    <input type="date" style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.request_date} onChange={e => setField('request_date', e.target.value)} required />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={xpLbl}>Customer (Optional)</label>
                                    <SearchableSelect options={customerOptions} value={form.customer_id} onChange={(v: string) => setField('customer_id', v)} placeholder="Select customer…" />
                                </div>
                                <div>
                                    <label style={xpLbl}>Season / Project</label>
                                    <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.season} onChange={e => setField('season', e.target.value)} placeholder="e.g. Spring 2026" />
                                </div>
                                <div>
                                    <label style={xpLbl}>Request Type</label>
                                    <select style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.request_type} onChange={e => setField('request_type', e.target.value)}>
                                        {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={xpLbl}>Customer Article Code</label>
                                    <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.customer_article_code} onChange={e => setField('customer_article_code', e.target.value)} />
                                </div>
                                <div>
                                    <label style={xpLbl}>Internal Article Code</label>
                                    <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.internal_article_code} onChange={e => setField('internal_article_code', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ② Target & Substrate */}
                    <div style={xpGroupBox}>
                        <div style={xpGroupHeader}>② Target &amp; Substrate</div>
                        <div style={xpGroupBody}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                                <div>
                                    <label style={xpLbl}>Color Standard / Pantone</label>
                                    <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.color_standard} onChange={e => setField('color_standard', e.target.value)} placeholder="e.g. Pantone 18-1664 TCX" />
                                </div>
                                <div>
                                    <label style={xpLbl}>Substrate (fabric quality)</label>
                                    <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.substrate} onChange={e => setField('substrate', e.target.value)} placeholder="e.g. 100% Cotton 150gsm" />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={xpLbl}>Substrate Item (Optional)</label>
                                    <SearchableSelect options={[{ value: '', label: 'None' }, ...itemOptions]} value={form.base_item_id} onChange={(v: string) => setField('base_item_id', v)} placeholder="Link base/greige item…" />
                                </div>
                                <div>
                                    <label style={xpLbl}>Due Date</label>
                                    <input type="date" style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
                                </div>
                                <div>
                                    <label style={xpLbl}>Estimated Completion</label>
                                    <input type="date" style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }} value={form.estimated_completion_date} onChange={e => setField('estimated_completion_date', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ③ Dips */}
                    <div style={xpGroupBox}>
                        <div style={xpGroupHeader}>③ Dips (Submissions)</div>
                        <div style={xpGroupBody}>
                            <div style={{ background: '#f5f9ff', border: '1px solid #b0c8e8', minHeight: 40, padding: '6px 8px', marginBottom: 6 }}>
                                {form.dips.length === 0
                                    ? <span style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>No dips added yet…</span>
                                    : form.dips.map((d, idx) => (
                                        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', marginRight: 4, marginBottom: 4, background: '#e8f4e8', border: '1px solid #7aba7a', fontSize: 11 }}>
                                            <span style={{ fontSize: 9, fontWeight: 'bold', color: '#228b22' }}>R{d.submission_round}</span>
                                            {d.color_name}
                                            <span onClick={() => removeDip(idx)} style={{ cursor: 'pointer', color: '#a00', marginLeft: 2, fontWeight: 'bold', fontSize: 12, lineHeight: 1 }} title="Remove">×</span>
                                        </span>
                                    ))
                                }
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <SearchableSelect options={colorOptions} value={pendingColor} onChange={setPendingColor} placeholder="Select color/shade…" size="sm" />
                                </div>
                                <label style={{ fontSize: 10, color: '#555' }}>Round</label>
                                <input type="number" min={1} style={{ ...xpInput, width: 56 }} value={pendingRound} onChange={e => setPendingRound(parseInt(e.target.value) || 1)} />
                                <button type="button" style={xpBtn()} onClick={addPendingDip}><i className="bi bi-plus-lg" /> Add</button>
                            </div>
                        </div>
                    </div>

                    {/* ④ Recipe link & notes */}
                    <div style={xpGroupBox}>
                        <div style={xpGroupHeader}>④ Approved Recipe &amp; Notes</div>
                        <div style={xpGroupBody}>
                            <div style={{ marginBottom: 8 }}>
                                <label style={xpLbl}>Approved Dye Recipe (Optional)</label>
                                <SearchableSelect options={[{ value: '', label: 'Not yet linked' }, ...recipeOptions]} value={form.approved_recipe_id} onChange={(v: string) => setField('approved_recipe_id', v)} placeholder="Link approved recipe…" />
                            </div>
                            <div>
                                <label style={xpLbl}>Notes</label>
                                <textarea style={{ ...xpInput, height: 'auto', padding: '4px 6px', width: '100%', resize: 'vertical' as const, boxSizing: 'border-box' as const }} rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} />
                            </div>
                        </div>
                    </div>
                </form>
            </ModalWrapper>
        </div>
    );
}
