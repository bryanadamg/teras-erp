'use client';

import { useEffect, useMemo, useState } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { xpBtn, xpInput, xpLabel } from '../shared/xpTheme';
import PixelAvatar from '../shared/PixelAvatar';
import AvatarPicker from '../shared/AvatarPicker';
import PermissionsPicker, { PermissionOption } from './PermissionsPicker';
import { User } from '../../context/UserContext';

const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';

function generatePassword(length = 14): string {
    const bytes = new Uint32Array(length);
    (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
    return Array.from(bytes, b => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

export interface UserFormPayload {
    username: string;
    full_name: string;
    role_id: string | null;
    permission_ids: string[];
    allowed_categories: string[] | null;
    avatar_id: string;
    password?: string;
}

export default function UserFormModal({
    isOpen, onClose, mode, user, roles, allPermissions, allCategories, classic, onSubmit,
}: {
    isOpen: boolean;
    onClose: () => void;
    mode: 'create' | 'edit';
    user?: User;
    roles: any[];
    allPermissions: PermissionOption[];
    allCategories: any[];
    classic: boolean;
    onSubmit: (payload: UserFormPayload) => Promise<{ ok: boolean; error?: string }>;
}) {
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [roleId, setRoleId] = useState('');
    const [permissionIds, setPermissionIds] = useState<string[]>([]);
    const [allowedCategories, setAllowedCategories] = useState<string[]>([]);
    const [avatarId, setAvatarId] = useState('1');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(mode === 'create');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setUsername(user?.username || '');
        setFullName(user?.full_name || '');
        setRoleId(user?.role?.id || '');
        setPermissionIds(user?.permissions?.map(p => p.id) || []);
        setAllowedCategories(user?.allowed_categories || []);
        setAvatarId(user?.avatar_id || '1');
        setPassword('');
        setShowPassword(mode === 'create');
        setPasswordVisible(false);
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, user?.id]);

    const rolePermissionIds = useMemo(() => {
        const role = roles.find(r => r.id === roleId);
        return role?.permissions?.map((p: any) => p.id) || [];
    }, [roles, roleId]);

    const toggleCategory = (catName: string) => {
        setAllowedCategories(prev => prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]);
    };

    const handleGeneratePassword = () => {
        const pw = generatePassword();
        setPassword(pw);
        setPasswordVisible(true);
    };

    const handleSubmit = async () => {
        setError('');
        if (!username || !fullName) {
            setError('Username and full name are required');
            return;
        }
        if (mode === 'create' && !password) {
            setError('Password is required');
            return;
        }
        setSubmitting(true);
        const payload: UserFormPayload = {
            username, full_name: fullName,
            role_id: roleId || null,
            permission_ids: permissionIds,
            allowed_categories: allowedCategories.length > 0 ? allowedCategories : null,
            avatar_id: avatarId,
        };
        if (mode === 'create' || (showPassword && password)) payload.password = password;
        const res = await onSubmit(payload);
        setSubmitting(false);
        if (res.ok) {
            onClose();
        } else {
            setError(res.error || 'Something went wrong');
        }
    };

    return (
        <ModalWrapper
            isOpen={isOpen}
            modeless
            onClose={onClose}
            title={<span><i className="bi bi-person-badge me-2"></i>{mode === 'create' ? 'Add User' : `Edit User — ${user?.username}`}</span>}
            variant={mode === 'create' ? 'success' : 'primary'}
            size="md"
            footer={
                <>
                    <button type="button" style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-secondary'} onClick={onClose}>Cancel</button>
                    <button
                        type="button"
                        disabled={submitting}
                        style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' }) : undefined}
                        className={classic ? '' : 'btn btn-success fw-bold px-4'}
                        onClick={handleSubmit}
                    >{submitting ? 'Saving…' : mode === 'create' ? 'Create User' : 'Save Changes'}</button>
                </>
            }
        >
            {error && (
                <div className={classic ? '' : 'alert alert-danger py-2 small'} style={classic ? { background: '#f5e8e8', border: '1px solid #8e0000', color: '#8e0000', padding: '4px 8px', fontSize: 11, marginBottom: 10, fontFamily: 'Tahoma,Arial,sans-serif' } : undefined}>
                    {error}
                </div>
            )}

            <div className="d-flex gap-3 mb-3">
                <div style={{ flexShrink: 0 }}>
                    <div style={classic ? { width: 48, height: 48, border: '1px solid', borderColor: '#fff #888 #888 #fff', background: '#e0dcd4', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { width: 52, height: 52, border: '1px solid #dee2e6', borderRadius: 6, background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PixelAvatar avatarId={avatarId} size={40} />
                    </div>
                    <div style={{ marginTop: 4 }}>
                        <AvatarPicker value={avatarId} onChange={setAvatarId} classic={classic} />
                    </div>
                </div>
                <div className="flex-grow-1">
                    <div className="mb-2">
                        <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Username</label>
                        <input
                            style={classic ? xpInput({ width: '100%', fontFamily: "'Courier New', monospace" }) : undefined}
                            className={classic ? '' : 'form-control form-control-sm font-monospace'}
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Full Name</label>
                        <input
                            style={classic ? xpInput({ width: '100%' }) : undefined}
                            className={classic ? '' : 'form-control form-control-sm'}
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="mb-3">
                <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Role</label>
                <select
                    style={classic ? xpInput({ height: 'auto', padding: '2px 4px', width: '100%' }) : undefined}
                    className={classic ? '' : 'form-select form-select-sm'}
                    value={roleId}
                    onChange={e => setRoleId(e.target.value)}
                >
                    <option value="">No Role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
            </div>

            <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                    <label style={classic ? { ...xpLabel(), marginBottom: 0 } : undefined} className={classic ? '' : 'form-label small text-muted mb-0'}>Password</label>
                    {mode === 'edit' && !showPassword && (
                        <button
                            type="button"
                            style={classic ? xpBtn({ padding: '1px 6px', fontSize: 10 }) : undefined}
                            className={classic ? '' : 'btn btn-sm btn-link p-0'}
                            onClick={() => setShowPassword(true)}
                        >Reset Password…</button>
                    )}
                </div>
                {showPassword ? (
                    <>
                        <div className="d-flex gap-1">
                            <input
                                type={passwordVisible ? 'text' : 'password'}
                                style={classic ? xpInput({ width: '100%', borderColor: '#cc6666' }) : undefined}
                                className={classic ? '' : 'form-control form-control-sm'}
                                placeholder={mode === 'create' ? 'Password' : 'New password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                title={passwordVisible ? 'Hide' : 'Show'}
                                style={classic ? xpBtn({ padding: '1px 6px' }) : undefined}
                                className={classic ? '' : 'btn btn-sm btn-light border'}
                                onClick={() => setPasswordVisible(v => !v)}
                            ><i className={`bi ${passwordVisible ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
                            <button
                                type="button"
                                title="Generate a random password"
                                style={classic ? xpBtn({ padding: '1px 6px' }) : undefined}
                                className={classic ? '' : 'btn btn-sm btn-light border'}
                                onClick={handleGeneratePassword}
                            ><i className="bi bi-shuffle"></i></button>
                            {mode === 'edit' && (
                                <button
                                    type="button"
                                    title="Cancel password reset"
                                    style={classic ? xpBtn({ padding: '1px 6px' }) : undefined}
                                    className={classic ? '' : 'btn btn-sm btn-light border'}
                                    onClick={() => { setShowPassword(false); setPassword(''); setPasswordVisible(false); }}
                                ><i className="bi bi-x-lg"></i></button>
                            )}
                        </div>
                        {passwordVisible && password && (
                            <small className={classic ? '' : 'text-muted d-block mt-1'} style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 9, color: '#888', display: 'block', marginTop: 2 } : undefined}>
                                Copy this now — it won&apos;t be shown again after saving.
                            </small>
                        )}
                    </>
                ) : (
                    <div style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#888', fontStyle: 'italic' } : undefined} className={classic ? '' : 'small text-muted fst-italic'}>
                        Leave unchanged, or reset it above.
                    </div>
                )}
            </div>

            <div className="mb-3">
                <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Permissions</label>
                <PermissionsPicker
                    allPermissions={allPermissions}
                    selectedIds={permissionIds}
                    onChange={setPermissionIds}
                    classic={classic}
                    disabledIds={rolePermissionIds}
                />
                <small className={classic ? '' : 'text-muted d-block mt-1'} style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 9, color: '#888', display: 'block', marginTop: 2 } : undefined}>
                    Greyed-out permissions are already granted by the selected role.
                </small>
            </div>

            <div className="mb-1">
                <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Allowed Categories</label>
                <div
                    style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 4, padding: '4px 6px', background: '#ffffff', border: '1px solid #b0a898', maxHeight: 120, overflowY: 'auto' as const } : { maxHeight: 120, overflowY: 'auto' as const }}
                    className={classic ? '' : 'd-flex flex-wrap gap-2 p-2 border rounded bg-white'}
                >
                    {allCategories.map(c => (
                        <div key={c.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 3 } : undefined} className={classic ? '' : 'form-check m-0'}>
                            <input
                                style={classic ? { cursor: 'pointer' } : undefined}
                                className={classic ? '' : 'form-check-input'}
                                type="checkbox"
                                checked={allowedCategories.includes(c.name)}
                                onChange={() => toggleCategory(c.name)}
                                id={`user-form-cat-${c.id}`}
                            />
                            <label
                                style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#000', cursor: 'pointer' } : undefined}
                                className={classic ? '' : 'form-check-label small'}
                                htmlFor={`user-form-cat-${c.id}`}
                            >{c.name}</label>
                        </div>
                    ))}
                    {allCategories.length === 0 && (
                        <small style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#888' } : undefined} className={classic ? '' : 'text-muted'}>No categories defined</small>
                    )}
                </div>
                <small className={classic ? '' : 'text-muted d-block mt-1'} style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 9, color: '#888', display: 'block', marginTop: 2 } : undefined}>
                    Uncheck all for access to every category.
                </small>
            </div>
        </ModalWrapper>
    );
}
