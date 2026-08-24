'use client';

import { useEffect, useMemo, useState } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { xpBtn, xpInput, CODE_FONT, xpFont, FieldLabel, FormError, ModalFooterActions, XP_BTN } from '../shared/xpTheme';
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
    avatar_id: string;
    password?: string;
}

export default function UserFormModal({
    isOpen, onClose, mode, user, roles, allPermissions, classic, onSubmit,
}: {
    isOpen: boolean;
    onClose: () => void;
    mode: 'create' | 'edit';
    user?: User;
    roles: any[];
    allPermissions: PermissionOption[];
    classic: boolean;
    onSubmit: (payload: UserFormPayload) => Promise<{ ok: boolean; error?: string }>;
}) {
    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [roleId, setRoleId] = useState('');
    const [permissionIds, setPermissionIds] = useState<string[]>([]);
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
            /* Same reason as RoleFormModal: the permission matrix wraps every resource
               row onto three lines at md. The two modals show the same picker, so they
               get the same width. */
            size="xl"
            footer={
                <ModalFooterActions
                    classic={classic}
                    onCancel={onClose}
                    onSubmit={handleSubmit}
                    submitting={submitting}
                    submitLabel={mode === 'create' ? 'Create User' : 'Save Changes'}
                    variant={mode === 'create' ? 'success' : 'primary'}
                />
            }
        >
            <FormError classic={classic}>{error}</FormError>

            <div className="mb-3">
                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={classic ? { width: 48, height: 48, border: '1px solid', borderColor: '#fff #888 #888 #fff', background: '#e0dcd4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } : { width: 52, height: 52, border: '1px solid #dee2e6', borderRadius: 6, background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <PixelAvatar avatarId={avatarId} size={40} />
                    </div>
                    <AvatarPicker value={avatarId} onChange={setAvatarId} classic={classic} />
                </div>
            </div>

            {/* Paired two-up: at xl these single-line fields each stretching the full
                width read as a form with nothing in it. Collapses to one column on
                narrow screens. */}
            <div className="row g-2 mb-3">
                <div className="col-md-6">
                    <FieldLabel classic={classic}>Username</FieldLabel>
                    <input
                        style={classic ? xpInput({ width: '100%', fontFamily: CODE_FONT }) : { fontFamily: CODE_FONT }}
                        className={classic ? '' : 'form-control form-control-sm'}
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                    />
                </div>
                <div className="col-md-6">
                    <FieldLabel classic={classic}>Full Name</FieldLabel>
                    <input
                        style={classic ? xpInput({ width: '100%' }) : undefined}
                        className={classic ? '' : 'form-control form-control-sm'}
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                    />
                </div>
            </div>

            <div className="row g-2 mb-3">
                <div className="col-md-6">
                    <FieldLabel classic={classic}>Role</FieldLabel>
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
                <div className="col-md-6">
                    <FieldLabel
                        classic={classic}
                        right={mode === 'edit' && !showPassword ? (
                            <button
                                type="button"
                                style={classic ? xpBtn({ padding: '1px 6px', fontSize: 10 }) : undefined}
                                className={classic ? XP_BTN : 'btn btn-sm btn-link p-0'}
                                onClick={() => setShowPassword(true)}
                            >Reset Password…</button>
                        ) : undefined}
                    >Password</FieldLabel>
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
                                    className={classic ? XP_BTN : 'btn btn-sm btn-light border'}
                                    onClick={() => setPasswordVisible(v => !v)}
                                ><i className={`bi ${passwordVisible ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
                                <button
                                    type="button"
                                    title="Generate a random password"
                                    style={classic ? xpBtn({ padding: '1px 6px' }) : undefined}
                                    className={classic ? XP_BTN : 'btn btn-sm btn-light border'}
                                    onClick={handleGeneratePassword}
                                ><i className="bi bi-shuffle"></i></button>
                                {mode === 'edit' && (
                                    <button
                                        type="button"
                                        title="Cancel password reset"
                                        style={classic ? xpBtn({ padding: '1px 6px' }) : undefined}
                                        className={classic ? XP_BTN : 'btn btn-sm btn-light border'}
                                        onClick={() => { setShowPassword(false); setPassword(''); setPasswordVisible(false); }}
                                    ><i className="bi bi-x-lg"></i></button>
                                )}
                            </div>
                            {passwordVisible && password && (
                                <small className={classic ? '' : 'text-muted d-block mt-1'} style={classic ? { fontFamily: xpFont, fontSize: 9, color: '#888', display: 'block', marginTop: 2 } : undefined}>
                                    Copy this now — it won&apos;t be shown again after saving.
                                </small>
                            )}
                        </>
                    ) : (
                        <div style={classic ? { fontFamily: xpFont, fontSize: 10, color: '#888', fontStyle: 'italic' } : undefined} className={classic ? '' : 'small text-muted fst-italic'}>
                            Leave unchanged, or reset it above.
                        </div>
                    )}
                </div>
            </div>

            <div className="mb-3">
                <FieldLabel classic={classic}>Permissions</FieldLabel>
                <PermissionsPicker
                    allPermissions={allPermissions}
                    selectedIds={permissionIds}
                    onChange={setPermissionIds}
                    classic={classic}
                    disabledIds={rolePermissionIds}
                />
                <small className={classic ? '' : 'text-muted d-block mt-1'} style={classic ? { fontFamily: xpFont, fontSize: 9, color: '#888', display: 'block', marginTop: 2 } : undefined}>
                    Locked chips are already granted by the selected role. Category/location/station
                    scoping is configured on the Role, not per user.
                </small>
            </div>
        </ModalWrapper>
    );
}
