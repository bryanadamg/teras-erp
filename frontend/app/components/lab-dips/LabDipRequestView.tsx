'use client';
import React, { useState, useMemo } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';

// ── XP style constants (consistent with DyeingSettingView) ──────────────────
const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const xpInput = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 6px', outline: 'none', height: 20,
} : {
    fontFamily: modernFont, fontSize: 13, border: '1px solid #cbd3df', borderRadius: 7,
    padding: '4px 8px', background: '#fff', color: '#1e293b', outline: 'none', height: 'auto',
};
const xpBtn = (classic: boolean, extra: React.CSSProperties = {}): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000',
    ...extra,
} : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 500, padding: '5px 12px', cursor: 'pointer',
    background: '#fff', color: '#334155', border: '1px solid #cbd3df', borderRadius: 7,
    ...extra,
};
// Modern primary-button overrides (Submit/Create/Add/New). Merged on top of the secondary base above.
const modernPrimaryBtn: React.CSSProperties = {
    fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none',
};
const xpGroupBox = (classic: boolean): React.CSSProperties => classic ? {
    border: '1px solid #c0bdb5', boxShadow: 'inset 1px 1px 0 #fff, 1px 1px 0 #c0bdb5', marginBottom: 10,
} : {
    background: '#fff', border: '1px solid #dbe1ea', borderRadius: 9, marginBottom: 10, overflow: 'hidden',
};
const xpGroupHeader = (classic: boolean): React.CSSProperties => classic ? {
    background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)',
    color: '#fff', fontFamily: xpFont, fontSize: 10, fontWeight: 'bold',
    padding: '3px 8px', letterSpacing: '0.5px', textTransform: 'uppercase' as const,
} : {
    background: '#eef1f6', color: '#475569', fontFamily: modernFont, fontSize: 11, fontWeight: 700,
    padding: '7px 12px', letterSpacing: '0.04em', textTransform: 'uppercase' as const,
    borderBottom: '1px solid #dbe1ea',
};
const xpGroupBody = (classic: boolean): React.CSSProperties => classic
    ? { background: '#fff', padding: '10px' }
    : { background: '#fff', padding: '10px' };
const xpLbl = (classic: boolean): React.CSSProperties => classic
    ? { fontFamily: xpFont, fontSize: 11, color: '#000', display: 'block', marginBottom: 2 }
    : { fontFamily: modernFont, fontSize: 12, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 3 };
const xpThCell = (classic: boolean): React.CSSProperties => classic ? {
    padding: '3px 6px', borderRight: '1px solid #b0aaa0', textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const, fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#000',
} : {
    padding: '6px 10px', textAlign: 'left' as const, whiteSpace: 'nowrap' as const,
    fontFamily: modernFont, fontSize: 11, fontWeight: 700, color: '#475569',
    textTransform: 'uppercase' as const, background: '#eef1f6', borderBottom: '1.5px solid #cbd3df',
};
const tdBase = (classic: boolean): React.CSSProperties => classic ? {
    padding: '4px 6px', borderRight: '1px solid #c0bdb5', borderBottom: '1px solid #d0cdc8',
    verticalAlign: 'middle' as const, fontFamily: xpFont, fontSize: 11,
} : {
    padding: '6px 10px', borderBottom: '1px solid #e6eaf1',
    verticalAlign: 'middle' as const, fontFamily: modernFont, fontSize: 13, color: '#334155',
};

const REQUEST_TYPES = ['NEW', 'RESUBMIT', 'STRIKE_OFF'];
const STATUS_FILTERS = ['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
const REQUEST_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];

const statusStyle = (status: string, classic: boolean): React.CSSProperties => {
    if (classic) {
        const map: Record<string, { bg: string; border: string; color: string }> = {
            APPROVED:    { bg: '#d4edda', border: '#27713a', color: '#0c3a1a' },
            REJECTED:    { bg: '#f8d7da', border: '#a01a1a', color: '#4a0000' },
            SUBMITTED:   { bg: '#dce4f5', border: '#3a5faa', color: '#0d2a6e' },
            RESUBMIT:    { bg: '#fff3cd', border: '#b8860b', color: '#3e2000' },
            IN_PROGRESS: { bg: '#fff3cd', border: '#b8860b', color: '#3e2000' },
            PENDING:     { bg: '#e8e8e8', border: '#7a7a7a', color: '#111' },
        };
        const s = map[status] || { bg: '#e8e8e8', border: '#7a7a7a', color: '#111' };
        return { background: s.bg, border: `1px solid ${s.border}`, color: s.color, padding: '1px 5px', fontSize: 9, fontFamily: xpFont, fontWeight: 'bold', whiteSpace: 'nowrap' as const };
    }
    // Modern: semantic colors preserved, softer bg + matching text/border, rounded 6px.
    const map: Record<string, { bg: string; border: string; color: string }> = {
        APPROVED:    { bg: '#ecfdf3', border: '#abdfc0', color: '#15803d' },
        REJECTED:    { bg: '#fef2f2', border: '#f3c4c4', color: '#dc2626' },
        SUBMITTED:   { bg: '#eff6ff', border: '#bfd3f5', color: '#1d4ed8' },
        RESUBMIT:    { bg: '#fffbeb', border: '#fce3a6', color: '#b45309' },
        IN_PROGRESS: { bg: '#fffbeb', border: '#fce3a6', color: '#b45309' },
        PENDING:     { bg: '#f1f5f9', border: '#d4dce6', color: '#475569' },
    };
    const s = map[status] || { bg: '#f1f5f9', border: '#d4dce6', color: '#475569' };
    return { display: 'inline-block', background: s.bg, border: `1px solid ${s.border}`, color: s.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontFamily: modernFont, fontWeight: 600, whiteSpace: 'nowrap' as const };
};

