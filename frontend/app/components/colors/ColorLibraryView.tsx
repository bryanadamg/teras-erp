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
    background: 'white', padding: '1px 6px', outline: 'none', height: 20, width: '100%',
} : {
    fontFamily: modernFont, fontSize: 13, border: '1px solid #cbd3df', borderRadius: 7,
    padding: '4px 8px', background: '#fff', color: '#1e293b', outline: 'none', width: '100%',
};
const btn = (classic: boolean, extra: React.CSSProperties = {}): React.CSSProperties => classic ? {
    fontFamily: xpFont, fontSize: 11, padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', ...extra,
} : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 500, padding: '5px 12px', cursor: 'pointer',
    background: '#fff', color: '#334155', border: '1px solid #cbd3df', borderRadius: 7, ...extra,
};
const primaryBtn: React.CSSProperties = { fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none' };
const lbl = (classic: boolean): React.CSSProperties => classic
    ? { fontFamily: xpFont, fontSize: 11, color: '#000', display: 'block', marginBottom: 2 }
    : { fontFamily: modernFont, fontSize: 12, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 3 };
const th = (classic: boolean): React.CSSProperties => classic ? {
    padding: '3px 6px', borderRight: '1px solid #b0aaa0', textAlign: 'left',
    whiteSpace: 'nowrap', fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#000',
} : {
    padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap',
    fontFamily: modernFont, fontSize: 11, fontWeight: 700, color: '#475569',
    textTransform: 'uppercase', background: '#eef1f6', borderBottom: '1.5px solid #cbd3df',
};
const td = (classic: boolean): React.CSSProperties => classic ? {
    padding: '4px 6px', borderRight: '1px solid #c0bdb5', borderBottom: '1px solid #d0cdc8',
    verticalAlign: 'middle', fontFamily: xpFont, fontSize: 11,
} : {
    padding: '6px 10px', borderBottom: '1px solid #e6eaf1',
    verticalAlign: 'middle', fontFamily: modernFont, fontSize: 13, color: '#334155',
};

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
            padding: '1px 7px', borderRadius: 10, fontWeight: 600,
            background: status === 'archived' ? '#fde8e8' : '#e6f4ea',
            color: status === 'archived' ? '#b42318' : '#1a7f37',
            border: `1px solid ${status === 'archived' ? '#f3c2c2' : '#abdbb6'}`,
        }}>{status}</span>
    );

    return (
        <div style={{ padding: classic ? 8 : 14, fontFamily: classic ? xpFont : modernFont }}>
            {/* toolbar */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: classic ? 15 : 18, fontWeight: 700, margin: 0, color: classic ? '#00309c' : '#1e293b' }}>
                    Color Library
                </h2>
                <span style={{ fontSize: 12, color: '#64748b' }}>{total.toLocaleString()} colors</span>
                <div style={{ flex: 1 }} />
                <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search code, name, Pantone, customer code..."
                    style={{ ...inp(classic), width: 280 }}
                />
                <select value={statusFilter} onChange={e => onStatusChange(e.target.value)} style={{ ...inp(classic), width: 120 }}>
                    {STATUS_FILTERS.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All status' : s}</option>)}
                </select>
                <button style={btn(classic, classic ? {} : primaryBtn)} onClick={openCreate}>+ New Color</button>
            </div>

            {/* table */}
            <div style={{ overflowX: 'auto', border: classic ? '1px solid #b0aaa0' : '1px solid #e2e8f0', borderRadius: classic ? 0 : 9 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead>
                        <tr>
                            <th style={th(classic)}></th>
                            <th style={th(classic)}>Code</th>
                            <th style={th(classic)}>Name</th>
                            <th style={th(classic)}>Pantone</th>
                            <th style={th(classic)}>Colour Index</th>
                            <th style={th(classic)}>Substrate</th>
                            <th style={th(classic)}>Customer</th>
                            <th style={th(classic)}>Cust. Code</th>
                            <th style={th(classic)}>Recipes</th>
                            <th style={th(classic)}>Status</th>
                            <th style={th(classic)}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {colors.length === 0 && (
                            <tr><td style={{ ...td(classic), textAlign: 'center', color: '#94a3b8' }} colSpan={11}>
                                {loading ? 'Loading...' : 'No colors found'}
                            </td></tr>
                        )}
                        {colors.map(c => (
                            <tr key={c.id}>
                                <td style={td(classic)}>{swatch(c.hex)}</td>
                                <td style={{ ...td(classic), fontWeight: 600 }}>{c.code}</td>
                                <td style={td(classic)}>{c.name}</td>
                                <td style={td(classic)}>{c.pantone_ref || '—'}</td>
                                <td style={td(classic)}>{c.colour_index || '—'}</td>
                                <td style={td(classic)}>{c.substrate || '—'}</td>
                                <td style={td(classic)}>{c.customer_name || '—'}</td>
                                <td style={td(classic)}>{c.customer_color_code || '—'}</td>
                                <td style={{ ...td(classic), textAlign: 'center' }}>{c.recipe_count || 0}</td>
                                <td style={td(classic)}>{statusChip(c.status)}</td>
                                <td style={td(classic)}>
                                    <button style={btn(classic, { marginRight: 4 })} onClick={() => openEdit(c)}>Edit</button>
                                    <button style={btn(classic, classic ? {} : { color: '#dc2626', borderColor: '#fecaca' })} onClick={() => handleDelete(c)}>
                                        {c.recipe_count > 0 ? 'Archive' : 'Delete'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* pagination */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
                <button style={btn(classic)} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</button>
                <span style={{ fontSize: 12, color: '#475569' }}>Page {page} / {totalPages}</span>
                <button style={btn(classic)} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
            </div>

            <ModalWrapper
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editing ? `Edit Color — ${editing.code}` : 'New Color'}
                size="lg"
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={btn(classic)} onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" form="color-form" style={btn(classic, classic ? {} : primaryBtn)}>
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
                            <textarea value={form.spectro_notes} onChange={e => setForm({ ...form, spectro_notes: e.target.value })} rows={2} placeholder="Lab readings (L*a*b*), illuminant, tolerance..." style={{ ...inp(classic), height: 'auto', resize: 'vertical' }} />
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
