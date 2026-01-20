import { useState } from 'react';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';

export default function PurchaseOrderView({ items, attributes, salesOrders, onCreatePO, onDeletePO }: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const [newPO, setNewPO] = useState({
      po_number: '',
      customer_name: '',
      order_date: new Date().toISOString().split('T')[0],
      lines: [] as any[]
  });
  
  const [newLine, setNewLine] = useState({ item_id: '', qty: 0, due_date: '', attribute_value_ids: [] as string[] });

  const handleAddLine = () => {
      if (!newLine.item_id || newLine.qty <= 0) return;
      setNewPO({ ...newPO, lines: [...newPO.lines, { ...newLine }] });
      setNewLine({ item_id: '', qty: 0, due_date: '', attribute_value_ids: [] });
  };

  const handleRemoveLine = (index: number) => {
      setNewPO({ ...newPO, lines: newPO.lines.filter((_, i) => i !== index) });
  };

  const handleValueChange = (valId: string, attrId: string) => {
      const attr = attributes.find((a: any) => a.id === attrId);
      if (!attr) return;

      const otherValues = newLine.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
      const newValues = valId ? [...otherValues, valId] : otherValues;
      setNewLine({...newLine, attribute_value_ids: newValues});
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      const payload = {
          ...newPO,
          order_date: newPO.order_date || null,
          lines: newPO.lines.map((line: any) => ({
              ...line,
              due_date: line.due_date || null
          }))
      };

      onCreatePO(payload);
      setNewPO({ po_number: '', customer_name: '', order_date: new Date().toISOString().split('T')[0], lines: [] });
      setIsCreateOpen(false);
  };

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getItemCode = (id: string) => items.find((i: any) => i.id === id)?.code || id;
  const isSample = (id: string) => items.find((i: any) => i.id === id)?.category === 'Sample';

  const getBoundAttributes = (itemId: string) => {
      const item = items.find((i: any) => i.id === itemId);
      if (!item || !item.attribute_ids) return [];
      return attributes.filter((a: any) => item.attribute_ids.includes(a.id));
  };

  const currentBoundAttrs = getBoundAttributes(newLine.item_id);

  const getAttributeValueName = (valId: string) => {
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  return (
    <div className="row g-4 fade-in">
       {/* Create PO Modal */}
       {isCreateOpen && (
       <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
            <div className="modal-dialog modal-lg modal-dialog-centered">
                <div className="modal-content shadow">
                    <div className="modal-header bg-primary bg-opacity-10 text-primary-emphasis">
                        <h5 className="modal-title"><i className="bi bi-cart-plus me-2"></i>Create Purchase Order (Incoming)</h5>
                        <button type="button" className="btn-close" onClick={() => setIsCreateOpen(false)}></button>
                    </div>
                    <div className="modal-body">
                        <form onSubmit={handleSubmit}>
                            <div className="row g-3 mb-3">
                                <div className="col-md-4">
                                    <label className="form-label small text-muted">PO Number</label>
                                    <input className="form-control" placeholder="PO-2024-001" value={newPO.po_number} onChange={e => setNewPO({...newPO, po_number: e.target.value})} required />
                                </div>
                                <div className="col-md-5">
                                    <label className="form-label small text-muted">Customer Name</label>
                                    <input className="form-control" placeholder="Client Name" value={newPO.customer_name} onChange={e => setNewPO({...newPO, customer_name: e.target.value})} required />
                                </div>
                                <div className="col-md-3">
                                    <label className="form-label small text-muted">Date</label>
                                    <input type="date" className="form-control" value={newPO.order_date} onChange={e => setNewPO({...newPO, order_date: e.target.value})} required />
                                </div>
                            </div>
                            
                            <h6 className="small text-uppercase text-muted fw-bold mb-3">Order Items (Samples)</h6>
                            <div className="bg-light p-3 rounded-3 mb-3 border border-dashed">
                                <div className="row g-2 mb-3">
                                    <div className="col-6">
                                        <label className="form-label small text-muted">Item</label>
                                        <select className="form-select form-select-sm" value={newLine.item_id} onChange={e => setNewLine({...newLine, item_id: e.target.value, attribute_value_ids: []})}>
                                            <option value="">Select Item...</option>
                                            {items.map((item: any) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} ({item.code}) {item.category === 'Sample' ? '★' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-3">
                                        <label className="form-label small text-muted">Qty</label>
                                        <input type="number" className="form-control form-control-sm" placeholder="0" value={newLine.qty} onChange={e => setNewLine({...newLine, qty: parseFloat(e.target.value)})} />
                                    </div>
                                    <div className="col-3 d-flex align-items-end">
                                        <button type="button" className="btn btn-secondary btn-sm w-100" onClick={handleAddLine} disabled={!newLine.item_id}>Add</button>
                                    </div>
                                    
                                    {/* Attribute Selection */}
                                    {currentBoundAttrs.length > 0 && (
                                        <div className="col-12 mt-2">
                                            <div className="card card-body bg-white border-0 shadow-sm p-2">
                                                <small className="text-muted fw-bold mb-2 d-block">Variants</small>
                                                <div className="row g-2">
                                                    {currentBoundAttrs.map((attr: any) => (
                                                        <div key={attr.id} className="col-md-4">
                                                            <select 
                                                                className="form-select form-select-sm"
                                                                value={newLine.attribute_value_ids.find(vid => attr.values.some((v:any) => v.id === vid)) || ''}
                                                                onChange={e => handleValueChange(e.target.value, attr.id)}
                                                            >
                                                                <option value="">Any {attr.name}</option>
                                                                {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                                            </select>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="mt-2">
                                    {newPO.lines.map((line: any, idx) => (
                                        <div key={idx} className="d-flex justify-content-between align-items-center p-2 bg-white rounded border mb-1 small shadow-sm">
                                            <div>
                                                <span className="fw-bold">{getItemName(line.item_id)}</span>
                                                <span className="text-muted ms-2 font-monospace">{getItemCode(line.item_id)}</span>
                                                {isSample(line.item_id) && <span className="badge bg-warning text-dark ms-2" style={{fontSize: '0.65rem'}}>Sample</span>}
                                                <div className="small text-muted fst-italic">
                                                    {(line.attribute_value_ids || []).map(getAttributeValueName).join(', ')}
                                                </div>
                                            </div>
                                            <div className="d-flex align-items-center gap-3">
                                                <span className="fw-bold">x{line.qty}</span>
                                                <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => handleRemoveLine(idx)}>
                                                    <i className="bi bi-x-circle"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {newPO.lines.length === 0 && <div className="text-center text-muted small fst-italic">No items added</div>}
                                </div>
                            </div>

                            <div className="d-flex justify-content-end gap-2 mt-3">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>{t('cancel')}</button>
                                <button type="submit" className="btn btn-primary fw-bold px-4">{t('save')} PO</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
       </div>
       )}

       {/* PO List */}
       <div className="col-12">
          <div className="card h-100 shadow-sm border-0">
             <div className="card-header bg-white d-flex justify-content-between align-items-center">
                 <h5 className="card-title mb-0">{t('purchase_orders')}</h5>
                 <button className="btn btn-sm btn-primary" onClick={() => setIsCreateOpen(true)}>
                     <i className="bi bi-plus-lg me-2"></i> {t('create')}
                 </button>
             </div>
             <div className="card-body p-0">
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th className="ps-4">PO Number</th>
                                <th>Customer</th>
                                <th>Date</th>
                                <th>Items</th>
                                <th>Status</th>
                                <th style={{width: '50px'}}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {salesOrders.map((po: any) => (
                                <tr key={po.id}>
                                    <td className="ps-4 fw-bold font-monospace text-primary">{po.po_number}</td>
                                    <td>{po.customer_name}</td>
                                    <td>{new Date(po.order_date).toLocaleDateString()}</td>
                                    <td>
                                        <div className="d-flex flex-column gap-1">
                                            {po.lines.map((line: any) => (
                                                <div key={line.id} className="small text-muted mb-1">
                                                    <div className="d-flex align-items-center">
                                                        <span className="fw-bold text-dark">{line.qty}</span> 
                                                        <span className="mx-1">x</span> 
                                                        <span className="fw-medium text-dark">{getItemName(line.item_id)}</span>
                                                        {isSample(line.item_id) && <i className="bi bi-star-fill text-warning ms-1" style={{fontSize: '0.6rem'}} title="Sample Item"></i>}
                                                    </div>
                                                    {line.attribute_value_ids && line.attribute_value_ids.length > 0 && (
                                                        <div className="ps-3 border-start ms-1 mt-1" style={{fontSize: '0.75rem'}}>
                                                            {line.attribute_value_ids.map((vid: string) => (
                                                                <span key={vid} className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10 me-1">
                                                                    {getAttributeValueName(vid)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td><span className="badge bg-secondary">{po.status}</span></td>
                                    <td className="pe-4 text-end">
                                        <button className="btn btn-sm btn-link text-danger" onClick={() => onDeletePO(po.id)}>
                                            <i className="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {salesOrders.length === 0 && <tr><td colSpan={6} className="text-center py-5 text-muted">No Purchase Orders found</td></tr>}
                        </tbody>
                    </table>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}