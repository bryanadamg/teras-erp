'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import { StatusChip, FormSection, useFloatingMenu, MenuTriggerButton, FloatingMenu, XPActionButton, ColorSwatchChip, CodeChip, CODE_FONT } from '../shared/xpTheme';
import {
    LV_XP_FONT, LV_MODERN_FONT, lvInput, lvBtn, lvPrimaryBtn, lvLabel, lvTh, lvTd, lvSep, lvRow,
} from '../shared/listViewTheme';

const STATUS_FILTERS = ['ALL', 'active', 'archived'];

// Origin of a shade, derived server-side from lab dip provenance (no column on Color).
// MANUAL = entered straight into the library, with no lab dip behind it.
const SOURCE_FILTER_OPTIONS = [
    { value: '', label: 'All Sources' },
    { value: 'FG', label: 'From Lab Dip (FG)' },
    { value: 'YARN', label: 'From Lab Dip (Yarn)' },
    { value: 'MANUAL', label: 'Manual Entry' },
];

interface Props {
    colors: any[];
    total: number;
    page: number;
    size: number;
    search: string;
    statusFilter: string;
    customerFilter?: string;
    variantFilter?: string;
    itemSearch?: string;
    sourceFilter?: string;   // '' | 'FG' | 'YARN' | 'MANUAL' — which lab dip book a shade came from
    customers: any[];
    loading?: boolean;
    onSearchChange: (s: string) => void;
    onStatusChange: (s: string) => void;
    onCustomerFilterChange?: (v: string) => void;
    onVariantFilterChange?: (v: string) => void;
    onItemSearchChange?: (s: string) => void;
    onSourceFilterChange?: (v: string) => void;
    onPageChange: (p: number) => void;
    onCreate: (payload: any) => void;
    onEdit: (id: string, payload: any) => void;
    onDelete: (id: string) => void;
    prefill?: { source_lab_dip_line_id: string; values: Record<string, string> } | null;
    embedded?: boolean;   // when tabbed under the Colors shell, drop own title + outer frame
    colorVariantValues?: any[];   // `Colors` (system_role='color') attribute values, for the variant link picker
}

const emptyForm = () => ({
    code: '', name: '', pantone_ref: '', colour_index: '', hex: '',
    substrate: '', customer_id: '', customer_color_code: '',
    l_star: '', a_star: '', b_star: '', lab_illuminant: '',
    spectro_notes: '', notes: '', status: 'active', variant_attribute_value_id: '',
});

