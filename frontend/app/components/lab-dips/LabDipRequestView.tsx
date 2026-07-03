'use client';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';

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
            APPROVED:  { bg: '#d4edda', border: '#27713a', color: '#0c3a1a' },
            REJECTED:  { bg: '#f8d7da', border: '#a01a1a', color: '#4a0000' },
            SUBMITTED: { bg: '#dce4f5', border: '#3a5faa', color: '#0d2a6e' },
            RESUBMIT:  { bg: '#fff3cd', border: '#b8860b', color: '#3e2000' },
            PENDING:   { bg: '#e8e8e8', border: '#7a7a7a', color: '#111' },
        };
        const s = map[status] || { bg: '#e8e8e8', border: '#7a7a7a', color: '#111' };
        return { background: s.bg, border: `1px solid ${s.border}`, color: s.color, padding: '1px 5px', fontSize: 9, fontFamily: xpFont, fontWeight: 'bold', whiteSpace: 'nowrap' as const };
    }
    // Modern: semantic colors preserved, softer bg + matching text/border, rounded 6px.
    const map: Record<string, { bg: string; border: string; color: string }> = {
        APPROVED:  { bg: '#ecfdf3', border: '#abdfc0', color: '#15803d' },
        REJECTED:  { bg: '#fef2f2', border: '#f3c4c4', color: '#dc2626' },
        SUBMITTED: { bg: '#eff6ff', border: '#bfd3f5', color: '#1d4ed8' },
        RESUBMIT:  { bg: '#fffbeb', border: '#fce3a6', color: '#b45309' },
        PENDING:   { bg: '#f1f5f9', border: '#d4dce6', color: '#475569' },
    };
    const s = map[status] || { bg: '#f1f5f9', border: '#d4dce6', color: '#475569' };
    return { display: 'inline-block', background: s.bg, border: `1px solid ${s.border}`, color: s.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontFamily: modernFont, fontWeight: 600, whiteSpace: 'nowrap' as const };
};

// Left-border + row background per dip status (mirrors SampleRequest colorRowStyle)
const dipRowStyle = (status: string, classic: boolean): { borderLeftColor: string; background: string } => {
    if (classic) {
        const map: Record<string, { borderLeftColor: string; background: string }> = {
            PENDING:  { borderLeftColor: '#9e9e9e', background: '#fdfdfd' },
            RESUBMIT: { borderLeftColor: '#c77800', background: '#fffdf8' },
            APPROVED: { borderLeftColor: '#27713a', background: '#f8fff8' },
            REJECTED: { borderLeftColor: '#a01a1a', background: '#fff8f8' },
        };
        return map[status] || map['PENDING'];
    }
    const map: Record<string, { borderLeftColor: string; background: string }> = {
        PENDING:  { borderLeftColor: '#cbd5e1', background: '#ffffff' },
        RESUBMIT: { borderLeftColor: '#f59e0b', background: '#fffbeb' },
        APPROVED: { borderLeftColor: '#22c55e', background: '#f0fdf4' },
        REJECTED: { borderLeftColor: '#ef4444', background: '#fef2f2' },
    };
    return map[status] || map['PENDING'];
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
    dips: [] as { id?: string; color_name: string; color_id?: string | null; submission_round: number; recipe_ref?: string }[],
});

