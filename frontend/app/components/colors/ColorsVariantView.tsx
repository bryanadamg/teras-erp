'use client';
import React, { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import ModalWrapper from '../shared/ModalWrapper';
import { FormSection, FormError } from '../shared/xpTheme';
import { lvInput, lvBtn, lvPrimaryBtn, lvLabel, lvSep, lvTh, lvTd, lvRow, lvThead, TableEmpty } from '../shared/listViewTheme';
import { ToolbarButton } from '../shared/shellTheme';
import Pager from '../shared/Pager';

const PAGE_SIZE = 25;

interface Props {
    values: any[];                 // AttributeValue rows of the Colors variant attribute
    // Per-action, not one canManage flag: color_variant.create/edit/delete are granted
    // independently on the Access Control grid, so a create-only role must not be shown
    // a Delete button the API will refuse.
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    /** Resolves with the outcome so a rejected create can be shown in the modal
     *  rather than closing it and leaving the reason in a toast the user has
     *  already dismissed. */
    onAdd: (value: string, hex?: string | null) => Promise<{ ok: boolean; error?: string }>;
    onRename: (valueId: string, value: string, hex?: string | null) => void;
    onDelete: (valueId: string) => void;
}

// Manages the values of the `Colors` variant attribute (system_role='color') — a small
// curated product-color list. This is the SAME variant attribute used for BOM gating,
// dye-recipe matching, MO/stock variant_key; it is NOT the 30k Color Code catalog. It
// lives here as a sibling tab purely for discoverability (single "Colors" home).
export default function ColorsVariantView({ values, canCreate, canEdit, canDelete, onAdd, onRename, onDelete }: Props) {
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newValue, setNewValue] = useState('');
    const [newHexOn, setNewHexOn] = useState(false);
    const [newHex, setNewHex] = useState('#cccccc');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [editHexOn, setEditHexOn] = useState(false);
    const [editHex, setEditHex] = useState('#cccccc');
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    const sorted = [...(values || [])].sort((a, b) => String(a.value).localeCompare(String(b.value)));
    const filtered = search ? sorted.filter(v => String(v.value).toLowerCase().includes(search.toLowerCase())) : sorted;
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const clampedPage = Math.min(page, pageCount);
    const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

    const handleSearchChange = (v: string) => { setSearch(v); setPage(1); };

    const openCreate = () => { setNewValue(''); setNewHexOn(false); setNewHex('#cccccc'); setFormError(''); setIsModalOpen(true); };

    const handleAdd = async () => {
        const v = newValue.trim();
        if (!v) { setFormError('Enter a color name.'); return; }
        const clash = sorted.find(x => String(x.value).trim().toLowerCase() === v.toLowerCase());
        if (clash) { setFormError(`"${clash.value}" already exists — color names must be unique.`); return; }

        // The loaded list can be stale (it rides in on the attributes master load), so
        // the server's own uniqueness check is the one that decides. Keep the modal open
        // and show what it said instead of closing on an unconfirmed create.
        setFormError('');
        setSaving(true);
        const res = await onAdd(v, newHexOn ? newHex : null);
        setSaving(false);
        if (!res?.ok) { setFormError(res?.error || 'Could not add this color.'); return; }

        setNewValue('');
        setNewHexOn(false);
        setNewHex('#cccccc');
        setIsModalOpen(false);
    };

    const startEdit = (v: any) => { setEditingId(v.id); setEditText(v.value); setEditHexOn(!!v.hex); setEditHex(v.hex || '#cccccc'); };
    const commitEdit = (v: any) => {
        const t = editText.trim();
        const nextHex = editHexOn ? editHex : null;
        if (t && (t !== v.value || nextHex !== (v.hex || null))) onRename(v.id, t, nextHex);
        setEditingId(null);
    };

    const handleDelete = async (v: any) => {
        const ok = await confirm({
            title: 'Delete Color', variant: 'danger', confirmText: 'Delete',
            message: `Delete color variant "${v.value}"? Blocked if it is used by any BOM, order, or stock.`,
        });
        if (ok) onDelete(v.id);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <input
                    style={{ ...lvInput(classic), width: 220 }}
                    placeholder="Search color…"
                    value={search}
                    onChange={e => handleSearchChange(e.target.value)}
                />
                <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                    {filtered.length} color{filtered.length !== 1 ? 's' : ''}
                </span>
                {canCreate && (
                    <>
                        <span style={lvSep(classic)} />
                        <ToolbarButton classic={classic} tone="create" icon="bi-plus-lg" onClick={openCreate}>New Color</ToolbarButton>
                    </>
                )}
            </div>

            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={lvThead(classic, true)}>
                        <tr>
                            <th style={{ ...lvTh(classic), width: 60 }}>Swatch</th>
                            <th style={lvTh(classic)}>Color</th>
                            <th style={{ ...lvTh(classic), width: 120, textAlign: 'right', borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <TableEmpty colSpan={3} classic={classic} tdStyle={lvTd(classic)}
                                message={search ? 'No colors match your search.' : 'No color variants yet.'} />
                        )}
                        {paged.map((v, idx) => (
                            <tr key={v.id} style={lvRow(classic, idx)}>
                                <td style={lvTd(classic)}>
                                    {editingId === v.id ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" title="Set exact color" checked={editHexOn} onChange={e => setEditHexOn(e.target.checked)} />
                                            {editHexOn && (
                                                <input type="color" value={editHex} onChange={e => setEditHex(e.target.value)} style={{ width: 28, height: 22, padding: 0, border: '1px solid #a0988c', cursor: 'pointer' }} />
                                            )}
                                        </div>
                                    ) : canEdit ? (
                                        <label
                                            title={v.hex ? `${v.hex} — click to change` : 'Click to set color'}
                                            style={{
                                                width: 18, height: 18, display: 'inline-block', cursor: 'pointer',
                                                background: v.hex || (classic ? '#e8e6df' : '#f1f5f9'),
                                                border: v.hex ? '1px solid rgba(0,0,0,0.35)' : `1px dashed ${classic ? '#a0988c' : '#94a3b8'}`,
                                            }}
                                        >
                                            <input
                                                type="color"
                                                value={v.hex || '#cccccc'}
                                                onChange={e => onRename(v.id, v.value, e.target.value)}
                                                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
                                            />
                                        </label>
                                    ) : v.hex ? (
                                        <span title={v.hex} style={{ width: 16, height: 16, background: v.hex, border: '1px solid rgba(0,0,0,0.35)', display: 'inline-block' }} />
                                    ) : <span style={{ color: classic ? '#999' : '#94a3b8', fontSize: 11 }}>—</span>}
                                </td>
                                <td style={lvTd(classic)}>
                                    {editingId === v.id ? (
                                        <input
                                            autoFocus
                                            style={{ ...lvInput(classic), width: 240 }}
                                            value={editText}
                                            onChange={e => setEditText(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(v); if (e.key === 'Escape') setEditingId(null); }}
                                        />
                                    ) : v.value}
                                </td>
                                <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                    {(canEdit || canDelete) && (
                                        <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                            {editingId === v.id ? (
                                                <>
                                                    <button title="Save" onClick={() => commitEdit(v)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#1a6e1a' : '#15803d', fontSize: 13 }}>
                                                        <i className="bi bi-check-lg" />
                                                    </button>
                                                    <button title="Cancel" onClick={() => setEditingId(null)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#555' : '#64748b', fontSize: 13 }}>
                                                        <i className="bi bi-x-lg" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    {canEdit && (
                                                        <button title="Rename" onClick={() => startEdit(v)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#555' : '#64748b', fontSize: 13 }}>
                                                            <i className="bi bi-pencil" />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button title="Delete" onClick={() => handleDelete(v)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#a00' : '#dc2626', fontSize: 13 }}>
                                                            <i className="bi bi-trash" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Pager page={clampedPage} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

            <ModalWrapper
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="New Color"
                size="sm"
                modeless
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={lvBtn(classic)} onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" form="color-variant-form" style={lvPrimaryBtn(classic)} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
                    </div>
                }
            >
                <form id="color-variant-form" onSubmit={e => { e.preventDefault(); handleAdd(); }}>
                    <FormError classic={classic}>{formError}</FormError>
                    <FormSection title="Color" classic={classic}>
                        <div>
                            <label style={lvLabel(classic)}>Name *</label>
                            <input
                                autoFocus
                                value={newValue}
                                onChange={e => { setNewValue(e.target.value); if (formError) setFormError(''); }}
                                style={lvInput(classic, { width: '100%', ...(formError ? { borderColor: classic ? '#8e0000' : '#dc2626' } : {}) })}
                                required
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: classic ? 11 : 12, color: classic ? '#333' : '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={newHexOn} onChange={e => setNewHexOn(e.target.checked)} />
                                Set exact color
                            </label>
                            {newHexOn && (
                                <input type="color" title="Swatch color" value={newHex} onChange={e => setNewHex(e.target.value)} style={{ width: 28, height: 22, padding: 0, border: '1px solid #a0988c', cursor: 'pointer' }} />
                            )}
                        </div>
                    </FormSection>
                </form>
            </ModalWrapper>
        </div>
    );
}
