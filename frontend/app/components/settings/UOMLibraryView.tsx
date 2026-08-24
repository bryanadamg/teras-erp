'use client';
import React, { useState } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { lvInput, lvBtn, lvPrimaryBtn, lvTh, lvTd, lvSep, lvRow, lvThead, ExpanderCell } from '../shared/listViewTheme';
import { ExpandedRowPanel, rowStateBg, Chip } from '../shared/xpTheme';
import { SearchField, ToolbarCount } from '../shared/shellTheme';

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
                <SearchField classic={classic} value={search} onChange={setSearch} placeholder="Search units…" width={200} />
                <ToolbarCount classic={classic} right>
                    {filtered.filter((u: any) => u.is_system).length} system &nbsp;+&nbsp; {filtered.filter((u: any) => !u.is_system).length} packaging
                </ToolbarCount>
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={lvThead(classic, true)}>
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
                                    <tr style={{ ...lvRow(classic, idx), cursor: 'pointer', background: isExpanded ? rowStateBg('expanded', classic) : lvRow(classic, idx).background }} onClick={() => toggleExpand(uom)}>
                                        <ExpanderCell classic={classic} expanded={isExpanded} onToggle={() => toggleExpand(uom)} label="conversion factors" />
                                        <td style={lvTd(classic)}>
                                            <span style={{ fontWeight: 'bold', fontVariant: classic ? 'all-small-caps' : undefined as any }}>{uom.name}</span>
                                            {uom.is_system && (
                                                <Chip classic={classic} size="xs" style={{ marginLeft: 6 }} tone={{
                                                    background: classic ? '#dce8ff' : '#dbeafe',
                                                    borderColor: classic ? '#7fa8e0' : '#93c5fd',
                                                    color: classic ? '#003080' : '#1d4ed8',
                                                }}>SYSTEM</Chip>
                                            )}
                                        </td>
                                        <td style={lvTd(classic)}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {factors.length > 0 ? factors.map((f: any) => (
                                                    <Chip key={f.id} classic={classic} tone={{
                                                        background: classic ? '#fff3e0' : '#fff7ed',
                                                        borderColor: classic ? '#f0a040' : '#fdba74',
                                                        color: classic ? '#804800' : '#9a3412',
                                                    }}>1 {uom.name} = {parseFloat(f.value)} {f.to_uom_name}</Chip>
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
                                            <td colSpan={4} style={{ padding: 0 }}>
                                                <ExpandedRowPanel classic={classic} style={{ padding: '8px 12px 8px 28px' }}>
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
                                                                        <Chip key={f.id} classic={classic} tone={{
                                                                            background: classic ? '#fff3e0' : '#fff7ed',
                                                                            borderColor: classic ? '#f0a040' : '#fdba74',
                                                                            color: classic ? '#804800' : '#9a3412',
                                                                        }} onRemove={() => onDeleteUOMFactor(uom.id, f.id)}>1 {uom.name} = {parseFloat(f.value)} {f.to_uom_name}</Chip>
                                                                    ))}
                                                                </>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>No conversions defined</span>
                                                    )}
                                                </ExpandedRowPanel>
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
