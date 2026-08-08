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
 * It used to render one bordered chip per permission — 54 boxes of varying
 * width, wrapping ragged, every one repeating its resource ("Create Purchase
 * Orders", "Print Purchase Orders", "View Purchase Orders"). A boxed label
 * reads as a control, so the panel looked like a wall of buttons and nothing
 * could be scanned.
 *
 * Same information, three structural changes: the resource is stated once with
 * its actions beside it, sections tile into columns so the block stays wide and
 * short instead of tall and ragged, and the marks are plain text on an aligned
 * grid — no borders, since none of this is clickable. Direct grants stay bold
 * and blue against inherited grey, which is the one distinction that has to
 * survive at a glance.
 */
export default function PermissionBreakdown({ permissions, classic, showDirect = false }: {
    permissions: BreakdownPermission[];
    classic: boolean;
    /** Marks `_direct` permissions apart from role-inherited ones (user rows). */
    showDirect?: boolean;
}) {
    const sections = groupPermissionsBySection(permissions);
    const font = classic ? xpFont : undefined;

    return (
        <SunkenPanel classic={classic}>
            <SunkenPanelBody classic={classic}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '10px 20px',
                    alignItems: 'start',
                }}>
                    {sections.map(({ section, permissions: secPerms }) => (
                        <div key={section}>
                            <div style={{
                                fontFamily: font,
                                fontSize: classic ? 10 : 11,
                                fontWeight: 'bold',
                                color: '#4a5568',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                borderBottom: '1px solid #c8c4b8',
                                paddingBottom: 2,
                                marginBottom: 4,
                            }}>{section}</div>
                            {groupPermissionsByResource(secPerms).map(({ resource, permissions: resPerms }) => (
                                <div key={resource} style={{ display: 'flex', gap: 6, marginBottom: 2, lineHeight: 1.35 }}>
                                    <span style={{
                                        fontFamily: font,
                                        fontSize: classic ? 10 : 11,
                                        color: '#000',
                                        width: '42%',
                                        flexShrink: 0,
                                    }}>{resource}</span>
                                    <span style={{ fontFamily: font, fontSize: classic ? 10 : 11, color: '#6b6558', minWidth: 0 }}>
                                        {resPerms.map((p, i) => {
                                            const { action } = describePermission(p.code, p.description);
                                            const direct = showDirect && p._direct;
                                            return (
                                                <React.Fragment key={p.id}>
                                                    {i > 0 && <span style={{ color: '#b3ada0' }}> · </span>}
                                                    <span
                                                        title={showDirect ? `${p.code} (${p._direct ? 'direct grant' : 'via role'})` : p.code}
                                                        style={direct ? { color: '#00006e', fontWeight: 'bold' } : undefined}
                                                    >{action}</span>
                                                </React.Fragment>
                                            );
                                        })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                {showDirect && permissions.some(p => p._direct) && (
                    <div style={{ fontFamily: font, fontSize: classic ? 9 : 10, color: '#6b6558', marginTop: 6 }}>
                        <span style={{ color: '#00006e', fontWeight: 'bold' }}>Bold</span> = granted directly to this user, not through the role.
                    </div>
                )}
            </SunkenPanelBody>
        </SunkenPanel>
    );
}
