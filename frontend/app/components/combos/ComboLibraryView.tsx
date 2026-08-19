'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import { StatusChip, CodeChip, TableSkeleton, useTableSkeletonMetrics } from '../shared/xpTheme';
import { SearchField, FilterChipBar, ToolbarCount, ToolbarButton } from '../shared/shellTheme';
import {
    LV_XP_FONT, LV_MODERN_FONT, lvInput, lvBtn, lvPrimaryBtn, lvLabel, lvTh, lvTd, lvSep, lvRow, lvThead } from '../shared/listViewTheme';

const STATUS_FILTERS = ['ALL', 'active', 'archived'];

interface Props {
    combos: any[];
    total: number;
    page: number;
    size: number;
    search: string;
    statusFilter: string;
    loading?: boolean;
    onSearchChange: (s: string) => void;
    onStatusChange: (s: string) => void;
    onPageChange: (p: number) => void;
    onCreate: (payload: any) => void;
    onEdit: (id: string, payload: any) => void;
    onDelete: (id: string) => void;
    embedded?: boolean;
}

const emptyForm = () => ({ code: '', name: '', description: '', status: 'active' });

export default function ComboLibraryView({
    combos, total, page, size, search, statusFilter, loading,
    onSearchChange, onStatusChange, onPageChange, onCreate, onEdit, onDelete, embedded,
}: Props) {
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { hasPermission, hasAnyPermission } = useUser();
    const canManage = hasAnyPermission('combo_library.create', 'combo_library.edit', 'combo_library.delete');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const [searchInput, setSearchInput] = useState(search);

    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skel = useTableSkeletonMetrics('combos', listBodyRef, combos.length > 0);

    // Debounce the search box so each keystroke does not fire a request against many rows.
    useEffect(() => {
        const t = setTimeout(() => onSearchChange(searchInput.trim()), 350);
        return () => clearTimeout(t);
    }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true); };
    const openEdit = (c: any) => {
        setEditing(c);
        setForm({ code: c.code || '', name: c.name || '', description: c.description || '', status: c.status || 'active' });
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.code.trim() || !form.name.trim()) return;
        const payload: any = { ...form };
        if (editing) onEdit(editing.id, payload);
        else onCreate(payload);
        setIsModalOpen(false);
        setEditing(null);
        setForm(emptyForm());
    };

    const handleDelete = async (c: any) => {
        const ok = await confirm({
            title: c.usage_count > 0 ? 'Archive Combo' : 'Delete Combo',
            message: c.usage_count > 0
                ? `"${c.code}" is used by ${c.usage_count} record(s); it will be archived, not deleted.`
                : `Delete combo "${c.code} — ${c.name}"? This cannot be undone.`,
            confirmText: c.usage_count > 0 ? 'Archive' : 'Delete',
            variant: 'danger',
        });
        if (ok) onDelete(c.id);
    };

    return (
        <div style={embedded
            ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT, background: '#fff' }
            : classic
            ? { display: 'flex', flexDirection: 'column', height: 'calc(var(--app-vh) - 80px)', minHeight: 0, fontFamily: LV_XP_FONT, border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#ece9d8' }
            : { display: 'flex', flexDirection: 'column', height: 'calc(var(--app-vh) - 80px)', minHeight: 0, fontFamily: LV_MODERN_FONT, border: '1px solid #dbe1ea', borderRadius: 9, background: '#f8fafc', overflow: 'hidden' }}>

            {/* Title bar (hidden when embedded under a tab shell) */}
            {!embedded && (
            <div style={classic
                ? { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', padding: '6px 12px', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }
                : { background: '#f7f9fc', color: '#1e293b', borderBottom: '1px solid #dbe1ea', padding: '8px 12px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <i className="bi bi-grid-3x3-gap" style={classic ? { fontSize: 14 } : { fontSize: 14, color: '#2563eb' }} />
                Combo Library
            </div>
            )}

            {/* Toolbar */}
            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                <SearchField classic={classic} value={searchInput} onChange={setSearchInput} placeholder="Search code, name, description…" width={260} />
                <span style={lvSep(classic)} />
                <FilterChipBar
                    classic={classic}
                    options={STATUS_FILTERS.map(s => ({ value: s, label: s === 'ALL' ? 'All' : s }))}
                    value={statusFilter}
                    onChange={onStatusChange}
                />
                <ToolbarCount classic={classic} right>
                    {total.toLocaleString()} combo{total !== 1 ? 's' : ''}
                </ToolbarCount>
                {canManage && (
                    <>
                        <span style={lvSep(classic)} />
                        <ToolbarButton classic={classic} tone="create" icon="bi-plus-lg" onClick={openCreate}>New Combo</ToolbarButton>
                    </>
                )}
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={lvThead(classic)}>
                        <tr>
                            <th style={{ ...lvTh(classic), width: 160 }}>Code</th>
                            <th style={lvTh(classic)}>Name</th>
                            <th style={lvTh(classic)}>Description</th>
                            <th style={{ ...lvTh(classic), width: 60, textAlign: 'center' }}>Usage</th>
                            <th style={{ ...lvTh(classic), width: 80 }}>Status</th>
                            <th style={{ ...lvTh(classic), width: 120, textAlign: 'right', borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody ref={listBodyRef}>
                        {combos.length === 0 && (loading ? (
                            <TableSkeleton rows={8} cols={skel.cols ?? 6} classic={classic} tdStyle={lvTd(classic)} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                        ) : (
                            <tr><td colSpan={6} style={{ ...lvTd(classic), textAlign: 'center', color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>
                                No combos found.
                            </td></tr>
                        ))}
                        {combos.map((c, idx) => (
                            <tr key={c.id} style={lvRow(classic, idx)}>
                                <td style={lvTd(classic)}>
                                    <CodeChip code={c.code} classic={classic} tone="accent" />
                                </td>
                                <td style={lvTd(classic)}>{c.name}</td>
                                <td style={lvTd(classic)}>{c.description || <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={{ ...lvTd(classic), textAlign: 'center' }}>{c.usage_count || 0}</td>
                                <td style={lvTd(classic)}><StatusChip status={c.status} /></td>
                                <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                        {canManage && (
                                        <button title="Edit" onClick={() => openEdit(c)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#555' : '#64748b', fontSize: 13 }}>
                                            <i className="bi bi-pencil" />
                                        </button>
                                        )}
                                        {canManage && (
                                        <button title={c.usage_count > 0 ? 'Archive' : 'Delete'} onClick={() => handleDelete(c)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#a00' : '#dc2626', fontSize: 13 }}>
                                            <i className={c.usage_count > 0 ? 'bi bi-archive' : 'bi bi-trash'} />
                                        </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Pager page={page} total={total} pageSize={size} onPageChange={onPageChange} />

            <ModalWrapper
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editing ? `Edit Combo — ${editing.code}` : 'New Combo'}
                size="md"
                modeless
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={lvBtn(classic)} onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" form="combo-form" style={lvPrimaryBtn(classic)}>
                            {editing ? 'Save' : 'Create'}
                        </button>
                    </div>
                }
            >
                <form id="combo-form" onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={lvLabel(classic)}>Code *</label>
                            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={lvInput(classic)} required />
                        </div>
                        <div>
                            <label style={lvLabel(classic)}>Name *</label>
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={lvInput(classic)} required />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={lvLabel(classic)}>Description</label>
                            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Weave / yarn-color pattern notes…" style={{ ...lvInput(classic), height: 'auto', resize: 'vertical' }} />
                        </div>
                        {editing && (
                            <div>
                                <label style={lvLabel(classic)}>Status</label>
                                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={lvInput(classic)}>
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
