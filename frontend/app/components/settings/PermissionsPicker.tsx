'use client';

import { useMemo, useState } from 'react';
import { xpFont } from '../shared/xpTheme';
import { PERMISSION_MATRIX, RESOURCE_ACTIONS, permissionCode, PermissionScope } from '../shared/permissionMatrix';

export interface PermissionOption {
    id: string;
    code: string;
    description: string;
}

const SCOPE_BADGE: Record<PermissionScope, string> = {
    category: 'by category',
    location: 'by location',
    work_center_type: 'by station type',
};

/**
 * Resource x action matrix picker matching the Permissions config spreadsheet
 * layout — one row per resource, one checkbox per action that resource
 * supports (not every resource has the same actions, so this isn't a uniform
 * grid). disabledIds render checked-but-locked (role-inherited grants a
 * direct user override can't remove).
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
    const idByCode = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of allPermissions) m.set(p.code, p.id);
        return m;
    }, [allPermissions]);
    const disabledSet = useMemo(() => new Set(disabledIds || []), [disabledIds]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggle = (id: string) => {
        if (disabledSet.has(id)) return;
        onChange(selectedSet.has(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
    };

    const resourceIds = (resource: string): string[] => {
        const actions = RESOURCE_ACTIONS[resource] || [];
        return actions.map(a => idByCode.get(permissionCode(resource, a.code))).filter((x): x is string => !!x);
    };

    const sectionIds = (section: typeof PERMISSION_MATRIX[number]): string[] =>
        section.resources.flatMap(r => resourceIds(r.resource));

    const toggleIds = (ids: string[]) => {
        const toggleable = ids.filter(id => !disabledSet.has(id));
        if (!toggleable.length) return;
        const allSelected = toggleable.every(id => selectedSet.has(id));
        if (allSelected) {
            const remove = new Set(toggleable);
            onChange(selectedIds.filter(id => !remove.has(id)));
        } else {
            const add = toggleable.filter(id => !selectedSet.has(id));
            onChange([...selectedIds, ...add]);
        }
    };

    const toggleCollapse = (section: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(section) ? next.delete(section) : next.add(section);
            return next;
        });
    };

    const fontStyle = classic
        ? { fontFamily: xpFont, fontSize: 10 }
        : { fontSize: 12 };

    const wrapStyle = classic
        ? { background: '#ffffff', border: '1px solid #b0a898', maxHeight: 320, overflowY: 'auto' as const }
        : { border: '1px solid #dee2e6', borderRadius: 4, background: '#fff', maxHeight: 320, overflowY: 'auto' as const };

    return (
        <div style={wrapStyle} className={classic ? '' : 'bg-white'}>
            {PERMISSION_MATRIX.map(section => {
                const secIds = sectionIds(section);
                if (!secIds.length) return null;
                const isCollapsed = collapsed.has(section.section);
                const toggleable = secIds.filter(id => !disabledSet.has(id));
                const allSelected = toggleable.length > 0 && toggleable.every(id => selectedSet.has(id));

                return (
                    <div key={section.section} style={{ borderBottom: classic ? '1px solid #d8d4c8' : '1px solid #eee' }}>
                        <div
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer',
                                background: classic ? '#eef0f4' : '#f8f9fa',
                            }}
                            onClick={() => toggleCollapse(section.section)}
                        >
                            <i className={`bi ${isCollapsed ? 'bi-caret-right-fill' : 'bi-caret-down-fill'}`} style={{ fontSize: 8 }} />
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={(e) => { e.stopPropagation(); toggleIds(secIds); }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{ ...fontStyle, fontWeight: 'bold', color: '#333' }}>{section.section}</span>
                        </div>
                        {!isCollapsed && (
                            <div style={{ padding: '2px 0 4px 0' }}>
                                {section.resources.map(r => {
                                    const actions = RESOURCE_ACTIONS[r.resource] || [];
                                    const rowActions = actions
                                        .map(a => ({ action: a, id: idByCode.get(permissionCode(r.resource, a.code)) }))
                                        .filter((x): x is { action: typeof actions[number]; id: string } => !!x.id);
                                    if (!rowActions.length) return null;
                                    return (
                                        <div
                                            key={r.resource}
                                            style={{
                                                display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                                                padding: classic ? '3px 8px 3px 22px' : '4px 12px 4px 28px',
                                            }}
                                        >
                                            <span style={{ ...fontStyle, minWidth: 120, color: '#555' }}>
                                                {r.label}
                                                {r.scope && (
                                                    <span style={{ marginLeft: 4, fontStyle: 'italic', color: '#999' }}>
                                                        ({SCOPE_BADGE[r.scope]})
                                                    </span>
                                                )}
                                            </span>
                                            {rowActions.map(({ action, id }) => (
                                                <label
                                                    key={id}
                                                    style={{
                                                        ...fontStyle, display: 'flex', alignItems: 'center', gap: 3,
                                                        color: disabledSet.has(id) ? '#888' : '#000',
                                                        cursor: disabledSet.has(id) ? 'default' : 'pointer',
                                                    }}
                                                    title={permissionCode(r.resource, action.code)}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSet.has(id) || disabledSet.has(id)}
                                                        disabled={disabledSet.has(id)}
                                                        onChange={() => toggle(id)}
                                                        style={{ cursor: disabledSet.has(id) ? 'default' : 'pointer' }}
                                                    />
                                                    {action.label}
                                                </label>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
            {PERMISSION_MATRIX.every(s => !sectionIds(s).length) && (
                <div style={{ ...fontStyle, padding: 8, color: '#888', fontStyle: 'italic' }}>No permissions defined</div>
            )}
        </div>
    );
}
