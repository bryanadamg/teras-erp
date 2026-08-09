'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ModalWrapper from '../shared/ModalWrapper';
import { xpInput, xpFont, FieldLabel, ToggleChip, ModalFooterActions } from '../shared/xpTheme';
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

    /* Scope pickers use the app-wide on/off chip (ToggleChip) rather than bare
       checkboxes — a wall of checkboxes made a restricted role hard to read
       back, and a per-view selected state would be a fourth chip look. */
    const scopeBox = (scroll: boolean, children: React.ReactNode) => (
        <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 4,
            background: '#ffffff',
            border: classic ? '1px solid #b0a898' : '1px solid #dee2e6',
            borderRadius: classic ? 0 : 4,
            padding: 6,
            ...(scroll ? { maxHeight: 160, overflowY: 'auto' as const } : {}),
        }}>{children}</div>
    );

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
            /* Permission matrix needs the width: at md every resource row wrapped
               its action chips onto three lines. */
            size="xl"
            footer={
                <ModalFooterActions
                    classic={classic}
                    onCancel={onClose}
                    onSubmit={handleSubmit}
                    submitting={submitting}
                    submitLabel={mode === 'create' ? 'Create Role' : 'Save Changes'}
                    variant={mode === 'create' ? 'success' : 'primary'}
                />
            }
        >
            {error && (
                <div className={classic ? '' : 'alert alert-danger py-2 small'} style={classic ? { background: '#f5e8e8', border: '1px solid #8e0000', color: '#8e0000', padding: '4px 8px', fontSize: 11, marginBottom: 10, fontFamily: xpFont } : undefined}>
                    {error}
                </div>
            )}

            <div className="mb-3">
                <FieldLabel classic={classic}>Role Name</FieldLabel>
                <input
                    style={classic ? xpInput({ width: '100%' }) : undefined}
                    className={classic ? '' : 'form-control form-control-sm'}
                    placeholder="e.g. Warehouse Supervisor"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
            </div>

            <div className="mb-3">
                <FieldLabel classic={classic}>Description</FieldLabel>
                <input
                    style={classic ? xpInput({ width: '100%' }) : undefined}
                    className={classic ? '' : 'form-control form-control-sm'}
                    placeholder="Optional"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                />
            </div>

            <div className="mb-1">
                <FieldLabel classic={classic}>Permissions</FieldLabel>
                <PermissionsPicker
                    allPermissions={allPermissions}
                    selectedIds={permissionIds}
                    onChange={setPermissionIds}
                    classic={classic}
                />
            </div>

            {hasWorkOrderPerm && wcTypes.length > 0 && (
                <div className="mt-3">
                    <FieldLabel classic={classic} hint="Leave all off to allow this role's Work Order actions on any station. Turn one or more on to restrict.">
                        Work Order Station Scope
                    </FieldLabel>
                    {scopeBox(false, wcTypes.map(t => (
                        <ToggleChip key={t} on={allowedWcTypes.includes(t)} onClick={() => toggleWcType(t)} classic={classic}>{t}</ToggleChip>
                    )))}
                </div>
            )}

            {hasCategoryScopedPerm && categories.length > 0 && (
                <div className="mt-3">
                    <FieldLabel classic={classic} hint="Leave all off to allow Item/Stock actions on any category. Turn one or more on to restrict.">
                        Item/Stock Category Scope
                    </FieldLabel>
                    {scopeBox(true, categories.map((c: any) => (
                        <ToggleChip key={c.id} on={allowedCategories.includes(c.id)} onClick={() => toggleCategory(c.id)} classic={classic}>
                            {(c.path_names || [c.name]).join(' / ')}
                        </ToggleChip>
                    )))}
                </div>
            )}

            {hasLocationScopedPerm && locations.length > 0 && (
                <div className="mt-3">
                    <FieldLabel classic={classic} hint="Leave all off to allow Lot actions at any location. Turn one or more on to restrict.">
                        Lot Management Location Scope
                    </FieldLabel>
                    {scopeBox(true, locations.map((l: any) => (
                        <ToggleChip key={l.id} on={allowedLocations.includes(l.id)} onClick={() => toggleLocation(l.id)} classic={classic}>
                            {l.full_path || l.name}
                        </ToggleChip>
                    )))}
                </div>
            )}
        </ModalWrapper>
    );
}