export default function LabDipRequestView({
    labDips, customers, items, recipes, attributes, colors,
    onCreate, onEdit, onUpdateStatus, onUpdateDipStatus, onDelete,
}: any) {
    const { confirm } = useConfirm();
    useToast();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const router = useRouter();
    const { hasPermission } = useUser();
    const canManage = hasPermission('dyeing.manage');

    // Spawn a Color Library record from an approved dip — mirrors the sample "+ Item"
    // flow: route to /colors with prefill params; the page opens the create modal filled.
    const createColorFromDip = (r: any, d: any) => {
        const params = new URLSearchParams();
        params.set('source_lab_dip_line_id', d.id);
        params.set('name', d.color_name || '');
        params.set('suggested_code', `${r.code}-${d.color_name || ''}`.replace(/\s+/g, '-').toUpperCase());
        if (r.customer_id) params.set('customer_id', r.customer_id);
        if (r.substrate) params.set('substrate', r.substrate);
        if (r.color_standard) params.set('pantone', r.color_standard);
        if (r.customer_article_code) params.set('customer_color_code', r.customer_article_code);
        params.set('notes', `From Lab Dip ${r.code}, round ${d.submission_round}`);
        router.push(`/colors?${params.toString()}`);
    };

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const [pendingColor, setPendingColor] = useState('');
    const [pendingRound, setPendingRound] = useState(1);

    // Colors now come from the Color Library (color_id). Fall back to the legacy
    // `labdip_color` attribute values only if the library has not been populated yet.
    const colorOptions = useMemo(() => {
        if (colors && colors.length) {
            return colors.map((c: any) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name }));
        }
        const attr = (attributes as any[]).find((a: any) => a.system_role === 'labdip_color');
        return (attr?.values ?? []).map((v: any) => ({ value: v.value, label: v.value }));
    }, [colors, attributes]);

    const colorNameById = useMemo(() => {
        const m: Record<string, string> = {};
        (colors || []).forEach((c: any) => { m[c.id] = c.code ? `${c.code} — ${c.name}` : c.name; });
        return m;
    }, [colors]);

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
            dips: (r.dips || []).map((d: any) => ({ id: d.id, color_name: d.color_name, color_id: d.color_id || null, submission_round: d.submission_round, recipe_ref: d.recipe_ref || '' })),
        });
        setPendingColor(''); setPendingRound(1);
        setIsModalOpen(true);
    };

    const addPendingDip = () => {
        if (!pendingColor.trim()) return;
        // Library selection => pendingColor is a color_id; resolve its display name.
        // Legacy fallback => the value itself is the color name.
        const isLibrary = !!colorNameById[pendingColor];
        const name = isLibrary ? colorNameById[pendingColor] : pendingColor.trim();
        setForm(prev => ({ ...prev, dips: [...prev.dips, { color_name: name, color_id: isLibrary ? pendingColor : null, submission_round: pendingRound, recipe_ref: '' }] }));
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
        if (classic) {
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
        }
        // Modern: segmented control look; active state keeps the semantic color.
        const palette = kind === 'reject'
            ? { onBg: '#fef2f2', onBorder: '#f3c4c4', onColor: '#dc2626' }
            : { onBg: '#fffbeb', onBorder: '#fce3a6', onColor: '#b45309' };
        return {
            fontFamily: modernFont, fontSize: 12, padding: '4px 10px', cursor: 'pointer',
            border: '1px solid', borderRight: 'none', whiteSpace: 'nowrap' as const,
            background: active ? palette.onBg : '#fff',
            borderColor: active ? palette.onBorder : '#cbd3df',
            color: active ? palette.onColor : '#64748b', fontWeight: active ? 600 : 500,
        };
    };
    const approveBtn = (): React.CSSProperties => classic ? {
        fontFamily: xpFont, fontSize: 10, padding: '1px 7px', cursor: 'pointer', border: '1px solid',
        whiteSpace: 'nowrap' as const, background: 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
        borderColor: '#d0cfc8 #a0a09a #a0a09a #d0cfc8', color: '#666',
    } : {
        fontFamily: modernFont, fontSize: 12, padding: '4px 10px', cursor: 'pointer', border: '1px solid',
        whiteSpace: 'nowrap' as const, background: '#fff', borderColor: '#cbd3df', color: '#64748b', fontWeight: 500,
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
                            <th style={xpThCell(classic)}>Target / Article</th>
                            <th style={{ ...xpThCell(classic), width: 90 }}>Type</th>
                            <th style={{ ...xpThCell(classic), width: 110 }}>Status</th>
                            <th style={{ ...xpThCell(classic), width: 90 }}>Dips</th>
                            <th style={{ ...xpThCell(classic), width: 130, textAlign: 'right' as const, borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={7} style={{ ...tdBase(classic), textAlign: 'center' as const, color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>No lab dip requests yet.</td></tr>
                        )}
                        {filtered.map((r: any, idx: number) => {
                            const approved = (r.dips || []).filter((d: any) => d.status === 'APPROVED').length;
                            const total = (r.dips || []).length;
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
                                            {r.color_standard && <div style={{ fontWeight: 'bold', fontSize: classic ? 11 : 13 }}>{r.color_standard}</div>}
                                            {r.customer_article_code && <div style={{ fontSize: classic ? 9 : 11, color: classic ? '#555' : '#64748b' }}>{r.customer_article_code}</div>}
                                            {!r.color_standard && !r.customer_article_code && <span style={{ fontSize: classic ? 9 : 12, color: classic ? '#888' : '#94a3b8', fontStyle: 'italic' }}>—</span>}
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
                                        const itemLabel = itemOptions.find((o: any) => o.value === r.base_item_id)?.label;
                                        const detailLbl: React.CSSProperties = classic
                                            ? { fontFamily: xpFont, fontSize: 10, color: '#333', fontWeight: 'bold', minWidth: 92, flexShrink: 0 }
                                            : { fontFamily: modernFont, fontSize: 11, color: '#475569', fontWeight: 600, minWidth: 92, flexShrink: 0 };
                                        const detailVal: React.CSSProperties = classic
                                            ? { fontFamily: xpFont, fontSize: 11, color: '#000' }
                                            : { fontFamily: modernFont, fontSize: 12.5, color: '#1e293b' };
                                        const sections: { title: string; fields: any[][] }[] = [
                                            { title: '① Identity & Specs', fields: [
                                                ['Customer', r.customer_id ? getCustomerName(r.customer_id) : 'Internal'],
                                                ['Season / Project', r.season || '—'],
                                                ['Request Type', r.request_type || '—'],
                                                ['Customer Art.', r.customer_article_code || '—'],
                                                ['Internal Art.', r.internal_article_code || '—'],
                                                ['Request Date', fmt(r.request_date)],
                                            ]},
                                            { title: '② Target & Substrate', fields: [
                                                ['Color Standard', r.color_standard || '—'],
                                                ['Substrate', r.substrate || '—'],
                                                ['Substrate Item', itemLabel || '—', true],
                                                ['Due Date', fmt(r.due_date)],
                                                ['Est. Completion', fmt(r.estimated_completion_date)],
                                            ]},
                                            { title: '③ Recipe & Notes', fields: [
                                                ['Approved Recipe', recipeLabel || '—', true],
                                                ['Notes', r.notes || '—', true],
                                            ]},
                                        ];
                                        return (
                                        <tr>
                                            <td colSpan={7} style={classic ? { padding: 0, borderBottom: '2px solid #9a9690' } : { padding: 0, borderBottom: '1px solid #dbe1ea' }}>
                                                <div style={classic
                                                    ? { background: '#ece9d8', borderTop: '2px solid #0058e6', display: 'flex', minHeight: 170 }
                                                    : { background: '#f8fafc', borderTop: '2px solid #2563eb', display: 'flex', minHeight: 170 }}>
                                                    {/* LEFT — Dips table */}
                                                    <div style={{ width: '48%', borderRight: classic ? '1px solid #a0988c' : '1px solid #dbe1ea', display: 'flex', flexDirection: 'column' }}>
                                                        <div style={classic
                                                            ? { background: 'linear-gradient(to bottom, #e4e1d8, #d5d2c8)', borderBottom: '1px solid #9a9690', padding: '2px 8px', fontSize: 10, fontWeight: 'bold', color: '#111', display: 'flex', alignItems: 'center', gap: 6, fontFamily: xpFont, flexShrink: 0 }
                                                            : { background: '#eef1f6', borderBottom: '1px solid #dbe1ea', padding: '7px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                            <i className="bi bi-palette" /> Dips — {total} total · {approved} approved
                                                        </div>
                                                        {total > 0 ? (
                                                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={{ ...xpThCell(classic), fontSize: classic ? 9 : 11 }}>Color / Shade</th>
                                                                            <th style={{ ...xpThCell(classic), fontSize: classic ? 9 : 11, width: 56 }}>Round</th>
                                                                            <th style={{ ...xpThCell(classic), fontSize: classic ? 9 : 11, width: 84 }}>Status</th>
                                                                            <th style={{ ...xpThCell(classic), fontSize: classic ? 9 : 11, textAlign: 'center' as const, borderRight: 'none', width: 210 }}>Update Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {(r.dips || []).map((d: any, dipIdx: number) => {
                                                                            const st = d.status || 'PENDING';
                                                                            const isApproved = st === 'APPROVED';
                                                                            const rs = dipRowStyle(st, classic);
                                                                            const isLast = dipIdx === (r.dips || []).length - 1;
                                                                            const rowTd: React.CSSProperties = { ...tdBase(classic), background: rs.background, borderBottom: isLast ? 'none' : tdBase(classic).borderBottom };
                                                                            return (
                                                                                <tr key={d.id} style={{ background: rs.background }}>
                                                                                    <td style={{ ...rowTd, borderLeft: `4px solid ${rs.borderLeftColor}`, fontWeight: 'bold' }}>
                                                                                        {d.color_name}
                                                                                        {d.recipe_ref && <div style={{ fontSize: classic ? 9 : 11, fontWeight: 'normal', color: classic ? '#555' : '#64748b' }}>{d.recipe_ref}</div>}
                                                                                    </td>
                                                                                    <td style={rowTd}>#{d.submission_round}</td>
                                                                                    <td style={rowTd}><span style={statusStyle(st, classic)}>{st}</span></td>
                                                                                    <td style={{ ...rowTd, borderRight: 'none', textAlign: 'center' as const }}>
                                                                                        {isApproved ? (
                                                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                                                                <span style={{ fontSize: classic ? 10 : 12, color: classic ? '#1b5e20' : '#15803d', fontWeight: classic ? 'bold' : 600 }}>Approved</span>
                                                                                                {d.color_id ? (
                                                                                                    <span title="Added to Color Library" style={{ fontSize: classic ? 9 : 11, color: classic ? '#555' : '#64748b', display: 'inline-flex', alignItems: 'center', gap: 2 }}><i className="bi bi-check-circle-fill" /> In Library</span>
                                                                                                ) : canManage ? (
                                                                                                    <button type="button" title="Create a Color Library record from this shade" style={approveBtn()} onClick={() => createColorFromDip(r, d)}><i className="bi bi-plus-lg" /> Color</button>
                                                                                                ) : null}
                                                                                            </div>
                                                                                        ) : canManage ? (
                                                                                            <div style={{ display: 'inline-flex' }}>
                                                                                                <button type="button" style={dipBtn(st === 'RESUBMIT', 'resubmit')} onClick={() => onUpdateDipStatus(r.id, d.id, st === 'RESUBMIT' ? 'PENDING' : 'RESUBMIT')}>Resubmit</button>
                                                                                                <button type="button" style={{ ...approveBtn(), borderRight: 'none' }} onClick={() => handleApproveDip(r.id, d.id, d.color_name)}>Approve</button>
                                                                                                <button type="button" style={dipBtn(st === 'REJECTED', 'reject')} onClick={() => onUpdateDipStatus(r.id, d.id, st === 'REJECTED' ? 'PENDING' : 'REJECTED')}>Reject</button>
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: 10, fontSize: classic ? 11 : 13, color: classic ? '#888' : '#64748b', fontStyle: 'italic' }}>No dips on this request.</div>
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
                                    <input style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const, background: classic ? '#f0f0f0' : '#f1f5f9', color: classic ? '#666' : '#64748b' }} value={editing ? editing.code : 'Auto-generated (LD-…)'} readOnly />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Request Date <span style={{ color: classic ? '#a00' : '#dc2626' }}>*</span></label>
                                    <input type="date" style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.request_date} onChange={e => setField('request_date', e.target.value)} required />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={xpLbl(classic)}>Customer (Optional)</label>
                                    <SearchableSelect options={customerOptions} value={form.customer_id} onChange={(v: string) => setField('customer_id', v)} placeholder="Select customer…" />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Season / Project</label>
                                    <input style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.season} onChange={e => setField('season', e.target.value)} placeholder="e.g. Spring 2026" />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Request Type</label>
                                    <select style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.request_type} onChange={e => setField('request_type', e.target.value)}>
                                        {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Customer Article Code</label>
                                    <input style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.customer_article_code} onChange={e => setField('customer_article_code', e.target.value)} />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Internal Article Code</label>
                                    <input style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.internal_article_code} onChange={e => setField('internal_article_code', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ② Target & Substrate */}
                    <div style={xpGroupBox(classic)}>
                        <div style={xpGroupHeader(classic)}>② Target &amp; Substrate</div>
                        <div style={xpGroupBody(classic)}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                                <div>
                                    <label style={xpLbl(classic)}>Color Standard / Pantone</label>
                                    <input style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.color_standard} onChange={e => setField('color_standard', e.target.value)} placeholder="e.g. Pantone 18-1664 TCX" />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Substrate (fabric quality)</label>
                                    <input style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.substrate} onChange={e => setField('substrate', e.target.value)} placeholder="e.g. 100% Cotton 150gsm" />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={xpLbl(classic)}>Substrate Item (Optional)</label>
                                    <SearchableSelect options={[{ value: '', label: 'None' }, ...itemOptions]} value={form.base_item_id} onChange={(v: string) => setField('base_item_id', v)} placeholder="Link base/greige item…" />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Due Date</label>
                                    <input type="date" style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
                                </div>
                                <div>
                                    <label style={xpLbl(classic)}>Estimated Completion</label>
                                    <input type="date" style={{ ...xpInput(classic), width: '100%', boxSizing: 'border-box' as const }} value={form.estimated_completion_date} onChange={e => setField('estimated_completion_date', e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ③ Dips */}
                    <div style={xpGroupBox(classic)}>
                        <div style={xpGroupHeader(classic)}>③ Dips (Submissions)</div>
                        <div style={xpGroupBody(classic)}>
                            <div style={classic
                                ? { background: '#f5f9ff', border: '1px solid #b0c8e8', minHeight: 40, padding: '6px 8px', marginBottom: 6 }
                                : { background: '#f8fafc', border: '1px solid #dbe1ea', borderRadius: 7, minHeight: 40, padding: '6px 8px', marginBottom: 6 }}>
                                {form.dips.length === 0
                                    ? <span style={{ fontSize: classic ? 11 : 13, color: classic ? '#999' : '#94a3b8', fontStyle: 'italic' }}>No dips added yet…</span>
                                    : form.dips.map((d, idx) => (
                                        <span key={idx} style={classic
                                            ? { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', marginRight: 4, marginBottom: 4, background: '#e8f4e8', border: '1px solid #7aba7a', fontSize: 11 }
                                            : { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', marginRight: 4, marginBottom: 4, background: '#ecfdf3', border: '1px solid #abdfc0', borderRadius: 6, fontSize: 12.5, color: '#15803d', fontFamily: modernFont }}>
                                            <span style={{ fontSize: classic ? 9 : 11, fontWeight: 'bold', color: classic ? '#228b22' : '#15803d' }}>R{d.submission_round}</span>
                                            {d.color_name}
                                            <span onClick={() => removeDip(idx)} style={{ cursor: 'pointer', color: classic ? '#a00' : '#dc2626', marginLeft: 2, fontWeight: 'bold', fontSize: 12, lineHeight: 1 }} title="Remove">×</span>
                                        </span>
                                    ))
                                }
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <SearchableSelect options={colorOptions} value={pendingColor} onChange={setPendingColor} placeholder="Select color/shade…" size="sm" />
                                </div>
                                <label style={{ fontSize: classic ? 10 : 12, color: classic ? '#555' : '#475569', fontWeight: classic ? undefined : 600 }}>Round</label>
                                <input type="number" min={1} style={{ ...xpInput(classic), width: 56 }} value={pendingRound} onChange={e => setPendingRound(parseInt(e.target.value) || 1)} />
                                <button type="button" style={classic ? xpBtn(true) : xpBtn(false, modernPrimaryBtn)} onClick={addPendingDip}><i className="bi bi-plus-lg" /> Add</button>
                            </div>
                        </div>
                    </div>

                    {/* ④ Recipe link & notes */}
                    <div style={xpGroupBox(classic)}>
                        <div style={xpGroupHeader(classic)}>④ Approved Recipe &amp; Notes</div>
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
        </div>
    );
}
