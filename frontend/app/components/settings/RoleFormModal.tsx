'use client';

import { useEffect, useState } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { xpBtn, xpInput, xpLabel } from '../shared/xpTheme';
import PermissionsPicker, { PermissionOption } from './PermissionsPicker';

export interface RoleFormPayload {
    name: string;
    description: string | null;
    permission_ids: string[];
}

export interface RoleLike {
    id: string;
    name: string;
    description?: string | null;
    permissions: PermissionOption[];
}

export default function RoleFormModal({
    isOpen, onClose, mode, role, allPermissions, classic, onSubmit,
}: {
    isOpen: boolean;
    onClose: () => void;
    mode: 'create' | 'edit';
    role?: RoleLike;
    allPermissions: PermissionOption[];
    classic: boolean;
    onSubmit: (payload: RoleFormPayload) => Promise<{ ok: boolean; error?: string }>;
}) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [permissionIds, setPermissionIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setName(role?.name || '');
        setDescription(role?.description || '');
        setPermissionIds(role?.permissions?.map(p => p.id) || []);
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, role?.id]);

    const handleSubmit = async () => {
        setError('');
        if (!name.trim()) {
            setError('Role name is required');
            return;
        }
        setSubmitting(true);
        const res = await onSubmit({ name: name.trim(), description: description.trim() || null, permission_ids: permissionIds });
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
            title={<span><i className="bi bi-shield-lock me-2"></i>{mode === 'create' ? 'Add Role' : `Edit Role — ${role?.name}`}</span>}
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
                    >{submitting ? 'Saving…' : mode === 'create' ? 'Create Role' : 'Save Changes'}</button>
                </>
            }
        >
            {error && (
                <div className={classic ? '' : 'alert alert-danger py-2 small'} style={classic ? { background: '#f5e8e8', border: '1px solid #8e0000', color: '#8e0000', padding: '4px 8px', fontSize: 11, marginBottom: 10, fontFamily: 'Tahoma,Arial,sans-serif' } : undefined}>
                    {error}
                </div>
            )}

            <div className="mb-3">
                <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Role Name</label>
                <input
                    style={classic ? xpInput({ width: '100%' }) : undefined}
                    className={classic ? '' : 'form-control form-control-sm'}
                    placeholder="e.g. Warehouse Supervisor"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
            </div>

            <div className="mb-3">
                <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Description</label>
                <input
                    style={classic ? xpInput({ width: '100%' }) : undefined}
                    className={classic ? '' : 'form-control form-control-sm'}
                    placeholder="Optional"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                />
            </div>

            <div className="mb-1">
                <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Permissions</label>
                <PermissionsPicker
                    allPermissions={allPermissions}
                    selectedIds={permissionIds}
                    onChange={setPermissionIds}
                    classic={classic}
                />
            </div>
        </ModalWrapper>
    );
}
