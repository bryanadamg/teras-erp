'use client';

import React, { useState, useEffect, useCallback } from 'react';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 4px', outline: 'none', height: 20,
};
const xpBtn: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
};
const xpSectionHeader: React.CSSProperties = {
    background: 'linear-gradient(to right, #3060b8, #1a3d90)',
    color: 'white', padding: '3px 8px',
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
};
const xpPanel: React.CSSProperties = {
    border: '1px solid #7f9db9', background: 'white',
};

const LINE_TYPES = ['DYE', 'AUXILIARY', 'SALT', 'OTHER'];

interface RecipeLine {
    id?: string;
    type: string;
    item_id: string;
    qty_per_100kg: number | string;
    uom: string;
    sort_order: number | string;
}

interface RecipeForm {
    code: string;
    name: string;
    color_standard: string;
    substrate_type: string;
    notes: string;
    is_active: boolean;
    lines: RecipeLine[];
}

const emptyForm = (): RecipeForm => ({
    code: '',
    name: '',
    color_standard: '',
    substrate_type: '',
    notes: '',
    is_active: true,
    lines: [],
});

interface Props {
    items: any[];
    authFetch: Function;
}

export default function DyeRecipeTab({ items, authFetch }: Props) {
    const [recipes, setRecipes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
    const [form, setForm] = useState<RecipeForm>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const loadRecipes = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authFetch('/api/dye-recipes');
            if (res.ok) {
                const data = await res.json();
                setRecipes(Array.isArray(data) ? data : (data.items || []));
            }
        } catch (e) {
            // silently fail
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        loadRecipes();
    }, [loadRecipes]);

    const selectedRecipe = recipes.find(r => String(r.id) === String(selectedId)) || null;

    const filteredRecipes = recipes.filter(r => {
        const q = searchText.toLowerCase();
        return (
            (r.code || '').toLowerCase().includes(q) ||
            (r.name || '').toLowerCase().includes(q)
        );
    });

    const openCreate = () => {
        setEditingRecipe(null);
        setForm(emptyForm());
        setShowForm(true);
        setSelectedId(null);
    };

    const openEdit = (recipe: any) => {
        setEditingRecipe(recipe);
        setForm({
            code: recipe.code || '',
            name: recipe.name || '',
            color_standard: recipe.color_standard || '',
            substrate_type: recipe.substrate_type || '',
            notes: recipe.notes || '',
            is_active: recipe.is_active !== false,
            lines: (recipe.lines || []).map((l: any) => ({
                id: l.id,
                type: l.type || 'DYE',
                item_id: String(l.item_id || ''),
                qty_per_100kg: l.qty_per_100kg ?? '',
                uom: l.uom || '',
                sort_order: l.sort_order ?? '',
            })),
        });
        setShowForm(true);
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingRecipe(null);
        setForm(emptyForm());
    };

    const handleSave = async () => {
        if (!form.code.trim() || !form.name.trim()) {
            alert('Code and Name are required.');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                lines: form.lines.map((l, idx) => ({
                    ...l,
                    qty_per_100kg: parseFloat(String(l.qty_per_100kg)) || 0,
                    sort_order: parseInt(String(l.sort_order)) || idx + 1,
                })),
            };
            let res;
            if (editingRecipe) {
                res = await authFetch(`/api/dye-recipes/${editingRecipe.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await authFetch('/api/dye-recipes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            if (res.ok) {
                const saved = await res.json();
                await loadRecipes();
                setShowForm(false);
                setEditingRecipe(null);
                setForm(emptyForm());
                setSelectedId(String(saved.id || (editingRecipe ? editingRecipe.id : '')));
            } else {
                const err = await res.json().catch(() => ({}));
                alert('Save failed: ' + (err.detail || res.statusText));
            }
        } catch (e: any) {
            alert('Save error: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (recipe: any) => {
        if (!confirm(`Delete recipe "${recipe.code} - ${recipe.name}"?`)) return;
        try {
            const res = await authFetch(`/api/dye-recipes/${recipe.id}`, { method: 'DELETE' });
            if (res.ok) {
                await loadRecipes();
                setSelectedId(null);
                setShowForm(false);
            } else {
                const err = await res.json().catch(() => ({}));
                alert('Delete failed: ' + (err.detail || res.statusText));
            }
        } catch (e: any) {
            alert('Delete error: ' + e.message);
        }
    };

    const addLine = () => {
        setForm(f => ({
            ...f,
            lines: [
                ...f.lines,
                {
                    type: 'DYE',
                    item_id: items.length > 0 ? String(items[0].id) : '',
                    qty_per_100kg: '',
                    uom: '',
                    sort_order: f.lines.length + 1,
                },
            ],
        }));
    };

    const removeLine = (idx: number) => {
        setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
    };

    const updateLine = (idx: number, field: keyof RecipeLine, value: any) => {
        setForm(f => ({
            ...f,
            lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l),
        }));
    };

    return (
        <div style={{ display: 'flex', height: '100%', gap: 0, fontFamily: xpFont, fontSize: 11 }}>
            {/* Left Panel */}
            <div style={{ width: 280, minWidth: 280, display: 'flex', flexDirection: 'column', ...xpPanel, borderRight: '1px solid #7f9db9' }}>
                <div style={xpSectionHeader}>Dye Recipe Library</div>
                <div style={{ padding: '4px 4px 2px 4px', borderBottom: '1px solid #c0d4e8' }}>
                    <input
                        style={{ ...xpInput, width: '100%', boxSizing: 'border-box' }}
                        placeholder="Search code or name..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                    />
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && (
                        <div style={{ padding: '8px', color: '#555', fontSize: 10 }}>Loading...</div>
                    )}
                    {!loading && filteredRecipes.length === 0 && (
                        <div style={{ padding: '8px', color: '#888', fontSize: 10 }}>No recipes found.</div>
                    )}
                    {filteredRecipes.map((recipe, idx) => {
                        const isSelected = String(recipe.id) === String(selectedId);
                        const isHovered = String(recipe.id) === String(hoveredId);
                        const isEven = idx % 2 === 0;
                        let bg = isEven ? '#f7f9fc' : 'white';
                        if (isHovered && !isSelected) bg = '#d4e4f7';
                        if (isSelected) bg = '#3060b8';
                        return (
                            <div
                                key={recipe.id}
                                onClick={() => { setSelectedId(String(recipe.id)); setShowForm(false); }}
                                onMouseEnter={() => setHoveredId(String(recipe.id))}
                                onMouseLeave={() => setHoveredId(null)}
                                style={{
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                    background: bg,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    borderBottom: '1px solid #e8eef5',
                                    userSelect: 'none',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: 11, color: isSelected ? 'white' : '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {recipe.code}
                                    </div>
                                    <div style={{ fontSize: 10, color: isSelected ? '#c8daff' : '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {recipe.name}
                                    </div>
                                </div>
                                <div style={{ marginLeft: 6, flexShrink: 0 }}>
                                    {recipe.is_active !== false ? (
                                        <span style={{
                                            display: 'inline-block', width: 8, height: 8,
                                            borderRadius: '50%', background: '#2a9a2a',
                                            border: '1px solid #1d6b1d',
                                        }} title="Active" />
                                    ) : (
                                        <span style={{
                                            fontSize: 9, background: '#ccc', color: '#444',
                                            padding: '1px 3px', border: '1px solid #999',
                                            borderRadius: 2,
                                        }}>INACTIVE</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ padding: '4px 6px', borderTop: '1px solid #c0d4e8', background: '#eef2f8' }}>
                    <button style={{ ...xpBtn }} onClick={openCreate}>+ New Recipe</button>
                </div>
            </div>

            {/* Right Panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', ...xpPanel, borderLeft: 'none', minWidth: 0 }}>
                {!showForm && !selectedId && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 12 }}>
                        Select a recipe or create new
                    </div>
                )}

                {showForm && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        <div style={xpSectionHeader}>
                            {editingRecipe ? 'Edit Recipe' : 'New Recipe'}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                            {/* Basic fields grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 10 }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: '#333' }}>
                                        Code <span style={{ color: 'red' }}>*</span>
                                    </label>
                                    <input
                                        style={{ ...xpInput, width: '100%', boxSizing: 'border-box' }}
                                        value={form.code}
                                        onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                                        placeholder="e.g. DR-001"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: '#333' }}>
                                        Name <span style={{ color: 'red' }}>*</span>
                                    </label>
                                    <input
                                        style={{ ...xpInput, width: '100%', boxSizing: 'border-box' }}
                                        value={form.name}
                                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="Recipe name"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: '#333' }}>Color Standard</label>
                                    <input
                                        style={{ ...xpInput, width: '100%', boxSizing: 'border-box' }}
                                        value={form.color_standard}
                                        onChange={e => setForm(f => ({ ...f, color_standard: e.target.value }))}
                                        placeholder="e.g. Pantone 18-1550"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: '#333' }}>Substrate Type</label>
                                    <input
                                        style={{ ...xpInput, width: '100%', boxSizing: 'border-box' }}
                                        value={form.substrate_type}
                                        onChange={e => setForm(f => ({ ...f, substrate_type: e.target.value }))}
                                        placeholder="e.g. Cotton, Polyester"
                                    />
                                </div>
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <label style={{ display: 'block', marginBottom: 2, color: '#333' }}>Notes</label>
                                <textarea
                                    style={{
                                        ...xpInput, height: 'auto', width: '100%',
                                        boxSizing: 'border-box', resize: 'vertical', minHeight: 48, padding: '2px 4px',
                                    }}
                                    value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                    placeholder="Optional notes"
                                />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#333' }}>
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                                        style={{ margin: 0 }}
                                    />
                                    Active
                                </label>
                            </div>

                            {/* Chemical Lines */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={{
                                    background: '#dde8f5', borderBottom: '1px solid #7f9db9',
                                    padding: '2px 6px', fontWeight: 'bold', fontSize: 11, color: '#1a1a1a',
                                    border: '1px solid #7f9db9', borderTopLeftRadius: 2, borderTopRightRadius: 2,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span>Chemical Lines</span>
                                </div>
                                <div style={{ border: '1px solid #7f9db9', borderTop: 'none' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                        <thead>
                                            <tr style={{ background: '#eef2f8' }}>
                                                <th style={{ padding: '2px 4px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 24 }}>#</th>
                                                <th style={{ padding: '2px 4px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 80 }}>Type</th>
                                                <th style={{ padding: '2px 4px', borderBottom: '1px solid #c0d4e8', textAlign: 'left' }}>Item</th>
                                                <th style={{ padding: '2px 4px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 80 }}>Qty/100kg</th>
                                                <th style={{ padding: '2px 4px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 60 }}>UOM</th>
                                                <th style={{ padding: '2px 4px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 50 }}>Sort</th>
                                                <th style={{ padding: '2px 4px', borderBottom: '1px solid #c0d4e8', textAlign: 'center', width: 28 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {form.lines.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '6px', color: '#888', textAlign: 'center' }}>
                                                        No lines. Click "Add Line" to begin.
                                                    </td>
                                                </tr>
                                            )}
                                            {form.lines.map((line, idx) => (
                                                <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#f7f9fc' }}>
                                                    <td style={{ padding: '2px 4px', color: '#666' }}>{idx + 1}</td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <select
                                                            style={{ ...xpInput, height: 20, width: '100%' }}
                                                            value={line.type}
                                                            onChange={e => updateLine(idx, 'type', e.target.value)}
                                                        >
                                                            {LINE_TYPES.map(t => (
                                                                <option key={t} value={t}>{t}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <select
                                                            style={{ ...xpInput, height: 20, width: '100%' }}
                                                            value={line.item_id}
                                                            onChange={e => updateLine(idx, 'item_id', e.target.value)}
                                                        >
                                                            <option value="">-- select item --</option>
                                                            {items.map(item => (
                                                                <option key={item.id} value={String(item.id)}>{item.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...xpInput, width: '100%' }}
                                                            value={line.qty_per_100kg}
                                                            onChange={e => updateLine(idx, 'qty_per_100kg', e.target.value)}
                                                            placeholder="0"
                                                            min={0}
                                                            step="any"
                                                        />
                                                    </td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <input
                                                            style={{ ...xpInput, width: '100%' }}
                                                            value={line.uom}
                                                            onChange={e => updateLine(idx, 'uom', e.target.value)}
                                                            placeholder="kg"
                                                        />
                                                    </td>
                                                    <td style={{ padding: '2px 4px' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...xpInput, width: '100%' }}
                                                            value={line.sort_order}
                                                            onChange={e => updateLine(idx, 'sort_order', e.target.value)}
                                                            placeholder={String(idx + 1)}
                                                            min={1}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                                                        <button
                                                            style={{ ...xpBtn, padding: '0px 5px', fontSize: 10, color: '#aa0000' }}
                                                            onClick={() => removeLine(idx)}
                                                            title="Remove line"
                                                        >X</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ padding: '4px 6px', borderTop: '1px solid #e8eef5', background: '#f7f9fc' }}>
                                        <button style={xpBtn} onClick={addLine}>Add Line</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Save / Cancel */}
                        <div style={{
                            display: 'flex', gap: 6, padding: '6px 12px',
                            borderTop: '1px solid #c0d4e8', background: '#eef2f8',
                        }}>
                            <button
                                style={{
                                    ...xpBtn,
                                    background: saving ? '#b0b8d0' : 'linear-gradient(to bottom, #4a7fd0, #2a5ab0)',
                                    color: 'white',
                                    borderColor: '#1a3d90 #0a1e60 #0a1e60 #1a3d90',
                                    fontWeight: 'bold',
                                    padding: '3px 14px',
                                }}
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button style={{ ...xpBtn, padding: '3px 10px' }} onClick={handleCancel} disabled={saving}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {!showForm && selectedId && selectedRecipe && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        <div style={{ ...xpSectionHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Recipe Detail</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                    style={{
                                        ...xpBtn,
                                        fontSize: 10, padding: '1px 8px',
                                        background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                                        color: '#1a1a1a',
                                    }}
                                    onClick={() => openEdit(selectedRecipe)}
                                >Edit</button>
                                <button
                                    style={{
                                        ...xpBtn,
                                        fontSize: 10, padding: '1px 8px',
                                        background: 'linear-gradient(to bottom, #e08080, #c04040)',
                                        color: 'white',
                                        borderColor: '#a03030 #601010 #601010 #a03030',
                                    }}
                                    onClick={() => handleDelete(selectedRecipe)}
                                >Delete</button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 12 }}>
                                <DetailField label="Code" value={selectedRecipe.code} />
                                <DetailField label="Name" value={selectedRecipe.name} />
                                <DetailField label="Color Standard" value={selectedRecipe.color_standard} />
                                <DetailField label="Substrate Type" value={selectedRecipe.substrate_type} />
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <DetailField label="Notes" value={selectedRecipe.notes} />
                                </div>
                                <div>
                                    <span style={{ color: '#555', fontSize: 10 }}>Status: </span>
                                    {selectedRecipe.is_active !== false ? (
                                        <span style={{ color: '#1a6a1a', fontWeight: 'bold', fontSize: 11 }}>Active</span>
                                    ) : (
                                        <span style={{ color: '#aa4400', fontWeight: 'bold', fontSize: 11 }}>Inactive</span>
                                    )}
                                </div>
                            </div>

                            {/* Lines read-only table */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={{
                                    background: '#dde8f5', borderBottom: '1px solid #7f9db9',
                                    padding: '2px 6px', fontWeight: 'bold', fontSize: 11, color: '#1a1a1a',
                                    border: '1px solid #7f9db9',
                                }}>
                                    Chemical Lines
                                </div>
                                <div style={{ border: '1px solid #7f9db9', borderTop: 'none' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                        <thead>
                                            <tr style={{ background: '#eef2f8' }}>
                                                <th style={{ padding: '2px 6px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 28 }}>#</th>
                                                <th style={{ padding: '2px 6px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 80 }}>Type</th>
                                                <th style={{ padding: '2px 6px', borderBottom: '1px solid #c0d4e8', textAlign: 'left' }}>Item</th>
                                                <th style={{ padding: '2px 6px', borderBottom: '1px solid #c0d4e8', textAlign: 'right', width: 90 }}>Qty/100kg</th>
                                                <th style={{ padding: '2px 6px', borderBottom: '1px solid #c0d4e8', textAlign: 'left', width: 60 }}>UOM</th>
                                                <th style={{ padding: '2px 6px', borderBottom: '1px solid #c0d4e8', textAlign: 'center', width: 50 }}>Sort</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!selectedRecipe.lines || selectedRecipe.lines.length === 0) && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '8px', color: '#888', textAlign: 'center' }}>
                                                        No chemical lines defined.
                                                    </td>
                                                </tr>
                                            )}
                                            {(selectedRecipe.lines || []).map((line: any, idx: number) => {
                                                const linkedItem = items.find(it => String(it.id) === String(line.item_id));
                                                return (
                                                    <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#f7f9fc' }}>
                                                        <td style={{ padding: '3px 6px', color: '#666' }}>{idx + 1}</td>
                                                        <td style={{ padding: '3px 6px' }}>
                                                            <span style={{
                                                                background: typeColor(line.type).bg,
                                                                color: typeColor(line.type).fg,
                                                                padding: '1px 5px', borderRadius: 2,
                                                                fontWeight: 'bold', fontSize: 9,
                                                                border: `1px solid ${typeColor(line.type).border}`,
                                                            }}>
                                                                {line.type || '-'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '3px 6px' }}>
                                                            {linkedItem ? linkedItem.name : (line.item_id || '-')}
                                                        </td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'right' }}>
                                                            {line.qty_per_100kg != null ? Number(line.qty_per_100kg).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-'}
                                                        </td>
                                                        <td style={{ padding: '3px 6px' }}>{line.uom || '-'}</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>{line.sort_order ?? '-'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 1 }}>{label}</div>
            <div style={{
                fontFamily: 'Tahoma, "Segoe UI", sans-serif', fontSize: 11,
                color: value ? '#1a1a1a' : '#aaa',
                background: '#f7f9fc', border: '1px solid #c8d8e8',
                padding: '1px 5px', minHeight: 18,
            }}>
                {value || '-'}
            </div>
        </div>
    );
}

function typeColor(type: string): { bg: string; fg: string; border: string } {
    switch ((type || '').toUpperCase()) {
        case 'DYE':       return { bg: '#d0e4ff', fg: '#1a3d90', border: '#7fa8e8' };
        case 'AUXILIARY': return { bg: '#d8f0d8', fg: '#1a5a1a', border: '#7fbb7f' };
        case 'SALT':      return { bg: '#fff0c0', fg: '#7a5000', border: '#d4a800' };
        default:          return { bg: '#ececec', fg: '#444', border: '#b0b0b0' };
    }
}
