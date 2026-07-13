'use client';
import React, { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { lvInput, lvBtn, lvPrimaryBtn, lvTh, lvTd, lvRow } from '../shared/listViewTheme';

interface Props {
    values: any[];                 // AttributeValue rows of the Colors variant attribute
    canManage: boolean;
    onAdd: (value: string) => void;
    onRename: (valueId: string, value: string) => void;
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

    const [newValue, setNewValue] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    const sorted = [...(values || [])].sort((a, b) => String(a.value).localeCompare(String(b.value)));

    const handleAdd = () => {
        const v = newValue.trim();
        if (!v) return;
        if (sorted.some(x => String(x.value).toLowerCase() === v.toLowerCase())) return;
        onAdd(v);
        setNewValue('');
    };

    const startEdit = (v: any) => { setEditingId(v.id); setEditText(v.value); };
    const commitEdit = (v: any) => {
        const t = editText.trim();
        if (t && t !== v.value) onRename(v.id, t);
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {canManage && (
                <div style={classic
                    ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }
                    : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <input
                        style={{ ...lvInput(classic), width: 220 }}
                        placeholder="New color name…"
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <button style={lvPrimaryBtn(classic)} onClick={handleAdd}><i className="bi bi-plus-lg" /> Add Color</button>
                    <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                        {sorted.length} color{sorted.length !== 1 ? 's' : ''}
                    </span>
                </div>
            )}

            <div style={{ flex: 1, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={classic
                        ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }
                        : { background: '#eef1f6' }}>
                        <tr>
                            <th style={lvTh(classic)}>Color</th>
                            <th style={{ ...lvTh(classic), width: 120, textAlign: 'right', borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 && (
                            <tr><td colSpan={2} style={{ ...lvTd(classic), textAlign: 'center', color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>
                                No color variants yet.
                            </td></tr>
                        )}
                        {sorted.map((v, idx) => (
                            <tr key={v.id} style={lvRow(classic, idx)}>
                                <td style={lvTd(classic)}>
                                    {editingId === v.id ? (
                                        <input
                                            autoFocus
                                            style={{ ...lvInput(classic), width: 240 }}
                                            value={editText}
                                            onChange={e => setEditText(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(v); if (e.key === 'Escape') setEditingId(null); }}
                                            onBlur={() => commitEdit(v)}
                                        />
                                    ) : v.value}
                                </td>
                                <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                    {canManage && (
                                        <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                            <button title="Rename" onClick={() => startEdit(v)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#555' : '#64748b', fontSize: 13 }}>
                                                <i className="bi bi-pencil" />
                                            </button>
                                            <button title="Delete" onClick={() => handleDelete(v)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#a00' : '#dc2626', fontSize: 13 }}>
                                                <i className="bi bi-trash" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
