'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';

// ── dual-theme style constants (consistent with LabDipRequestView) ──────────
const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const inp = (classic: boolean): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 6px', outline: 'none', height: 20, width: '100%', boxSizing: 'border-box',
} : {
    fontFamily: modernFont, fontSize: 13, border: '1px solid #cbd3df', borderRadius: 7,
    padding: '4px 8px', background: '#fff', color: '#1e293b', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const xpBtn = (classic: boolean, extra: React.CSSProperties = {}): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', ...extra,
} : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 500, padding: '5px 12px', cursor: 'pointer',
    background: '#fff', color: '#334155', border: '1px solid #cbd3df', borderRadius: 7, ...extra,
};
const modernPrimaryBtn: React.CSSProperties = { fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none' };
const lbl = (classic: boolean): React.CSSProperties => classic
    ? { fontFamily: xpFont, fontSize: 11, color: '#000', display: 'block', marginBottom: 2 }
    : { fontFamily: modernFont, fontSize: 12, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 3 };
const xpThCell = (classic: boolean): React.CSSProperties => classic ? {
    padding: '3px 6px', borderRight: '1px solid #b0aaa0', textAlign: 'left', whiteSpace: 'nowrap',
    fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#000',
} : {
    padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap',
    fontFamily: modernFont, fontSize: 11, fontWeight: 700, color: '#475569',
    textTransform: 'uppercase', background: '#eef1f6', borderBottom: '1.5px solid #cbd3df',
};
const tdBase = (classic: boolean): React.CSSProperties => classic ? {
    padding: '4px 6px', borderRight: '1px solid #c0bdb5', verticalAlign: 'middle',
    fontFamily: xpFont, fontSize: 11,
} : {
    padding: '6px 10px', verticalAlign: 'middle', fontFamily: modernFont, fontSize: 13, color: '#334155',
};
const sep = (classic: boolean): React.CSSProperties =>
    classic ? { width: 1, height: 20, background: '#a0988c', margin: '0 2px' } : { width: 1, height: 20, background: '#dbe1ea', margin: '0 2px' };

const STATUS_FILTERS = ['ALL', 'active', 'archived'];

interface Props {
    colors: any[];
    total: number;
    page: number;
    size: number;
    search: string;
    statusFilter: string;
    customers: any[];
    loading?: boolean;
    onSearchChange: (s: string) => void;
    onStatusChange: (s: string) => void;
    onPageChange: (p: number) => void;
    onCreate: (payload: any) => void;
    onEdit: (id: string, payload: any) => void;
    onDelete: (id: string) => void;
}

const emptyForm = () => ({
    code: '', name: '', pantone_ref: '', colour_index: '', hex: '',
    substrate: '', customer_id: '', customer_color_code: '',
    spectro_notes: '', notes: '', status: 'active',
});

export default function ColorLibraryView({
    colors, total, page, size, search, statusFilter, customers, loading,
    onSearchChange, onStatusChange, onPageChange, onCreate, onEdit, onDelete,
}: Props) {
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const [searchInput, setSearchInput] = useState(search);

    // Debounce the search box so each keystroke does not fire a request against 30k rows.
    useEffect(() => {
        const t = setTimeout(() => onSearchChange(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

    const customerOptions = useMemo(() =>
        [{ value: '', label: 'No Customer (House Color)' },
         ...(customers || []).map((c: any) => ({ value: c.id, label: c.name }))],
    [customers]);

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true); };
    const openEdit = (c: any) => {
        setEditing(c);
        setForm({
            code: c.code || '', name: c.name || '', pantone_ref: c.pantone_ref || '',
            colour_index: c.colour_index || '', hex: c.hex || '', substrate: c.substrate || '',
            customer_id: c.customer_id || '', customer_color_code: c.customer_color_code || '',
            spectro_notes: c.spectro_notes || '', notes: c.notes || '', status: c.status || 'active',
        });
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.code.trim() || !form.name.trim()) return;
        const payload = { ...form, customer_id: form.customer_id || null };
        if (editing) onEdit(editing.id, payload); else onCreate(payload);
        setIsModalOpen(false);
        setEditing(null);
        setForm(emptyForm());
    };

    const handleDelete = async (c: any) => {
        const ok = await confirm({
            title: c.recipe_count > 0 ? 'Archive Color' : 'Delete Color',
            message: c.recipe_count > 0
                ? `"${c.code}" is used by ${c.recipe_count} recipe(s); it will be archived, not deleted.`
                : `Delete color "${c.code} — ${c.name}"? This cannot be undone.`,
            confirmText: c.recipe_count > 0 ? 'Archive' : 'Delete',
            variant: 'danger',
        });
        if (ok) onDelete(c.id);
    };

    const totalPages = Math.max(1, Math.ceil(total / size));

    const primaryToolbarBtn = classic
        ? xpBtn(true, { background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', fontWeight: 'bold' })
        : xpBtn(false, modernPrimaryBtn);

    const swatch = (hex?: string) => (
        <span style={{
            display: 'inline-block', width: 18, height: 18, borderRadius: classic ? 2 : 4,
            border: '1px solid #94a3b8', background: hex || 'transparent',
            backgroundImage: hex ? undefined : 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)',
            backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px', verticalAlign: 'middle',
        }} title={hex || 'no swatch'} />
    );

    const statusChip = (status: string) => (
        <span style={{
            fontFamily: classic ? xpFont : modernFont, fontSize: classic ? 10 : 11,
            padding: classic ? '0 6px' : '1px 7px', borderRadius: classic ? 2 : 10, fontWeight: 'bold',
            background: status === 'archived' ? '#fde8e8' : '#e6f4ea',
            color: status === 'archived' ? '#b42318' : '#1a7f37',
            border: `1px solid ${status === 'archived' ? '#f3c2c2' : '#abdbb6'}`,
        }}>{status}</span>
    );

    return (
        <div style={classic
            ? { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: xpFont, border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#ece9d8' }
            : { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: modernFont, border: '1px solid #dbe1ea', borderRadius: 9, background: '#f8fafc', overflow: 'hidden' }}>

            {/* Title bar */}
            <div style={classic
                ? { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', padding: '6px 12px', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }
                : { background: '#f7f9fc', color: '#1e293b', borderBottom: '1px solid #dbe1ea', padding: '8px 12px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <i className="bi bi-palette2" style={classic ? { fontSize: 14 } : { fontSize: 14, color: '#2563eb' }} />
                Color Library
            </div>

            {/* Toolbar */}
            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                <button style={primaryToolbarBtn} onClick={openCreate}>
                    <i className="bi bi-plus-lg" /> New Color
                </button>
                <span style={sep(classic)} />
                <input
                    style={{ ...inp(classic), width: 240, flexBasis: 240 }}
                    placeholder="Search code, name, Pantone, customer code…"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                />
                <span style={sep(classic)} />
                {STATUS_FILTERS.map(s => (
                    <button key={s} style={statusFilter === s ? primaryToolbarBtn : xpBtn(classic)} onClick={() => onStatusChange(s)}>
                        {s === 'ALL' ? 'All' : s}
                    </button>
                ))}
                <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                    {total.toLocaleString()} color{total !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={classic
                        ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }
                        : { background: '#eef1f6' }}>
                        <tr>
                            <th style={{ ...xpThCell(classic), width: 34 }}></th>
                            <th style={{ ...xpThCell(classic), width: 130 }}>Code</th>
                            <th style={xpThCell(classic)}>Name</th>
                            <th style={{ ...xpThCell(classic), width: 110 }}>Pantone</th>
                            <th style={{ ...xpThCell(classic), width: 150 }}>Colour Index</th>
                            <th style={{ ...xpThCell(classic), width: 90 }}>Substrate</th>
                            <th style={{ ...xpThCell(classic), width: 120 }}>Customer</th>
                            <th style={{ ...xpThCell(classic), width: 90 }}>Cust. Code</th>
                            <th style={{ ...xpThCell(classic), width: 60, textAlign: 'center' }}>Recipes</th>
                            <th style={{ ...xpThCell(classic), width: 80 }}>Status</th>
                            <th style={{ ...xpThCell(classic), width: 120, textAlign: 'right', borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {colors.length === 0 && (
                            <tr><td colSpan={11} style={{ ...tdBase(classic), textAlign: 'center', color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>
                                {loading ? 'Loading…' : 'No colors found.'}
                            </td></tr>
                        )}
                        {colors.map((c, idx) => (
                            <tr key={c.id} style={classic
                                ? { background: idx % 2 === 0 ? '#fff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' }
                                : { background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e6eaf1' }}>
                                <td style={{ ...tdBase(classic), textAlign: 'center' }}>{swatch(c.hex)}</td>
                                <td style={tdBase(classic)}>
                                    <span style={classic
                                        ? { fontFamily: "'Courier New', monospace", fontWeight: 'bold', color: '#0047c8', fontSize: 11 }
                                        : { fontFamily: "'Courier New', monospace", fontWeight: 700, color: '#2563eb', fontSize: 12 }}>{c.code}</span>
                                </td>
                                <td style={tdBase(classic)}>{c.name}</td>
                                <td style={tdBase(classic)}>{c.pantone_ref || <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={tdBase(classic)}>{c.colour_index || <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={tdBase(classic)}>{c.substrate || <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={tdBase(classic)}>{c.customer_name || <span style={{ color: '#aaa', fontStyle: 'italic' }}>House</span>}</td>
                                <td style={tdBase(classic)}>{c.customer_color_code || <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={{ ...tdBase(classic), textAlign: 'center' }}>{c.recipe_count || 0}</td>
                                <td style={tdBase(classic)}>{statusChip(c.status)}</td>
                                <td style={{ ...tdBase(classic), borderRight: 'none', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                        <button title="Edit" onClick={() => openEdit(c)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#555' : '#64748b', fontSize: 13 }}>
                                            <i className="bi bi-pencil" />
                                        </button>
                                        <button title={c.recipe_count > 0 ? 'Archive' : 'Delete'} onClick={() => handleDelete(c)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#a00' : '#dc2626', fontSize: 13 }}>
                                            <i className={c.recipe_count > 0 ? 'bi bi-archive' : 'bi bi-trash'} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Status bar / pagination */}
            <div style={classic
                ? { background: '#ece9d8', borderTop: '1px solid #b0a898', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 11, color: '#333' }
                : { background: '#fff', borderTop: '1px solid #dbe1ea', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 12, color: '#475569' }}>
                <span style={{ marginLeft: 'auto' }} />
                <button style={xpBtn(classic)} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>◀ Prev</button>
                <span>Page {page} / {totalPages}</span>
                <button style={xpBtn(classic)} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next ▶</button>
            </div>

            <ModalWrapper
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editing ? `Edit Color — ${editing.code}` : 'New Color'}
                size="lg"
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={xpBtn(classic)} onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" form="color-form" style={xpBtn(classic, classic ? { background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', fontWeight: 'bold' } : modernPrimaryBtn)}>
                            {editing ? 'Save' : 'Create'}
                        </button>
                    </div>
                }
            >
                <form id="color-form" onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={lbl(classic)}>Code *</label>
                            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={inp(classic)} required />
                        </div>
                        <div>
                            <label style={lbl(classic)}>Name *</label>
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp(classic)} required />
                        </div>
                        <div>
                            <label style={lbl(classic)}>Pantone Ref</label>
                            <input value={form.pantone_ref} onChange={e => setForm({ ...form, pantone_ref: e.target.value })} placeholder="e.g. 19-4052 TCX" style={inp(classic)} />
                        </div>
                        <div>
                            <label style={lbl(classic)}>Colour Index (C.I.)</label>
                            <input value={form.colour_index} onChange={e => setForm({ ...form, colour_index: e.target.value })} placeholder="e.g. C.I. Reactive Blue 19" style={inp(classic)} />
                        </div>
                        <div>
                            <label style={lbl(classic)}>Swatch (hex)</label>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input type="color" value={form.hex || '#ffffff'} onChange={e => setForm({ ...form, hex: e.target.value })} style={{ width: 36, height: 24, padding: 0, border: '1px solid #94a3b8', cursor: 'pointer' }} />
                                <input value={form.hex} onChange={e => setForm({ ...form, hex: e.target.value })} placeholder="#RRGGBB" style={inp(classic)} />
                            </div>
                        </div>
                        <div>
                            <label style={lbl(classic)}>Substrate</label>
                            <input value={form.substrate} onChange={e => setForm({ ...form, substrate: e.target.value })} placeholder="e.g. CVC, 100% Cotton" style={inp(classic)} />
                        </div>
                        <div>
                            <label style={lbl(classic)}>Customer</label>
                            <SearchableSelect options={customerOptions} value={form.customer_id} onChange={v => setForm({ ...form, customer_id: v })} placeholder="House color" />
                        </div>
                        <div>
                            <label style={lbl(classic)}>Customer Color Code</label>
                            <input value={form.customer_color_code} onChange={e => setForm({ ...form, customer_color_code: e.target.value })} style={inp(classic)} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={lbl(classic)}>Spectrophotometer Notes</label>
                            <textarea value={form.spectro_notes} onChange={e => setForm({ ...form, spectro_notes: e.target.value })} rows={2} placeholder="Lab readings (L*a*b*), illuminant, tolerance…" style={{ ...inp(classic), height: 'auto', resize: 'vertical' }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={lbl(classic)}>Notes</label>
                            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inp(classic), height: 'auto', resize: 'vertical' }} />
                        </div>
                        {editing && (
                            <div>
                                <label style={lbl(classic)}>Status</label>
                                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp(classic)}>
                                    <option value="active">active</option>
                                    <option value="archived">archived</option>
                                </select>
                            </div>
                        )}
                    </div>
                </form>
            </ModalWrapper>
        </div>
    );
}
