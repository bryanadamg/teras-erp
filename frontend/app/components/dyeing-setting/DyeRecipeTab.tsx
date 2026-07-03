'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DyeRecipePrintView from './DyeRecipePrintView';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import CodeConfigModal, { CodeConfig, buildCodeParts, buildCodeWithCounter } from '../shared/CodeConfigModal';
import SearchableSelect from '../shared/SearchableSelect';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', padding: '1px 4px', outline: 'none', height: 20,
};
const modernInput: React.CSSProperties = {
    fontFamily: modernFont, fontSize: 13, border: '1px solid #cbd3df',
    borderRadius: 7, background: '#fff', color: '#1e293b',
    padding: '4px 8px', outline: 'none', height: 'auto',
};
const xpBtn: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 10, padding: '2px 8px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
};
const modernBtn: React.CSSProperties = {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 500, padding: '5px 12px',
    background: '#fff', color: '#334155', border: '1px solid #cbd3df',
    borderRadius: 7, cursor: 'pointer',
};
const xpSectionHeader: React.CSSProperties = {
    background: 'linear-gradient(to right, #3a6fc4 0%, #6a9fd8 60%, #a8c8f0 100%)',
    color: 'white', padding: '3px 8px',
    fontFamily: xpFont, fontSize: 11, fontWeight: 'bold',
};
const modernSectionHeader: React.CSSProperties = {
    background: '#eef1f6', color: '#475569',
    textTransform: 'uppercase', fontWeight: 700, fontSize: 11,
    letterSpacing: '0.04em', padding: '7px 12px',
    borderBottom: '1px solid #dbe1ea', fontFamily: modernFont,
};
const xpPanel: React.CSSProperties = {
    border: '1px solid #7f9db9', background: 'white',
};
const modernPanel: React.CSSProperties = {
    border: '1px solid #dbe1ea', background: '#fff', borderRadius: 9,
};

const inputStyle = (classic: boolean): React.CSSProperties => classic ? xpInput : modernInput;
const btnStyle = (classic: boolean): React.CSSProperties => classic ? xpBtn : modernBtn;
const primaryBtnStyle = (classic: boolean): React.CSSProperties => classic ? xpBtn : {
    fontFamily: modernFont, fontSize: 12.5, fontWeight: 600, padding: '5px 12px',
    background: '#2563eb', color: '#fff', border: 'none',
    borderRadius: 7, cursor: 'pointer',
};

const LINE_TYPES = ['DYE', 'AUXILIARY', 'SALT', 'OTHER'];

interface RecipeLine {
    id?: string;
    chemical_type: string;
    item_id: string;
    qty_per_100kg: number | string;
    qty_per_liter: number | null;
    uom_id?: string | null;
    sort_order: number | string;
}

interface RecipeForm {
    code: string;
    name: string;
    color_standard: string;
    color_id: string;
    substrate_type: string;
    notes: string;
    is_active: boolean;
    lines: RecipeLine[];
    attribute_value_ids: string[];
}

const emptyForm = (): RecipeForm => ({
    code: '',
    name: '',
    color_standard: '',
    color_id: '',
    substrate_type: '',
    notes: '',
    is_active: true,
    lines: [],
    attribute_value_ids: [],
});

interface Props {
    items: any[];
    attributes: any[];
    authFetch: Function;
}

