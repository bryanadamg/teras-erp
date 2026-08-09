'use client';

import { useMemo, useState } from 'react';
import { xpFont } from '../shared/xpTheme';
import {
    PERMISSION_MATRIX, RESOURCE_ACTIONS, permissionCode, PermissionScope,
    actionIntent, INTENT_CHIP,
} from '../shared/permissionMatrix';

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
 * layout — one row per resource, one toggle per action that resource supports
 * (not every resource has the same actions, so this isn't a uniform grid).
 *
 * Actions are toggle chips, not checkboxes, tinted by intent with the same
 * palette the read-only PermissionBreakdown uses (create green / edit blue /
 * delete red / print amber / view grey) — so the panel you configure a role in
 * and the panel you audit it in read as the same object. Granted chips are
 * filled and carry a check glyph; ungranted ones are flat grey, which makes a
 * half-configured section visible at a glance instead of requiring a read of
 * every checkbox. disabledIds render locked (role-inherited grants a direct
 * user override can't remove).
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

    const setIds = (ids: string[], on: boolean) => {
        const toggleable = ids.filter(id => !disabledSet.has(id));
        if (!toggleable.length) return;
        if (on) {
            const add = toggleable.filter(id => !selectedSet.has(id));
            if (add.length) onChange([...selectedIds, ...add]);
        } else {
            const remove = new Set(toggleable);
            onChange(selectedIds.filter(id => !remove.has(id)));
        }
    };

    const toggleCollapse = (section: string) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            next.has(section) ? next.delete(section) : next.add(section);
            return next;
        });
    };

    const size = classic ? 10 : 11;
    const chipSize = classic ? 9.5 : 10.5;
    const font = classic ? xpFont : undefined;
    const radius = classic ? 0 : 3;

    const wrapStyle = classic
        ? { background: '#ffffff', border: '1px solid #b0a898', maxHeight: 320, overflowY: 'auto' as const }
        : { border: '1px solid #dee2e6', borderRadius: 4, background: '#fff', maxHeight: 320, overflowY: 'auto' as const };

    const linkBtn = (label: string, onClick: () => void, disabled: boolean) => (
        <button
            type="button"
            disabled={disabled}
            onClick={e => { e.stopPropagation(); onClick(); }}
            style={{
                fontFamily: font, fontSize: classic ? 9 : 10,
                background: 'none', border: 'none', padding: '0 3px',
                color: disabled ? '#a9a396' : '#00006e',
                textDecoration: disabled ? 'none' : 'underline',
                cursor: disabled ? 'default' : 'pointer',
            }}
        >{label}</button>
    );

    return (
        <div style={wrapStyle} className={classic ? '' : 'bg-white'}>
            {PERMISSION_MATRIX.map(section => {
                const secIds = sectionIds(section);
                if (!secIds.length) return null;
                const isCollapsed = collapsed.has(section.section);
                const toggleable = secIds.filter(id => !disabledSet.has(id));
                const grantedCount = secIds.filter(id => selectedSet.has(id) || disabledSet.has(id)).length;
                const allSelected = toggleable.length > 0 && toggleable.every(id => selectedSet.has(id));

                return (
                    <div key={section.section} style={{ borderBottom: classic ? '1px solid #d8d4c8' : '1px solid #eee' }}>
                        <div
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', cursor: 'pointer',
                                background: grantedCount ? (classic ? '#e6ecf4' : '#eef1f5') : (classic ? '#f1f0ec' : '#f8f9fa'),
                                borderBottom: isCollapsed ? 'none' : '1px solid #dcd8cc',
                            }}
                            onClick={() => toggleCollapse(section.section)}
                        >
                            <i className={`bi ${isCollapsed ? 'bi-caret-right-fill' : 'bi-caret-down-fill'}`} style={{ fontSize: 8, color: '#5a6472' }} />
                            <span style={{
                                fontFamily: font, fontSize: size, fontWeight: 'bold', color: '#33475b',
                                textTransform: 'uppercase', letterSpacing: '0.5px',
                            }}>{section.section}</span>
                            <span style={{
                                fontFamily: font, fontSize: classic ? 9 : 10,
                                color: grantedCount ? '#1a3d7a' : '#8b8578',
                                background: '#fff', border: `1px solid ${grantedCount ? '#a9bdd6' : '#d5d1c6'}`,
                                borderRadius: radius, padding: '0 4px',
                            }}>{grantedCount} / {secIds.length}</span>
                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                                {linkBtn('All', () => setIds(secIds, true), allSelected || !toggleable.length)}
                                <span style={{ color: '#c3bfb3', fontSize: 9 }}>|</span>
                                {linkBtn('Clear', () => setIds(secIds, false), !toggleable.some(id => selectedSet.has(id)))}
                            </span>
                        </div>
                        {!isCollapsed && (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {section.resources.map((r, i) => {
                                        const actions = RESOURCE_ACTIONS[r.resource] || [];
                                        const rowActions = actions
                                            .map(a => ({ action: a, id: idByCode.get(permissionCode(r.resource, a.code)) }))
                                            .filter((x): x is { action: typeof actions[number]; id: string } => !!x.id);
                                        if (!rowActions.length) return null;
                                        return (
                                            <tr key={r.resource} style={{ background: i % 2 === 0 ? '#ffffff' : '#fafaf7' }}>
                                                <td style={{
                                                    fontFamily: font, fontSize: size, color: '#000',
                                                    padding: classic ? '3px 8px 3px 20px' : '4px 10px 4px 24px',
                                                    width: 132, verticalAlign: 'top',
                                                    borderRight: '1px solid #e6e3db',
                                                }}>
                                                    {r.label}
                                                    {r.scope && (
                                                        <div style={{ fontStyle: 'italic', color: '#9a948a', fontSize: classic ? 9 : 10 }}>
                                                            {SCOPE_BADGE[r.scope]}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '3px 6px' }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                                        {rowActions.map(({ action, id }) => {
                                                            const locked = disabledSet.has(id);
                                                            const on = selectedSet.has(id) || locked;
                                                            const c = INTENT_CHIP[actionIntent(action.code)];
                                                            return (
                                                                <button
                                                                    key={id}
                                                                    type="button"
                                                                    aria-pressed={on}
                                                                    disabled={locked}
                                                                    onClick={() => toggle(id)}
                                                                    title={locked
                                                                        ? `${permissionCode(r.resource, action.code)} — granted by the role, can't be removed here`
                                                                        : permissionCode(r.resource, action.code)}
                                                                    style={{
                                                                        fontFamily: font, fontSize: chipSize, lineHeight: 1.6,
                                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                                        background: on ? c.bg : '#f6f5f1',
                                                                        border: `1px solid ${on ? c.border : '#d5d1c6'}`,
                                                                        color: on ? c.fg : '#8d8779',
                                                                        fontWeight: on ? 'bold' : 'normal',
                                                                        opacity: locked ? 0.7 : 1,
                                                                        padding: '0 5px',
                                                                        borderRadius: radius,
                                                                        cursor: locked ? 'default' : 'pointer',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                >
                                                                    <i
                                                                        className={`bi ${locked ? 'bi-lock-fill' : on ? 'bi-check2' : 'bi-dash'}`}
                                                                        style={{ fontSize: 8, opacity: on ? 1 : 0.55 }}
                                                                    />
                                                                    {action.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                );
            })}
            {PERMISSION_MATRIX.every(s => !sectionIds(s).length) && (
                <div style={{ fontFamily: font, fontSize: size, padding: 8, color: '#888', fontStyle: 'italic' }}>No permissions defined</div>
            )}
        </div>
    );
}
