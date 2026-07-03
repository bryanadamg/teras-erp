'use client';

import { useMemo, useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useUser, User } from '../../context/UserContext';
import { useConfirm } from '../../context/ConfirmContext';
import { xpBtn, xpInput } from '../shared/xpTheme';
import { xpBevel, xpTitleBar, xpTableHeader, xpThCell, tdBase } from './settingsStyles';
import PixelAvatar from '../shared/PixelAvatar';
import Pager from '../shared/Pager';
import UserFormModal, { UserFormPayload } from './UserFormModal';
import EffectivePermissions from './EffectivePermissions';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
const USERS_PAGE_SIZE = 10;

type StatusFilter = 'all' | 'active' | 'inactive';

function formatLastLogin(value?: string | null): string {
    if (!value) return 'Never';
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SettingsUsersTab() {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { users, setCurrentUser, currentUser, refreshUsers } = useUser();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [roles, setRoles] = useState<any[]>([]);
    const [allPermissions, setAllPermissions] = useState<any[]>([]);
    const [allCategories, setAllCategories] = useState<any[]>([]);

    const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
    const [formUser, setFormUser] = useState<User | undefined>(undefined);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [page, setPage] = useState(1);

    useEffect(() => {
        const authHeaders = { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` };
        Promise.all([
            fetch(`${API_BASE}/roles`, { headers: authHeaders }).then(res => res.ok ? res.json() : []),
            fetch(`${API_BASE}/permissions`, { headers: authHeaders }).then(res => res.ok ? res.json() : []),
            fetch(`${API_BASE}/categories`, { headers: authHeaders }).then(res => res.ok ? res.json() : []),
        ]).then(([rolesData, permsData, catsData]) => {
            setRoles(rolesData);
            setAllPermissions(permsData);
            setAllCategories(catsData);
        }).catch(err => console.error("Failed to fetch auth data", err));

        refreshUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredUsers = useMemo(() => {
        const term = search.trim().toLowerCase();
        return users.filter(u => {
            if (statusFilter === 'active' && !u.is_active) return false;
            if (statusFilter === 'inactive' && u.is_active) return false;
            if (term && !u.username.toLowerCase().includes(term) && !u.full_name.toLowerCase().includes(term)) return false;
            return true;
        });
    }, [users, search, statusFilter]);

    const pageCount = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
    const clampedPage = Math.min(page, pageCount);
    const pagedUsers = filteredUsers.slice((clampedPage - 1) * USERS_PAGE_SIZE, clampedPage * USERS_PAGE_SIZE);

    useEffect(() => { setPage(1); }, [search, statusFilter]);

    const submitCreate = async (payload: UserFormPayload): Promise<{ ok: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                showToast('User created successfully!', 'success');
                refreshUsers();
                return { ok: true };
            }
            const err = await res.json();
            return { ok: false, error: err.detail };
        } catch (e) {
            console.error(e);
            return { ok: false, error: 'Error creating user' };
        }
    };

    const submitEdit = async (userId: string, payload: UserFormPayload): Promise<{ ok: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const updated = await res.json();
                showToast('User updated successfully!', 'success');
                if (currentUser?.id === userId) setCurrentUser(updated);
                refreshUsers();
                return { ok: true };
            }
            const err = await res.json();
            return { ok: false, error: err.detail };
        } catch (e) {
            console.error(e);
            return { ok: false, error: 'Error updating user' };
        }
    };

    const setUserActive = async (user: User, active: boolean) => {
        if (!active) {
            const ok = await confirm({
                title: 'Deactivate User',
                message: `Deactivate "${user.username}"? They will immediately lose access until reactivated.`,
                confirmText: 'Deactivate',
                variant: 'danger',
            });
            if (!ok) return;
        }
        try {
            const res = await fetch(`${API_BASE}/users/${user.id}/${active ? 'reactivate' : 'deactivate'}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (res.ok) {
                showToast(`User ${active ? 'reactivated' : 'deactivated'} successfully!`, 'success');
                refreshUsers();
            } else {
                const err = await res.json();
                showToast(`Failed: ${err.detail}`, 'danger');
            }
        } catch (e) {
            console.error(e);
            showToast('Error updating user status', 'danger');
        }
    };

    return (
        <div style={classic ? xpBevel : undefined} className={classic ? '' : 'card shadow-sm border-0'}>
            {classic ? (
                <div style={{ ...xpTitleBar('linear-gradient(to right, #8e0000 0%, #c84040 100%)', '#4a0000'), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><i className="bi bi-shield-lock" style={{ marginRight: 6 }}></i>User Management (Admin)</span>
                    <button
                        style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', padding: '2px 10px' })}
                        onClick={() => { setFormUser(undefined); setFormMode('create'); }}
                    ><i className="bi bi-person-plus me-1"></i>Add User</button>
                </div>
            ) : (
                <div className="card-header bg-danger bg-opacity-10 text-danger-emphasis d-flex justify-content-between align-items-center">
                    <h5 className="card-title mb-0"><i className="bi bi-shield-lock me-2"></i>User Management (Admin)</h5>
                    <button
                        className="btn btn-sm btn-success"
                        onClick={() => { setFormUser(undefined); setFormMode('create'); }}
                    ><i className="bi bi-person-plus me-1"></i>Add User</button>
                </div>
            )}

            {/* Search + status filter toolbar */}
            {classic ? (
                <div style={{
                    background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898',
                    padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const,
                }}>
                    <i className="bi bi-search" style={{ fontSize: 10, color: '#555' }}></i>
                    <input
                        type="text"
                        style={xpInput({ width: 200 })}
                        placeholder="Search username or name…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <select style={xpInput({ height: 'auto', padding: '1px 4px', width: 120 })} value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <div style={{ marginLeft: 'auto', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 10, color: '#555' }}>
                        {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                    </div>
                </div>
            ) : (
                <div className="card-body border-bottom py-2">
                    <div className="row g-2 align-items-center">
                        <div className="col-md-5">
                            <div className="input-group input-group-sm">
                                <span className="input-group-text bg-white border-end-0"><i className="bi bi-search"></i></span>
                                <input
                                    type="text"
                                    className="form-control border-start-0"
                                    placeholder="Search username or name…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="col-md-3">
                            <select className="form-select form-select-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
                                <option value="all">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div className="col-md-4 text-md-end small text-muted">
                            {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                        </div>
                    </div>
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
                                <th style={classic ? { ...xpThCell, width: 36 } : undefined} className={classic ? '' : 'ps-4'} />
                                <th style={classic ? xpThCell : undefined}>Username</th>
                                <th style={classic ? xpThCell : undefined}>Full Name</th>
                                <th style={classic ? xpThCell : undefined}>Role</th>
                                <th style={classic ? xpThCell : undefined}>Permissions</th>
                                <th style={classic ? xpThCell : undefined}>Allowed Categories</th>
                                <th style={classic ? xpThCell : undefined}>Last Login</th>
                                <th style={classic ? xpThCell : undefined}>Status</th>
                                <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none' } : undefined} className={classic ? '' : 'text-end pe-4'}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedUsers.map((user, rowIndex) => {
                                const isSelf = currentUser?.id === user.id;
                                return (
                                    <tr
                                        key={user.id}
                                        style={classic ? { background: rowIndex % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5', opacity: user.is_active ? 1 : 0.6 } : { opacity: user.is_active ? 1 : 0.6 }}
                                    >
                                        <td style={classic ? { ...tdBase, textAlign: 'center' as const } : undefined} className={classic ? '' : 'ps-4'}>
                                            <div style={classic ? { width: 28, height: 28, border: '1px solid', borderColor: '#fff #888 #888 #fff', background: '#e0dcd4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } : { width: 32, height: 32, border: '1px solid #dee2e6', borderRadius: 4, background: '#f8f9fa', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <PixelAvatar avatarId={user.avatar_id} size={24} />
                                            </div>
                                        </td>
                                        <td style={classic ? { ...tdBase, fontFamily: "'Courier New', monospace", fontWeight: 'bold' } : undefined} className={classic ? '' : 'font-monospace'}>
                                            {user.username}
                                            {isSelf && <span className={classic ? '' : 'text-muted small ms-1'} style={classic ? { fontSize: 8, color: '#888', fontWeight: 'normal' } : undefined}> (you)</span>}
                                        </td>
                                        <td style={classic ? tdBase : undefined}>{user.full_name}</td>
                                        <td style={classic ? tdBase : undefined}>
                                            {classic ? (
                                                <span style={{ display: 'inline-block', width: 'fit-content', maxWidth: '100%', background: '#e8e8e8', border: '1px solid #6a6a6a', color: '#000', padding: '1px 5px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif', fontWeight: 'bold' }}>
                                                    {user.role?.name || '-'}
                                                </span>
                                            ) : (
                                                <span className="badge bg-secondary" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{user.role?.name || '-'}</span>
                                            )}
                                        </td>
                                        <td style={classic ? tdBase : undefined}>
                                            <EffectivePermissions
                                                rolePermissions={user.role?.permissions || []}
                                                directPermissions={user.permissions || []}
                                                classic={classic}
                                            />
                                        </td>
                                        <td style={classic ? tdBase : undefined}>
                                            <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 2 } : undefined} className={classic ? '' : 'd-flex flex-wrap gap-1'}>
                                                {user.allowed_categories && user.allowed_categories.length > 0 ? (
                                                    user.allowed_categories.map((c: string) => (
                                                        classic ? (
                                                            <span key={c} style={{ background: '#fff8e1', border: '1px solid #c77800', color: '#4a3000', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif' }}>
                                                                {c}
                                                            </span>
                                                        ) : (
                                                            <span key={c} className="badge bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25" style={{fontSize: '0.65rem'}}>
                                                                {c}
                                                            </span>
                                                        )
                                                    ))
                                                ) : (
                                                    classic ? (
                                                        <span style={{ background: '#e8f5e9', border: '1px solid #2e7d32', color: '#1b4620', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif' }}>All Categories</span>
                                                    ) : (
                                                        <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25" style={{fontSize: '0.65rem'}}>All Categories</span>
                                                    )
                                                )}
                                            </div>
                                        </td>
                                        <td style={classic ? { ...tdBase, fontSize: 9, whiteSpace: 'nowrap' as const } : undefined} className={classic ? '' : 'small text-muted'}>
                                            {formatLastLogin(user.last_login_at)}
                                        </td>
                                        <td style={classic ? tdBase : undefined}>
                                            {user.is_active ? (
                                                classic ? (
                                                    <span style={{ background: '#e8f5e9', border: '1px solid #2e7d32', color: '#1b4620', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif' }}>Active</span>
                                                ) : (
                                                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25" style={{fontSize: '0.65rem'}}>Active</span>
                                                )
                                            ) : (
                                                classic ? (
                                                    <span style={{ background: '#f5e8e8', border: '1px solid #8e0000', color: '#8e0000', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif' }}>Inactive</span>
                                                ) : (
                                                    <span className="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25" style={{fontSize: '0.65rem'}}>Inactive</span>
                                                )
                                            )}
                                        </td>
                                        <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' as const } : undefined} className={classic ? '' : 'text-end pe-4'}>
                                            {classic ? (
                                                <>
                                                    <button
                                                        title="Edit"
                                                        onClick={() => { setFormUser(user); setFormMode('edit'); }}
                                                        style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: '#555', fontSize: '12px' }}
                                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                    ><i className="bi bi-pencil-square"></i></button>
                                                    {!isSelf && (
                                                        <button
                                                            title={user.is_active ? 'Deactivate' : 'Reactivate'}
                                                            onClick={() => setUserActive(user, !user.is_active)}
                                                            style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: user.is_active ? '#8e0000' : '#2d7a2d', fontSize: '12px' }}
                                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                        ><i className={`bi ${user.is_active ? 'bi-person-dash' : 'bi-person-check'}`}></i></button>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <button className="btn btn-sm btn-link" onClick={() => { setFormUser(user); setFormMode('edit'); }}>
                                                        <i className="bi bi-pencil-square"></i>
                                                    </button>
                                                    {!isSelf && (
                                                        <button
                                                            className={`btn btn-sm btn-link ${user.is_active ? 'text-danger' : 'text-success'}`}
                                                            title={user.is_active ? 'Deactivate' : 'Reactivate'}
                                                            onClick={() => setUserActive(user, !user.is_active)}
                                                        >
                                                            <i className={`bi ${user.is_active ? 'bi-person-dash' : 'bi-person-check'}`}></i>
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={9} style={classic ? { ...tdBase, textAlign: 'center' as const, fontStyle: 'italic', color: '#888' } : undefined} className={classic ? '' : 'text-center text-muted py-4'}>
                                        No users match this search/filter.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <Pager
                    page={clampedPage}
                    total={filteredUsers.length}
                    pageSize={USERS_PAGE_SIZE}
                    onPageChange={setPage}
                    leftContent={classic ? `${filteredUsers.length} of ${users.length} user${users.length !== 1 ? 's' : ''}` : undefined}
                />
            </div>

            <UserFormModal
                isOpen={formMode !== null}
                onClose={() => setFormMode(null)}
                mode={formMode || 'create'}
                user={formUser}
                roles={roles}
                allPermissions={allPermissions}
                allCategories={allCategories}
                classic={classic}
                onSubmit={(payload) => formMode === 'create' ? submitCreate(payload) : submitEdit(formUser!.id, payload)}
            />
        </div>
    );
}
