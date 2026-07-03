'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useConfirm } from '../../context/ConfirmContext';
import { xpBtn } from '../shared/xpTheme';
import { xpBevel, xpTitleBar, xpTableHeader, xpThCell, tdBase } from './settingsStyles';
import RoleFormModal, { RoleFormPayload, RoleLike } from './RoleFormModal';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

export default function SettingsRolesTab() {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { users } = useUser();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [roles, setRoles] = useState<RoleLike[]>([]);
    const [allPermissions, setAllPermissions] = useState<any[]>([]);
    const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
    const [formRole, setFormRole] = useState<RoleLike | undefined>(undefined);

    const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('access_token')}` });

    const loadData = () => {
        Promise.all([
            fetch(`${API_BASE}/roles`, { headers: authHeaders() }).then(res => res.ok ? res.json() : []),
            fetch(`${API_BASE}/permissions`, { headers: authHeaders() }).then(res => res.ok ? res.json() : []),
        ]).then(([rolesData, permsData]) => {
            setRoles(rolesData);
            setAllPermissions(permsData);
        }).catch(err => console.error("Failed to fetch roles/permissions", err));
    };

    useEffect(() => { loadData(); }, []);

    const userCountByRole = useMemo(() => {
        const counts = new Map<string, number>();
        for (const u of users) {
            if (u.role?.id) counts.set(u.role.id, (counts.get(u.role.id) || 0) + 1);
        }
        return counts;
    }, [users]);

    const submitCreate = async (payload: RoleFormPayload): Promise<{ ok: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                showToast('Role created successfully!', 'success');
                loadData();
                return { ok: true };
            }
            const err = await res.json();
            return { ok: false, error: err.detail };
        } catch (e) {
            console.error(e);
            return { ok: false, error: 'Error creating role' };
        }
    };

    const submitEdit = async (roleId: string, payload: RoleFormPayload): Promise<{ ok: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/roles/${roleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                showToast('Role updated successfully!', 'success');
                loadData();
                return { ok: true };
            }
            const err = await res.json();
            return { ok: false, error: err.detail };
        } catch (e) {
            console.error(e);
            return { ok: false, error: 'Error updating role' };
        }
    };

    const deleteRole = async (role: RoleLike) => {
        const inUse = userCountByRole.get(role.id) || 0;
        if (inUse > 0) {
            showToast(`Cannot delete — assigned to ${inUse} user${inUse !== 1 ? 's' : ''}. Reassign them first.`, 'warning');
            return;
        }
        const ok = await confirm({
            title: 'Delete Role',
            message: `Delete the role "${role.name}"? This cannot be undone.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            const res = await fetch(`${API_BASE}/roles/${role.id}`, { method: 'DELETE', headers: authHeaders() });
            if (res.ok || res.status === 204) {
                showToast('Role deleted', 'success');
                loadData();
            } else {
                const err = await res.json();
                showToast(`Failed: ${err.detail}`, 'danger');
            }
        } catch (e) {
            console.error(e);
            showToast('Error deleting role', 'danger');
        }
    };

    return (
        <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0'}>
            {classic ? (
                <div style={{ ...xpTitleBar('linear-gradient(to right, #8e5000 0%, #c87c00 100%)', '#5e3000'), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><i className="bi bi-diagram-3" style={{ marginRight: 6 }}></i>Roles &amp; Permissions (Admin)</span>
                    <button
                        style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', padding: '2px 10px' })}
                        onClick={() => { setFormRole(undefined); setFormMode('create'); }}
                    ><i className="bi bi-plus-lg me-1"></i>Add Role</button>
                </div>
            ) : (
                <div className="card-header bg-warning bg-opacity-10 text-warning-emphasis d-flex justify-content-between align-items-center">
                    <h5 className="card-title mb-0"><i className="bi bi-diagram-3 me-2"></i>Roles &amp; Permissions (Admin)</h5>
                    <button
                        className="btn btn-sm btn-success"
                        onClick={() => { setFormRole(undefined); setFormMode('create'); }}
                    ><i className="bi bi-plus-lg me-1"></i>Add Role</button>
                </div>
            )}

            <div style={classic ? { background: '#ece9d8' } : undefined} className={classic ? '' : 'card-body p-0'}>
                <div className="table-responsive">
                    <table
                        style={classic ? { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' } : undefined}
                        className={classic ? '' : 'table table-hover align-middle mb-0'}
                    >
                        <thead style={classic ? xpTableHeader : undefined} className={classic ? '' : 'table-light'}>
                            <tr>
                                <th style={classic ? xpThCell : undefined} className={classic ? '' : 'ps-4'}>Name</th>
                                <th style={classic ? xpThCell : undefined}>Description</th>
                                <th style={classic ? xpThCell : undefined}>Permissions</th>
                                <th style={classic ? { ...xpThCell, width: 90, textAlign: 'center' as const } : undefined}>Users</th>
                                <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none' } : undefined} className={classic ? '' : 'text-end pe-4'}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((role, rowIndex) => {
                                const count = userCountByRole.get(role.id) || 0;
                                const isAdminRole = role.permissions.some(p => p.code === 'admin.access');
                                return (
                                    <tr key={role.id} style={classic ? { background: rowIndex % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' } : undefined}>
                                        <td style={classic ? { ...tdBase, fontWeight: 'bold' } : undefined} className={classic ? '' : 'fw-semibold ps-4'}>{role.name}</td>
                                        <td style={classic ? tdBase : undefined} className={classic ? '' : 'text-muted small'}>{role.description || '-'}</td>
                                        <td style={classic ? tdBase : undefined}>
                                            {isAdminRole ? (
                                                classic ? (
                                                    <span style={{ background: '#e8e8e8', border: '1px solid #6a6a6a', color: '#000', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif', fontWeight: 'bold' }}>All Permissions</span>
                                                ) : (
                                                    <span className="badge bg-dark bg-opacity-75">All Permissions</span>
                                                )
                                            ) : (
                                                <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 2 } : undefined} className={classic ? '' : 'd-flex flex-wrap gap-1'}>
                                                    {role.permissions.map(p => (
                                                        classic ? (
                                                            <span key={p.id} title={p.code} style={{ background: '#dde8f5', border: '1px solid #7f9db9', color: '#00006e', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif' }}>
                                                                {p.description}
                                                            </span>
                                                        ) : (
                                                            <span key={p.id} title={p.code} className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25" style={{ fontSize: '0.65rem' }}>
                                                                {p.description}
                                                            </span>
                                                        )
                                                    ))}
                                                    {role.permissions.length === 0 && (
                                                        <span style={classic ? { fontSize: '9px', color: '#888', fontStyle: 'italic', fontFamily: 'Tahoma,Arial,sans-serif' } : undefined} className={classic ? '' : 'text-muted small fst-italic'}>None</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td style={classic ? { ...tdBase, textAlign: 'center' as const } : undefined} className={classic ? '' : 'text-center'}>
                                            {classic ? (
                                                <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10 }}>{count}</span>
                                            ) : (
                                                <span className="badge bg-light text-dark border">{count}</span>
                                            )}
                                        </td>
                                        <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' as const } : undefined} className={classic ? '' : 'text-end pe-4'}>
                                            {classic ? (
                                                <>
                                                    <button
                                                        title="Edit"
                                                        onClick={() => { setFormRole(role); setFormMode('edit'); }}
                                                        style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: '#555', fontSize: '12px' }}
                                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                    ><i className="bi bi-pencil-square"></i></button>
                                                    <button
                                                        title={count > 0 ? `Assigned to ${count} user(s)` : 'Delete'}
                                                        onClick={() => deleteRole(role)}
                                                        disabled={count > 0}
                                                        style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: count > 0 ? 'not-allowed' : 'pointer', padding: '1px 4px', color: count > 0 ? '#bbb' : '#8e0000', fontSize: '12px' }}
                                                        onMouseEnter={e => { if (count === 0) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; } }}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                    ><i className="bi bi-trash"></i></button>
                                                </>
                                            ) : (
                                                <>
                                                    <button className="btn btn-sm btn-link" onClick={() => { setFormRole(role); setFormMode('edit'); }}>
                                                        <i className="bi bi-pencil-square"></i>
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-link text-danger"
                                                        title={count > 0 ? `Assigned to ${count} user(s)` : 'Delete'}
                                                        disabled={count > 0}
                                                        onClick={() => deleteRole(role)}
                                                    >
                                                        <i className="bi bi-trash"></i>
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {roles.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={classic ? { ...tdBase, textAlign: 'center' as const, fontStyle: 'italic', color: '#888' } : undefined} className={classic ? '' : 'text-center text-muted py-4'}>
                                        No roles defined yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <RoleFormModal
                isOpen={formMode !== null}
                onClose={() => setFormMode(null)}
                mode={formMode || 'create'}
                role={formRole}
                allPermissions={allPermissions}
                classic={classic}
                onSubmit={(payload) => formMode === 'create' ? submitCreate(payload) : submitEdit(formRole!.id, payload)}
            />
        </div>
    );
}
