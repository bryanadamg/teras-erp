'use client';

import { useEffect, useMemo, useState } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { xpBtn, xpInput, xpLabel } from '../shared/xpTheme';
import PermissionsPicker, { PermissionOption } from './PermissionsPicker';
import { useData } from '../../context/DataContext';

export interface RoleFormPayload {
    name: string;
    description: string | null;
    permission_ids: string[];
    allowed_work_center_types: string[] | null;
    allowed_categories: string[] | null;
    allowed_locations: string[] | null;
}

export interface RoleLike {
    id: string;
    name: string;
    description?: string | null;
    permissions: PermissionOption[];
    allowed_work_center_types?: string[] | null;
    allowed_categories?: string[] | null;
    allowed_locations?: string[] | null;
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
    const { workCenters, categories, locations } = useData();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [permissionIds, setPermissionIds] = useState<string[]>([]);
    const [allowedWcTypes, setAllowedWcTypes] = useState<string[]>([]);
    const [allowedCategories, setAllowedCategories] = useState<string[]>([]);
    const [allowedLocations, setAllowedLocations] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setName(role?.name || '');
        setDescription(role?.description || '');
        setPermissionIds(role?.permissions?.map(p => p.id) || []);
        setAllowedWcTypes(role?.allowed_work_center_types || []);
        setAllowedCategories(role?.allowed_categories || []);
        setAllowedLocations(role?.allowed_locations || []);
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, role?.id]);

    const wcTypes = useMemo(() => {
        const types = new Set<string>();
        for (const wc of workCenters) {
            if (wc.center_type) types.add(wc.center_type);
        }
        return Array.from(types).sort();
    }, [workCenters]);

    const selectedCodes = useMemo(() => {
        const selected = new Set(permissionIds);
        return new Set(allPermissions.filter(p => selected.has(p.id)).map(p => p.code));
    }, [permissionIds, allPermissions]);

    const hasWorkOrderPerm = useMemo(() => {
        for (const c of selectedCodes) if (c.startsWith('work_order.')) return true;
        return false;
    }, [selectedCodes]);

    const hasCategoryScopedPerm = useMemo(() => {
        for (const c of selectedCodes) if (c.startsWith('item.') || c.startsWith('stock_on_hand.')) return true;
        return false;
    }, [selectedCodes]);

    const hasLocationScopedPerm = useMemo(() => {
        for (const c of selectedCodes) if (c.startsWith('lot.')) return true;
        return false;
    }, [selectedCodes]);

    const toggleWcType = (t: string) => {
        setAllowedWcTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    };

    const toggleCategory = (id: string) => {
        setAllowedCategories(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleLocation = (id: string) => {
        setAllowedLocations(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleSubmit = async () => {
        setError('');
        if (!name.trim()) {
            setError('Role name is required');
            return;
        }
        setSubmitting(true);
        const res = await onSubmit({
            name: name.trim(),
            description: description.trim() || null,
            permission_ids: permissionIds,
            allowed_work_center_types: allowedWcTypes.length ? allowedWcTypes : null,
            allowed_categories: allowedCategories.length ? allowedCategories : null,
            allowed_locations: allowedLocations.length ? allowedLocations : null,
        });
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

            {hasWorkOrderPerm && wcTypes.length > 0 && (
                <div className="mt-3">
                    <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Work Order Station Scope</label>
                    <div className={classic ? '' : 'text-muted small mb-1'} style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#666', marginBottom: 4 } : undefined}>
                        Leave all unchecked to allow this role's Work Order actions on any station. Check one or more to restrict.
                    </div>
                    <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 8, background: '#ffffff', border: '1px solid #b0a898', padding: 6 } : undefined} className={classic ? '' : 'border rounded bg-white p-2 d-flex flex-wrap gap-3'}>
                        {wcTypes.map(t => (
                            <label key={t} style={classic ? { display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, cursor: 'pointer' } : undefined} className={classic ? '' : 'form-check-label small d-flex align-items-center gap-1'}>
                                <input type="checkbox" checked={allowedWcTypes.includes(t)} onChange={() => toggleWcType(t)} />
                                {t}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {hasCategoryScopedPerm && categories.length > 0 && (
                <div className="mt-3">
                    <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Item/Stock Category Scope</label>
                    <div className={classic ? '' : 'text-muted small mb-1'} style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#666', marginBottom: 4 } : undefined}>
                        Leave all unchecked to allow Item/Stock actions on any category. Check one or more to restrict.
                    </div>
                    <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 8, background: '#ffffff', border: '1px solid #b0a898', padding: 6, maxHeight: 160, overflowY: 'auto' as const } : { maxHeight: 160, overflowY: 'auto' as const }} className={classic ? '' : 'border rounded bg-white p-2 d-flex flex-wrap gap-3'}>
                        {categories.map((c: any) => (
                            <label key={c.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, cursor: 'pointer' } : undefined} className={classic ? '' : 'form-check-label small d-flex align-items-center gap-1'}>
                                <input type="checkbox" checked={allowedCategories.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                                {(c.path_names || [c.name]).join(' / ')}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {hasLocationScopedPerm && locations.length > 0 && (
                <div className="mt-3">
                    <label style={classic ? xpLabel() : undefined} className={classic ? '' : 'form-label small text-muted'}>Lot Management Location Scope</label>
                    <div className={classic ? '' : 'text-muted small mb-1'} style={classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#666', marginBottom: 4 } : undefined}>
                        Leave all unchecked to allow Lot actions at any location. Check one or more to restrict.
                    </div>
                    <div style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 8, background: '#ffffff', border: '1px solid #b0a898', padding: 6, maxHeight: 160, overflowY: 'auto' as const } : { maxHeight: 160, overflowY: 'auto' as const }} className={classic ? '' : 'border rounded bg-white p-2 d-flex flex-wrap gap-3'}>
                        {locations.map((l: any) => (
                            <label key={l.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, cursor: 'pointer' } : undefined} className={classic ? '' : 'form-check-label small d-flex align-items-center gap-1'}>
                                <input type="checkbox" checked={allowedLocations.includes(l.id)} onChange={() => toggleLocation(l.id)} />
                                {l.full_path || l.name}
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </ModalWrapper>
    );
}
