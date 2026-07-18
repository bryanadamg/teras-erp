'use client';
import React, { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { lvInput, lvBtn, lvPrimaryBtn, lvTh, lvTd, lvSep, lvRow } from '../shared/listViewTheme';

interface Props {
    uoms: any[];
    canManage: boolean;
    onCreateUOM: (name: string) => Promise<Response>;
    onDeleteUOM: (id: string) => void;
    onSaveUOMFactor: (fromUomId: string, toUomId: string, value: number) => void;
    onDeleteUOMFactor: (uomId: string, factorId: string) => void;
}

export default function UOMLibraryView({ uoms, canManage, onCreateUOM, onDeleteUOM, onSaveUOMFactor, onDeleteUOMFactor }: Props) {
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [search, setSearch] = useState('');
    const [newName, setNewName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [factorValue, setFactorValue] = useState('');
    const [factorToUomId, setFactorToUomId] = useState('');

    const filtered = (uoms || []).filter((u: any) => u.name.toLowerCase().includes(search.toLowerCase()));
    const sorted = [...filtered.filter((u: any) => u.is_system), ...filtered.filter((u: any) => !u.is_system)];

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const res = await onCreateUOM(newName.trim());
            if (res?.ok) setNewName('');
        } finally { setIsSubmitting(false); }
    };

    const toggleExpand = (uom: any) => {
        setExpandedId(expandedId === uom.id ? null : uom.id);
        setFactorValue('');
        setFactorToUomId('');
    };

    const handleAddFactor = (uom: any) => {
        if (!factorValue || !factorToUomId) return;
        onSaveUOMFactor(uom.id, factorToUomId, parseFloat(factorValue));
        setFactorValue('');
        setFactorToUomId('');
    };

    const handleDelete = async (uom: any) => {
        const ok = await confirm({
            title: 'Delete UOM', variant: 'danger', confirmText: 'Delete',
            message: `Delete unit "${uom.name}"? Blocked if it is used by any item or conversion.`,
        });
        if (ok) onDeleteUOM(uom.id);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar */}
            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                {canManage && (
                    <form onSubmit={handleCreate} style={{ display: 'flex', gap: 6 }}>
                        <input
                            style={{ ...lvInput(classic), width: 180 }}
                            placeholder="e.g. Dozen, kg…"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                        />
                        <button type="submit" style={lvPrimaryBtn(classic)} disabled={isSubmitting}>
                            <i className="bi bi-plus-lg" /> {isSubmitting ? '…' : 'New UOM'}
                        </button>
                    </form>
                )}
                <span style={lvSep(classic)} />
                <input
                    style={{ ...lvInput(classic), width: 200 }}
                    placeholder="Search units…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                    {filtered.filter((u: any) => u.is_system).length} system &nbsp;+&nbsp; {filtered.filter((u: any) => !u.is_system).length} packaging
                </span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={classic
                        ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }
                        : { background: '#eef1f6' }}>
                        <tr>
                            <th style={{ ...lvTh(classic), width: 34 }}></th>
                            <th style={{ ...lvTh(classic), width: 160 }}>Name</th>
                            <th style={lvTh(classic)}>Conversions</th>
                            <th style={{ ...lvTh(classic), width: 70, textAlign: 'right', borderRight: 'none' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 && (
                            <tr><td colSpan={4} style={{ ...lvTd(classic), textAlign: 'center', color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>
                                No units defined.
                            </td></tr>
                        )}
                        {sorted.map((uom: any, idx: number) => {
                            const isExpanded = expandedId === uom.id;
                            const factors: any[] = uom.factors || [];
                            return (
                                <React.Fragment key={uom.id}>
                                    <tr style={{ ...lvRow(classic, idx), cursor: 'pointer', background: isExpanded ? (classic ? '#fff8f0' : '#fffbeb') : lvRow(classic, idx).background }} onClick={() => toggleExpand(uom)}>
                                        <td style={{ ...lvTd(classic), textAlign: 'center' }}>
                                            <i className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'}`} style={{ fontSize: 10, color: '#888' }} />
                                        </td>
                                        <td style={lvTd(classic)}>
                                            <span style={{ fontWeight: 'bold', fontVariant: classic ? 'all-small-caps' : undefined as any }}>{uom.name}</span>
                                            {uom.is_system && (
                                                <span style={{
                                                    marginLeft: 6, fontSize: classic ? 9 : 10, background: classic ? '#dce8ff' : '#dbeafe',
                                                    border: `1px solid ${classic ? '#7fa8e0' : '#93c5fd'}`, color: classic ? '#003080' : '#1d4ed8',
                                                    padding: '1px 5px', borderRadius: classic ? 0 : 4,
                                                }}>SYSTEM</span>
                                            )}
                                        </td>
                                        <td style={lvTd(classic)}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {factors.length > 0 ? factors.map((f: any) => (
                                                    <span key={f.id} style={{
                                                        fontSize: classic ? 10 : 11, background: classic ? '#fff3e0' : '#fff7ed',
                                                        border: `1px solid ${classic ? '#f0a040' : '#fdba74'}`, color: classic ? '#804800' : '#9a3412',
                                                        padding: '1px 5px',
                                                    }}>1 {uom.name} = {parseFloat(f.value)} {f.to_uom_name}</span>
                                                )) : (
                                                    <span style={{ fontSize: classic ? 10 : 11, color: '#aaa', fontStyle: 'italic' }}>
                                                        {uom.is_system ? 'base unit' : 'no conversion set'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                            {canManage && !uom.is_system && (
                                                <button title="Delete" onClick={() => handleDelete(uom)} style={{ background: 'none', border: '1px solid transparent', cursor: 'pointer', padding: '1px 4px', color: classic ? '#a00' : '#dc2626', fontSize: 13 }}>
                                                    <i className="bi bi-trash" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={4} style={{ padding: 0, borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #e6eaf1' }}>
                                                <div style={{ background: classic ? '#f0ede4' : '#fffbeb', borderTop: classic ? '1px solid #c0a060' : '1px solid #fde68a', padding: '8px 12px 8px 40px' }}>
                                                    {canManage ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: classic ? 11 : 12, color: classic ? '#804800' : '#9a3412' }}>1 <b>{uom.name}</b> =</span>
                                                            <input
                                                                type="number"
                                                                style={{ ...lvInput(classic), width: 90 }}
                                                                value={factorValue}
                                                                onChange={e => setFactorValue(e.target.value)}
                                                                placeholder="value"
                                                            />
                                                            <select
                                                                style={{ ...lvInput(classic), width: 160 }}
                                                                value={factorToUomId}
                                                                onChange={e => setFactorToUomId(e.target.value)}
                                                            >
                                                                <option value="">-- unit --</option>
                                                                {(uoms || []).filter((u: any) => u.id !== uom.id).map((u: any) => (
                                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                                ))}
                                                            </select>
                                                            <button style={lvBtn(classic)} onClick={() => handleAddFactor(uom)}>Add</button>
                                                            {factors.length > 0 && (
                                                                <>
                                                                    <span style={{ width: 1, height: 18, background: classic ? '#c0a060' : '#fde68a' }} />
                                                                    {factors.map((f: any) => (
                                                                        <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: classic ? 10 : 11, color: classic ? '#804800' : '#9a3412' }}>
                                                                            1 {uom.name} = {parseFloat(f.value)} {f.to_uom_name}
                                                                            <button style={{ border: 'none', background: 'none', color: '#c00', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }} onClick={() => onDeleteUOMFactor(uom.id, f.id)}>✕</button>
                                                                        </span>
                                                                    ))}
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>No conversions defined</span>
                                                    )}
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
        </div>
    );
}