export default function DyeRecipeTab({ items, attributes, authFetch }: Props) {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { hasPermission } = useUser();
    const canManage = hasPermission('dyeing.manage');
    const [recipes, setRecipes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
    const [form, setForm] = useState<RecipeForm>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [washBaths, setWashBaths] = useState<Array<{bath_number: number; description: string}>>([]);
    const [finishingSteps, setFinishingSteps] = useState<Array<{description: string; sort_order: number}>>([]);
    const [showPrint, setShowPrint] = useState(false);
    const [showCodeConfig, setShowCodeConfig] = useState(false);
    const [codeConfig, setCodeConfig] = useState<CodeConfig | null>(null);
    const [allChemicalItems, setAllChemicalItems] = useState<any[]>([]);
    const [colors, setColors] = useState<any[]>([]);
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    useEffect(() => {
        // Active colors for the recipe's shade picker (capped; future: server typeahead at 30k).
        authFetch('/api/colors?status=active&size=500')
            .then((res: Response) => res.ok ? res.json() : null)
            .then((data: any) => { if (data) setColors(data.items ?? []); })
            .catch(() => {});
    }, [authFetch]);

    const colorOptions = React.useMemo(() =>
        [{ value: '', label: 'No library color' },
         ...colors.map((c: any) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name }))],
    [colors]);

    useEffect(() => {
        authFetch('/api/preferences/code_config_DYE')
            .then((res: Response) => res.ok ? res.json() : null)
            .then((data: any) => { if (data?.value) setCodeConfig(data.value); })
            .catch(() => {});
    }, [authFetch]);

    useEffect(() => {
        authFetch('/api/items?skip=0&limit=2000&search=')
            .then((res: Response) => res.ok ? res.json() : null)
            .then((data: any) => {
                if (!data) return;
                const all: any[] = Array.isArray(data) ? data : (data.items || []);
                setAllChemicalItems(all.filter((it: any) =>
                    it.category_path && it.category_path.some((p: string) => p === 'Chemical' || p === 'Dye')
                ));
            })
            .catch(() => {});
    }, [authFetch]);

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

    // Auto-generate code from config + selected attribute values (new recipes only)
    useEffect(() => {
        if (!codeConfig) return;
        if (editingRecipe) return;
        const variantNames: string[] = (codeConfig.variantAttributeNames || []).map((attrName: string) => {
            const attr = attributes.find((a: any) => a.name === attrName);
            if (!attr) return '';
            const sel = (attr.values || []).find((v: any) => form.attribute_value_ids.includes(String(v.id)));
            return sel?.value || '';
        }).filter(Boolean);
        const parts = buildCodeParts(codeConfig, '', variantNames);
        const base = parts.join(codeConfig.separator);
        const matchingCounters = recipes
            .filter(r => {
                if (!r.code) return false;
                const m = r.code.match(/^(.+)-(\d{5})$/);
                return m && m[1] === base;
            })
            .map(r => {
                const m = (r.code || '').match(/(\d{5})$/);
                return m ? parseInt(m[1], 10) : 0;
            });
        const counter = matchingCounters.length > 0 ? Math.max(...matchingCounters) + 1 : 1;
        setForm(f => ({ ...f, code: buildCodeWithCounter(codeConfig, counter, '', variantNames) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.attribute_value_ids, codeConfig, editingRecipe]);

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
        setWashBaths([]);
        setFinishingSteps([]);
        setShowForm(true);
        setSelectedId(null);
    };

    const openEdit = (recipe: any) => {
        setEditingRecipe(recipe);
        setForm({
            code: recipe.code || '',
            name: recipe.name || '',
            color_standard: recipe.color_standard || '',
            color_id: recipe.color_id || '',
            substrate_type: recipe.substrate_type || '',
            notes: recipe.notes || '',
            is_active: recipe.is_active !== false,
            lines: (recipe.lines || []).map((l: any) => ({
                id: l.id,
                chemical_type: l.chemical_type || 'OTHER',
                item_id: String(l.item_id || ''),
                qty_per_100kg: l.qty_per_100kg ?? '',
                qty_per_liter: l.qty_per_liter ?? null,
                uom_id: l.uom_id || null,
                sort_order: l.sort_order ?? '',
            })),
            attribute_value_ids: (recipe.attribute_value_ids || []).map(String),
        });
        setWashBaths((recipe.wash_baths || []).map((wb: any) => ({
            bath_number: wb.bath_number,
            description: wb.description,
        })));
        setFinishingSteps((recipe.finishing_steps || []).map((fs: any) => ({
            description: fs.description,
            sort_order: fs.sort_order,
        })));
        setShowForm(true);
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingRecipe(null);
        setForm(emptyForm());
        setWashBaths([]);
        setFinishingSteps([]);
    };

    const handleSave = async () => {
        if (!form.code.trim() || !form.name.trim()) {
            showToast('Code and Name are required.', 'warning');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                color_id: form.color_id || null,
                lines: form.lines.map((l, idx) => ({
                    ...l,
                    qty_per_100kg: parseFloat(String(l.qty_per_100kg)) || 0,
                    qty_per_liter: l.qty_per_liter,
                    sort_order: parseInt(String(l.sort_order)) || idx + 1,
                })),
                wash_baths: washBaths,
                finishing_steps: finishingSteps,
                attribute_value_ids: form.attribute_value_ids,
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
                setWashBaths([]);
                setFinishingSteps([]);
                setSelectedId(String(saved.id || (editingRecipe ? editingRecipe.id : '')));
                showToast(editingRecipe ? 'Recipe updated.' : 'Recipe created.', 'success');
            } else {
                const err = await res.json().catch(() => ({}));
                showToast('Save failed: ' + (err.detail || res.statusText), 'danger');
            }
        } catch (e: any) {
            showToast('Save error: ' + e.message, 'danger');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (recipe: any) => {
        const confirmed = await confirm({
            title: 'Delete Recipe',
            message: `Delete recipe "${recipe.code} - ${recipe.name}"? This cannot be undone.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            const res = await authFetch(`/api/dye-recipes/${recipe.id}`, { method: 'DELETE' });
            if (res.ok) {
                await loadRecipes();
                setSelectedId(null);
                setShowForm(false);
                showToast('Recipe deleted.', 'success');
            } else {
                const err = await res.json().catch(() => ({}));
                showToast('Delete failed: ' + (err.detail || res.statusText), 'danger');
            }
        } catch (e: any) {
            showToast('Delete error: ' + e.message, 'danger');
        }
    };

    const addLine = () => {
        setForm(f => ({
            ...f,
            lines: [
                ...f.lines,
                {
                    chemical_type: 'DYE',
                    item_id: '',
                    qty_per_100kg: '',
                    qty_per_liter: null,
                    uom_id: null,
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

    // Shared cell border / header styles for tables (theme-aware)
    const thStyle = (extra?: React.CSSProperties): React.CSSProperties => classic
        ? {
            background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
            borderBottom: '2px solid #808080', borderRight: '1px solid #b0aaa0',
            padding: '3px 6px', textAlign: 'left', whiteSpace: 'nowrap',
            fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#000',
            ...extra,
        }
        : {
            background: '#eef1f6', color: '#475569', textTransform: 'uppercase',
            fontSize: 11, fontWeight: 700, padding: '6px 10px',
            borderBottom: '1.5px solid #cbd3df', fontFamily: modernFont, textAlign: 'left',
            ...extra,
        };

    return (
        <>
        <div style={{ display: 'flex', height: '100%', gap: 0, fontFamily: classic ? xpFont : modernFont, fontSize: classic ? 11 : 13, ...(classic ? {} : { background: '#f8fafc', color: '#1e293b' }) }}>
            {/* Left Panel */}
            <div style={classic
                ? { width: 280, minWidth: 280, display: 'flex', flexDirection: 'column', ...xpPanel, borderRight: '1px solid #7f9db9' }
                : { width: 280, minWidth: 280, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #dbe1ea' }
            }>
                <div style={classic ? xpSectionHeader : modernSectionHeader}>Dye Recipe Library</div>
                <div style={{ padding: '4px 4px 2px 4px', borderBottom: classic ? '1px solid #c0d4e8' : '1px solid #e6eaf1' }}>
                    <input
                        style={{ ...inputStyle(classic), width: '100%', boxSizing: 'border-box' }}
                        placeholder="Search code or name..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                    />
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && (
                        <div style={{ padding: '8px', color: classic ? '#555' : '#64748b', fontSize: classic ? 10 : 12 }}>Loading...</div>
                    )}
                    {!loading && filteredRecipes.length === 0 && (
                        <div style={{ padding: '8px', color: classic ? '#888' : '#64748b', fontSize: classic ? 10 : 12 }}>No recipes found.</div>
                    )}
                    {filteredRecipes.map((recipe, idx) => {
                        const isSelected = String(recipe.id) === String(selectedId);
                        const isHovered = String(recipe.id) === String(hoveredId);
                        const isEven = idx % 2 === 0;
                        let bg = classic
                            ? (isEven ? '#f7f9fc' : 'white')
                            : (isEven ? '#f8fafc' : '#fff');
                        if (isHovered && !isSelected) bg = classic ? '#d4e4f7' : '#e7eefc';
                        if (isSelected) bg = classic ? '#3060b8' : '#eff6ff';
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
                                    borderBottom: classic ? '1px solid #e8eef5' : '1px solid #e6eaf1',
                                    userSelect: 'none',
                                    ...(classic || !isSelected ? {} : { boxShadow: 'inset 3px 0 0 #2563eb' }),
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: classic ? 11 : 13, color: classic ? (isSelected ? 'white' : '#1a1a1a') : (isSelected ? '#1d4ed8' : '#1e293b'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {recipe.code}
                                    </div>
                                    <div style={{ fontSize: classic ? 10 : 12, color: classic ? (isSelected ? '#c8daff' : '#666') : (isSelected ? '#3b82f6' : '#64748b'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {recipe.name}
                                    </div>
                                </div>
                                <div style={{ marginLeft: 6, flexShrink: 0 }}>
                                    {recipe.is_active !== false ? (
                                        <span style={classic ? {
                                            display: 'inline-block', width: 8, height: 8,
                                            borderRadius: '50%', background: '#2a9a2a',
                                            border: '1px solid #1d6b1d',
                                        } : {
                                            display: 'inline-block', width: 8, height: 8,
                                            borderRadius: '50%', background: '#22c55e',
                                            border: '1px solid #16a34a',
                                        }} title="Active" />
                                    ) : (
                                        <span style={classic ? {
                                            fontSize: 9, background: '#ccc', color: '#444',
                                            padding: '1px 3px', border: '1px solid #999',
                                            borderRadius: 2,
                                        } : {
                                            fontSize: 10, background: '#f1f5f9', color: '#64748b',
                                            padding: '1px 5px', border: '1px solid #cbd3df',
                                            borderRadius: 6, fontWeight: 600,
                                        }}>INACTIVE</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {canManage && (
                <div style={{ padding: '4px 6px', borderTop: classic ? '1px solid #c0d4e8' : '1px solid #e6eaf1', background: classic ? '#eef2f8' : '#f8fafc' }}>
                    <button style={{ ...primaryBtnStyle(classic) }} onClick={openCreate}>+ New Recipe</button>
                </div>
                )}
            </div>

            {/* Right Panel */}
            <div style={classic
                ? { flex: 1, display: 'flex', flexDirection: 'column', ...xpPanel, borderLeft: 'none', minWidth: 0 }
                : { flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: 'none', minWidth: 0 }
            }>
                {!showForm && !selectedId && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: classic ? '#888' : '#64748b', fontSize: classic ? 12 : 14 }}>
                        Select a recipe or create new
                    </div>
                )}

                {showForm && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        <div style={classic ? xpSectionHeader : modernSectionHeader}>
                            {editingRecipe ? 'Edit Recipe' : 'New Recipe'}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                            {/* Basic fields grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 10 }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: classic ? '#333' : '#475569', fontSize: classic ? undefined : 12, fontWeight: classic ? undefined : 600 }}>
                                        Code <span style={{ color: classic ? 'red' : '#dc2626' }}>*</span>
                                    </label>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <input
                                            style={{ ...inputStyle(classic), flex: 1 }}
                                            value={form.code}
                                            onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                                            placeholder="e.g. DR-001"
                                        />
                                        <button
                                            type="button"
                                            style={classic
                                                ? { ...xpBtn, fontSize: 10, padding: '1px 6px', flexShrink: 0, whiteSpace: 'nowrap' }
                                                : { ...modernBtn, flexShrink: 0, whiteSpace: 'nowrap' }
                                            }
                                            onClick={() => setShowCodeConfig(true)}
                                            title="Configure code format"
                                        >Configure</button>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: classic ? '#333' : '#475569', fontSize: classic ? undefined : 12, fontWeight: classic ? undefined : 600 }}>
                                        Name <span style={{ color: classic ? 'red' : '#dc2626' }}>*</span>
                                    </label>
                                    <input
                                        style={{ ...inputStyle(classic), width: '100%', boxSizing: 'border-box' }}
                                        value={form.name}
                                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="Recipe name"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: classic ? '#333' : '#475569', fontSize: classic ? undefined : 12, fontWeight: classic ? undefined : 600 }}>Library Color</label>
                                    <SearchableSelect
                                        options={colorOptions}
                                        value={form.color_id}
                                        onChange={(v: string) => setForm(f => ({ ...f, color_id: v }))}
                                        placeholder="Link to Color Library…"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: classic ? '#333' : '#475569', fontSize: classic ? undefined : 12, fontWeight: classic ? undefined : 600 }}>Color Standard</label>
                                    <input
                                        style={{ ...inputStyle(classic), width: '100%', boxSizing: 'border-box' }}
                                        value={form.color_standard}
                                        onChange={e => setForm(f => ({ ...f, color_standard: e.target.value }))}
                                        placeholder="e.g. Pantone 18-1550"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 2, color: classic ? '#333' : '#475569', fontSize: classic ? undefined : 12, fontWeight: classic ? undefined : 600 }}>Substrate Type</label>
                                    <input
                                        style={{ ...inputStyle(classic), width: '100%', boxSizing: 'border-box' }}
                                        value={form.substrate_type}
                                        onChange={e => setForm(f => ({ ...f, substrate_type: e.target.value }))}
                                        placeholder="e.g. Cotton, Polyester"
                                    />
                                </div>
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <label style={{ display: 'block', marginBottom: 2, color: classic ? '#333' : '#475569', fontSize: classic ? undefined : 12, fontWeight: classic ? undefined : 600 }}>Notes</label>
                                <textarea
                                    style={{
                                        ...inputStyle(classic), height: 'auto', width: '100%',
                                        boxSizing: 'border-box', resize: 'vertical', minHeight: 48, padding: classic ? '2px 4px' : '4px 8px',
                                    }}
                                    value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                    placeholder="Optional notes"
                                />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: classic ? '#333' : '#334155', fontSize: classic ? undefined : 13 }}>
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                                        style={{ margin: 0 }}
                                    />
                                    Active
                                </label>
                            </div>

                            {/* Attribute Matching */}
                            {attributes.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <div style={classic ? {
                                        background: '#dde8f5', border: '1px solid #7f9db9',
                                        padding: '2px 6px', fontWeight: 'bold', fontSize: 11,
                                        color: '#1a1a1a', marginBottom: 4,
                                    } : {
                                        background: '#eef1f6', border: '1px solid #dbe1ea',
                                        borderRadius: 7,
                                        padding: '6px 10px', fontWeight: 700, fontSize: 11,
                                        textTransform: 'uppercase', letterSpacing: '0.04em',
                                        color: '#475569', marginBottom: 6,
                                    }}>
                                        Attribute Match (for auto-suggest)
                                    </div>
                                    <div style={classic
                                        ? { border: '1px solid #c0d4e8', padding: '6px 8px', background: '#f7f9fc' }
                                        : { border: '1px solid #dbe1ea', borderRadius: 9, padding: '8px 10px', background: '#f8fafc' }
                                    }>
                                        <div style={{ fontSize: classic ? 10 : 12, color: classic ? '#666' : '#64748b', marginBottom: 6 }}>
                                            Link this recipe to attribute values. The system will suggest it when a Work Order matches all selected values.
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '4px 12px' }}>
                                            {attributes.map((attr: any) => {
                                                if (!attr.values?.length) return null;
                                                const selectedId = (attr.values as any[]).find(
                                                    (v: any) => form.attribute_value_ids.includes(String(v.id))
                                                )?.id?.toString() || '';
                                                return (
                                                    <div key={attr.id}>
                                                        <div style={{ fontSize: classic ? 10 : 12, color: classic ? '#555' : '#64748b', marginBottom: 2 }}>{attr.name}</div>
                                                        <select
                                                            style={{ ...inputStyle(classic), height: classic ? 22 : 'auto', width: '100%' }}
                                                            value={selectedId}
                                                            onChange={e => {
                                                                const newValId = e.target.value;
                                                                const attrValIds = (attr.values as any[]).map((v: any) => String(v.id));
                                                                setForm(f => ({
                                                                    ...f,
                                                                    attribute_value_ids: [
                                                                        ...f.attribute_value_ids.filter(x => !attrValIds.includes(x)),
                                                                        ...(newValId ? [newValId] : []),
                                                                    ],
                                                                }));
                                                            }}
                                                        >
                                                            <option value="">-- none --</option>
                                                            {(attr.values as any[]).map((val: any) => (
                                                                <option key={val.id} value={String(val.id)}>{val.value}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Chemical Lines */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={classic ? {
                                    background: '#dde8f5', borderBottom: '1px solid #7f9db9',
                                    padding: '2px 6px', fontWeight: 'bold', fontSize: 11, color: '#1a1a1a',
                                    border: '1px solid #7f9db9', borderTopLeftRadius: 2, borderTopRightRadius: 2,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                } : {
                                    background: '#eef1f6', borderBottom: '1px solid #dbe1ea',
                                    padding: '7px 12px', fontWeight: 700, fontSize: 11, color: '#475569',
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                    border: '1px solid #dbe1ea', borderTopLeftRadius: 9, borderTopRightRadius: 9,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span>Chemical Lines</span>
                                </div>
                                <div style={classic
                                    ? { border: '1px solid #7f9db9', borderTop: 'none' }
                                    : { border: '1px solid #dbe1ea', borderTop: 'none', borderBottomLeftRadius: 9, borderBottomRightRadius: 9, overflow: 'hidden' }
                                }>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 10 : 13 }}>
                                        <thead>
                                            <tr style={classic ? { background: '#eef2f8' } : {}}>
                                                <th style={thStyle({ width: 24 })}>#</th>
                                                <th style={thStyle({ width: 80 })}>Type</th>
                                                <th style={thStyle()}>Item</th>
                                                <th style={thStyle({ width: 80 })}>Qty/100kg</th>
                                                <th style={thStyle({ width: 80, fontSize: classic ? 11 : 11 })}>g/L</th>
                                                <th style={thStyle({ width: 50 })}>Sort</th>
                                                <th style={thStyle({ textAlign: 'center', width: 28 })}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {form.lines.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '6px', color: classic ? '#888' : '#64748b', textAlign: 'center' }}>
                                                        No lines. Click "Add Line" to begin.
                                                    </td>
                                                </tr>
                                            )}
                                            {form.lines.map((line, idx) => (
                                                <tr key={idx} style={{ background: classic ? (idx % 2 === 0 ? 'white' : '#f7f9fc') : (idx % 2 === 0 ? '#fff' : '#f8fafc') }}>
                                                    <td style={{ padding: classic ? '2px 4px' : '6px 10px', color: classic ? '#666' : '#64748b', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>{idx + 1}</td>
                                                    <td style={{ padding: classic ? '2px 4px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                        <select
                                                            style={{ ...inputStyle(classic), height: classic ? 20 : 'auto', width: '100%' }}
                                                            value={line.chemical_type}
                                                            onChange={e => updateLine(idx, 'chemical_type', e.target.value)}
                                                        >
                                                            {LINE_TYPES.map(t => (
                                                                <option key={t} value={t}>{t}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                        <SearchableSelect
                                                            options={allChemicalItems.map((item: any) => ({
                                                                value: String(item.id),
                                                                label: item.name,
                                                                subLabel: item.code,
                                                            }))}
                                                            value={line.item_id}
                                                            onChange={val => updateLine(idx, 'item_id', val)}
                                                            placeholder="-- select item --"
                                                            size="sm"
                                                        />
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...inputStyle(classic), width: '100%' }}
                                                            value={line.qty_per_100kg}
                                                            onChange={e => updateLine(idx, 'qty_per_100kg', e.target.value)}
                                                            placeholder="0"
                                                            min={0}
                                                            step="any"
                                                        />
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...inputStyle(classic), width: '100%' }}
                                                            value={line.qty_per_liter ?? ''}
                                                            onChange={e => updateLine(idx, 'qty_per_liter', e.target.value ? parseFloat(e.target.value) : null)}
                                                            placeholder="0"
                                                            min={0}
                                                            step="any"
                                                        />
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                        <input
                                                            type="number"
                                                            style={{ ...inputStyle(classic), width: '100%' }}
                                                            value={line.sort_order}
                                                            onChange={e => updateLine(idx, 'sort_order', e.target.value)}
                                                            placeholder={String(idx + 1)}
                                                            min={1}
                                                        />
                                                    </td>
                                                    <td style={{ padding: classic ? '2px 4px' : '6px 10px', textAlign: 'center', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                        <button
                                                            style={classic
                                                                ? { ...xpBtn, padding: '0px 5px', fontSize: 10, color: '#aa0000' }
                                                                : { ...modernBtn, padding: '3px 8px', fontSize: 12, color: '#dc2626', borderColor: '#f0c5c5' }
                                                            }
                                                            onClick={() => removeLine(idx)}
                                                            title="Remove line"
                                                        >X</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ padding: '4px 6px', borderTop: classic ? '1px solid #e8eef5' : '1px solid #e6eaf1', background: classic ? '#f7f9fc' : '#f8fafc' }}>
                                        <button style={btnStyle(classic)} onClick={addLine}>Add Line</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BAK CUCI */}
                        <div style={{ padding: '8px 12px', borderTop: classic ? '1px solid #c0d4e8' : '1px solid #e6eaf1' }}>
                            <div style={{ fontWeight: classic ? 600 : 700, fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: classic ? 1 : '0.04em', color: classic ? undefined : '#475569' }}>Bak Cuci</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 10 : 13 }}>
                                <thead>
                                    <tr style={classic ? { background: '#eef2f8' } : {}}>
                                        <th style={thStyle({ width: 50 })}>No.</th>
                                        <th style={thStyle()}>Description</th>
                                        <th style={thStyle({ width: 36 })}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {washBaths.map((wb, i) => (
                                        <tr key={i} style={{ background: classic ? (i % 2 === 0 ? 'white' : '#f7f9fc') : (i % 2 === 0 ? '#fff' : '#f8fafc') }}>
                                            <td style={{ padding: classic ? '2px 4px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                <input type="number" style={{ ...inputStyle(classic), width: '100%' }}
                                                    value={wb.bath_number}
                                                    onChange={e => { const u = [...washBaths]; u[i] = { ...u[i], bath_number: parseInt(e.target.value) || i + 1 }; setWashBaths(u); }} />
                                            </td>
                                            <td style={{ padding: classic ? '2px 4px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                <input type="text" style={{ ...inputStyle(classic), width: '100%' }}
                                                    value={wb.description}
                                                    onChange={e => { const u = [...washBaths]; u[i] = { ...u[i], description: e.target.value }; setWashBaths(u); }} />
                                            </td>
                                            <td style={{ padding: classic ? '2px 4px' : '6px 10px', textAlign: 'center', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                <button style={classic
                                                    ? { ...xpBtn, padding: '0px 5px', fontSize: 10, color: '#aa0000' }
                                                    : { ...modernBtn, padding: '3px 8px', fontSize: 12, color: '#dc2626', borderColor: '#f0c5c5' }
                                                }
                                                    onClick={() => setWashBaths(washBaths.filter((_, j) => j !== i))}>×</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button style={classic ? { ...xpBtn, marginTop: 4, fontSize: 10 } : { ...modernBtn, marginTop: 4 }}
                                onClick={() => setWashBaths([...washBaths, { bath_number: washBaths.length + 1, description: '' }])}>+ Add Bath</button>
                        </div>

                        {/* FINISHING */}
                        <div style={{ padding: '8px 12px', borderTop: classic ? '1px solid #c0d4e8' : '1px solid #e6eaf1' }}>
                            <div style={{ fontWeight: classic ? 600 : 700, fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: classic ? 1 : '0.04em', color: classic ? undefined : '#475569' }}>Finishing</div>
                            {finishingSteps.map((fs, i) => (
                                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                                    <input type="text" style={{ ...inputStyle(classic), flex: 1 }}
                                        value={fs.description}
                                        onChange={e => { const u = [...finishingSteps]; u[i] = { ...u[i], description: e.target.value }; setFinishingSteps(u); }}
                                        placeholder="e.g. TALASOFT NI 20cc/l CHROMAFIX FRD 10cc/l" />
                                    <button style={classic
                                        ? { ...xpBtn, padding: '0px 5px', fontSize: 10, color: '#aa0000', flexShrink: 0 }
                                        : { ...modernBtn, padding: '3px 8px', fontSize: 12, color: '#dc2626', borderColor: '#f0c5c5', flexShrink: 0 }
                                    }
                                        onClick={() => setFinishingSteps(finishingSteps.filter((_, j) => j !== i))}>×</button>
                                </div>
                            ))}
                            <button style={classic ? { ...xpBtn, fontSize: 10 } : { ...modernBtn }}
                                onClick={() => setFinishingSteps([...finishingSteps, { description: '', sort_order: finishingSteps.length }])}>+ Add Finishing Step</button>
                        </div>

                        {/* Save / Cancel */}
                        <div style={{
                            display: 'flex', gap: 6, padding: '6px 12px',
                            borderTop: classic ? '1px solid #c0d4e8' : '1px solid #e6eaf1', background: classic ? '#eef2f8' : '#f8fafc',
                        }}>
                            <button
                                style={classic ? {
                                    ...xpBtn,
                                    background: saving ? '#b0b8d0' : 'linear-gradient(to bottom, #4a7fd0, #2a5ab0)',
                                    color: 'white',
                                    borderColor: '#1a3d90 #0a1e60 #0a1e60 #1a3d90',
                                    fontWeight: 'bold',
                                    padding: '3px 14px',
                                } : {
                                    ...primaryBtnStyle(false),
                                    background: saving ? '#93b4f5' : '#2563eb',
                                    cursor: saving ? 'default' : 'pointer',
                                }}
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button style={classic ? { ...xpBtn, padding: '3px 10px' } : { ...modernBtn }} onClick={handleCancel} disabled={saving}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {!showForm && selectedId && selectedRecipe && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        <div style={{ ...(classic ? xpSectionHeader : modernSectionHeader), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Recipe Detail</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {canManage && (
                                <button
                                    style={classic ? {
                                        ...xpBtn,
                                        fontSize: 10, padding: '1px 8px',
                                        background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                                        color: '#1a1a1a',
                                    } : { ...modernBtn }}
                                    onClick={() => openEdit(selectedRecipe)}
                                >Edit</button>
                                )}
                                <button
                                    style={classic ? { ...xpBtn, fontSize: 10, padding: '1px 8px' } : { ...modernBtn }}
                                    onClick={() => setShowPrint(true)}
                                    title="Print Recipe Card"
                                >Print</button>
                                {canManage && (
                                <button
                                    style={classic ? {
                                        ...xpBtn,
                                        fontSize: 10, padding: '1px 8px',
                                        background: 'linear-gradient(to bottom, #e08080, #c04040)',
                                        color: 'white',
                                        borderColor: '#a03030 #601010 #601010 #a03030',
                                    } : {
                                        ...modernBtn,
                                        background: '#dc2626', color: '#fff', border: 'none', fontWeight: 600,
                                    }}
                                    onClick={() => handleDelete(selectedRecipe)}
                                >Delete</button>
                                )}
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 12 }}>
                                <DetailField label="Code" value={selectedRecipe.code} classic={classic} />
                                <DetailField label="Name" value={selectedRecipe.name} classic={classic} />
                                <DetailField label="Color Standard" value={selectedRecipe.color_standard} classic={classic} />
                                <DetailField label="Substrate Type" value={selectedRecipe.substrate_type} classic={classic} />
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <DetailField label="Notes" value={selectedRecipe.notes} classic={classic} />
                                </div>
                                <div>
                                    <span style={{ color: classic ? '#555' : '#64748b', fontSize: classic ? 10 : 12 }}>Status: </span>
                                    {selectedRecipe.is_active !== false ? (
                                        <span style={{ color: classic ? '#1a6a1a' : '#16a34a', fontWeight: 'bold', fontSize: classic ? 11 : 13 }}>Active</span>
                                    ) : (
                                        <span style={{ color: classic ? '#aa4400' : '#d97706', fontWeight: 'bold', fontSize: classic ? 11 : 13 }}>Inactive</span>
                                    )}
                                </div>
                                {selectedRecipe.attribute_value_ids?.length > 0 && (
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div style={{ fontSize: classic ? 10 : 12, color: classic ? '#555' : '#64748b', marginBottom: 2 }}>Attribute Match</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 6px' }}>
                                            {selectedRecipe.attribute_value_ids.map((vid: string) => {
                                                let label = vid;
                                                for (const attr of attributes) {
                                                    const v = (attr.values || []).find((av: any) => String(av.id) === String(vid));
                                                    if (v) { label = `${attr.name}: ${v.value}`; break; }
                                                }
                                                return (
                                                    <span key={vid} style={classic ? {
                                                        background: '#dde8f5', border: '1px solid #7fa8e8',
                                                        padding: '1px 6px', borderRadius: 2, fontSize: 10, color: '#1a3d90',
                                                    } : {
                                                        background: '#eff6ff', border: '1px solid #bfd3f5',
                                                        padding: '2px 8px', borderRadius: 6, fontSize: 12, color: '#1d4ed8', fontWeight: 500,
                                                    }}>{label}</span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Lines read-only table */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={classic ? {
                                    background: '#dde8f5', borderBottom: '1px solid #7f9db9',
                                    padding: '2px 6px', fontWeight: 'bold', fontSize: 11, color: '#1a1a1a',
                                    border: '1px solid #7f9db9',
                                } : {
                                    background: '#eef1f6', borderBottom: '1px solid #dbe1ea',
                                    padding: '7px 12px', fontWeight: 700, fontSize: 11, color: '#475569',
                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                    border: '1px solid #dbe1ea', borderTopLeftRadius: 9, borderTopRightRadius: 9,
                                }}>
                                    Chemical Lines
                                </div>
                                <div style={classic
                                    ? { border: '1px solid #7f9db9', borderTop: 'none' }
                                    : { border: '1px solid #dbe1ea', borderTop: 'none', borderBottomLeftRadius: 9, borderBottomRightRadius: 9, overflow: 'hidden' }
                                }>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 10 : 13 }}>
                                        <thead>
                                            <tr style={classic ? { background: '#eef2f8' } : {}}>
                                                <th style={thStyle({ width: 28 })}>#</th>
                                                <th style={thStyle({ width: 80 })}>Type</th>
                                                <th style={thStyle()}>Item</th>
                                                <th style={thStyle({ textAlign: 'right', width: 90 })}>Qty/100kg</th>
                                                <th style={thStyle({ width: 60 })}>UOM</th>
                                                <th style={thStyle({ textAlign: 'center', width: 50 })}>Sort</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!selectedRecipe.lines || selectedRecipe.lines.length === 0) && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '8px', color: classic ? '#888' : '#64748b', textAlign: 'center' }}>
                                                        No chemical lines defined.
                                                    </td>
                                                </tr>
                                            )}
                                            {(selectedRecipe.lines || []).map((line: any, idx: number) => {
                                                const linkedItem = items.find(it => String(it.id) === String(line.item_id));
                                                return (
                                                    <tr key={idx} style={{ background: classic ? (idx % 2 === 0 ? 'white' : '#f7f9fc') : (idx % 2 === 0 ? '#fff' : '#f8fafc') }}>
                                                        <td style={{ padding: classic ? '3px 6px' : '6px 10px', color: classic ? '#666' : '#64748b', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>{idx + 1}</td>
                                                        <td style={{ padding: classic ? '3px 6px' : '6px 10px', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                            <span style={{
                                                                background: typeColor(line.chemical_type, classic).bg,
                                                                color: typeColor(line.chemical_type, classic).fg,
                                                                padding: classic ? '1px 5px' : '2px 7px', borderRadius: classic ? 2 : 6,
                                                                fontWeight: classic ? 'bold' : 600, fontSize: classic ? 9 : 11,
                                                                border: `1px solid ${typeColor(line.chemical_type, classic).border}`,
                                                            }}>
                                                                {line.chemical_type || '-'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: classic ? '3px 6px' : '6px 10px', color: classic ? undefined : '#334155', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                            {line.item_name || linkedItem?.name || (line.item_id || '-')}
                                                        </td>
                                                        <td style={{ padding: classic ? '3px 6px' : '6px 10px', textAlign: 'right', color: classic ? undefined : '#334155', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>
                                                            {line.qty_per_100kg != null ? Number(line.qty_per_100kg).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-'}
                                                        </td>
                                                        <td style={{ padding: classic ? '3px 6px' : '6px 10px', color: classic ? undefined : '#334155', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>{line.uom_name || '-'}</td>
                                                        <td style={{ padding: classic ? '3px 6px' : '6px 10px', textAlign: 'center', color: classic ? undefined : '#334155', borderBottom: classic ? undefined : '1px solid #e6eaf1' }}>{line.sort_order ?? '-'}</td>
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

        {showPrint && selectedRecipe && (
            <DyeRecipePrintView
                recipe={selectedRecipe}
                onClose={() => setShowPrint(false)}
            />
        )}

        {showCodeConfig && (
            <CodeConfigModal
                isOpen={showCodeConfig}
                onClose={() => setShowCodeConfig(false)}
                type="DYE"
                attributes={attributes}
                initialConfig={codeConfig || undefined}
                onSave={cfg => {
                    setCodeConfig(cfg);
                    authFetch('/api/preferences/code_config_DYE', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ value: cfg }),
                    }).catch(() => {});
                    setShowCodeConfig(false);
                }}
            />
        )}
        </>
    );
}

function DetailField({ label, value, classic }: { label: string; value?: string | null; classic: boolean }) {
    return (
        <div>
            <div style={{ fontSize: classic ? 10 : 12, color: classic ? '#555' : '#64748b', marginBottom: classic ? 1 : 3 }}>{label}</div>
            <div style={classic ? {
                fontFamily: 'Tahoma, "Segoe UI", sans-serif', fontSize: 11,
                color: value ? '#1a1a1a' : '#aaa',
                background: '#f7f9fc', border: '1px solid #c8d8e8',
                padding: '1px 5px', minHeight: 18,
            } : {
                fontFamily: modernFont, fontSize: 13,
                color: value ? '#1e293b' : '#94a3b8',
                background: '#f8fafc', border: '1px solid #dbe1ea', borderRadius: 7,
                padding: '4px 8px', minHeight: 18,
            }}>
                {value || '-'}
            </div>
        </div>
    );
}

function typeColor(type: string, classic: boolean): { bg: string; fg: string; border: string } {
    if (!classic) {
        switch ((type || '').toUpperCase()) {
            case 'DYE':       return { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfd3f5' };
            case 'AUXILIARY': return { bg: '#ecfdf3', fg: '#16a34a', border: '#bbf0cc' };
            case 'SALT':      return { bg: '#fef9ec', fg: '#b45309', border: '#f1dca0' };
            default:          return { bg: '#f1f5f9', fg: '#64748b', border: '#cbd3df' };
        }
    }
    switch ((type || '').toUpperCase()) {
        case 'DYE':       return { bg: '#d0e4ff', fg: '#1a3d90', border: '#7fa8e8' };
        case 'AUXILIARY': return { bg: '#d8f0d8', fg: '#1a5a1a', border: '#7fbb7f' };
        case 'SALT':      return { bg: '#fff0c0', fg: '#7a5000', border: '#d4a800' };
        default:          return { bg: '#ececec', fg: '#444', border: '#b0b0b0' };
    }
}