export default function ColorLibraryView({
    colors, total, page, size, search, statusFilter, customerFilter, variantFilter, itemSearch, sourceFilter, customers, loading,
    onSearchChange, onStatusChange, onCustomerFilterChange, onVariantFilterChange, onItemSearchChange, onSourceFilterChange,
    onPageChange, onCreate, onEdit, onDelete, prefill, embedded,
    colorVariantValues,
}: Props) {
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { hasPermission, hasAnyPermission } = useUser();
    const canManage = hasAnyPermission('color_code.create', 'color_code.edit', 'color_code.archive');
    const router = useRouter();
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(160);

    // Jump to Dyeing & Setting with this color pre-selected in a new recipe.
    const createRecipeForColor = (c: any) => router.push(`/dyeing-setting?recipe_color_id=${encodeURIComponent(c.id)}`);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const [sourceLineId, setSourceLineId] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState(search);
    const [itemSearchInput, setItemSearchInput] = useState(itemSearch || '');

    // Arriving from a LabDip "+ Color" deep-link: open the create modal pre-filled and
    // remember the source dip line so the backend can wire lineage on save.
    useEffect(() => {
        if (prefill?.source_lab_dip_line_id) {
            setEditing(null);
            setForm({ ...emptyForm(), ...prefill.values });
            setSourceLineId(prefill.source_lab_dip_line_id);
            setIsModalOpen(true);
        }
    }, [prefill?.source_lab_dip_line_id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounce the search box so each keystroke does not fire a request against 30k rows.
    useEffect(() => {
        const t = setTimeout(() => onSearchChange(searchInput.trim()), 350);
        return () => clearTimeout(t);
    }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const t = setTimeout(() => onItemSearchChange?.(itemSearchInput.trim()), 350);
        return () => clearTimeout(t);
    }, [itemSearchInput]); // eslint-disable-line react-hooks/exhaustive-deps

    const customerOptions = useMemo(() =>
        [{ value: '', label: 'No Customer (House Color)' },
         ...(customers || []).map((c: any) => ({ value: c.id, label: c.name }))],
    [customers]);

    const customerFilterOptions = useMemo(() =>
        [{ value: '', label: 'All Customers' },
         ...(customers || []).map((c: any) => ({ value: c.id, label: c.name }))],
    [customers]);

    const variantOptions = useMemo(() =>
        [{ value: '', label: 'Not linked to a variant' },
         ...(colorVariantValues || []).map((v: any) => ({ value: v.id, label: v.value }))],
    [colorVariantValues]);

    // Stored swatch hex per `Colors` variant value, so the Color Variant column renders the
    // same swatch+label chip as every other variant display (BOM table, lab dip request).
    const variantHexByLabel = useMemo(() => {
        const map: Record<string, string> = {};
        (colorVariantValues || []).forEach((v: any) => { if (v.hex) map[v.value] = v.hex; });
        return map;
    }, [colorVariantValues]);

    const variantFilterOptions = useMemo(() =>
        [{ value: '', label: 'All Color Variants' },
         ...(colorVariantValues || []).map((v: any) => ({ value: v.id, label: v.value }))],
    [colorVariantValues]);

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setSourceLineId(null); setIsModalOpen(true); };
    const openEdit = (c: any) => {
        setEditing(c);
        setForm({
            code: c.code || '', name: c.name || '', pantone_ref: c.pantone_ref || '',
            colour_index: c.colour_index || '', hex: c.hex || '', substrate: c.substrate || '',
            customer_id: c.customer_id || '', customer_color_code: c.customer_color_code || '',
            l_star: c.l_star ?? '', a_star: c.a_star ?? '', b_star: c.b_star ?? '',
            lab_illuminant: c.lab_illuminant || '',
            spectro_notes: c.spectro_notes || '', notes: c.notes || '', status: c.status || 'active',
            variant_attribute_value_id: c.variant_attribute_value_id || '',
        });
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.code.trim() || !form.name.trim()) return;
        // CIELAB axes are numeric columns: send a number when filled, null when blank.
        const num = (v: any) => (v === '' || v === null || v === undefined ? null : Number(v));
        const payload: any = {
            ...form,
            customer_id: form.customer_id || null,
            variant_attribute_value_id: form.variant_attribute_value_id || null,
            l_star: num(form.l_star), a_star: num(form.a_star), b_star: num(form.b_star),
            lab_illuminant: form.lab_illuminant.trim() || null,
        };
        if (editing) {
            onEdit(editing.id, payload);
        } else {
            if (sourceLineId) payload.source_lab_dip_line_id = sourceLineId;
            onCreate(payload);
        }
        setIsModalOpen(false);
        setEditing(null);
        setForm(emptyForm());
        setSourceLineId(null);
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

    const swatch = (hex?: string) => (
        <span style={{
            display: 'inline-block', width: 18, height: 18, borderRadius: classic ? 2 : 4,
            border: '1px solid #94a3b8', background: hex || 'transparent',
            backgroundImage: hex ? undefined : 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%)',
            backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px', verticalAlign: 'middle',
        }} title={hex || 'no swatch'} />
    );

    return (
        <div style={embedded
            ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT, background: '#fff' }
            : classic
            ? { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', minHeight: 0, fontFamily: LV_XP_FONT, border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', background: '#ece9d8' }
            : { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', minHeight: 0, fontFamily: LV_MODERN_FONT, border: '1px solid #dbe1ea', borderRadius: 9, background: '#f8fafc', overflow: 'hidden' }}>

            {/* Title bar (hidden when embedded under the Colors tab shell) */}
            {!embedded && (
            <div style={classic
                ? { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', padding: '6px 12px', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }
                : { background: '#f7f9fc', color: '#1e293b', borderBottom: '1px solid #dbe1ea', padding: '8px 12px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <i className="bi bi-palette2" style={classic ? { fontSize: 14 } : { fontSize: 14, color: '#2563eb' }} />
                Color Library
            </div>
            )}

            {/* Toolbar */}
            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                <input
                    style={{ ...lvInput(classic), width: 240, flexBasis: 240 }}
                    placeholder="Search code, name, Pantone, customer code…"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                />
                <span style={lvSep(classic)} />
                <div style={{ display: 'flex' }}>
                    {STATUS_FILTERS.map(s => (
                        <button key={s} style={statusFilter === s ? lvPrimaryBtn(classic) : lvBtn(classic)} onClick={() => onStatusChange(s)}>
                            {s === 'ALL' ? 'All' : s}
                        </button>
                    ))}
                </div>
                <span style={lvSep(classic)} />
                <div style={{ width: 170 }}>
                    <SearchableSelect options={variantFilterOptions} value={variantFilter || ''} onChange={v => onVariantFilterChange?.(v)} placeholder="All Color Variants" />
                </div>
                <div style={{ width: 170 }}>
                    <SearchableSelect options={customerFilterOptions} value={customerFilter || ''} onChange={v => onCustomerFilterChange?.(v)} placeholder="All Customers" />
                </div>
                <input
                    style={{ ...lvInput(classic), width: 170, flexBasis: 170 }}
                    placeholder="Search item…"
                    value={itemSearchInput}
                    onChange={e => setItemSearchInput(e.target.value)}
                />
                {/* Which lab dip book a shade came from. FG and yarn dips both mint into this
                    one library ('00005-A-2' next to 'Y00005-A-2'), so the two need separating. */}
                <div style={{ width: 170 }}>
                    <SearchableSelect options={SOURCE_FILTER_OPTIONS} value={sourceFilter || ''} onChange={v => onSourceFilterChange?.(v)} placeholder="All Sources" />
                </div>
                <span style={classic ? { marginLeft: 'auto', fontSize: 11, color: '#333' } : { marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
                    {total.toLocaleString()} color{total !== 1 ? 's' : ''}
                </span>
                {canManage && (
                    <>
                        <span style={lvSep(classic)} />
                        <button style={lvPrimaryBtn(classic)} onClick={openCreate} title="New Color">
                            <i className="bi bi-plus-lg" />
                        </button>
                    </>
                )}
            </div>

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <thead style={classic
                        ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' }
                        : { background: '#eef1f6' }}>
                        <tr>
                            <th style={{ ...lvTh(classic), width: 34 }}></th>
                            <th style={{ ...lvTh(classic), width: 130 }}>Code</th>
                            <th style={lvTh(classic)}>Name</th>
                            <th style={{ ...lvTh(classic), width: 130 }}>Color Variant</th>
                            <th style={{ ...lvTh(classic), width: 150 }}>Colour Index</th>
                            <th style={{ ...lvTh(classic), width: 130 }}>L*a*b*</th>
                            <th style={{ ...lvTh(classic), width: 120 }}>Customer</th>
                            <th style={{ ...lvTh(classic), width: 90 }}>Cust. Code</th>
                            <th style={{ ...lvTh(classic), width: 110 }}>From Lab Dip</th>
                            <th style={{ ...lvTh(classic), width: 140 }}>Item</th>
                            <th style={{ ...lvTh(classic), width: 60, textAlign: 'center' }}>Recipes</th>
                            <th style={{ ...lvTh(classic), width: 80 }}>Status</th>
                            <th style={{ ...lvTh(classic), width: 70, textAlign: 'right', borderRight: 'none' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {colors.length === 0 && (
                            <tr><td colSpan={13} style={{ ...lvTd(classic), textAlign: 'center', color: classic ? '#888' : '#64748b', fontStyle: 'italic', padding: 20 }}>
                                {loading ? 'Loading…' : 'No colors found.'}
                            </td></tr>
                        )}
                        {colors.map((c, idx) => (
                            <tr key={c.id} style={lvRow(classic, idx)}>
                                <td style={{ ...lvTd(classic), textAlign: 'center' }}>{swatch(c.hex)}</td>
                                <td style={lvTd(classic)}>
                                    <CodeChip code={c.code} classic={classic} tone="accent" style={{ fontWeight: 'bold' }} />
                                </td>
                                <td style={lvTd(classic)}>{c.name}</td>
                                <td style={lvTd(classic)}>{c.variant_attribute_value_label
                                    ? <ColorSwatchChip label={c.variant_attribute_value_label} classic={classic} hex={variantHexByLabel[c.variant_attribute_value_label]} />
                                    : <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={lvTd(classic)}>{c.colour_index || <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={lvTd(classic)}>
                                    {c.l_star != null
                                        ? <span style={{ fontFamily: CODE_FONT, fontSize: classic ? 11 : 12 }}>
                                            {c.l_star}/{c.a_star ?? '—'}/{c.b_star ?? '—'}
                                          </span>
                                        : <span style={{ color: '#aaa' }}>—</span>}
                                </td>
                                <td style={lvTd(classic)}>{c.customer_name || <span style={{ color: '#aaa', fontStyle: 'italic' }}>House</span>}</td>
                                <td style={lvTd(classic)}>{c.customer_color_code || <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={lvTd(classic)}>{c.source_lab_dip_code
                                    ? <span
                                        title="Open this lab dip request"
                                        // The two lab dip books are separate pages, each listing only its own
                                        // requests — route by the source code's prefix or the deep-link no-ops.
                                        onClick={e => { e.stopPropagation(); router.push(`${String(c.source_lab_dip_code).startsWith('LDY-') ? '/lab-dips-yarn' : '/lab-dips'}?open=${encodeURIComponent(c.source_lab_dip_request_id)}`); }}
                                        style={{ fontFamily: CODE_FONT, color: '#0058e6', fontSize: classic ? 9 : 10.5, cursor: 'pointer', textDecoration: 'underline' }}>{c.source_lab_dip_code}</span>
                                    : <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={lvTd(classic)}>{c.source_item_name
                                    ? <span title={c.source_item_code || undefined}>{c.source_item_name}</span>
                                    : <span style={{ color: '#aaa' }}>—</span>}</td>
                                <td style={{ ...lvTd(classic), textAlign: 'center' }}>{c.recipe_count || 0}</td>
                                <td style={lvTd(classic)}><StatusChip status={c.status} /></td>
                                <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                                        {canManage && c.l_star == null && (
                                        <XPActionButton
                                            classic={classic}
                                            tone="warning"
                                            icon="bi-rulers"
                                            title="Complete L*a*b* measurement for this color"
                                            onClick={() => openEdit(c)}
                                        />
                                        )}
                                        {canManage && (
                                        <XPActionButton
                                            classic={classic}
                                            tone="primary"
                                            icon="bi-droplet-half"
                                            title="Create dyeing recipe for this color"
                                            onClick={() => createRecipeForColor(c)}
                                        />
                                        )}
                                        <MenuTriggerButton classic={classic} onClick={e => menuToggle(String(c.id), e)} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Pager page={page} total={total} pageSize={size} onPageChange={onPageChange} />

            {/* ── Row ⋯ menu: Edit / Archive-Delete ── */}
            {menuOpenId && (() => {
                const c = colors.find(x => String(x.id) === menuOpenId);
                if (!c || !canManage) return null;
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            { key: 'edit', label: 'Edit', icon: 'bi-pencil', onClick: () => { menuClose(); openEdit(c); } },
                            { key: 'delete', label: c.recipe_count > 0 ? 'Archive' : 'Delete', icon: c.recipe_count > 0 ? 'bi-archive' : 'bi-trash', danger: true, onClick: () => { menuClose(); handleDelete(c); } },
                        ]}
                    />
                );
            })()}

            <ModalWrapper
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editing ? `Edit Color — ${editing.code}` : 'New Color'}
                size="lg"
                modeless
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={lvBtn(classic)} onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" form="color-form" style={lvPrimaryBtn(classic)}>
                            {editing ? 'Save' : 'Create'}
                        </button>
                    </div>
                }
            >
                <form id="color-form" onSubmit={handleSubmit}>
                    {/* 1. Identity — code + name (+ status when editing) always top-most. */}
                    <FormSection title="Identity" classic={classic}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <label style={lvLabel(classic)}>Code *</label>
                                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={lvInput(classic)} required />
                            </div>
                            <div>
                                <label style={lvLabel(classic)}>Name *</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={lvInput(classic)} required />
                            </div>
                            <div>
                                <label style={lvLabel(classic)}>Color Variant</label>
                                <SearchableSelect
                                    options={variantOptions}
                                    value={form.variant_attribute_value_id}
                                    onChange={v => setForm({ ...form, variant_attribute_value_id: v })}
                                    placeholder="Not linked to a variant"
                                />
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
                    </FormSection>

                    {/* 2. CIELAB — the structured shade identity the client completes after approval. */}
                    <FormSection title="CIELAB (L*a*b*) — Objective Shade Identity" classic={classic}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) 1.3fr', gap: 10, alignItems: 'end' }}>
                            {([
                                { key: 'l_star', axis: 'L*', hint: 'Lightness · 0–100', min: 0, max: 100 },
                                { key: 'a_star', axis: 'a*', hint: 'Green ↔ Red · −128…127', min: -128, max: 127 },
                                { key: 'b_star', axis: 'b*', hint: 'Blue ↔ Yellow · −128…127', min: -128, max: 127 },
                            ] as const).map(f => (
                                <div key={f.key}>
                                    <label style={{ ...lvLabel(classic), display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                        <span style={{ fontWeight: 'bold', fontSize: classic ? 13 : 15, fontFamily: CODE_FONT, color: classic ? '#0047c8' : '#2563eb' }}>{f.axis}</span>
                                    </label>
                                    <input
                                        type="number" inputMode="decimal" step="0.01" min={f.min} max={f.max}
                                        value={(form as any)[f.key]}
                                        onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                                        placeholder="—"
                                        style={{ ...lvInput(classic), textAlign: 'center', fontFamily: CODE_FONT, fontWeight: 700, fontSize: classic ? 13 : 15 }}
                                    />
                                    <div style={{ marginTop: 3, fontSize: classic ? 9 : 10, color: classic ? '#556' : '#64748b' }}>{f.hint}</div>
                                </div>
                            ))}
                            <div>
                                <label style={lvLabel(classic)}>Illuminant / Observer</label>
                                <input
                                    value={form.lab_illuminant}
                                    onChange={e => setForm({ ...form, lab_illuminant: e.target.value })}
                                    placeholder="e.g. D65 / 10°"
                                    style={lvInput(classic)}
                                />
                                <div style={{ marginTop: 3, fontSize: classic ? 9 : 10, color: classic ? '#556' : '#64748b' }}>Measurement condition</div>
                            </div>
                        </div>
                    </FormSection>

                    {/* 3. Details — everything else. */}
                    <FormSection title="Details" classic={classic}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <label style={lvLabel(classic)}>Pantone Ref</label>
                                <input value={form.pantone_ref} onChange={e => setForm({ ...form, pantone_ref: e.target.value })} placeholder="e.g. 19-4052 TCX" style={lvInput(classic)} />
                            </div>
                            <div>
                                <label style={lvLabel(classic)}>Colour Index (C.I.)</label>
                                <input value={form.colour_index} onChange={e => setForm({ ...form, colour_index: e.target.value })} placeholder="e.g. C.I. Reactive Blue 19" style={lvInput(classic)} />
                            </div>
                            <div>
                                <label style={lvLabel(classic)}>Swatch (hex)</label>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <input type="color" value={form.hex || '#ffffff'} onChange={e => setForm({ ...form, hex: e.target.value })} style={{ width: 36, height: 24, padding: 0, border: '1px solid #94a3b8', cursor: 'pointer' }} />
                                    <input value={form.hex} onChange={e => setForm({ ...form, hex: e.target.value })} placeholder="#RRGGBB" style={lvInput(classic)} />
                                </div>
                            </div>
                            <div>
                                <label style={lvLabel(classic)}>Substrate</label>
                                <input value={form.substrate} onChange={e => setForm({ ...form, substrate: e.target.value })} placeholder="e.g. CVC, 100% Cotton" style={lvInput(classic)} />
                            </div>
                            <div>
                                <label style={lvLabel(classic)}>Customer</label>
                                <SearchableSelect options={customerOptions} value={form.customer_id} onChange={v => setForm({ ...form, customer_id: v })} placeholder="House color" />
                            </div>
                            <div>
                                <label style={lvLabel(classic)}>Customer Color Code</label>
                                <input value={form.customer_color_code} onChange={e => setForm({ ...form, customer_color_code: e.target.value })} style={lvInput(classic)} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={lvLabel(classic)}>Spectrophotometer Notes</label>
                                <textarea value={form.spectro_notes} onChange={e => setForm({ ...form, spectro_notes: e.target.value })} rows={2} placeholder="Tolerance (ΔE), geometry, extra readings…" style={{ ...lvInput(classic), height: 'auto', resize: 'vertical' }} />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={lvLabel(classic)}>Notes</label>
                                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...lvInput(classic), height: 'auto', resize: 'vertical' }} />
                            </div>
                        </div>
                    </FormSection>
                </form>
            </ModalWrapper>
        </div>
    );
}
