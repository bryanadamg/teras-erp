'use client';
import React, { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import ModalWrapper from '../shared/ModalWrapper';
import { FormSection } from '../shared/xpTheme';
import { lvInput, lvBtn, lvPrimaryBtn, lvLabel, lvSep, lvTh, lvTd, lvRow, lvThead } from '../shared/listViewTheme';

interface Props {
    values: any[];                 // AttributeValue rows of the Colors variant attribute
    canManage: boolean;
    onAdd: (value: string, hex?: string | null) => void;
    onRename: (valueId: string, value: string, hex?: string | null) => void;
    onDelete: (valueId: string) => void;
}

// Manages the values of the `Colors` variant attribute (system_role='color') — a small
// curated product-color list. This is the SAME variant attribute used for BOM gating,
// dye-recipe matching, MO/stock variant_key; it is NOT the 30k Color Code catalog. It
// lives here as a sibling tab purely for discoverability (single "Colors" home).
export default function ColorsVariantView({ values, canManage, onAdd, onRename, onDelete }: Props) {
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newValue, setNewValue] = useState('');
    const [newHexOn, setNewHexOn] = useState(false);
    const [newHex, setNewHex] = useState('#cccccc');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [editHexOn, setEditHexOn] = useState(false);
    const [editHex, setEditHex] = useState('#cccccc');

    const sorted = [...(values || [])].sort((a, b) => String(a.value).localeCompare(String(b.value)));
    const filtered = search ? sorted.filter(v => String(v.value).toLowerCase().includes(search.toLowerCase())) : sorted;

    const openCreate = () => { setNewValue(''); setNewHexOn(false); setNewHex('#cccccc'); setIsModalOpen(true); };

    const handleAdd = () => {
        const v = newValue.trim();
        if (!v) return;
        if (sorted.some(x => String(x.value).toLowerCase() === v.toLowerCase())) return;
        onAdd(v, newHexOn ? newHex : null);
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
                    onChange={e => setSearch(e.target.value)}
                />
                <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                    {filtered.length} color{filtered.length !== 1 ? 's' : ''}
                </span>
                {canManage && (
                    <>
                        <span style={lvSep(classic)} />
                        <button style={lvPrimaryBtn(classic)} onClick={openCreate}><i className="bi bi-plus-lg" /> New Color</button>
                    </>
                )}
            </div>

            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={lvThead(classic)}>
                        <tr>
                            <th style={{ ...lvTh(classic), width: 60 }}>Swatch</th>
                            <th style={lvTh(classic)}>Color</th>
                            <th style={{ ...lvTh(classic), width: 120, textAlign: 'right', borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={3} style={{ ...lvTd(classic), textAlign: 'center', color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>
                                {search ? 'No colors match your search.' : 'No color variants yet.'}
                            </td></tr>
                        )}
                        {filtered.map((v, idx) => (
                            <tr key={v.id} style={lvRow(classic, idx)}>
                                <td style={lvTd(classic)}>
                                    {editingId === v.id ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="checkbox" title="Set exact color" checked={editHexOn} onChange={e => setEditHexOn(e.target.checked)} />
                                            {editHexOn && (
                                                <input type="color" value={editHex} onChange={e => setEditHex(e.target.value)} style={{ width: 28, height: 22, padding: 0, border: '1px solid #a0988c', cursor: 'pointer' }} />
                                            )}
                                        </div>
                                    ) : canManage ? (
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
                                    {canManage && (
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
                                                    <button title="Rename" onClick={() => startEdit(v)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#555' : '#64748b', fontSize: 13 }}>
                                                        <i className="bi bi-pencil" />
                                                    </button>
                                                    <button title="Delete" onClick={() => handleDelete(v)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#a00' : '#dc2626', fontSize: 13 }}>
                                                        <i className="bi bi-trash" />
                                                    </button>
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

            <ModalWrapper
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="New Color"
                size="sm"
                modeless
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={lvBtn(classic)} onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" form="color-variant-form" style={lvPrimaryBtn(classic)}>Create</button>
                    </div>
                }
            >
                <form id="color-variant-form" onSubmit={e => { e.preventDefault(); handleAdd(); }}>
                    <FormSection title="Color" classic={classic}>
                        <div>
                            <label style={lvLabel(classic)}>Name *</label>
                            <input
                                autoFocus
                                value={newValue}
                                onChange={e => setNewValue(e.target.value)}
                                style={{ ...lvInput(classic), width: '100%' }}
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
