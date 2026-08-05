'use client';

import { useState } from 'react';
import { xpFont, SunkenPanel, SunkenPanelBody } from '../shared/xpTheme';
import { groupPermissionsBySection } from '../shared/permissionMatrix';

interface Permission { id: string; code: string; description: string }

const badgeStyle = (classic: boolean, kind: 'inherited' | 'direct', p: Permission) => {
    if (classic) {
        return kind === 'inherited'
            ? { key: p.id, title: `${p.code} (via role)`, style: { background: '#e8e8e8', border: '1px solid #999', color: '#555', padding: '0 4px', fontSize: '9px', fontFamily: xpFont } }
            : { key: p.id, title: `${p.code} (direct grant)`, style: { background: '#dde8f5', border: '1px solid #7f9db9', color: '#00006e', padding: '0 4px', fontSize: '9px', fontFamily: xpFont, fontWeight: 'bold' as const } };
    }
    return kind === 'inherited'
        ? { key: p.id, title: `${p.code} (via role)`, className: 'badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25', style: { fontSize: '0.65rem' } }
        : { key: p.id, title: `${p.code} (direct grant)`, className: 'badge bg-info bg-opacity-10 text-info border border-info border-opacity-25', style: { fontSize: '0.65rem' } };
};

/**
 * Shows the union of role-inherited and directly-granted permissions on a
 * user row — previously only direct overrides were visible, which hid what a
 * user could actually do if their role already covered it. Collapses to a
 * one-line summary; expands into the full list grouped by section (same
 * grouping RoleFormModal's permission matrix uses) so a user with many
 * permissions doesn't blow out the row height.
 */
export default function EffectivePermissions({
    rolePermissions, directPermissions, classic,
}: {
    rolePermissions: Permission[];
    directPermissions: Permission[];
    classic: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const directIds = new Set(directPermissions.map(p => p.id));
    const inherited = rolePermissions.filter(p => !directIds.has(p.id));
    const isAdmin = rolePermissions.some(p => p.code === 'admin.access') || directPermissions.some(p => p.code === 'admin.access');

    if (isAdmin) {
        return classic ? (
            <span style={{ background: '#e8e8e8', border: '1px solid #6a6a6a', color: '#000', padding: '0 4px', fontSize: '9px', fontFamily: xpFont, fontWeight: 'bold' }}>
                All Permissions
            </span>
        ) : (
            <span className="badge bg-dark bg-opacity-75">All Permissions</span>
        );
    }

    const total = inherited.length + directPermissions.length;
    if (total === 0) {
        return classic ? (
            <span style={{ fontSize: '9px', color: '#888', fontStyle: 'italic', fontFamily: xpFont }}>None</span>
        ) : (
            <span className="text-muted small fst-italic">None</span>
        );
    }

    const summary = `${total} permission${total !== 1 ? 's' : ''}${directPermissions.length > 0 ? ` (${directPermissions.length} direct)` : ''}`;

    if (!expanded) {
        return (
            <button
                onClick={() => setExpanded(true)}
                style={classic ? {
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: xpFont, fontSize: '10px', color: '#00006e',
                    display: 'flex', alignItems: 'center', gap: 4,
                } : { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.8rem', color: '#0d6efd', display: 'flex', alignItems: 'center', gap: 4 }}
            >
                <i className="bi bi-caret-right-fill" style={{ fontSize: 8 }} />
                {summary}
            </button>
        );
    }

    const sections = groupPermissionsBySection([
        ...inherited.map(p => ({ ...p, _direct: false })),
        ...directPermissions.map(p => ({ ...p, _direct: true })),
    ]);

    return (
        <div>
            <button
                onClick={() => setExpanded(false)}
                style={classic ? {
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 3,
                    fontFamily: xpFont, fontSize: '10px', color: '#00006e',
                    display: 'flex', alignItems: 'center', gap: 4,
                } : { background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 4, fontSize: '0.8rem', color: '#0d6efd', display: 'flex', alignItems: 'center', gap: 4 }}
            >
                <i className="bi bi-caret-down-fill" style={{ fontSize: 8 }} />
                {summary}
            </button>
            <SunkenPanel classic={classic}>
                <SunkenPanelBody classic={classic}>
                    {sections.map(({ section, permissions }) => (
                        <div key={section} style={{ marginBottom: 6 }}>
                            <div style={classic
                                ? { fontFamily: xpFont, fontSize: '10px', fontWeight: 'bold', color: '#333', marginBottom: 3 }
                                : { fontSize: '0.7rem', fontWeight: 'bold', color: '#333', marginBottom: 3 }}
                            >{section}</div>
                            <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 2 } : undefined} className={classic ? '' : 'd-flex flex-wrap gap-1'}>
                                {permissions.map(p => {
                                    const { key, ...rest } = badgeStyle(classic, p._direct ? 'direct' : 'inherited', p);
                                    return <span key={key} {...rest}>{p.description}</span>;
                                })}
                            </div>
                        </div>
                    ))}
                </SunkenPanelBody>
            </SunkenPanel>
        </div>
    );
}
