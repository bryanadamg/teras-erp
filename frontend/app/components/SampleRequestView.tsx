import { useState } from 'react';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';

export default function SampleRequestView({ samples, salesOrders, items, attributes, onCreateSample, onUpdateStatus, onDeleteSample }: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const [newSample, setNewSample] = useState({
      sales_order_id: '',
      base_item_id: '',
      attribute_value_ids: [] as string[],
      notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateSample(newSample);
      setNewSample({ sales_order_id: '', base_item_id: '', attribute_value_ids: [], notes: '' });
      setIsCreateOpen(false);
  };

  const handleValueChange = (valId: string, attrId: string) => {
      const attr = attributes.find((a: any) => a.id === attrId);
      if (!attr) return;

      const otherValues = newSample.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
      const newValues = valId ? [...otherValues, valId] : otherValues;
      setNewSample({...newSample, attribute_value_ids: newValues});
  };

  const getBoundAttributes = (itemId: string) => {
      const item = items.find((i: any) => i.id === itemId);
      if (!item || !item.attribute_ids) return [];
      return attributes.filter((a: any) => item.attribute_ids.includes(a.id));
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'APPROVED': return 'bg-success';
          case 'REJECTED': return 'bg-danger';
          case 'SENT': return 'bg-info text-dark';
          case 'IN_PRODUCTION': return 'bg-warning text-dark';
          default: return 'bg-secondary';
      }
  };

  const currentBoundAttrs = getBoundAttributes(newSample.base_item_id);
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getPONumber = (id: string) => salesOrders.find((s: any) => s.id === id)?.po_number || 'No PO';

  return (
    <div className="row g-4 fade-in">
       {/* Create Modal */}
       {isCreateOpen && (
       <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content shadow">
                    <div className="modal-header bg-primary bg-opacity-10 text-primary-emphasis">
                        <h5 className="modal-title"><i className="bi bi-eyedropper me-2"></i>New Sample Request</h5>
                        <button type="button" className="btn-close" onClick={() => setIsCreateOpen(false)}></button>
                    </div>
                    <div className="modal-body">
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label className="form-label">Link to Purchase Order (Optional)</label>
                                <select className="form-select" value={newSample.sales_order_id} onChange={e => setNewSample({...newSample, sales_order_id: e.target.value})}>
                                    <option value="">Select PO...</option>
                                    {salesOrders.map((so: any) => (
                                        <option key={so.id} value={so.id}>{so.po_number} - {so.customer_name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="mb-3">
                                <label className="form-label">Base Item (Prototype Model)</label>
                                <select className="form-select" value={newSample.base_item_id} onChange={e => setNewSample({...newSample, base_item_id: e.target.value, attribute_value_ids: []})} required>
                                    <option value="">Select Base Item...</option>
                                    {items.filter((i:any) => i.category !== 'Sample').map((item: any) => (
                                        <option key={item.id} value={item.id}>{item.name} ({item.code})</option>
                                    ))}
                                </select>
                            </div>

                            {currentBoundAttrs.length > 0 && (
                                <div className="mb-3 p-3 bg-light rounded border">
                                    <label className="form-label small text-muted mb-2">Define Configuration</label>
                                    <div className="row g-2">
                                        {currentBoundAttrs.map((attr: any) => (
                                            <div key={attr.id} className="col-md-6">
                                                <label className="form-label small mb-1">{attr.name}</label>
                                                <select 
                                                    className="form-select form-select-sm"
                                                    value={newSample.attribute_value_ids.find(vid => attr.values.some((v:any) => v.id === vid)) || ''}
                                                    onChange={e => handleValueChange(e.target.value, attr.id)}
                                                    required
                                                >
                                                    <option value="">Select {attr.name}...</option>
                                                    {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mb-3">
                                <label className="form-label">Notes</label>
                                <textarea className="form-control" rows={3} value={newSample.notes} onChange={e => setNewSample({...newSample, notes: e.target.value})} placeholder="e.g. Client requested softer fabric..."></textarea>
                            </div>

                            <div className="d-flex justify-content-end gap-2 mt-3">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>{t('cancel')}</button>
                                <button type="submit" className="btn btn-primary fw-bold px-4">Create Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
       </div>
       )}

       {/* List */}
       <div className="col-12">
          <div className="card h-100 shadow-sm border-0">
             <div className="card-header bg-white d-flex justify-content-between align-items-center">
                 <h5 className="card-title mb-0">{t('sample_requests')}</h5>
                 <button className="btn btn-sm btn-primary" onClick={() => setIsCreateOpen(true)}>
                     <i className="bi bi-plus-lg me-2"></i> {t('create')}
                 </button>
             </div>
             <div className="card-body p-0">
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th className="ps-4">Request Code</th>
                                <th>Related PO</th>
                                <th>Item Config</th>
                                <th>Status</th>
                                <th style={{width: '120px'}} className="text-end pe-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {samples.map((s: any) => (
                                <tr key={s.id}>
                                    <td className="ps-4">
                                        <div className="fw-bold font-monospace text-primary">{s.code}</div>
                                        <div className="small text-muted">{new Date(s.created_at).toLocaleDateString()}</div>
                                    </td>
                                    <td>
                                        {s.sales_order_id ? (
                                            <span className="badge bg-light text-dark border"><i className="bi bi-receipt me-1"></i>{getPONumber(s.sales_order_id)}</span>
                                        ) : <span className="text-muted small">-</span>}
                                    </td>
                                    <td>
                                        <div className="fw-medium">{getItemName(s.base_item_id)}</div>
                                        <div className="small text-muted d-flex gap-1 flex-wrap mt-1">
                                            {/* We need to resolve attr value names from IDs if not populated, assuming s.attribute_values is populated by backend */}
                                            {s.attribute_values && s.attribute_values.map((v:any) => (
                                                <span key={v.id} className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10">{v.value}</span>
                                            ))}
                                        </div>
                                        {s.notes && <div className="small text-muted fst-italic mt-1"><i className="bi bi-sticky me-1"></i>{s.notes}</div>}
                                    </td>
                                    <td><span className={`badge ${getStatusBadge(s.status)}`}>{s.status}</span></td>
                                    <td className="pe-4 text-end">
                                        <div className="dropdown">
                                            <button className="btn btn-sm btn-light border dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                                Update
                                            </button>
                                            <ul className="dropdown-menu dropdown-menu-end shadow">
                                                <li><button className="dropdown-item small" onClick={() => onUpdateStatus(s.id, 'IN_PRODUCTION')}>Mark In Production</button></li>
                                                <li><button className="dropdown-item small" onClick={() => onUpdateStatus(s.id, 'SENT')}>Mark Sent to Client</button></li>
                                                <li><hr className="dropdown-divider"/></li>
                                                <li><button className="dropdown-item small text-success" onClick={() => onUpdateStatus(s.id, 'APPROVED')}><i className="bi bi-check-lg me-2"></i>Client Approved</button></li>
                                                <li><button className="dropdown-item small text-danger" onClick={() => onUpdateStatus(s.id, 'REJECTED')}><i className="bi bi-x-lg me-2"></i>Client Rejected</button></li>
                                                <li><hr className="dropdown-divider"/></li>
                                                <li><button className="dropdown-item small text-danger" onClick={() => onDeleteSample(s.id)}>Delete Request</button></li>
                                            </ul>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {samples.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No sample requests found</td></tr>}
                        </tbody>
                    </table>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}
