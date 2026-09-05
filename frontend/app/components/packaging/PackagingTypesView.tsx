'use client';
import React, { useState, useMemo } from 'react';
import { useConfirm } from '../../context/ConfirmContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import ModalWrapper from '../shared/ModalWrapper';
import { StatusChip, CodeChip, XP_BTN, useFloatingMenu, MenuTriggerButton, FloatingMenu } from '../shared/xpTheme';
import { SearchField, ToolbarCount, ToolbarButton, viewShellStyle, PageTitleBar } from '../shared/shellTheme';
import {
    LV_XP_FONT, LV_MODERN_FONT, lvInput, lvBtn, lvPrimaryBtn, lvLabel, lvTh, lvTd, lvSep, lvRow, lvThead, TableEmpty,
} from '../shared/listViewTheme';

// The box master the pack screens pick from: Box S/M/L/XL, Plastic Bag, Custom.
//
// The only figure that matters here is `tare_kg` — the empty box's weight, added
// to each carton's net reading to make the brutto printed on its label and
// totalled on the delivery note. Editing one NEVER rewrites what is already
// packed: every carton snapshots the tare it was packed with, so a correction
// applies from the next pack event on.
//
// The Custom row is the exception with no tare of its own: it is weighed by hand
// at log time. Exactly one such row is expected, but nothing enforces that —
// "custom" is a property of a box (it has no standard weight), not a singleton.
//
// Bounded data — a handful of rows the plant physically stocks — so it lists
// whole and filters client-side, like Routing and Settings > Users.

const emptyForm = () => ({ code: '', name: '', tare_kg: '', is_custom: false, sort_order: '0', active: true });

interface Props {
    types: any[];
    loading?: boolean;
    onCreate: (payload: any) => void;
    onEdit: (id: string, payload: any) => void;
    onDelete: (t: any) => void;
}

