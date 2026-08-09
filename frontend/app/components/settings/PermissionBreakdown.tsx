'use client';

import React from 'react';
import { xpFont, SunkenPanel, SunkenPanelBody } from '../shared/xpTheme';
import { describePermission, groupPermissionsBySection, groupPermissionsByResource } from '../shared/permissionMatrix';

export interface BreakdownPermission {
    id: string;
    code: string;
    description: string;
    /** true when granted directly on the user rather than inherited from the role. */
    _direct?: boolean;
}

/**
 * The expanded permission list on a role row and on a user row.
 *
 * Each section is its own bordered mini-table with a tinted header — the same
 * drill-down shape the Booking Stock row detail uses — instead of one flat
 * grid of text columns, so a 60-permission role reads as five small tables you
 * can scan section by section.
 *
 * Actions are chips tinted by intent (create green / edit blue / delete red /
 * print amber / view grey) so the destructive grants are findable without
 * reading every word. The resource is stated once per row: chips carry only the
 * verb, never "…Purchase Orders" repeated six times.
 */

type Intent = 'create' | 'edit' | 'delete' | 'print' | 'view';

const INTENT_BY_ACTION: Record<string, Intent> = {
    create: 'create', create_pr: 'create', create_recipe: 'create',
    edit: 'edit', adjust: 'edit', move: 'edit', split: 'edit', stage: 'edit',
    log: 'edit', import: 'edit', update_status: 'edit', set_status: 'edit',
    receive_goods: 'edit', unmount: 'edit', start: 'edit',
    delete: 'delete', archive: 'delete', qc_reject: 'delete', close: 'delete', stop: 'delete',
    print: 'print', print_card: 'print', print_label: 'print',
    view: 'view',
};

const CHIP: Record<Intent, { bg: string; border: string; fg: string }> = {
    create: { bg: '#e2f3e2', border: '#7bb07b', fg: '#1a5e2a' },
    edit: { bg: '#dde8f5', border: '#7f9db9', fg: '#1a3d7a' },
    delete: { bg: '#f7e2e2', border: '#c08a8a', fg: '#8e0000' },
    print: { bg: '#fff3d6', border: '#c8a04a', fg: '#7a5000' },
    view: { bg: '#eeece6', border: '#bab5a8', fg: '#5c5749' },
};

const intentOf = (code: string): Intent => INTENT_BY_ACTION[code.split('.')[1] || ''] || 'edit';

export default function PermissionBreakdown({ permissions, classic, showDirect = false }: {
    permissions: BreakdownPermission[];
    classic: boolean;
    /** Marks `_direct` permissions apart from role-inherited ones (user rows). */
    showDirect?: boolean;
}) {
    const sections = groupPermissionsBySection(permissions);
    const font = classic ? xpFont : undefined;
    const size = classic ? 10 : 11;
    const radius = classic ? 0 : 3;

    return (
        <SunkenPanel classic={classic}>
            <SunkenPanelBody classic={classic}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 12,
                alignItems: 'start',
            }}>
                {sections.map(({ section, permissions: secPerms }) => (
                    <table key={section} style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        background: '#fff',
                        border: '1px solid #c0bdb5',
                        borderRadius: radius,
                        overflow: 'hidden',
                    }}>
                        <thead>
                            <tr style={{ background: '#eef1f5' }}>
                                <th colSpan={2} style={{
                                    fontFamily: font,
                                    fontSize: size,
                                    fontWeight: 'bold',
                                    color: '#33475b',
                                    textAlign: 'left',
                                    letterSpacing: '0.5px',
                                    textTransform: 'uppercase',
                                    padding: '3px 8px',
                                    borderBottom: '1px solid #b8c2cc',
                                }}>
                                    {section}
                                    <span style={{ fontWeight: 'normal', color: '#7b8794', marginLeft: 6 }}>
                                        ({secPerms.length})
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupPermissionsByResource(secPerms).map(({ resource, permissions: resPerms }, i) => (
                                <tr key={resource} style={{ background: i % 2 === 0 ? '#ffffff' : '#fafaf7' }}>
                                    <td style={{
                                        fontFamily: font,
                                        fontSize: size,
                                        color: '#000',
                                        padding: '3px 8px',
                                        width: '38%',
                                        verticalAlign: 'top',
                                        whiteSpace: 'nowrap',
                                        borderRight: '1px solid #e6e3db',
                                    }}>{resource}</td>
                                    <td style={{ padding: '3px 6px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                            {resPerms.map(p => {
                                                const { action } = describePermission(p.code, p.description);
                                                const c = CHIP[intentOf(p.code)];
                                                const direct = showDirect && p._direct;
                                                return (
                                                    <span
                                                        key={p.id}
                                                        title={showDirect ? `${p.code} (${p._direct ? 'direct grant' : 'via role'})` : p.code}
                                                        style={{
                                                            fontFamily: font,
                                                            fontSize: classic ? 9 : 10,
                                                            lineHeight: 1.5,
                                                            background: c.bg,
                                                            border: `1px solid ${direct ? '#00006e' : c.border}`,
                                                            color: direct ? '#00006e' : c.fg,
                                                            fontWeight: direct ? 'bold' : 'normal',
                                                            padding: '0 5px',
                                                            borderRadius: radius,
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >{action}</span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ))}
            </div>
            {showDirect && permissions.some(p => p._direct) && (
                <div style={{ fontFamily: font, fontSize: classic ? 9 : 10, color: '#6b6558', marginTop: 6 }}>
                    <span style={{
                        background: '#dde8f5', border: '1px solid #00006e',
                        padding: '0 5px', fontWeight: 'bold', color: '#00006e', marginRight: 5, borderRadius: radius,
                    }}>Chip</span>
                    outlined in blue = granted directly to this user, not through the role.
                </div>
            )}
            </SunkenPanelBody>
        </SunkenPanel>
    );
}
