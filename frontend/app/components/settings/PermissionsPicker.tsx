'use client';

import { useMemo, useState } from 'react';
import { xpFont } from '../shared/xpTheme';

export interface PermissionOption {
    id: string;
    code: string;
    description: string;
}

const MODULE_LABELS: Record<string, string> = {
    admin: 'Administration',
    inventory: 'Inventory',
    locations: 'Locations',
    manufacturing: 'Manufacturing',
    work_order: 'Work Orders',
    stock: 'Stock',
    reports: 'Reports',
};

function moduleLabel(code: string): string {
    const prefix = code.split('.')[0];
    return MODULE_LABELS[prefix] || prefix.split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

function groupPermissions(permissions: PermissionOption[]): { module: string; items: PermissionOption[] }[] {
    const groups = new Map<string, PermissionOption[]>();
    for (const p of permissions) {
        const module = moduleLabel(p.code);
        if (!groups.has(module)) groups.set(module, []);
        groups.get(module)!.push(p);
    }
    return Array.from(groups.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([module, items]) => ({ module, items }));
}

/**
 * Grouped checkbox picker for granular permissions — replaces the flat
 * scrolling wall of raw codes previously duplicated across add/edit user rows.
 * disabledIds render checked-but-locked (used to show role-inherited grants
 * that a direct override can't remove).
 */
export default function PermissionsPicker({
    allPermissions, selectedIds, onChange, classic, disabledIds,
}: {
    allPermissions: PermissionOption[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    classic: boolean;
    disabledIds?: string[];
}) {
    const groups = useMemo(() => groupPermissions(allPermissions), [allPermissions]);
    const disabledSet = useMemo(() => new Set(disabledIds || []), [disabledIds]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggle = (id: string) => {
        if (disabledSet.has(id)) return;
        onChange(selectedSet.has(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
    };

    const toggleGroup = (items: PermissionOption[]) => {
        const toggleable = items.filter(p => !disabledSet.has(p.id));
        const allSelected = toggleable.every(p => selectedSet.has(p.id));
        if (allSelected) {
            const remove = new Set(toggleable.map(p => p.id));
            onChange(selectedIds.filter(id => !remove.has(id)));
        } else {
            const add = toggleable.map(p => p.id).filter(id => !selectedSet.has(id));
            onChange([...selectedIds, ...add]);
        }
    };

    const toggleCollapse = (module: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(module) ? next.delete(module) : next.add(module);
            return next;
        });
    };

    if (classic) {
        return (
            <div style={{ background: '#ffffff', border: '1px solid #b0a898', maxHeight: 220, overflowY: 'auto' }}>
                {groups.map(({ module, items }) => {
                    const isCollapsed = collapsed.has(module);
                    const toggleable = items.filter(p => !disabledSet.has(p.id));
                    const allSelected = toggleable.length > 0 && toggleable.every(p => selectedSet.has(p.id));
                    return (
                        <div key={module} style={{ borderBottom: '1px solid #d8d4c8' }}>
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', background: '#eef0f4', cursor: 'pointer' }}
                                onClick={() => toggleCollapse(module)}
                            >
                                <i className={`bi ${isCollapsed ? 'bi-caret-right-fill' : 'bi-caret-down-fill'}`} style={{ fontSize: 8 }} />
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={(e) => { e.stopPropagation(); toggleGroup(items); }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ fontFamily: xpFont, fontSize: 10, fontWeight: 'bold', color: '#333' }}>{module}</span>
                            </div>
                            {!isCollapsed && (
                                <div style={{ padding: '2px 6px 4px 22px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {items.map(p => (
                                        <label
                                            key={p.id}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: xpFont, fontSize: 10, color: disabledSet.has(p.id) ? '#888' : '#000', cursor: disabledSet.has(p.id) ? 'default' : 'pointer' }}
                                            title={p.code}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedSet.has(p.id) || disabledSet.has(p.id)}
                                                disabled={disabledSet.has(p.id)}
                                                onChange={() => toggle(p.id)}
                                                style={{ cursor: disabledSet.has(p.id) ? 'default' : 'pointer' }}
                                            />
                                            {p.description}
                                            {disabledSet.has(p.id) && <span style={{ fontStyle: 'italic', color: '#999' }}>(via role)</span>}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                {groups.length === 0 && (
                    <div style={{ padding: 8, fontFamily: xpFont, fontSize: 10, color: '#888', fontStyle: 'italic' }}>No permissions defined</div>
                )}
            </div>
        );
    }

    return (
        <div className="border rounded bg-white" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {groups.map(({ module, items }) => {
                const isCollapsed = collapsed.has(module);
                const toggleable = items.filter(p => !disabledSet.has(p.id));
                const allSelected = toggleable.length > 0 && toggleable.every(p => selectedSet.has(p.id));
                return (
                    <div key={module} className="border-bottom">
                        <div
                            className="d-flex align-items-center gap-2 px-2 py-1 bg-light"
                            style={{ cursor: 'pointer' }}
                            onClick={() => toggleCollapse(module)}
                        >
                            <i className={`bi ${isCollapsed ? 'bi-caret-right-fill' : 'bi-caret-down-fill'} small text-muted`} />
                            <input
                                type="checkbox"
                                className="form-check-input m-0"
                                checked={allSelected}
                                onChange={(e) => { e.stopPropagation(); toggleGroup(items); }}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <span className="small fw-bold">{module}</span>
                        </div>
                        {!isCollapsed && (
                            <div className="px-2 py-1 ps-4 d-flex flex-column gap-1">
                                {items.map(p => (
                                    <div key={p.id} className="form-check m-0">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`perm-picker-${p.id}`}
                                            checked={selectedSet.has(p.id) || disabledSet.has(p.id)}
                                            disabled={disabledSet.has(p.id)}
                                            onChange={() => toggle(p.id)}
                                        />
                                        <label className="form-check-label small" htmlFor={`perm-picker-${p.id}`} title={p.code}>
                                            {p.description}
                                            {disabledSet.has(p.id) && <span className="text-muted fst-italic ms-1">(via role)</span>}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            {groups.length === 0 && <div className="p-2 small text-muted fst-italic">No permissions defined</div>}
        </div>
    );
}
