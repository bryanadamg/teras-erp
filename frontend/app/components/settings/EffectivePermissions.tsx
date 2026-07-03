'use client';

import { xpFont } from '../shared/xpTheme';

interface Permission { id: string; code: string; description: string }

/**
 * Shows the union of role-inherited and directly-granted permissions on a
 * user row — previously only direct overrides were visible, which hid what a
 * user could actually do if their role already covered it.
 */
export default function EffectivePermissions({
    rolePermissions, directPermissions, classic,
}: {
    rolePermissions: Permission[];
    directPermissions: Permission[];
    classic: boolean;
}) {
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

    if (inherited.length === 0 && directPermissions.length === 0) {
        return classic ? (
            <span style={{ fontSize: '9px', color: '#888', fontStyle: 'italic', fontFamily: xpFont }}>None</span>
        ) : (
            <span className="text-muted small fst-italic">None</span>
        );
    }

    return (
        <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 2 } : undefined} className={classic ? '' : 'd-flex flex-wrap gap-1'}>
            {inherited.map(p => (
                classic ? (
                    <span key={p.id} title={`${p.code} (via role)`} style={{ background: '#e8e8e8', border: '1px solid #999', color: '#555', padding: '0 4px', fontSize: '9px', fontFamily: xpFont }}>
                        {p.description}
                    </span>
                ) : (
                    <span key={p.id} title={`${p.code} (via role)`} className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25" style={{ fontSize: '0.65rem' }}>
                        {p.description}
                    </span>
                )
            ))}
            {directPermissions.map(p => (
                classic ? (
                    <span key={p.id} title={`${p.code} (direct grant)`} style={{ background: '#dde8f5', border: '1px solid #7f9db9', color: '#00006e', padding: '0 4px', fontSize: '9px', fontFamily: xpFont, fontWeight: 'bold' }}>
                        {p.description}
                    </span>
                ) : (
                    <span key={p.id} title={`${p.code} (direct grant)`} className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25" style={{ fontSize: '0.65rem' }}>
                        {p.description}
                    </span>
                )
            ))}
        </div>
    );
}
