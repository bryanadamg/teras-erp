'use client';

import { useState } from 'react';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';
import ModalWrapper from './ModalWrapper';

interface Partner {
    id: string;
    name: string;
    address?: string;
    type: string;
    active: boolean;
}

interface PartnersViewProps {
    partners: Partner[];
    type: 'CUSTOMER' | 'SUPPLIER';
    onCreate: (partner: any) => void;
    onUpdate: (id: string, partner: any) => void;
    onDelete: (id: string) => void;
}

export default function PartnersView({ partners, type, onCreate, onUpdate, onDelete }: PartnersViewProps) {
    const { showToast } = useToast();
    const { t } = useLanguage();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
    const [newPartner, setNewPartner] = useState({ name: '', address: '', type, active: true });

    const filteredPartners = partners.filter(p => p.type === type);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPartner.name) return;
        onCreate(newPartner);
        setNewPartner({ name: '', address: '', type, active: true });
        setIsCreateOpen(false);
    };

    const handleUpdateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPartner) return;
        onUpdate(editingPartner.id, {
            name: editingPartner.name,
            address: editingPartner.address,
            active: editingPartner.active
        });
        setEditingPartner(null);
    };

    const typeLabel = type === 'CUSTOMER' ? 'Customer' : 'Supplier';

    return (
        <div className="fade-in">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h4 className="mb-0">{typeLabel} Management</h4>
                    <p className="text-muted small">Maintain your network of {typeLabel.toLowerCase()}s</p>
                </div>
                <button className="btn btn-primary shadow-sm" onClick={() => setIsCreateOpen(true)}>
                    <i className="bi bi-plus-lg me-2"></i>Add {typeLabel}
                </button>
            </div>

            <div className="card border-0 shadow-sm">
                <div className="card-body p-0">
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th className="ps-4">Name</th>
                                    <th>Address</th>
                                    <th>Status</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPartners.map(p => (
                                    <tr key={p.id}>
                                        <td className="ps-4 fw-bold">{p.name}</td>
                                        <td className="text-muted small">{p.address || '-'}</td>
                                        <td>
                                            <span className={`badge ${p.active ? 'bg-success' : 'bg-secondary'}`}>
                                                {p.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="text-end pe-4">
                                            <button className="btn btn-sm btn-link text-primary" onClick={() => setEditingPartner(p)}>
                                                <i className="bi bi-pencil-square"></i>
                                            </button>
                                            <button className="btn btn-sm btn-link text-danger" onClick={() => onDelete(p.id)}>
                                                <i className="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPartners.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="text-center py-5 text-muted">
                                            No {typeLabel.toLowerCase()}s found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            <ModalWrapper
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                title={<><i className="bi bi-plus-circle me-1"></i> Add New {typeLabel}</>}
                variant="primary"
                footer={
                    <>
                        <button type="button" className="btn btn-sm btn-link text-muted" onClick={() => setIsCreateOpen(false)}>Cancel</button>
                        <button type="button" className="btn btn-sm btn-primary px-4 fw-bold" onClick={handleSubmit}>CREATE {typeLabel.toUpperCase()}</button>
                    </>
                }
            >
                <div className="mb-3">
                    <label className="form-label small fw-bold">Name</label>
                    <input 
                        className="form-control" 
                        value={newPartner.name} 
                        onChange={e => setNewPartner({...newPartner, name: e.target.value})} 
                        required 
                        placeholder={`Enter ${typeLabel.toLowerCase()} name...`}
                    />
                </div>
                <div className="mb-3">
                    <label className="form-label small fw-bold">Address (Optional)</label>
                    <textarea 
                        className="form-control" 
                        rows={3} 
                        value={newPartner.address} 
                        onChange={e => setNewPartner({...newPartner, address: e.target.value})}
                        placeholder="Street, City, Zip Code..."
                    ></textarea>
                </div>
            </ModalWrapper>

            {/* Edit Modal */}
            <ModalWrapper
                isOpen={!!editingPartner}
                onClose={() => setEditingPartner(null)}
                title={<><i className="bi bi-pencil-square me-1"></i> Edit {typeLabel}</>}
                variant="info"
                footer={
                    <>
                        <button type="button" className="btn btn-sm btn-link text-muted" onClick={() => setEditingPartner(null)}>Cancel</button>
                        <button type="button" className="btn btn-sm btn-info text-white px-4 fw-bold" onClick={handleUpdateSubmit}>SAVE CHANGES</button>
                    </>
                }
            >
                {editingPartner && (
                    <>
                        <div className="mb-3">
                            <label className="form-label small fw-bold">Name</label>
                            <input 
                                className="form-control" 
                                value={editingPartner.name} 
                                onChange={e => setEditingPartner({...editingPartner, name: e.target.value})} 
                                required 
                            />
                        </div>
                        <div className="mb-3">
                            <label className="form-label small fw-bold">Address (Optional)</label>
                            <textarea 
                                className="form-control" 
                                rows={3} 
                                value={editingPartner.address || ''} 
                                onChange={e => setEditingPartner({...editingPartner, address: e.target.value})}
                            ></textarea>
                        </div>
                        <div className="form-check form-switch mt-3">
                            <input 
                                className="form-check-input" 
                                type="checkbox" 
                                checked={editingPartner.active} 
                                onChange={e => setEditingPartner({...editingPartner, active: e.target.checked})}
                            />
                            <label className="form-check-label small fw-bold">Active {typeLabel}</label>
                        </div>
                    </>
                )}
            </ModalWrapper>
        </div>
    );
}
