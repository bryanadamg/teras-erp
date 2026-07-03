'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useTheme } from '../../context/ThemeContext';
import { useUser, User } from '../../context/UserContext';
import { useConfirm } from '../../context/ConfirmContext';
import { xpBtn, xpInput } from '../shared/xpTheme';
import { xpBevel, xpTitleBar, xpTableHeader, xpThCell, tdBase } from './settingsStyles';
import PixelAvatar from '../shared/PixelAvatar';
import AvatarPicker from '../shared/AvatarPicker';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

export default function SettingsUsersTab() {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { users, setCurrentUser, currentUser, refreshUsers } = useUser();
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';

    const [roles, setRoles] = useState<any[]>([]);
    const [allPermissions, setAllPermissions] = useState<any[]>([]);
    const [allCategories, setAllCategories] = useState<any[]>([]);

    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [editUsername, setEditUsername] = useState('');
    const [editName, setEditName] = useState('');
    const [editRoleId, setEditRoleId] = useState('');
    const [editPermissionIds, setEditPermissionIds] = useState<string[]>([]);
    const [editAllowedCategories, setEditAllowedCategories] = useState<string[]>([]);
    const [editAvatarId, setEditAvatarId] = useState<string>('1');
    const [newPassword, setNewPassword] = useState('');

    const [isAddingUser, setIsAddingUser] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newFullName, setNewFullName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRoleId, setNewUserRoleId] = useState('');
    const [newUserPermissionIds, setNewUserPermissionIds] = useState<string[]>([]);
    const [newUserAllowedCategories, setNewUserAllowedCategories] = useState<string[]>([]);
    const [newUserAvatarId, setNewUserAvatarId] = useState<string>('1');

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

    const startEditingUser = (user: User) => {
        setEditingUser(user.id);
        setEditUsername(user.username);
        setEditName(user.full_name);
        setEditRoleId(user.role?.id || '');
        setEditPermissionIds(user.permissions?.map(p => p.id) || []);
        setEditAllowedCategories(user.allowed_categories || []);
        setEditAvatarId(user.avatar_id || '1');
        setNewPassword('');
    };

    const toggleEditPermission = (permId: string) => {
        setEditPermissionIds(prev =>
            prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
        );
    };

    const toggleEditCategory = (catName: string) => {
        setEditAllowedCategories(prev =>
            prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
        );
    };

    const saveUserChanges = async (userId: string) => {
        try {
            const payload: any = {
                username: editUsername,
                full_name: editName,
                role_id: editRoleId || null,
                permission_ids: editPermissionIds,
                allowed_categories: editAllowedCategories.length > 0 ? editAllowedCategories : null,
                avatar_id: editAvatarId,
            };
            if (newPassword) payload.password = newPassword;
            const res = await fetch(`${API_BASE}/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const updated = await res.json();
                showToast('User updated successfully!', 'success');
                if (currentUser?.id === userId) setCurrentUser(updated);
                setEditingUser(null);
                setNewPassword('');
                refreshUsers();
            } else {
                const err = await res.json();
                showToast(`Failed: ${err.detail}`, 'danger');
            }
        } catch (e) {
            console.error(e);
            showToast('Error updating user', 'danger');
        }
    };

    const resetNewUserForm = () => {
        setNewUsername('');
        setNewFullName('');
        setNewUserPassword('');
        setNewUserRoleId('');
        setNewUserPermissionIds([]);
        setNewUserAllowedCategories([]);
        setNewUserAvatarId('1');
    };

    const toggleNewUserPermission = (permId: string) => {
        setNewUserPermissionIds(prev =>
            prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
        );
    };

    const toggleNewUserCategory = (catName: string) => {
        setNewUserAllowedCategories(prev =>
            prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
        );
    };

    const createUser = async () => {
        if (!newUsername || !newFullName || !newUserPassword) {
            showToast('Username, full name, and password are required', 'warning');
            return;
        }
        try {
            const payload: any = {
                username: newUsername,
                full_name: newFullName,
                password: newUserPassword,
                role_id: newUserRoleId || null,
                permission_ids: newUserPermissionIds,
                allowed_categories: newUserAllowedCategories.length > 0 ? newUserAllowedCategories : null,
                avatar_id: newUserAvatarId,
            };
            const res = await fetch(`${API_BASE}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('User created successfully!', 'success');
                setIsAddingUser(false);
                resetNewUserForm();
                refreshUsers();
            } else {
                const err = await res.json();
                showToast(`Failed: ${err.detail}`, 'danger');
            }
        } catch (e) {
            console.error(e);
            showToast('Error creating user', 'danger');
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
                        onClick={() => { setIsAddingUser(v => !v); resetNewUserForm(); }}
                    ><i className="bi bi-person-plus me-1"></i>Add User</button>
                </div>
            ) : (
                <div className="card-header bg-danger bg-opacity-10 text-danger-emphasis d-flex justify-content-between align-items-center">
                    <h5 className="card-title mb-0"><i className="bi bi-shield-lock me-2"></i>User Management (Admin)</h5>
                    <button
                        className="btn btn-sm btn-success"
                        onClick={() => { setIsAddingUser(v => !v); resetNewUserForm(); }}
                    ><i className="bi bi-person-plus me-1"></i>Add User</button>
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
                                <th style={classic ? xpThCell : undefined} className={classic ? '' : ''}>Username</th>
                                <th style={classic ? xpThCell : undefined}>Full Name</th>
                                <th style={classic ? xpThCell : undefined}>Role &amp; Password</th>
                                <th style={classic ? xpThCell : undefined}>Permissions</th>
                                <th style={classic ? xpThCell : undefined}>Allowed Categories</th>
                                <th style={classic ? xpThCell : undefined}>Status</th>
                                <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none' } : undefined} className={classic ? '' : 'text-end pe-4'}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isAddingUser && (
                                <tr style={classic ? { background: '#fffde8', borderBottom: '1px solid #c0bdb5' } : undefined} className={classic ? '' : 'bg-light'}>
                                    <td style={classic ? { ...tdBase, verticalAlign: 'top' } : undefined} className={classic ? '' : 'ps-4'}>
                                        <div style={classic ? { width: 28, height: 28, border: '1px solid', borderColor: '#fff #888 #888 #fff', background: '#e0dcd4', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width: 32, height: 32, border: '1px solid #dee2e6', borderRadius: 4, background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <PixelAvatar avatarId={newUserAvatarId} size={24} />
                                        </div>
                                        <div style={{ marginTop: 4 }}>
                                            <AvatarPicker value={newUserAvatarId} onChange={setNewUserAvatarId} classic={classic} />
                                        </div>
                                    </td>
                                    <td style={classic ? tdBase : undefined}>
                                        <input
                                            style={classic ? xpInput({ width: '100%', fontFamily: "'Courier New', monospace" }) : undefined}
                                            className={classic ? '' : 'form-control form-control-sm font-monospace'}
                                            placeholder="Username"
                                            value={newUsername}
                                            onChange={e => setNewUsername(e.target.value)}
                                        />
                                    </td>
                                    <td style={classic ? tdBase : undefined}>
                                        <input
                                            style={classic ? xpInput({ width: '100%' }) : undefined}
                                            className={classic ? '' : 'form-control form-control-sm'}
                                            placeholder="Full Name"
                                            value={newFullName}
                                            onChange={e => setNewFullName(e.target.value)}
                                        />
                                    </td>
                                    <td style={classic ? tdBase : undefined}>
                                        <select
                                            style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%', marginBottom: 4 }) : undefined}
                                            className={classic ? '' : 'form-select form-select-sm mb-2'}
                                            value={newUserRoleId}
                                            onChange={e => setNewUserRoleId(e.target.value)}
                                        >
                                            <option value="">No Role</option>
                                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        </select>
                                        <input
                                            type="password"
                                            style={classic ? xpInput({ width: '100%', borderColor: '#cc6666' }) : undefined}
                                            className={classic ? '' : 'form-control form-control-sm'}
                                            placeholder="Password"
                                            value={newUserPassword}
                                            onChange={e => setNewUserPassword(e.target.value)}
                                        />
                                    </td>
                                    <td style={classic ? tdBase : undefined}>
                                        <div
                                            style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 4, padding: '4px 6px', background: '#ffffff', border: '1px solid #b0a898', maxHeight: 150, overflowY: 'auto' as const } : { maxHeight: 150, overflowY: 'auto' as const }}
                                            className={classic ? '' : 'd-flex flex-wrap gap-2 p-2 border rounded bg-white'}
                                        >
                                            {allPermissions.map(p => (
                                                <div key={p.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 3 } : undefined} className={classic ? '' : 'form-check m-0'}>
                                                    <input
                                                        style={classic ? { cursor: 'pointer' } : undefined}
                                                        className={classic ? '' : 'form-check-input'}
                                                        type="checkbox"
                                                        checked={newUserPermissionIds.includes(p.id)}
                                                        onChange={() => toggleNewUserPermission(p.id)}
                                                        id={`new-perm-${p.id}`}
                                                    />
                                                    <label
                                                        style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#000', cursor: 'pointer' } : undefined}
                                                        className={classic ? '' : 'form-check-label small'}
                                                        htmlFor={`new-perm-${p.id}`}
                                                        title={p.description}
                                                    >{p.code}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={classic ? tdBase : undefined}>
                                        <div
                                            style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 4, padding: '4px 6px', background: '#ffffff', border: '1px solid #b0a898', maxHeight: 150, overflowY: 'auto' as const } : { maxHeight: 150, overflowY: 'auto' as const }}
                                            className={classic ? '' : 'd-flex flex-wrap gap-2 p-2 border rounded bg-white'}
                                        >
                                            {allCategories.map(c => (
                                                <div key={c.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 3 } : undefined} className={classic ? '' : 'form-check m-0'}>
                                                    <input
                                                        style={classic ? { cursor: 'pointer' } : undefined}
                                                        className={classic ? '' : 'form-check-input'}
                                                        type="checkbox"
                                                        checked={newUserAllowedCategories.includes(c.name)}
                                                        onChange={() => toggleNewUserCategory(c.name)}
                                                        id={`new-cat-${c.id}`}
                                                    />
                                                    <label
                                                        style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#000', cursor: 'pointer' } : undefined}
                                                        className={classic ? '' : 'form-check-label small'}
                                                        htmlFor={`new-cat-${c.id}`}
                                                    >{c.name}</label>
                                                </div>
                                            ))}
                                            {allCategories.length === 0 && (
                                                <small style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#888' } : undefined} className={classic ? '' : 'text-muted'}>No categories defined</small>
                                            )}
                                        </div>
                                    </td>
                                    <td style={classic ? tdBase : undefined}>
                                        {classic ? (
                                            <span style={{ background: '#e8f5e9', border: '1px solid #2e7d32', color: '#1b4620', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif' }}>Active</span>
                                        ) : (
                                            <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25" style={{fontSize: '0.65rem'}}>Active</span>
                                        )}
                                    </td>
                                    <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' as const } : undefined} className={classic ? '' : 'text-end pe-4'}>
                                        <div style={classic ? { display: 'flex', gap: 2, justifyContent: 'flex-end' } : undefined} className={classic ? '' : 'd-flex gap-1 justify-content-end'}>
                                            {classic ? (
                                                <>
                                                    <button
                                                        style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', padding: '2px 8px' })}
                                                        onClick={createUser}
                                                    ><i className="bi bi-check-lg"></i></button>
                                                    <button
                                                        style={xpBtn({ padding: '2px 8px' })}
                                                        onClick={() => setIsAddingUser(false)}
                                                    ><i className="bi bi-x-lg"></i></button>
                                                </>
                                            ) : (
                                                <>
                                                    <button className="btn btn-sm btn-success" onClick={createUser}>
                                                        <i className="bi bi-check-lg"></i>
                                                    </button>
                                                    <button className="btn btn-sm btn-light border" onClick={() => setIsAddingUser(false)}>
                                                        <i className="bi bi-x-lg"></i>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {users.map((user, rowIndex) => (
                                <tr
                                    key={user.id}
                                    style={classic ? { background: editingUser === user.id ? '#fffde8' : rowIndex % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5', opacity: user.is_active ? 1 : 0.6 } : { opacity: user.is_active ? 1 : 0.6 }}
                                    className={classic ? '' : (editingUser === user.id ? 'bg-light' : '')}
                                >
                                    {editingUser === user.id ? (
                                        <>
                                            <td style={classic ? { ...tdBase, verticalAlign: 'top' } : undefined} className={classic ? '' : 'ps-4'}>
                                                <div style={classic ? { width: 28, height: 28, border: '1px solid', borderColor: '#fff #888 #888 #fff', background: '#e0dcd4', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width: 32, height: 32, border: '1px solid #dee2e6', borderRadius: 4, background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <PixelAvatar avatarId={editAvatarId} size={24} />
                                                </div>
                                                <div style={{ marginTop: 4 }}>
                                                    <AvatarPicker value={editAvatarId} onChange={setEditAvatarId} classic={classic} />
                                                </div>
                                            </td>
                                            <td style={classic ? tdBase : undefined} className={classic ? '' : ''}>
                                                <input
                                                    style={classic ? xpInput({ width: '100%', fontFamily: "'Courier New', monospace" }) : undefined}
                                                    className={classic ? '' : 'form-control form-control-sm font-monospace'}
                                                    value={editUsername}
                                                    onChange={e => setEditUsername(e.target.value)}
                                                />
                                            </td>
                                            <td style={classic ? tdBase : undefined}>
                                                <input
                                                    style={classic ? xpInput({ width: '100%' }) : undefined}
                                                    className={classic ? '' : 'form-control form-control-sm'}
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                />
                                            </td>
                                            <td style={classic ? tdBase : undefined}>
                                                <select
                                                    style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%', marginBottom: 4 }) : undefined}
                                                    className={classic ? '' : 'form-select form-select-sm mb-2'}
                                                    value={editRoleId}
                                                    onChange={e => setEditRoleId(e.target.value)}
                                                >
                                                    <option value="">No Role</option>
                                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                </select>
                                                <input
                                                    type="password"
                                                    style={classic ? xpInput({ width: '100%', borderColor: '#cc6666' }) : undefined}
                                                    className={classic ? '' : 'form-control form-control-sm'}
                                                    placeholder="Reset Password..."
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                />
                                            </td>
                                            <td style={classic ? tdBase : undefined}>
                                                <div
                                                    style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 4, padding: '4px 6px', background: '#ffffff', border: '1px solid #b0a898', maxHeight: 150, overflowY: 'auto' as const } : { maxHeight: 150, overflowY: 'auto' as const }}
                                                    className={classic ? '' : 'd-flex flex-wrap gap-2 p-2 border rounded bg-white'}
                                                >
                                                    {allPermissions.map(p => (
                                                        <div key={p.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 3 } : undefined} className={classic ? '' : 'form-check m-0'}>
                                                            <input
                                                                style={classic ? { cursor: 'pointer' } : undefined}
                                                                className={classic ? '' : 'form-check-input'}
                                                                type="checkbox"
                                                                checked={editPermissionIds.includes(p.id)}
                                                                onChange={() => toggleEditPermission(p.id)}
                                                                id={`perm-${p.id}`}
                                                            />
                                                            <label
                                                                style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#000', cursor: 'pointer' } : undefined}
                                                                className={classic ? '' : 'form-check-label small'}
                                                                htmlFor={`perm-${p.id}`}
                                                                title={p.description}
                                                            >{p.code}</label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td style={classic ? tdBase : undefined}>
                                                <div
                                                    style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 4, padding: '4px 6px', background: '#ffffff', border: '1px solid #b0a898', maxHeight: 150, overflowY: 'auto' as const } : { maxHeight: 150, overflowY: 'auto' as const }}
                                                    className={classic ? '' : 'd-flex flex-wrap gap-2 p-2 border rounded bg-white'}
                                                >
                                                    {allCategories.map(c => (
                                                        <div key={c.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 3 } : undefined} className={classic ? '' : 'form-check m-0'}>
                                                            <input
                                                                style={classic ? { cursor: 'pointer' } : undefined}
                                                                className={classic ? '' : 'form-check-input'}
                                                                type="checkbox"
                                                                checked={editAllowedCategories.includes(c.name)}
                                                                onChange={() => toggleEditCategory(c.name)}
                                                                id={`cat-${c.id}`}
                                                            />
                                                            <label
                                                                style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#000', cursor: 'pointer' } : undefined}
                                                                className={classic ? '' : 'form-check-label small'}
                                                                htmlFor={`cat-${c.id}`}
                                                            >{c.name}</label>
                                                        </div>
                                                    ))}
                                                    {allCategories.length === 0 && (
                                                        <small style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#888' } : undefined} className={classic ? '' : 'text-muted'}>No categories defined</small>
                                                    )}
                                                </div>
                                                <small
                                                    style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '9px', color: '#888', display: 'block', marginTop: 2 } : { fontSize: '0.65rem' }}
                                                    className={classic ? '' : 'text-muted d-block mt-1'}
                                                >*Uncheck all for full access</small>
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
                                                <div style={classic ? { display: 'flex', gap: 2, justifyContent: 'flex-end' } : undefined} className={classic ? '' : 'd-flex gap-1 justify-content-end'}>
                                                    {classic ? (
                                                        <>
                                                            <button
                                                                style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', padding: '2px 8px' })}
                                                                onClick={() => saveUserChanges(user.id)}
                                                            ><i className="bi bi-check-lg"></i></button>
                                                            <button
                                                                style={xpBtn({ padding: '2px 8px' })}
                                                                onClick={() => setEditingUser(null)}
                                                            ><i className="bi bi-x-lg"></i></button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button className="btn btn-sm btn-success" onClick={() => saveUserChanges(user.id)}>
                                                                <i className="bi bi-check-lg"></i>
                                                            </button>
                                                            <button className="btn btn-sm btn-light border" onClick={() => setEditingUser(null)}>
                                                                <i className="bi bi-x-lg"></i>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td style={classic ? { ...tdBase, textAlign: 'center' as const } : undefined} className={classic ? '' : 'ps-4'}>
                                                <div style={classic ? { width: 28, height: 28, border: '1px solid', borderColor: '#fff #888 #888 #fff', background: '#e0dcd4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } : { width: 32, height: 32, border: '1px solid #dee2e6', borderRadius: 4, background: '#f8f9fa', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <PixelAvatar avatarId={user.avatar_id} size={24} />
                                                </div>
                                            </td>
                                            <td style={classic ? { ...tdBase, fontFamily: "'Courier New', monospace", fontWeight: 'bold' } : undefined} className={classic ? '' : 'font-monospace'}>{user.username}</td>
                                            <td style={classic ? tdBase : undefined}>{user.full_name}</td>
                                            <td style={classic ? tdBase : undefined}>
                                                {classic ? (
                                                    <span style={{ background: '#e8e8e8', border: '1px solid #6a6a6a', color: '#000', padding: '1px 5px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif', fontWeight: 'bold' }}>
                                                        {user.role?.name || '-'}
                                                    </span>
                                                ) : (
                                                    <span className="badge bg-secondary">{user.role?.name || '-'}</span>
                                                )}
                                            </td>
                                            <td style={classic ? tdBase : undefined}>
                                                <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 2 } : undefined} className={classic ? '' : 'd-flex flex-wrap gap-1'}>
                                                    {user.permissions?.map((p: any) => (
                                                        classic ? (
                                                            <span key={p.id} style={{ background: '#dde8f5', border: '1px solid #7f9db9', color: '#00006e', padding: '0 4px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif' }}>
                                                                {p.code}
                                                            </span>
                                                        ) : (
                                                            <span key={p.id} className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25" style={{fontSize: '0.65rem'}}>
                                                                {p.code}
                                                            </span>
                                                        )
                                                    ))}
                                                    {(!user.permissions || user.permissions.length === 0) && (
                                                        <span style={classic ? { fontSize: '9px', color: '#888', fontStyle: 'italic', fontFamily: 'Tahoma,Arial,sans-serif' } : undefined} className={classic ? '' : 'text-muted small italic'}>Inherited only</span>
                                                    )}
                                                </div>
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
                                                            onClick={() => startEditingUser(user)}
                                                            style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: '#555', fontSize: '12px' }}
                                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                        ><i className="bi bi-pencil-square"></i></button>
                                                        <button
                                                            title={user.is_active ? 'Deactivate' : 'Reactivate'}
                                                            onClick={() => setUserActive(user, !user.is_active)}
                                                            style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: user.is_active ? '#8e0000' : '#2d7a2d', fontSize: '12px' }}
                                                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                        ><i className={`bi ${user.is_active ? 'bi-person-dash' : 'bi-person-check'}`}></i></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="btn btn-sm btn-link" onClick={() => startEditingUser(user)}>
                                                            <i className="bi bi-pencil-square"></i>
                                                        </button>
                                                        <button
                                                            className={`btn btn-sm btn-link ${user.is_active ? 'text-danger' : 'text-success'}`}
                                                            title={user.is_active ? 'Deactivate' : 'Reactivate'}
                                                            onClick={() => setUserActive(user, !user.is_active)}
                                                        >
                                                            <i className={`bi ${user.is_active ? 'bi-person-dash' : 'bi-person-check'}`}></i>
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {classic && (
                    <div style={{ background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898', padding: '2px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#333' }}>
                        {users.length} user{users.length !== 1 ? 's' : ''} total
                    </div>
                )}
            </div>
        </div>
    );
}