export default function PackagingTypesView({ types, loading, onCreate, onEdit, onDelete }: Props) {
    const { confirm } = useConfirm();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { hasAnyPermission } = useUser();
    const canManage = hasAnyPermission('packaging_type.create', 'packaging_type.edit', 'packaging_type.archive');

    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(140);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return types;
        return types.filter((t: any) => `${t.code} ${t.name}`.toLowerCase().includes(q));
    }, [types, search]);

    const openCreate = () => { setEditing(null); setForm(emptyForm()); setIsModalOpen(true); };
    const openEdit = (t: any) => {
        setEditing(t);
        setForm({
            code: t.code || '',
            name: t.name || '',
            tare_kg: t.tare_kg != null ? String(t.tare_kg) : '',
            is_custom: !!t.is_custom,
            sort_order: String(t.sort_order ?? 0),
            active: t.active !== false,
        });
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.code.trim() || !form.name.trim()) return;
        const payload: any = {
            code: form.code.trim(),
            name: form.name.trim(),
            // A custom box's tare is typed per carton at pack time, so storing one
            // here would be a default nobody means — the server drops it too.
            tare_kg: form.is_custom ? null : (form.tare_kg === '' ? null : Number(form.tare_kg)),
            is_custom: form.is_custom,
            sort_order: Number(form.sort_order) || 0,
            active: form.active,
        };
        if (editing) onEdit(editing.id, payload);
        else onCreate(payload);
        setIsModalOpen(false);
        setEditing(null);
        setForm(emptyForm());
    };

    const handleDelete = async (t: any) => {
        const ok = await confirm({
            title: 'Delete Packaging Type',
            message: `Delete "${t.code} — ${t.name}"? A type already used by packed cartons is deactivated instead, so those labels keep naming their box.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (ok) onDelete(t);
    };

    const emptyMessage = search.trim()
        ? 'No packaging type matches that search.'
        : 'No packaging types yet. Add the boxes the floor packs into, with the weight of each empty box.';

    return (
        <div style={viewShellStyle(classic, 'page', { fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT })}>
            <PageTitleBar classic={classic} icon="bi-box2" title="Packaging Types" />

            <div style={classic
                ? { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }
                : { background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                <SearchField classic={classic} value={search} onChange={setSearch} placeholder="Search code or name…" width={240} />
                <ToolbarCount classic={classic} right>
                    {filtered.length === types.length
                        ? `${types.length} type${types.length !== 1 ? 's' : ''}`
                        : `${filtered.length} of ${types.length} types`}
                </ToolbarCount>
                {canManage && (
                    <>
                        <span style={lvSep(classic)} />
                        <ToolbarButton classic={classic} tone="create" icon="bi-plus-lg" onClick={openCreate}>New Packaging Type</ToolbarButton>
                    </>
                )}
            </div>

            <div style={{ flex: 1, minHeight: 0, background: '#fff', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={lvThead(classic)}>
                        <tr>
                            <th style={{ ...lvTh(classic), width: 120 }}>Code</th>
                            <th style={lvTh(classic)}>Name</th>
                            <th style={{ ...lvTh(classic), width: 150, textAlign: 'right' }}>Tare (kg)</th>
                            <th style={{ ...lvTh(classic), width: 80, textAlign: 'center' }}>Order</th>
                            <th style={{ ...lvTh(classic), width: 90 }}>Status</th>
                            <th style={{ ...lvTh(classic), width: 80, textAlign: 'right', borderRight: 'none' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <TableEmpty colSpan={6} classic={classic} tdStyle={lvTd(classic)}
                                message={loading ? 'Loading…' : emptyMessage} />
                        )}
                        {filtered.map((t: any, idx: number) => (
                            <tr key={t.id} style={lvRow(classic, idx)}>
                                <td style={lvTd(classic)}><CodeChip code={t.code} classic={classic} tone="accent" /></td>
                                <td style={lvTd(classic)}>{t.name}</td>
                                <td style={{ ...lvTd(classic), textAlign: 'right' }}>
                                    {/* A custom box has no stored tare BY DESIGN — the packer
                                        weighs the empty box at log time — so it reads as that
                                        rather than as a number someone forgot to fill in. */}
                                    {t.is_custom
                                        ? <span style={{ color: '#888', fontStyle: 'italic' }}>weighed at packing</span>
                                        : Number(t.tare_kg) > 0
                                            ? Number(t.tare_kg).toFixed(3)
                                            : <span style={{ color: '#b8860b' }}>not set</span>}
                                </td>
                                <td style={{ ...lvTd(classic), textAlign: 'center', color: '#888' }}>{t.sort_order ?? 0}</td>
                                <td style={lvTd(classic)}><StatusChip status={t.active === false ? 'archived' : 'active'} /></td>
                                <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                    {canManage && <MenuTriggerButton classic={classic} onClick={e => menuToggle(t.id, e)} />}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {menuOpenId && (() => {
                const t = filtered.find((x: any) => String(x.id) === menuOpenId);
                if (!t || !canManage) return null;
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            { key: 'edit', label: 'Edit', icon: 'bi-pencil-square', onClick: () => { menuClose(); openEdit(t); } },
                            { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, onClick: () => { menuClose(); handleDelete(t); } },
                        ]}
                    />
                );
            })()}

            <ModalWrapper
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editing ? `Edit Packaging Type — ${editing.code}` : 'New Packaging Type'}
                size="md"
                modeless
                footer={
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" className={XP_BTN} style={lvBtn(classic)} onClick={() => setIsModalOpen(false)}>Cancel</button>
                        <button type="submit" form="packaging-type-form" className={XP_BTN} style={lvPrimaryBtn(classic)}>
                            {editing ? 'Save' : 'Create'}
                        </button>
                    </div>
                }
            >
                <form id="packaging-type-form" onSubmit={handleSubmit}>
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
                            <label style={{ ...lvLabel(classic), display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={form.is_custom}
                                    onChange={e => setForm({ ...form, is_custom: e.target.checked })} />
                                <span>Weighed at packing (custom box)</span>
                            </label>
                            <div style={{ fontSize: classic ? 10 : 11.5, color: '#777', marginTop: 2 }}>
                                Tick this for a box with no standard weight — the packer weighs the
                                empty box on each pack log instead of taking a figure from here.
                            </div>
                        </div>
                        <div>
                            <label style={lvLabel(classic)}>Tare — weight of the empty box (kg)</label>
                            <input
                                type="number" min="0" step="any"
                                value={form.is_custom ? '' : form.tare_kg}
                                onChange={e => setForm({ ...form, tare_kg: e.target.value })}
                                style={lvInput(classic)}
                                disabled={form.is_custom}
                                placeholder={form.is_custom ? 'weighed at packing' : '0.000'}
                            />
                            <div style={{ fontSize: classic ? 10 : 11.5, color: '#777', marginTop: 2 }}>
                                Added to each carton&apos;s net weight to make its gross. Changing it
                                affects cartons packed from now on — never ones already packed.
                            </div>
                        </div>
                        <div>
                            <label style={lvLabel(classic)}>Sort order</label>
                            <input type="number" step="1" value={form.sort_order}
                                onChange={e => setForm({ ...form, sort_order: e.target.value })} style={lvInput(classic)} />
                        </div>
                        {editing && (
                            <div>
                                <label style={lvLabel(classic)}>Status</label>
                                <select value={form.active ? 'active' : 'archived'}
                                    onChange={e => setForm({ ...form, active: e.target.value === 'active' })}
                                    style={lvInput(classic)}>
                                    <option value="active">active</option>
                                    <option value="archived">archived</option>
                                </select>
                                <div style={{ fontSize: classic ? 10 : 11.5, color: '#777', marginTop: 2 }}>
                                    An archived type disappears from the pack screens&apos; pickers but
                                    still names the cartons it packed.
                                </div>
                            </div>
                        )}
                    </div>
                </form>
            </ModalWrapper>
        </div>
    );
}