const today = () => new Date().toISOString().split('T')[0];
const LABDIP_PAGE_SIZE = 20;

type DipDraft = { id?: string; color_name: string; color_id?: string | null; submission_round: number; recipe_ref?: string };
type ItemDraft = { id?: string; item_id: string; item_label?: string; variant_seq?: number; dips: DipDraft[] };

// 0 → A, 1 → B, … 25 → Z, 26 → AA (spreadsheet-column style).
const variantLetter = (seq: number): string => {
    let s = '', n = seq + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
};
// Numeric portion of the request code: "LD-2026-00001" → "00001".
const seqPart = (code?: string): string => (code || '').split('-').pop() || '';

// Two distinct chips: the request sequence (neutral) and the item's variant letter (accent).
const seqBadge = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: "'Courier New', monospace", fontSize: 11, fontWeight: 'bold', color: '#333',
    background: '#e4e1d8', border: '1px solid #a0988c', padding: '1px 7px', whiteSpace: 'nowrap' as const,
} : {
    fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 700, color: '#475569',
    background: '#eef1f6', border: '1px solid #d4dce6', borderRadius: 5, padding: '2px 9px', whiteSpace: 'nowrap' as const,
};
const variantBadge = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold', color: '#fff',
    background: '#3a6fc4', border: '1px solid #1a4a8a', padding: '1px 7px', whiteSpace: 'nowrap' as const,
} : {
    fontFamily: modernFont, fontSize: 12, fontWeight: 700, color: '#1e40af',
    background: '#dbe7fb', border: '1px solid #bcd0f5', borderRadius: 5, padding: '2px 9px', whiteSpace: 'nowrap' as const,
};

const emptyForm = () => ({
    request_date: today(),
    customer_id: '',
    approved_recipe_id: '',
    season: '',
    request_type: 'NEW',
    notes: '',
    items: [] as ItemDraft[],
    // Legacy dips with no item, carried through on edit so they aren't dropped.
    legacyDips: [] as DipDraft[],
});

