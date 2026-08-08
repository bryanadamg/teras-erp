'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import ModalWrapper from '../shared/ModalWrapper';
import Pager from '../shared/Pager';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { StatusChip, useFloatingMenu, MenuTriggerButton, FloatingMenu, xpFont } from '../shared/xpTheme';
import { lvBtn, lvInput, lvTh, lvTd, lvLabel } from '../shared/listViewTheme';
import { ShellWindow, ShellTitleBar, xpToolbar, SearchField, ToolbarCount } from '../shared/shellTheme';

const PARTNERS_PAGE_SIZE = 20;

interface Partner {
    id: string;
    name: string;
    address?: string;
    contact_person?: string;
    phone?: string;
    fax?: string;
    email?: string;
    type: string;
    active: boolean;
}

interface PartnersViewProps {
    partners: Partner[];
    type: 'CUSTOMER' | 'SUPPLIER';
    onCreate: (partner: any) => void;
    onUpdate: (id: string, partner: any) => void;
    onDelete: (id: string) => void;
    onBulkDelete?: (ids: string[]) => void;
}

export default function PartnersView({ partners, type, onCreate, onUpdate, onDelete, onBulkDelete }: PartnersViewProps) {
    const { showToast } = useToast();
    const { t } = useLanguage();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
    const [newPartner, setNewPartner] = useState({ name: '', address: '', contact_person: '', phone: '', fax: '', email: '', type, active: true });
    const [deletingPartner, setDeletingPartner] = useState<Partner | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { uiStyle: currentStyle } = useTheme();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
    const [page, setPage] = useState(1);
    const { openId: menuOpenId, pos: menuPos, toggle: menuToggle, close: menuClose } = useFloatingMenu(140);

    useEffect(() => {
        setSelectedIds(new Set());
        setPage(1);
    }, [searchTerm]);

    const classic = currentStyle === 'classic';
    const typeLabel = type === 'CUSTOMER' ? 'Customer' : 'Supplier';
    const { hasPermission, hasAnyPermission } = useUser();
    const canManage = type === 'CUSTOMER'
        ? hasAnyPermission('customer.create', 'customer.edit', 'customer.delete')
        : hasAnyPermission('supplier.create', 'supplier.edit', 'supplier.delete');

    // Button/input/cell/label chrome sourced from the shared lv* helpers (pinned to
    // classic=true — this constant is only ever used inside `classic ? ... : undefined`
    // branches below) instead of re-declaring the same CSS values locally.
    const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => lvBtn(true, extra);
    const xpInput: React.CSSProperties = lvInput(true);
    const xpSep: React.CSSProperties = {
        width: '1px',
        height: '20px',
        background: '#a0988c',
        margin: '0 2px',
        flexShrink: 0,
    };
    const xpThCell: React.CSSProperties = lvTh(true);
    const xpTableHeader: React.CSSProperties = {
        background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
        borderBottom: '2px solid #808080',
    };
    const tdBase: React.CSSProperties = lvTd(true);
    const xpLabel: React.CSSProperties = lvLabel(true);

    const filteredPartners = partners.filter(p =>
        p.type === type &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (p.address || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const pages = Math.max(1, Math.ceil(filteredPartners.length / PARTNERS_PAGE_SIZE));
    const clampedPage = Math.min(page, pages);
    const pagedPartners = filteredPartners.slice((clampedPage - 1) * PARTNERS_PAGE_SIZE, clampedPage * PARTNERS_PAGE_SIZE);

    const allSelected = filteredPartners.length > 0 && selectedIds.size === filteredPartners.length;
    const someSelected = selectedIds.size > 0;

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredPartners.map(p => p.id)));
        }
    };

    const confirmBulkDelete = () => {
        const ids = Array.from(selectedIds);
        if (onBulkDelete) {
            onBulkDelete(ids);
        } else {
            ids.forEach(id => onDelete(id));
        }
        setSelectedIds(new Set());
        setShowBulkDeleteConfirm(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPartner.name) return;
        onCreate(newPartner);
        setNewPartner({ name: '', address: '', contact_person: '', phone: '', fax: '', email: '', type, active: true });
        setIsCreateOpen(false);
    };

    const handleUpdateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPartner) return;
        onUpdate(editingPartner.id, {
            name: editingPartner.name,
            address: editingPartner.address,
            contact_person: editingPartner.contact_person,
            phone: editingPartner.phone,
            fax: editingPartner.fax,
            email: editingPartner.email,
            active: editingPartner.active
        });
        setEditingPartner(null);
    };

    const handleDelete = (p: Partner) => {
        setDeletingPartner(p);
    };

    const confirmDelete = () => {
        if (!deletingPartner) return;
        onDelete(deletingPartner.id);
        setDeletingPartner(null);
    };

    return (
        <ShellWindow classic={classic} fill="page" className="fade-in">
            <ShellTitleBar
                classic={classic}
                icon="bi-people-fill"
                title={`${typeLabel} Management`}
                subtitle={`Maintain your network of ${typeLabel.toLowerCase()}s`}
                right={canManage && (classic ? (
                    <button
                        style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' })}
                        onClick={() => setIsCreateOpen(true)}
                    >
                        <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>Add {typeLabel}
                    </button>
                ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => setIsCreateOpen(true)}>
                        <i className="bi bi-plus-lg me-2"></i>Add {typeLabel}
                    </button>
                ))}
            />

                {/* ── Secondary toolbar: search + count ── */}
                <div
                    style={classic ? xpToolbar() : undefined}
                    className={classic ? '' : 'px-3 py-2 border-bottom d-flex align-items-center gap-3 bg-white'}
                >
                    <SearchField
                        classic={classic}
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder={`Search ${typeLabel.toLowerCase()}s…`}
                        width={280}
                        grow
                    />
                    {classic && <div style={xpSep}></div>}
                    <ToolbarCount classic={classic}>
                        {filteredPartners.length} {typeLabel}{filteredPartners.length !== 1 ? 's' : ''}
                    </ToolbarCount>
                </div>

                {/* ── Bulk action bar ── */}
                {canManage && someSelected && (
                    classic ? (
                        <div style={xpToolbar({ background: '#fff8e1', borderBottom: '1px solid #e0c060' })}>
                            <span style={{ fontFamily: xpFont, fontSize: '11px', color: '#665500', fontWeight: 'bold' }}>
                                {selectedIds.size} selected
                            </span>
                            <div style={xpSep}></div>
                            <button
                                style={xpBtn({ background: 'linear-gradient(to bottom, #c84040, #8e0000)', borderColor: '#8e0000 #5e0000 #5e0000 #8e0000', color: '#ffffff', fontWeight: 'bold' })}
                                onClick={() => setShowBulkDeleteConfirm(true)}
                            >
                                <i className="bi bi-trash" style={{ marginRight: 4 }}></i>Delete Selected
                            </button>
                            <button
                                style={xpBtn()}
                                onClick={() => setSelectedIds(new Set())}
                            >Clear</button>
                        </div>
                    ) : (
                        <div className="px-3 py-2 border-bottom d-flex align-items-center gap-3" style={{ background: '#fff8e1' }}>
                            <span className="small fw-bold" style={{ color: '#665500' }}>{selectedIds.size} selected</span>
                            <button className="btn btn-sm btn-danger" onClick={() => setShowBulkDeleteConfirm(true)}>
                                <i className="bi bi-trash me-1"></i>Delete Selected
                            </button>
                            <button className="btn btn-sm btn-link text-muted p-0" onClick={() => setSelectedIds(new Set())}>Clear</button>
                        </div>
                    )
                )}

                {/* ── Table ── */}
                <div
                    className={classic ? '' : 'card-body p-0'}
                    style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
                >
                    <div className="table-responsive" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                        <table
                            className={classic ? '' : 'table table-hover align-middle mb-0'}
                            style={classic ? { width: '100%', borderCollapse: 'collapse', background: '#fff' } : undefined}
                        >
                            <thead style={classic ? xpTableHeader : undefined} className={classic ? '' : 'table-light'}>
                                <tr>
                                    <th style={classic ? { ...xpThCell, width: '28px', textAlign: 'center' as const } : undefined} className={classic ? '' : 'ps-3'}>
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                                            onChange={toggleSelectAll}
                                            title="Select all"
                                            style={classic ? { cursor: 'pointer' } : undefined}
                                        />
                                    </th>
                                    <th style={classic ? { ...xpThCell, width: '30%' } : undefined} className={classic ? '' : 'ps-2'}>Name</th>
                                    <th style={classic ? xpThCell : undefined}>Address</th>
                                    <th style={classic ? { ...xpThCell, width: '80px' } : undefined}>Status</th>
                                    <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none', width: '80px' } : undefined} className={classic ? '' : 'text-end pe-4'}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedPartners.map((p, rowIndex) => (
                                    <tr
                                        key={p.id}
                                        style={classic ? { background: selectedIds.has(p.id) ? '#e8f0f8' : rowIndex % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' } : undefined}
                                        className={classic ? '' : selectedIds.has(p.id) ? 'table-active' : ''}
                                    >
                                        <td style={classic ? { ...tdBase, textAlign: 'center' as const } : undefined} className={classic ? '' : 'ps-3'}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(p.id)}
                                                onChange={() => toggleSelect(p.id)}
                                                style={classic ? { cursor: 'pointer' } : undefined}
                                            />
                                        </td>
                                        <td style={classic ? { ...tdBase, fontWeight: 'bold' } : undefined} className={classic ? '' : 'ps-2 fw-bold'}>
                                            {p.name}
                                        </td>
                                        <td style={classic ? { ...tdBase, color: '#555' } : undefined} className={classic ? '' : 'text-muted small'}>
                                            {p.address || <span style={classic ? { color: '#aaa' } : undefined} className={classic ? '' : 'fst-italic'}>—</span>}
                                        </td>
                                        <td style={classic ? tdBase : undefined} className={classic ? '' : 'text-muted small'}>
                                            <StatusChip status={p.active ? 'ACTIVE' : 'INACTIVE'} />
                                        </td>
                                        <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' as const } : undefined} className={classic ? '' : 'text-end pe-4'}>
                                            {canManage && <MenuTriggerButton classic={classic} onClick={e => menuToggle(p.id, e)} />}
                                        </td>
                                    </tr>
                                ))}
                                {filteredPartners.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'center', padding: '24px 8px', color: '#888', fontStyle: 'italic' } : undefined}
                                            className={classic ? '' : 'text-center py-5 text-muted'}
                                        >
                                            {searchTerm
                                                ? `No ${typeLabel.toLowerCase()}s match "${searchTerm}"`
                                                : `No ${typeLabel.toLowerCase()}s found. Add one to get started.`}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <Pager page={clampedPage} total={filteredPartners.length} pageSize={PARTNERS_PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />

                {/* ── Status bar ── */}
                {classic && (
                    <div style={{
                        background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)',
                        borderTop: '1px solid #b0a898',
                        padding: '2px 8px',
                        display: 'flex',
                        gap: '12px',
                        fontFamily: xpFont,
                        fontSize: '10px',
                        color: '#333',
                    }}>
                        <span>{partners.filter(p => p.type === type).length} total</span>
                        <span>|</span>
                        <span>{partners.filter(p => p.type === type && p.active).length} active</span>
                    </div>
                )}

            {/* Row ⋯ menu: Edit / Delete */}
            {menuOpenId && (() => {
                const p = pagedPartners.find(x => String(x.id) === menuOpenId);
                if (!p || !canManage) return null;
                return (
                    <FloatingMenu
                        pos={menuPos}
                        items={[
                            { key: 'edit', label: 'Edit', icon: 'bi-pencil-square', onClick: () => { menuClose(); setEditingPartner(p); } },
                            { key: 'delete', label: 'Delete', icon: 'bi-trash', danger: true, onClick: () => { menuClose(); handleDelete(p); } },
                        ]}
                    />
                );
            })()}

            {/* Create Modal */}
            <ModalWrapper
                isOpen={isCreateOpen}
                modeless
                onClose={() => setIsCreateOpen(false)}
                title={<><i className="bi bi-plus-circle me-1"></i> Add New {typeLabel}</>}
                variant="primary"
                footer={
                    <>
                        <button
                            type="button"
                            style={classic ? xpBtn() : undefined}
                            className={classic ? '' : 'btn btn-sm btn-link text-muted'}
                            onClick={() => setIsCreateOpen(false)}
                        >Cancel</button>
                        <button
                            type="button"
                            style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#ffffff', fontWeight: 'bold' }) : undefined}
                            className={classic ? '' : 'btn btn-sm btn-primary px-4 fw-bold'}
                            onClick={handleSubmit}
                        >CREATE {typeLabel.toUpperCase()}</button>
                    </>
                }
            >
                <div className="mb-3">
                    <label
                        style={classic ? xpLabel : undefined}
                        className={classic ? '' : 'form-label small fw-bold'}
                    >Name</label>
                    <input
                        style={classic ? xpInput : undefined}
                        className={classic ? '' : 'form-control'}
                        value={newPartner.name}
                        onChange={e => setNewPartner({...newPartner, name: e.target.value})}
                        required
                        placeholder={`Enter ${typeLabel.toLowerCase()} name…`}
                        autoFocus
                    />
                </div>
                <div className="mb-3">
                    <label
                        style={classic ? xpLabel : undefined}
                        className={classic ? '' : 'form-label small fw-bold'}
                    >Address <span style={classic ? { fontWeight: 'normal', color: '#666' } : undefined} className={classic ? '' : 'fw-normal text-muted'}>(Optional)</span></label>
                    <textarea
                        style={classic ? { ...xpInput, height: 'auto', padding: '4px 6px', width: '100%', resize: 'vertical' as const } : undefined}
                        className={classic ? '' : 'form-control'}
                        rows={3}
                        value={newPartner.address}
                        onChange={e => setNewPartner({...newPartner, address: e.target.value})}
                        placeholder="Street, City, Zip Code…"
                    ></textarea>
                </div>
                <div className="mb-3">
                    <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Contact Person <span style={classic ? { fontWeight: 'normal', color: '#666' } : undefined} className={classic ? '' : 'fw-normal text-muted'}>(Attn)</span></label>
                    <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={newPartner.contact_person} onChange={e => setNewPartner({...newPartner, contact_person: e.target.value})} placeholder="e.g. Pak Nicolas" />
                </div>
                <div className="row g-2 mb-3">
                    <div className="col-6">
                        <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Phone / Telp</label>
                        <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={newPartner.phone} onChange={e => setNewPartner({...newPartner, phone: e.target.value})} placeholder="e.g. 021 5869948" />
                    </div>
                    <div className="col-6">
                        <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Fax</label>
                        <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={newPartner.fax} onChange={e => setNewPartner({...newPartner, fax: e.target.value})} placeholder="e.g. 021 5868012" />
                    </div>
                </div>
                <div className="mb-3">
                    <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Email</label>
                    <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={newPartner.email} onChange={e => setNewPartner({...newPartner, email: e.target.value})} placeholder="e.g. sales@supplier.com" />
                </div>
            </ModalWrapper>

            {/* Delete Confirmation Modal */}
            <ModalWrapper
                isOpen={!!deletingPartner}
                onClose={() => setDeletingPartner(null)}
                title={<><i className="bi bi-trash me-1"></i> Delete {typeLabel}</>}
                variant="danger"
                size="sm"
                footer={
                    <>
                        <button
                            type="button"
                            style={classic ? xpBtn() : undefined}
                            className={classic ? '' : 'btn btn-sm btn-link text-muted'}
                            onClick={() => setDeletingPartner(null)}
                        >Cancel</button>
                        <button
                            type="button"
                            style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #c84040, #8e0000)', borderColor: '#8e0000 #5e0000 #5e0000 #8e0000', color: '#ffffff', fontWeight: 'bold' }) : undefined}
                            className={classic ? '' : 'btn btn-sm btn-danger px-4 fw-bold'}
                            onClick={confirmDelete}
                        >DELETE</button>
                    </>
                }
            >
                <p style={classic ? { fontFamily: xpFont, fontSize: '11px', margin: 0 } : undefined} className={classic ? '' : 'mb-0'}>
                    Delete <strong>{deletingPartner?.name}</strong>? This action cannot be undone.
                </p>
            </ModalWrapper>

            {/* Bulk Delete Confirmation Modal */}
            <ModalWrapper
                isOpen={showBulkDeleteConfirm}
                onClose={() => setShowBulkDeleteConfirm(false)}
                title={<><i className="bi bi-trash me-1"></i> Delete {selectedIds.size} {typeLabel}{selectedIds.size !== 1 ? 's' : ''}</>}
                variant="danger"
                size="sm"
                footer={
                    <>
                        <button
                            type="button"
                            style={classic ? xpBtn() : undefined}
                            className={classic ? '' : 'btn btn-sm btn-link text-muted'}
                            onClick={() => setShowBulkDeleteConfirm(false)}
                        >Cancel</button>
                        <button
                            type="button"
                            style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #c84040, #8e0000)', borderColor: '#8e0000 #5e0000 #5e0000 #8e0000', color: '#ffffff', fontWeight: 'bold' }) : undefined}
                            className={classic ? '' : 'btn btn-sm btn-danger px-4 fw-bold'}
                            onClick={confirmBulkDelete}
                        >DELETE ALL</button>
                    </>
                }
            >
                <p style={classic ? { fontFamily: xpFont, fontSize: '11px', margin: 0 } : undefined} className={classic ? '' : 'mb-0'}>
                    Delete <strong>{selectedIds.size} {typeLabel.toLowerCase()}{selectedIds.size !== 1 ? 's' : ''}</strong>? This action cannot be undone.
                </p>
            </ModalWrapper>

            {/* Edit Modal */}
            <ModalWrapper
                isOpen={!!editingPartner}
                modeless
                onClose={() => setEditingPartner(null)}
                title={<><i className="bi bi-pencil-square me-1"></i> Edit {typeLabel}</>}
                variant="info"
                footer={
                    <>
                        <button
                            type="button"
                            style={classic ? xpBtn() : undefined}
                            className={classic ? '' : 'btn btn-sm btn-link text-muted'}
                            onClick={() => setEditingPartner(null)}
                        >Cancel</button>
                        <button
                            type="button"
                            style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #006e8e, #004a5e)', borderColor: '#004a5e #001a2e #001a2e #004a5e', color: '#ffffff', fontWeight: 'bold' }) : undefined}
                            className={classic ? '' : 'btn btn-sm btn-info text-white px-4 fw-bold'}
                            onClick={handleUpdateSubmit}
                        >SAVE CHANGES</button>
                    </>
                }
            >
                {editingPartner && (
                    <>
                        <div className="mb-3">
                            <label
                                style={classic ? xpLabel : undefined}
                                className={classic ? '' : 'form-label small fw-bold'}
                            >Name</label>
                            <input
                                style={classic ? xpInput : undefined}
                                className={classic ? '' : 'form-control'}
                                value={editingPartner.name}
                                onChange={e => setEditingPartner({...editingPartner, name: e.target.value})}
                                required
                            />
                        </div>
                        <div className="mb-3">
                            <label
                                style={classic ? xpLabel : undefined}
                                className={classic ? '' : 'form-label small fw-bold'}
                            >Address <span style={classic ? { fontWeight: 'normal', color: '#666' } : undefined} className={classic ? '' : 'fw-normal text-muted'}>(Optional)</span></label>
                            <textarea
                                style={classic ? { ...xpInput, height: 'auto', padding: '4px 6px', width: '100%', resize: 'vertical' as const } : undefined}
                                className={classic ? '' : 'form-control'}
                                rows={3}
                                value={editingPartner.address || ''}
                                onChange={e => setEditingPartner({...editingPartner, address: e.target.value})}
                            ></textarea>
                        </div>
                        <div className="mb-3">
                            <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Contact Person <span style={classic ? { fontWeight: 'normal', color: '#666' } : undefined} className={classic ? '' : 'fw-normal text-muted'}>(Attn)</span></label>
                            <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={editingPartner.contact_person || ''} onChange={e => setEditingPartner({...editingPartner, contact_person: e.target.value})} placeholder="e.g. Pak Nicolas" />
                        </div>
                        <div className="row g-2 mb-3">
                            <div className="col-6">
                                <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Phone / Telp</label>
                                <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={editingPartner.phone || ''} onChange={e => setEditingPartner({...editingPartner, phone: e.target.value})} placeholder="e.g. 021 5869948" />
                            </div>
                            <div className="col-6">
                                <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Fax</label>
                                <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={editingPartner.fax || ''} onChange={e => setEditingPartner({...editingPartner, fax: e.target.value})} placeholder="e.g. 021 5868012" />
                            </div>
                        </div>
                        <div className="mb-3">
                            <label style={classic ? xpLabel : undefined} className={classic ? '' : 'form-label small fw-bold'}>Email</label>
                            <input style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} value={editingPartner.email || ''} onChange={e => setEditingPartner({...editingPartner, email: e.target.value})} placeholder="e.g. sales@supplier.com" />
                        </div>
                        <div style={classic ? { marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 } : undefined} className={classic ? '' : 'form-check mt-3'}>
                            <input
                                style={classic ? { cursor: 'pointer' } : undefined}
                                className={classic ? '' : 'form-check-input'}
                                type="checkbox"
                                id="activeCheck"
                                checked={editingPartner.active}
                                onChange={e => setEditingPartner({...editingPartner, active: e.target.checked})}
                            />
                            <label
                                style={classic ? { fontFamily: xpFont, fontSize: '11px', color: '#000', cursor: 'pointer' } : undefined}
                                className={classic ? '' : 'form-check-label small fw-bold'}
                                htmlFor="activeCheck"
                            >Active {typeLabel}</label>
                        </div>
                    </>
                )}
            </ModalWrapper>
        </ShellWindow>
    );
}
