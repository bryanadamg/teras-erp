'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DyeRecipePrintView from './DyeRecipePrintView';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import CodeConfigModal, { CodeConfig } from '../shared/CodeConfigModal';
import ModalWrapper from '../shared/ModalWrapper';
import SearchableSelect from '../shared/SearchableSelect';
import Pager from '../shared/Pager';
import { StatusChip, FormSection, useFloatingMenu, MenuTriggerButton, FloatingMenu } from '../shared/xpTheme';
import { lvInput, lvBtn, lvPrimaryBtn, lvTh, lvTd, lvSep, lvRow, lvLabel } from '../shared/listViewTheme';
import { API_BASE } from '../shared/apiBase';

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
const RECIPE_PAGE_SIZE = 25;

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
});

interface Props {
    items: any[];
    attributes: any[];
    authFetch: Function;
    // Deep-link from Color Library "create recipe for this color" button: opens the
    // create panel pre-selected on this color. Cleared via onColorConsumed once opened.
    initialColorId?: string | null;
    onColorConsumed?: () => void;
}

export default function DyeRecipeTab({ items, attributes, authFetch, initialColorId, onColorConsumed }: Props) {
    const { uiStyle } = useTheme();
    const router = useRouter();
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
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const toggleExpand = (id: string) => setExpandedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const [washBaths, setWashBaths] = useState<Array<{bath_number: number; description: string}>>([]);
    const [finishingSteps, setFinishingSteps] = useState<Array<{description: string; sort_order: number}>>([]);
    const [showPrint, setShowPrint] = useState(false);
    const [showCodeConfig, setShowCodeConfig] = useState(false);
    const [codeConfig, setCodeConfig] = useState<CodeConfig | null>(null);
    const [allChemicalItems, setAllChemicalItems] = useState<any[]>([]);
    const [colors, setColors] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(160);

    useEffect(() => {
        // Active colors for the recipe's shade picker (capped; future: server typeahead at 30k).
        authFetch(`${API_BASE}/colors?status=active&size=500`)
            .then((res: Response) => res.ok ? res.json() : null)
            .then((data: any) => { if (data) setColors(data.items ?? []); })
            .catch(() => {});
    }, [authFetch]);

    const colorOptions = React.useMemo(() =>
        [{ value: '', label: 'No library color' },
         ...colors.map((c: any) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name }))],
    [colors]);

    useEffect(() => {
        authFetch(`${API_BASE}/preferences/code_config_DYE`)
            .then((res: Response) => res.ok ? res.json() : null)
            .then((data: any) => { if (data?.value) setCodeConfig(data.value); })
            .catch(() => {});
    }, [authFetch]);

    useEffect(() => {
        authFetch(`${API_BASE}/items?skip=0&limit=2000&search=`)
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
            const res = await authFetch(`${API_BASE}/dye-recipes`);
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

    // Recipe code base = configurable prefix + selected color's code (Configure edits
    // prefix/separator). Counter is a 5-digit suffix, incremented per base.
    const recipeCodeBase = useCallback((colorCode: string): string => {
        const sep = codeConfig?.separator || '-';
        const prefix = codeConfig?.prefix || 'DR';
        return [prefix, colorCode].filter(Boolean).join(sep);
    }, [codeConfig]);

    // Auto-generate code + derive name/standard from the selected Library Color
    // (new recipes only — a recipe is made FOR one color code).
    useEffect(() => {
        if (editingRecipe) return;
        const color = colors.find((c: any) => String(c.id) === String(form.color_id));
        if (!color) {
            setForm(f => (f.code || f.name ? { ...f, code: '', name: '', color_standard: '' } : f));
            return;
        }
        const sep = codeConfig?.separator || '-';
        const base = recipeCodeBase(color.code || '');
        const matchingCounters = recipes
            .filter(r => {
                if (!r.code) return false;
                const m = r.code.match(/^(.+)[-_ ](\d{5})$/);
                return m && m[1] === base;
            })
            .map(r => {
                const m = (r.code || '').match(/(\d{5})$/);
                return m ? parseInt(m[1], 10) : 0;
            });
        const counter = matchingCounters.length > 0 ? Math.max(...matchingCounters) + 1 : 1;
        setForm(f => ({
            ...f,
            code: [base, String(counter).padStart(5, '0')].join(sep),
            name: color.name || color.code || '',
            color_standard: color.pantone_ref || color.code || '',
        }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.color_id, codeConfig, editingRecipe, colors]);

    // Deep-link prefill: Color Library sends a color_id → open the create panel
    // pre-selected on it. Ensure the color is in the picker list (fetch the single
    // color if it's outside the capped active-colors page), then open + consume.
    useEffect(() => {
        if (!initialColorId) return;
        let cancelled = false;
        (async () => {
            if (!colors.some((c: any) => String(c.id) === String(initialColorId))) {
                try {
                    const res = await authFetch(`${API_BASE}/colors/${initialColorId}`);
                    if (res.ok) {
                        const c = await res.json();
                        if (!cancelled && c?.id) {
                            setColors(prev => prev.some(p => String(p.id) === String(c.id)) ? prev : [c, ...prev]);
                        }
                    }
                } catch { /* ignore — badge/code just won't derive */ }
            }
            if (cancelled) return;
            setEditingRecipe(null);
            setWashBaths([]);
            setFinishingSteps([]);
            setForm({ ...emptyForm(), color_id: String(initialColorId) });
            setSelectedId(null);
            setShowForm(true);
            onColorConsumed?.();
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialColorId]);

    const selectedRecipe = recipes.find(r => String(r.id) === String(selectedId)) || null;

    const filteredRecipes = recipes.filter(r => {
        const q = searchText.toLowerCase();
        return (
            (r.code || '').toLowerCase().includes(q) ||
            (r.name || '').toLowerCase().includes(q)
        );
    });

    useEffect(() => { setPage(1); }, [searchText]);
    const recipePages = Math.max(1, Math.ceil(filteredRecipes.length / RECIPE_PAGE_SIZE));
    const clampedPage = Math.min(page, recipePages);
    const pagedRecipes = filteredRecipes.slice((clampedPage - 1) * RECIPE_PAGE_SIZE, clampedPage * RECIPE_PAGE_SIZE);

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
        if (!form.color_id) {
            showToast('Select a Library Color to create a recipe for.', 'warning');
            return;
        }
        if (!form.code.trim() || !form.name.trim()) {
            showToast('Code could not be generated — pick a color with a code.', 'warning');
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
            };
            let res;
            if (editingRecipe) {
                res = await authFetch(`${API_BASE}/dye-recipes/${editingRecipe.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await authFetch(`${API_BASE}/dye-recipes`, {
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
            const res = await authFetch(`${API_BASE}/dye-recipes/${recipe.id}`, { method: 'DELETE' });
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

    // Table header cells build on the shared listViewTheme `lvTh` so nested recipe
    // tables match the library tables; classic adds the XP thead gradient/underline
    // that lvTh leaves to the parent thead.
    const thStyle = (extra?: React.CSSProperties): React.CSSProperties => classic
        ? { ...lvTh(true), background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080', ...extra }
        : { ...lvTh(false), ...extra };

    // Expandable-row detail: full recipe breakdown (chemical lines, wash baths,
    // finishing, attribute matches) shown inline under the table row.
    const renderDetail = (recipe: any) => {
        const sectionHeader = (label: string): React.CSSProperties => classic ? {
            background: '#dde8f5', borderBottom: '1px solid #7f9db9',
            padding: '2px 6px', fontWeight: 'bold', fontSize: 11, color: '#1a1a1a',
            border: '1px solid #7f9db9',
        } : {
            background: '#eef1f6', borderBottom: '1px solid #dbe1ea',
            padding: '7px 12px', fontWeight: 700, fontSize: 11, color: '#475569',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            border: '1px solid #dbe1ea', borderTopLeftRadius: 9, borderTopRightRadius: 9,
        };
        const panelBox: React.CSSProperties = classic
            ? { border: '1px solid #7f9db9', borderTop: 'none' }
            : { border: '1px solid #dbe1ea', borderTop: 'none', borderBottomLeftRadius: 9, borderBottomRightRadius: 9, overflow: 'hidden' };
        const labelStyle: React.CSSProperties = { fontSize: classic ? 10 : 12, color: classic ? '#555' : '#64748b', marginBottom: 2 };
        const emptyStyle: React.CSSProperties = { color: classic ? '#888' : '#64748b', fontSize: classic ? 10 : 12 };
        return (
            <div style={{ padding: classic ? '8px 12px' : '10px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>

                    {/* ── Column 1: Recipe Info ── */}
                    <div>
                        <div style={sectionHeader('Recipe Info')}>Recipe Info</div>
                        <div style={{ ...panelBox, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <DetailField label="Color Standard" value={recipe.color_standard} classic={classic} />
                            <DetailField label="Substrate Type" value={recipe.substrate_type} classic={classic} />
                            <DetailField label="Notes" value={recipe.notes} classic={classic} />
                            {recipe.attribute_value_ids?.length > 0 && (
                                <div>
                                    <div style={labelStyle}>Attribute Match</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 6px' }}>
                                        {recipe.attribute_value_ids.map((vid: string) => {
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
                    </div>

                    {/* ── Column 2: Chemical Lines ── */}
                    <div>
                        <div style={sectionHeader('Chemical Lines')}>Chemical Lines</div>
                        <div style={{ ...panelBox, overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: classic ? 10 : 13 }}>
                                <thead>
                                    <tr style={classic ? { background: '#eef2f8' } : {}}>
                                        <th style={thStyle({ width: 28 })}>#</th>
                                        <th style={thStyle({ width: 70 })}>Type</th>
                                        <th style={thStyle()}>Item</th>
                                        <th style={thStyle({ textAlign: 'right', width: 80 })}>Qty/100kg</th>
                                        <th style={thStyle({ width: 50 })}>UOM</th>
                                        <th style={thStyle({ textAlign: 'center', width: 44 })}>Sort</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!recipe.lines || recipe.lines.length === 0) && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '8px', color: classic ? '#888' : '#64748b', textAlign: 'center' }}>
                                                No chemical lines defined.
                                            </td>
                                        </tr>
                                    )}
                                    {(recipe.lines || []).map((line: any, idx: number) => {
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

                    {/* ── Column 3: Wash Baths + Finishing ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                            <div style={sectionHeader('Bak Cuci')}>Bak Cuci</div>
                            <div style={{ ...panelBox, padding: '6px 8px' }}>
                                {(!recipe.wash_baths || recipe.wash_baths.length === 0)
                                    ? <span style={emptyStyle}>None.</span>
                                    : (recipe.wash_baths || []).map((wb: any, i: number) => (
                                        <div key={i} style={{ fontSize: classic ? 10 : 12, color: classic ? '#1a1a1a' : '#334155', padding: '1px 0' }}>
                                            <b>{wb.bath_number}.</b> {wb.description || '-'}
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div>
                            <div style={sectionHeader('Finishing')}>Finishing</div>
                            <div style={{ ...panelBox, padding: '6px 8px' }}>
                                {(!recipe.finishing_steps || recipe.finishing_steps.length === 0)
                                    ? <span style={emptyStyle}>None.</span>
                                    : (recipe.finishing_steps || []).map((fs: any, i: number) => (
                                        <div key={i} style={{ fontSize: classic ? 10 : 12, color: classic ? '#1a1a1a' : '#334155', padding: '1px 0' }}>
                                            {i + 1}. {fs.description || '-'}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        );
    };

    return (
        <>
        <div style={classic
            ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, ...xpPanel, border: 'none' }
            : { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#fff' }
        }>
            {/* Toolbar */}
            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                {canManage && (
                <button style={lvPrimaryBtn(classic)} onClick={openCreate}>
                    <i className="bi bi-plus-lg" /> New Recipe
                </button>
                )}
                <span style={lvSep(classic)} />
                <input
                    style={{ ...lvInput(classic), width: 240, flexBasis: 240 }}
                    placeholder="Search code or name…"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                />
                <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                    {filteredRecipes.length.toLocaleString()} recipe{filteredRecipes.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={classic
                        ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }
                        : { background: '#eef1f6' }}>
                        <tr>
                            <th style={{ ...lvTh(classic), width: 30 }}></th>
                            <th style={{ ...lvTh(classic), width: 150 }}>Code</th>
                            <th style={{ ...lvTh(classic), width: 130 }}>Color Code</th>
                            <th style={lvTh(classic)}>Name</th>
                            <th style={{ ...lvTh(classic), width: 150 }}>Color Standard</th>
                            <th style={{ ...lvTh(classic), width: 110 }}>Substrate</th>
                            <th style={{ ...lvTh(classic), width: 55, textAlign: 'center' }}>Lines</th>
                            <th style={{ ...lvTh(classic), width: 80 }}>Status</th>
                            <th style={{ ...lvTh(classic), width: 44, textAlign: 'right', borderRight: 'none' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRecipes.length === 0 && (
                            <tr><td colSpan={9} style={{ ...lvTd(classic), textAlign: 'center', color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>
                                {loading ? 'Loading…' : 'No recipes found.'}
                            </td></tr>
                        )}
                        {pagedRecipes.map((recipe, idx) => {
                            const rid = String(recipe.id);
                            const expanded = expandedIds.has(rid);
                            const lineCount = (recipe.lines || []).length;
                            return (
                                <React.Fragment key={rid}>
                                    <tr style={{ ...lvRow(classic, idx), cursor: 'pointer' }} onClick={() => toggleExpand(rid)}>
                                        <td style={{ ...lvTd(classic), textAlign: 'center', color: classic ? '#555' : '#64748b' }}>
                                            <i className={expanded ? 'bi bi-caret-down-fill' : 'bi bi-caret-right-fill'} style={{ fontSize: 10 }} />
                                        </td>
                                        <td style={lvTd(classic)}>
                                            <span style={classic
                                                ? { fontFamily: "'Courier New', monospace", fontWeight: 'bold', color: '#0047c8', fontSize: 11 }
                                                : { fontFamily: "'Courier New', monospace", fontWeight: 700, color: '#2563eb', fontSize: 12 }}>{recipe.code}</span>
                                        </td>
                                        <td style={lvTd(classic)}>
                                            {recipe.color_code ? (
                                                <span
                                                    onClick={e => { e.stopPropagation(); router.push(`/colors?search=${encodeURIComponent(recipe.color_code)}`); }}
                                                    title={`Open ${recipe.color_code} in the Color Library`}
                                                    style={classic ? {
                                                        display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                                                        fontFamily: "'Courier New', monospace", fontWeight: 'bold', fontSize: 10, color: '#1a3d90',
                                                        background: '#dde8f5', border: '1px solid #7fa8e8', borderRadius: 2, padding: '1px 6px',
                                                    } : {
                                                        display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                                                        fontFamily: "'Courier New', monospace", fontWeight: 600, fontSize: 12, color: '#1d4ed8',
                                                        background: '#eff6ff', border: '1px solid #bfd3f5', borderRadius: 6, padding: '2px 8px',
                                                    }}
                                                >
                                                    <i className="bi bi-palette" style={{ fontSize: classic ? 9 : 11 }} />
                                                    {recipe.color_code}
                                                </span>
                                            ) : <span style={{ color: '#aaa' }}>—</span>}
                                        </td>
                                        <td style={lvTd(classic)}>{recipe.name}</td>
                                        <td style={lvTd(classic)}>{recipe.color_standard || <span style={{ color: '#aaa' }}>—</span>}</td>
                                        <td style={lvTd(classic)}>{recipe.substrate_type || <span style={{ color: '#aaa' }}>—</span>}</td>
                                        <td style={{ ...lvTd(classic), textAlign: 'center' }}>{lineCount}</td>
                                        <td style={lvTd(classic)}>
                                            <StatusChip status={recipe.is_active !== false ? 'active' : 'inactive'} />
                                        </td>
                                        <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <MenuTriggerButton classic={classic} onClick={e => menuToggle(rid, e)} />
                                            </div>
                                        </td>
                                    </tr>
                                    {expanded && (
                                        <tr>
                                            <td colSpan={9} style={{
                                                padding: 0,
                                                background: classic ? '#ece9d8' : '#eef2f7',
                                                borderBottom: classic ? '1px solid #808080' : '1px solid #cbd3df',
                                                boxShadow: classic ? 'inset 0 2px 4px rgba(0,0,0,0.12)' : 'inset 0 2px 4px rgba(15,23,42,0.06)',
                                            }}>
                                                {renderDetail(recipe)}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <Pager page={clampedPage} total={filteredRecipes.length} pageSize={RECIPE_PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />

            {/* ── Row ⋯ menu: Edit / Print / Delete ── */}
            {menuOpenId && (() => {
                const recipe = recipes.find(r => String(r.id) === menuOpenId);
                if (!recipe) return null;
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            { key: 'edit', label: 'Edit', icon: 'bi-pencil', hidden: !canManage, onClick: () => { menuClose(); openEdit(recipe); } },
                            { key: 'print', label: 'Print Recipe Card', icon: 'bi-printer', onClick: () => { menuClose(); setSelectedId(String(recipe.id)); setShowPrint(true); } },
                            { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, hidden: !canManage, onClick: () => { menuClose(); handleDelete(recipe); } },
                        ]}
                    />
                );
            })()}

                <ModalWrapper
                    isOpen={showForm}
                    onClose={handleCancel}
                    modeless
                    size="xl"
                    title={editingRecipe ? 'Edit Recipe' : 'New Recipe'}
                    footer={
                        <>
                            <button style={classic ? { ...xpBtn, padding: '3px 10px' } : { ...modernBtn }} onClick={handleCancel} disabled={saving}>
                                Cancel
                            </button>
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
                        </>
                    }
                >
                    {/* ── Recipe Info ── */}
                    {/* A recipe is made FOR one Library Color. The color drives the recipe
                        code + name + color standard, so those are read-only here — the
                        panel only asks for the color plus recipe-specific fields. */}
                    <FormSection title="Recipe Info" classic={classic}>
                        <div style={{ marginBottom: 8 }}>
                            <label style={lvLabel(classic)}>
                                Library Color <span style={{ color: classic ? 'red' : '#dc2626' }}>*</span>
                            </label>
                            <SearchableSelect
                                options={colorOptions}
                                value={form.color_id}
                                onChange={(v: string) => setForm(f => ({ ...f, color_id: v }))}
                                placeholder="Select color code to make recipe for…"
                            />
                            <div style={{ fontSize: classic ? 10 : 12, color: classic ? '#666' : '#64748b', marginTop: 3 }}>
                                Recipe code, name and color standard are taken from the selected color.
                            </div>
                        </div>
                        {form.color_id && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 8 }}>
                                <div>
                                    <label style={lvLabel(classic)}>Recipe Code</label>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <input
                                            readOnly
                                            style={{ ...inputStyle(classic), flex: 1, background: classic ? '#ece9d8' : '#f1f5f9', color: classic ? '#333' : '#475569' }}
                                            value={form.code}
                                            placeholder="(auto)"
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
                                    <label style={lvLabel(classic)}>Color Standard</label>
                                    <input
                                        readOnly
                                        style={{ ...inputStyle(classic), width: '100%', boxSizing: 'border-box', background: classic ? '#ece9d8' : '#f1f5f9', color: classic ? '#333' : '#475569' }}
                                        value={form.color_standard || '—'}
                                    />
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                            <div>
                                <label style={lvLabel(classic)}>Substrate Type</label>
                                <input
                                    style={{ ...inputStyle(classic), width: '100%', boxSizing: 'border-box' }}
                                    value={form.substrate_type}
                                    onChange={e => setForm(f => ({ ...f, substrate_type: e.target.value }))}
                                    placeholder="e.g. Cotton, Polyester"
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
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
                        </div>
                        <div style={{ marginTop: 8 }}>
                            <label style={lvLabel(classic)}>Notes</label>
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
                    </FormSection>

                    {/* ── Chemical Lines ── */}
                    <FormSection title="Chemical Lines" classic={classic}>
                        <div style={classic
                            ? { border: '1px solid #7f9db9' }
                            : { border: '1px solid #dbe1ea', borderRadius: 9, overflow: 'hidden' }
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
                    </FormSection>

                    {/* ── Bak Cuci ── */}
                    <FormSection title="Bak Cuci" classic={classic}>
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
                    </FormSection>

                    {/* ── Finishing ── */}
                    <FormSection title="Finishing" classic={classic}>
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
                    </FormSection>

                </ModalWrapper>

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
                    authFetch(`${API_BASE}/preferences/code_config_DYE`, {
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