export default function LabDipRequestView({
    labDips, customers, items, onSearchItems, recipes,
    onCreate, onEdit, onUpdateStatus, onUpdateItemStatus, onDelete,
}: any) {
    useToast();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { hasPermission } = useUser();
    const canManage = hasPermission('dyeing.manage');

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const [pendingItem, setPendingItem] = useState('');
    const [page, setPage] = useState(1);

    // Approval dialog: captures the "set" index (+ optional notes) that completes the
    // approved color code, then mints a Color library entry via onUpdateItemStatus.
    const [approval, setApproval] = useState<{ reqId: string; itemId: string; seq: string; variant: string } | null>(null);
    const [approvalSet, setApprovalSet] = useState('');
    const [approvalNotes, setApprovalNotes] = useState('');
    const openApproval = (reqId: string, v: any) => {
        if (v.status === 'APPROVED' || v.status === 'REJECTED') return; // locked
        setApproval({ reqId, itemId: v.id, seq: v.seq, variant: v.variant });
        setApprovalSet('');
        setApprovalNotes('');
    };
    const confirmApproval = () => {
        if (!approval || !approvalSet.trim()) return;
        onUpdateItemStatus(approval.reqId, approval.itemId, 'APPROVED', { set: approvalSet.trim(), notes: approvalNotes.trim() || undefined });
        setApproval(null);
    };

    // `items` is the server-side typeahead result page (already scoped to Finished Goods).
    const itemLabel = (it: any) => it.code ? `${it.code} — ${it.name}` : it.name;
    const itemOptions = useMemo(() =>
        (items || []).map((it: any) => ({ value: it.id, label: itemLabel(it) })),
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

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setPendingItem(''); setIsModalOpen(true); };

    const openEdit = (r: any) => {
        setEditing(r);
        const mapDip = (d: any): DipDraft => ({ id: d.id, color_name: d.color_name, color_id: d.color_id || null, submission_round: d.submission_round, recipe_ref: d.recipe_ref || '' });
        setForm({
            request_date: r.request_date || today(),
            customer_id: r.customer_id || '',
            approved_recipe_id: r.approved_recipe_id || '',
            season: r.season || '',
            request_type: r.request_type || 'NEW',
            notes: r.notes || '',
            items: (r.items || []).map((it: any) => ({ id: it.id, item_id: it.item_id, item_label: it.item_code ? `${it.item_code} — ${it.item_name}` : it.item_name, variant_seq: it.variant_seq, dips: (it.dips || []).map(mapDip) })),
            legacyDips: (r.dips || []).filter((d: any) => !d.lab_dip_item_id).map(mapDip),
        });
        setPendingItem('');
        setIsModalOpen(true);
    };

    const addItem = () => {
        if (!pendingItem) return;
        if (form.items.some(it => it.item_id === pendingItem)) { setPendingItem(''); return; }
        const label = itemOptions.find((o: any) => o.value === pendingItem)?.label || pendingItem;
        setForm(prev => ({ ...prev, items: [...prev.items, { item_id: pendingItem, item_label: label, dips: [] }] }));
        setPendingItem('');
    };
    const removeItem = (itemId: string) => setForm(prev => ({ ...prev, items: prev.items.filter(it => it.item_id !== itemId) }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            request_date: form.request_date,
            customer_id: form.customer_id || null,
            approved_recipe_id: form.approved_recipe_id || null,
            season: form.season,
            request_type: form.request_type,
            notes: form.notes,
            items: form.items.map((it, gi) => ({
                id: it.id,
                item_id: it.item_id,
                order: gi,
                dips: it.dips.filter(d => d.color_name.trim() !== ''),
            })),
            dips: form.legacyDips.filter(d => d.color_name.trim() !== ''),
        };
        if (editing) onEdit(editing.id, payload); else onCreate(payload);
        setIsModalOpen(false);
        setEditing(null);
        setForm(emptyForm());
    };

    const filtered = (labDips || []).filter((r: any) => {
        const matchSearch = !searchTerm ||
            r.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.color_standard && r.color_standard.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (r.customer_article_code && r.customer_article_code.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
        return matchSearch && matchStatus;
    });

    // Search/filter change → reset to page 1
    React.useEffect(() => { setPage(1); }, [searchTerm, statusFilter]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / LABDIP_PAGE_SIZE));
    const clampedPage = Math.min(page, totalPages);
    const paged = filtered.slice((clampedPage - 1) * LABDIP_PAGE_SIZE, clampedPage * LABDIP_PAGE_SIZE);

    const setField = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

    // Request code: real code when editing; else a best-effort preview of the next code.
    // The server mints from a monotonic DB sequence, so this max+1 estimate is a lower bound
    // (it can trail the true value after the top request is deleted) — hence the "(on save)" note.
    const maxSeq = (labDips || []).reduce((m: number, r: any) => {
        const n = parseInt(seqPart(r.code), 10);
        return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const nextCode = `LD-${new Date().getFullYear()}-${String(maxSeq + 1).padStart(5, '0')}`;
    const displayCode = editing ? editing.code : nextCode;

    // Segmented per-variant status control (Progress / Approved / Rejected).
    const itemStatusBtn = (active: boolean, kind: 'progress' | 'approved' | 'rejected'): React.CSSProperties => {
        if (classic) {
            const map = {
                progress: { on: 'linear-gradient(to bottom, #ffe082, #c77800)', border: '#a06000 #603000 #603000 #a06000', color: '#3e2000' },
                approved: { on: 'linear-gradient(to bottom, #7bd88f, #1b7a34)', border: '#0f5a22 #073d15 #073d15 #0f5a22', color: '#04220c' },
                rejected: { on: 'linear-gradient(to bottom, #d32f2f, #8b0000)', border: '#7f0000 #4a0000 #4a0000 #7f0000', color: '#fff' },
            };
            const p = map[kind];
            return {
                fontFamily: xpFont, fontSize: 10, padding: '1px 8px', cursor: 'pointer', border: '1px solid',
                borderRight: 'none', whiteSpace: 'nowrap' as const,
                background: active ? p.on : 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
                borderColor: active ? p.border : '#d0cfc8 #a0a09a #a0a09a #d0cfc8',
                color: active ? p.color : '#666', fontWeight: active ? 'bold' : 'normal',
            };
        }
        const map = {
            progress: { onBg: '#fffbeb', onBorder: '#fce3a6', onColor: '#b45309' },
            approved: { onBg: '#ecfdf3', onBorder: '#abdfc0', onColor: '#15803d' },
            rejected: { onBg: '#fef2f2', onBorder: '#f3c4c4', onColor: '#dc2626' },
        };
        const p = map[kind];
        return {
            fontFamily: modernFont, fontSize: 12, padding: '4px 11px', cursor: 'pointer', border: '1px solid',
            borderRight: 'none', whiteSpace: 'nowrap' as const,
            background: active ? p.onBg : '#fff', borderColor: active ? p.onBorder : '#cbd3df',
            color: active ? p.onColor : '#64748b', fontWeight: active ? 600 : 500,
        };
    };

    const primaryToolbarBtn = classic
        ? xpBtn(true, { background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', fontWeight: 'bold' })
        : xpBtn(false, modernPrimaryBtn);

    return (
        <div style={classic
            ? { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: xpFont, border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#ece9d8' }
            : { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: modernFont, border: '1px solid #dbe1ea', borderRadius: 9, background: '#f8fafc', overflow: 'hidden' }}>
            {/* Title bar */}
            <div style={classic
                ? { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', padding: '6px 12px', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }
                : { background: '#f7f9fc', color: '#1e293b', borderBottom: '1px solid #dbe1ea', padding: '8px 12px', fontSize: 14, fontWeight: 700, fontFamily: modernFont, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <i className="bi bi-droplet" style={classic ? { fontSize: 14 } : { fontSize: 14, color: '#2563eb' }} />
                Lab Dip Requests
            </div>

            {/* Toolbar */}
            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, flexShrink: 0 }}>
                {canManage && (
                <button style={primaryToolbarBtn} onClick={openCreate}>
                    <i className="bi bi-plus-lg" /> New Lab Dip Request
                </button>
                )}
                <span style={classic ? { width: 1, height: 20, background: '#a0988c', margin: '0 2px' } : { width: 1, height: 20, background: '#dbe1ea', margin: '0 2px' }} />
                <input style={{ ...xpInput(classic), width: 200 }} placeholder="Search code, color standard, article…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <span style={classic ? { width: 1, height: 20, background: '#a0988c', margin: '0 2px' } : { width: 1, height: 20, background: '#dbe1ea', margin: '0 2px' }} />
                {STATUS_FILTERS.map(s => (
                    <button key={s} style={statusFilter === s ? primaryToolbarBtn : xpBtn(classic)} onClick={() => setStatusFilter(s)}>
                        {s}
                    </button>
                ))}
                <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, background: '#fff', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={classic
                        ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }
                        : { background: '#eef1f6' }}>
                        <tr>
                            <th style={{ ...xpThCell(classic), width: 140 }}>Request Code</th>
                            <th style={{ ...xpThCell(classic), width: 120 }}>Customer</th>
                            <th style={xpThCell(classic)}>Items</th>
                            <th style={{ ...xpThCell(classic), width: 90 }}>Type</th>
                            <th style={{ ...xpThCell(classic), width: 110 }}>Status</th>
                            <th style={{ ...xpThCell(classic), width: 90 }}>Variants</th>
                            <th style={{ ...xpThCell(classic), width: 130, textAlign: 'right' as const, borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={7} style={{ ...tdBase(classic), textAlign: 'center' as const, color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>No lab dip requests yet.</td></tr>
                        )}
                        {paged.map((r: any, idx: number) => {
                            const approved = (r.items || []).filter((it: any) => it.status === 'APPROVED').length;
                            const total = (r.items || []).length;
                            return (
                                <React.Fragment key={r.id}>
                                    <tr onClick={() => toggleExpand(r.id)} style={classic
                                        ? { background: idx % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5', cursor: 'pointer' }
                                        : { background: idx % 2 === 0 ? '#fff' : '#f8fafc', cursor: 'pointer' }}>
                                        <td style={tdBase(classic)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <button onClick={e => { e.stopPropagation(); toggleExpand(r.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 10, color: classic ? '#333' : '#64748b' }}>
                                                    {expandedIds.has(r.id) ? '▼' : '▶'}
                                                </button>
                                                <div>
                                                    <div style={classic
                                                        ? { fontFamily: "'Courier New', monospace", fontWeight: 'bold', color: '#0047c8', fontSize: 10 }
                                                        : { fontFamily: "'Courier New', monospace", fontWeight: 700, color: '#2563eb', fontSize: 12 }}>{r.code}</div>
                                                    <div style={{ fontSize: classic ? 9 : 11, color: classic ? '#555' : '#64748b' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={tdBase(classic)}>
                                            {r.customer_id ? getCustomerName(r.customer_id) : <span style={{ fontSize: classic ? 9 : 12, color: classic ? '#555' : '#64748b', fontStyle: 'italic' }}>Internal</span>}
                                        </td>
                                        <td style={tdBase(classic)}>
                                            {(() => {
                                                const its = r.items || [];
                                                if (!its.length) return <span style={{ fontSize: classic ? 9 : 12, color: classic ? '#888' : '#94a3b8', fontStyle: 'italic' }}>—</span>;
                                                const first = its[0];
                                                return (
                                                    <>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <span style={{ ...seqBadge(classic), fontSize: classic ? 9 : 11, padding: '0 5px' }}>{seqPart(r.code)}</span>
                                                            <span style={{ ...variantBadge(classic), fontSize: classic ? 9 : 11, padding: '0 5px' }}>{variantLetter(first.variant_seq ?? 0)}</span>
                                                            <span style={{ fontWeight: 'bold', fontSize: classic ? 11 : 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{first.item_name || first.item_code || '—'}</span>
                                                        </div>
                                                        {its.length > 1 && <div style={{ fontSize: classic ? 9 : 11, color: classic ? '#555' : '#64748b' }}>+{its.length - 1} more</div>}
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td style={tdBase(classic)}><span style={{ fontSize: classic ? 10 : 13 }}>{r.request_type}</span></td>
                                        <td style={tdBase(classic)}><span style={statusStyle(r.status, classic)}>{r.status}</span></td>
                                        <td style={tdBase(classic)}>
                                            {total > 0 ? (
                                                <span style={{ fontSize: classic ? 11 : 13 }}>
                                                    <span style={{ fontWeight: 'bold', color: approved === total ? (classic ? '#1a6e1a' : '#15803d') : approved > 0 ? (classic ? '#0047c8' : '#2563eb') : (classic ? '#777' : '#94a3b8') }}>{approved}</span>
                                                    <span style={{ color: classic ? '#777' : '#94a3b8' }}>/{total}</span>
                                                    <span style={{ fontSize: classic ? 9 : 11, color: classic ? '#555' : '#64748b', marginLeft: 3 }}>approved</span>
                                                </span>
                                            ) : <span style={{ fontSize: classic ? 9 : 12, color: classic ? '#888' : '#94a3b8', fontStyle: 'italic' }}>—</span>}
                                        </td>
                                        <td style={{ ...tdBase(classic), borderRight: 'none', textAlign: 'right' as const }}>
                                            <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                                {canManage && (
                                                <button title="Edit" onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#555' : '#64748b', fontSize: 13 }}>
                                                    <i className="bi bi-pencil" />
                                                </button>
                                                )}
                                                {canManage && (
                                                <button title="Delete" onClick={e => { e.stopPropagation(); onDelete(r.id); }} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#a00' : '#dc2626', fontSize: 13 }}>
                                                    <i className="bi bi-trash" />
                                                </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedIds.has(r.id) && (() => {
                                        const fmt = (d: any) => d ? new Date(d).toLocaleDateString() : '—';
                                        const recipeLabel = recipeOptions.find((o: any) => o.value === r.approved_recipe_id)?.label;
                                        const detailLbl: React.CSSProperties = classic
                                            ? { fontFamily: xpFont, fontSize: 10, color: '#333', fontWeight: 'bold', minWidth: 92, flexShrink: 0 }
                                            : { fontFamily: modernFont, fontSize: 11, color: '#475569', fontWeight: 600, minWidth: 92, flexShrink: 0 };
                                        const detailVal: React.CSSProperties = classic
                                            ? { fontFamily: xpFont, fontSize: 11, color: '#000' }
                                            : { fontFamily: modernFont, fontSize: 12.5, color: '#1e293b' };
                                        // One row per selected item: code + variant badges, item name, status control.
                                        const variantRows = (r.items || []).map((it: any) => ({
                                            id: it.id,
                                            name: it.item_name || it.item_code || '—',
                                            seq: seqPart(r.code),
                                            variant: variantLetter(it.variant_seq ?? 0),
                                            status: it.status || 'PENDING',
                                            approvedCode: it.approved_color_code || null,
                                        }));
                                        // Progress/Reject toggle: clicking the active one reverts to PENDING.
                                        // APPROVED/REJECTED are terminal (locked) — guarded here and on the server.
                                        const setItemStatus = (itemId: string, cur: string, next: string) => {
                                            if (cur === 'APPROVED' || cur === 'REJECTED') return;
                                            onUpdateItemStatus(r.id, itemId, cur === next ? 'PENDING' : next);
                                        };
                                        const sections: { title: string; fields: any[][] }[] = [
                                            { title: '① Identity', fields: [
                                                ['Customer', r.customer_id ? getCustomerName(r.customer_id) : 'Internal'],
                                                ['Season / Project', r.season || '—'],
                                                ['Request Type', r.request_type || '—'],
                                                ['Request Date', fmt(r.request_date)],
                                            ]},
                                            { title: '② Recipe & Notes', fields: [
                                                ['Approved Recipe', recipeLabel || '—', true],
                                                ['Notes', r.notes || '—', true],
                                            ]},
                                        ];
                                        return (
                                        <tr>
                                            <td colSpan={7} style={classic
                                                ? { padding: 6, borderBottom: '2px solid #9a9690', background: '#d8d3c8' }
                                                : { padding: 8, borderBottom: '1px solid #dbe1ea', background: '#e9edf1' }}>
                                                <div style={{
                                                    boxShadow: classic
                                                        ? 'inset 0 2px 5px rgba(0,0,0,0.28), inset 0 -2px 5px rgba(0,0,0,0.16)'
                                                        : 'inset 0 2px 6px rgba(0,0,0,0.18), inset 0 -2px 6px rgba(0,0,0,0.10)',
                                                    ...(classic
                                                        ? { background: '#ece9d8', border: '1px solid #808080', display: 'flex', minHeight: 170, overflow: 'hidden' }
                                                        : { background: '#f8fafc', border: '1px solid #ced4da', borderRadius: 8, display: 'flex', minHeight: 170, overflow: 'hidden' }),
                                                }}>
                                                    {/* LEFT — Item variants + status */}
                                                    <div style={{ width: '48%', borderRight: classic ? '1px solid #a0988c' : '1px solid #dbe1ea', display: 'flex', flexDirection: 'column' }}>
                                                        <div style={classic
                                                            ? { background: 'linear-gradient(to bottom, #e4e1d8, #d5d2c8)', borderBottom: '1px solid #9a9690', padding: '2px 8px', fontSize: 10, fontWeight: 'bold', color: '#111', display: 'flex', alignItems: 'center', gap: 6, fontFamily: xpFont, flexShrink: 0 }
                                                            : { background: '#eef1f6', borderBottom: '1px solid #dbe1ea', padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                            <i className="bi bi-box-seam" /> Variants — {total} total · {approved} approved
                                                        </div>
                                                        {total > 0 ? (
                                                            <div style={{ overflowY: 'auto', flex: 1, padding: classic ? '4px 6px' : '8px 10px' }}>
                                                                {variantRows.map((v: any) => {
                                                                    const locked = v.status === 'APPROVED' || v.status === 'REJECTED';
                                                                    return (
                                                                    <div key={v.id} style={classic
                                                                        ? { border: '1px solid #b0c8e8', background: '#f5f9ff', marginBottom: 5, padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }
                                                                        : { border: '1px solid #dbe1ea', background: '#fff', borderRadius: 8, marginBottom: 6, padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                                                                        {/* Item name (left) */}
                                                                        <span style={{ flex: 1, minWidth: 90, fontWeight: 700, fontSize: classic ? 11 : 13, color: classic ? '#0d3a8a' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{v.name}</span>
                                                                        {/* Code + variant (right, before the status control). When approved, the
                                                                            variant badge shows the full approved color code (e.g. 00006-A-5). */}
                                                                        <span style={{ ...seqBadge(classic), fontSize: classic ? 9 : 11, padding: '0 5px' }}>{v.seq}</span>
                                                                        {v.approvedCode ? (
                                                                            <span title="Approved color code (saved to library)" style={{ ...variantBadge(classic), fontSize: classic ? 9 : 11, padding: '0 6px', background: classic ? '#1b7a34' : '#dcfce7', color: classic ? '#fff' : '#166534', borderColor: classic ? '#0f5a22' : '#a7e3bf' }}>{v.approvedCode}</span>
                                                                        ) : (
                                                                            <span style={{ ...variantBadge(classic), fontSize: classic ? 9 : 11, padding: '0 5px' }}>{v.variant}</span>
                                                                        )}
                                                                        {canManage ? (
                                                                            <div style={{ display: 'inline-flex', opacity: locked ? 0.85 : 1 }}>
                                                                                <button type="button" disabled={locked} style={{ ...itemStatusBtn(v.status === 'IN_PROGRESS', 'progress'), ...(locked ? { cursor: 'not-allowed' } : {}) }} onClick={() => setItemStatus(v.id, v.status, 'IN_PROGRESS')}>Progress</button>
                                                                                <button type="button" disabled={locked} style={{ ...itemStatusBtn(v.status === 'APPROVED', 'approved'), ...(locked ? { cursor: 'not-allowed' } : {}) }} onClick={() => openApproval(r.id, v)}>Approved</button>
                                                                                <button type="button" disabled={locked} style={{ ...itemStatusBtn(v.status === 'REJECTED', 'rejected'), borderRight: '1px solid', ...(locked ? { cursor: 'not-allowed' } : {}) }} onClick={() => setItemStatus(v.id, v.status, 'REJECTED')}>Rejected</button>
                                                                                {locked && <i className="bi bi-lock-fill" title="Decision locked" style={{ marginLeft: 6, alignSelf: 'center', fontSize: classic ? 10 : 12, color: classic ? '#777' : '#94a3b8' }} />}
                                                                            </div>
                                                                        ) : (
                                                                            <span style={statusStyle(v.status, classic)}>{v.status.replace('_', ' ')}</span>
                                                                        )}
                                                                    </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: 10, fontSize: classic ? 11 : 13, color: classic ? '#888' : '#64748b', fontStyle: 'italic' }}>No items on this request.</div>
                                                        )}
                                                    </div>
                                                    {/* RIGHT — Request details */}
                                                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                                        {/* Request status control */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flexWrap: 'wrap' as const, borderBottom: classic ? '1px solid #d0cdc8' : '1px solid #e6eaf1', background: '#fff' }}>
                                                            <span style={{ fontSize: classic ? 10 : 12, fontWeight: classic ? 'bold' : 600, color: classic ? '#111' : '#475569' }}>Request Status:</span>
                                                            <select style={{ ...xpInput(classic), width: 140 }} value={r.status} disabled={!canManage} onChange={e => onUpdateStatus(r.id, e.target.value)}>
                                                                {REQUEST_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                            </select>
                                                        </div>
                                                        {sections.map(({ title, fields }) => (
                                                            <div key={title}>
                                                                <div style={xpGroupHeader(classic)}>{title}</div>
                                                                <div style={{ padding: '6px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', background: '#fff', borderBottom: classic ? '1px solid #d0cdc8' : '1px solid #e6eaf1' }}>
                                                                    {fields.map(([label, value, full]: any) => (
                                                                        <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', ...(full ? { gridColumn: '1 / -1' } : {}) }}>
                                                                            <span style={detailLbl}>{label}</span>
                                                                            <span style={{ ...detailVal, whiteSpace: full ? 'pre-wrap' as const : undefined }}>{value}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })()}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Pager page={clampedPage} total={filtered.length} pageSize={LABDIP_PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />

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
                        <button type="button" style={xpBtn(classic)} onClick={() => { setIsModalOpen(false); setEditing(null); }}>Cancel</button>
                        <button type="button" style={classic
                            ? xpBtn(true, { background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#fff', fontWeight: 'bold' })
                            : xpBtn(false, modernPrimaryBtn)} onClick={handleSubmit as any}>
                            {editing ? 'Save Changes' : 'Create Request'}
                        </button>
                    </>
                }
            >
                <form onSubmit={handleSubmit} id="create-lab-dip-form">
                    {/* ① Identity */}
                    <div style={xpGroupBox(classic)}>
                        <div style={xpGroupHeader(classic)}>① Identity</div>
                        <div style={xpGroupBody(classic)}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                                <div>
                                    <label style={xpLbl(classic)}>Request Code</label>
                                    <div style={classic
                                        ? { fontFamily: "'Courier New', monospace", fontSize: 14, fontWeight: 'bold', color: '#0047c8', padding: '2px 0' }
                                        : { fontFamily: "'Courier New', monospace", fontSize: 15, fontWeight: 700, color: '#2563eb', padding: '3px 0' }}>
                                        {displayCode}
                                        {!editing && <span style={{ fontFamily: modernFont, fontSize: classic ? 9 : 10, fontWeight: 400, color: classic ? '#888' : '#94a3b8', marginLeft: 6 }}>(on save)</span>}
                                    </div>
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Request Type</label>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                                        {REQUEST_TYPES.map(t => {
                                            const active = form.request_type === t;
                                            return (
                                                <button key={t} type="button" onClick={() => setField('request_type', t)} style={classic
                                                    ? { fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', padding: '2px 9px', cursor: 'pointer', border: '1px solid', background: active ? 'linear-gradient(to bottom, #316ac5, #1a4a8a)' : 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderColor: active ? '#1a3a7a #0a1a4a #0a1a4a #1a3a7a' : '#dfdfdf #808080 #808080 #dfdfdf', color: active ? '#fff' : '#333' }
                                                    : { fontFamily: modernFont, fontSize: 12, fontWeight: 600, padding: '4px 11px', cursor: 'pointer', borderRadius: 999, border: '1px solid', background: active ? '#2563eb' : '#fff', borderColor: active ? '#2563eb' : '#cbd3df', color: active ? '#fff' : '#475569' }}>
                                                    {t}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Customer (Optional)</label>
                                    <SearchableSelect options={customerOptions} value={form.customer_id} onChange={(v: string) => setField('customer_id', v)} placeholder="Select customer…" />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Season / Project</label>
                                    <input style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.season} onChange={e => setField('season', e.target.value)} placeholder="e.g. Spring 2026" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ② Items */}
                    <div style={xpGroupBox(classic)}>
                        <div style={xpGroupHeader(classic)}>② Items</div>
                        <div style={xpGroupBody(classic)}>
                            {/* Add finished-good item */}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <SearchableSelect
                                        options={itemOptions.filter((o: any) => !form.items.some(it => it.item_id === o.value))}
                                        value={pendingItem}
                                        onChange={setPendingItem}
                                        onSearch={onSearchItems}
                                        placeholder="Add finished-good item…"
                                        size="sm"
                                    />
                                </div>
                                <button type="button" style={classic ? xpBtn(true) : xpBtn(false, modernPrimaryBtn)} onClick={addItem}><i className="bi bi-plus-lg" /> Add Item</button>
                            </div>

                            {form.items.length === 0 && (
                                <div style={{ fontSize: classic ? 11 : 13, color: classic ? '#999' : '#94a3b8', fontStyle: 'italic', padding: '4px 2px' }}>
                                    No items yet — add finished-good items; each is assigned a variant code.
                                </div>
                            )}

                            {(() => {
                                // Preview variant_seq per item: existing keep theirs; new items take
                                // the next index above the max kept seq (matches the server's rule).
                                const keptSeqs = form.items.filter(it => it.variant_seq !== undefined).map(it => it.variant_seq as number);
                                let np = keptSeqs.length ? Math.max(...keptSeqs) + 1 : 0;
                                return form.items.map(it => {
                                const seq = it.variant_seq !== undefined ? it.variant_seq : np++;
                                return (
                                    <div key={it.item_id} style={classic
                                        ? { border: '1px solid #b0c8e8', background: '#f5f9ff', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }
                                        : { border: '1px solid #dbe1ea', background: '#fff', borderRadius: 8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
                                        {/* Item name (left) */}
                                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: classic ? 11 : 13, color: classic ? '#0d3a8a' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                            <i className="bi bi-box-seam" style={{ marginRight: 5, color: classic ? '#3a6fc4' : '#2563eb' }} />{it.item_label || it.item_id}
                                        </span>
                                        {/* Two distinct badges: sequence + variant (right) */}
                                        <span title="Request sequence" style={seqBadge(classic)}>{seqPart(displayCode)}</span>
                                        <span title="Variant" style={variantBadge(classic)}>{variantLetter(seq)}</span>
                                        <button type="button" title="Remove item" onClick={() => removeItem(it.item_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: classic ? '#a00' : '#dc2626', fontSize: 15, fontWeight: 'bold', lineHeight: 1, padding: '0 2px' }}>×</button>
                                    </div>
                                );
                                });
                            })()}
                        </div>
                    </div>

                    {/* ③ Recipe link & notes */}
                    <div style={xpGroupBox(classic)}>
                        <div style={xpGroupHeader(classic)}>③ Approved Recipe &amp; Notes</div>
                        <div style={xpGroupBody(classic)}>
                            <div style={{ marginBottom: 8 }}>
                                <label style={xpLbl(classic)}>Approved Dye Recipe (Optional)</label>
                                <SearchableSelect options={[{ value: '', label: 'Not yet linked' }, ...recipeOptions]} value={form.approved_recipe_id} onChange={(v: string) => setField('approved_recipe_id', v)} placeholder="Link approved recipe…" />
                            </div>
                            <div>
                                <label style={xpLbl(classic)}>Notes</label>
                                <textarea style={{ ...xpInput(classic), height: 'auto', padding: '4px 6px', width: '100%', resize: 'vertical' as const, boxSizing: 'border-box' as const }} rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} />
                            </div>
                        </div>
                    </div>
                </form>
            </ModalWrapper>

            {/* Approve variant → capture the "set" index, mint the color code */}
            <ModalWrapper
                isOpen={!!approval}
                onClose={() => setApproval(null)}
                title={<><i className="bi bi-check2-circle me-2" />Approve Variant</>}
                variant="success"
                size="sm"
                footer={
                    <>
                        <button type="button" style={xpBtn(classic)} onClick={() => setApproval(null)}>Cancel</button>
                        <button type="button" disabled={!approvalSet.trim()} style={classic
                            ? xpBtn(true, { background: 'linear-gradient(to bottom, #7bd88f, #1b7a34)', borderColor: '#0f5a22 #073d15 #073d15 #0f5a22', color: '#04220c', fontWeight: 'bold', opacity: approvalSet.trim() ? 1 : 0.55 })
                            : xpBtn(false, { fontWeight: 600, background: '#16a34a', color: '#fff', border: 'none', opacity: approvalSet.trim() ? 1 : 0.55 })}
                            onClick={confirmApproval}>
                            Approve &amp; Save Color
                        </button>
                    </>
                }
            >
                {approval && (
                    <div style={{ padding: '2px 2px 4px' }}>
                        <label style={xpLbl(classic)}>Set Index</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ ...seqBadge(classic), fontSize: classic ? 11 : 13 }}>{approval.seq}</span>
                            <span style={{ ...variantBadge(classic), fontSize: classic ? 11 : 13 }}>{approval.variant}</span>
                            <span style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, color: classic ? '#555' : '#94a3b8' }}>–</span>
                            <input autoFocus style={{ ...xpInput(classic), width: 90 }} value={approvalSet}
                                onChange={e => setApprovalSet(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') confirmApproval(); }}
                                placeholder="e.g. 5" />
                        </div>
                        <div style={{ fontSize: classic ? 11 : 12, color: classic ? '#555' : '#64748b', marginBottom: 10 }}>
                            Approved color code:{' '}
                            <span style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, color: classic ? '#1b7a34' : '#16a34a' }}>
                                {approval.seq}-{approval.variant}-{approvalSet.trim() || '…'}
                            </span>
                            {' '}— saved to the Color library.
                        </div>
                        <label style={xpLbl(classic)}>Notes (optional)</label>
                        <textarea style={{ ...xpInput(classic), height: 'auto', padding: '4px 6px', width: '100%', resize: 'vertical' as const, boxSizing: 'border-box' as const }} rows={2} value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)} placeholder="Optional note carried onto the color entry…" />
                    </div>
                )}
            </ModalWrapper>
        </div>
    );
}
