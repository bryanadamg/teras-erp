import { useState, useEffect } from 'react';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';
import { useToast } from './Toast';

export default function ManufacturingView({ items, boms, locations, attributes, workOrders, onCreateWO, onUpdateStatus }: any) {
  const { showToast } = useToast();
  const [newWO, setNewWO] = useState({ code: '', bom_id: '', location_code: '', qty: 1.0, due_date: '' });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Config State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'WO',
      suffix: '',
      separator: '-',
      includeItemCode: true,
      includeVariant: false,
      variantAttributeNames: [],
      includeYear: false,
      includeMonth: false
  });

  useEffect(() => {
      const savedConfig = localStorage.getItem('wo_code_config');
      if (savedConfig) {
          try {
              setCodeConfig(JSON.parse(savedConfig));
          } catch (e) {
              console.error("Invalid config in localstorage");
          }
      }
  }, []);

  const handleSaveConfig = (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('wo_code_config', JSON.stringify(newConfig));
      
      if (newWO.bom_id) {
          const suggested = suggestWOCode(newWO.bom_id, newConfig);
          setNewWO(prev => ({ ...prev, code: suggested }));
      }
  };

  const suggestWOCode = (bomId: string, config = codeConfig) => {
      const bom = boms.find((b: any) => b.id === bomId);
      if (!bom) return '';
      
      const item = items.find((i: any) => i.id === bom.item_id);
      const itemCode = item ? item.code : 'PROD';
      
      // Determine Variant Name if needed
      let variantName = '';
      if (config.includeVariant && bom.attribute_value_ids && bom.attribute_value_ids.length > 0) {
          // Join names of all variants included in the BOM
          const names: string[] = [];
          for (const valId of bom.attribute_value_ids) {
              for (const attr of attributes) {
                  const val = attr.values.find((v: any) => v.id === valId);
                  if (val) {
                      if (!config.variantAttributeNames || config.variantAttributeNames.length === 0 || config.variantAttributeNames.includes(attr.name)) {
                          names.push(val.value.toUpperCase().replace(/\s+/g, ''));
                      }
                      break;
                  }
              }
          }
          variantName = names.join('');
      }

      const parts = [];
      if (config.prefix) parts.push(config.prefix);
      if (config.includeItemCode) parts.push(itemCode);
      if (config.includeVariant && variantName) parts.push(variantName);
      
      const now = new Date();
      if (config.includeYear) parts.push(now.getFullYear());
      if (config.includeMonth) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
      if (config.suffix) parts.push(config.suffix);

      const basePattern = parts.join(config.separator);
      
      let counter = 1;
      let baseCode = `${basePattern}${config.separator}001`;
      
      while (workOrders.some((w: any) => w.code === baseCode)) {
          counter++;
          baseCode = `${basePattern}${config.separator}${String(counter).padStart(3, '0')}`;
      }
      return baseCode;
  };

  const handlePrint = () => {
      window.print();
  };

  const filteredWorkOrders = workOrders.filter((wo: any) => {
      const date = new Date(wo.created_at);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      
      if (start && date < start) return false;
      if (end) {
          const endDateTime = new Date(end);
          endDateTime.setHours(23, 59, 59, 999);
          if (date > endDateTime) return false;
      }
      return true;
  });

  const handleBOMChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const bomId = e.target.value;
      const suggestedCode = suggestWOCode(bomId);
      setNewWO({...newWO, bom_id: bomId, code: suggestedCode});
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await onCreateWO(newWO);
      
      if (res && res.status === 400) {
          let baseCode = newWO.code;
          const baseMatch = baseCode.match(/^(.*)-(\d+)$/);
          if (baseMatch) baseCode = baseMatch[1];

          let counter = 1;
          let suggestedCode = `${baseCode}-${counter}`;
          while (workOrders.some((w: any) => w.code === suggestedCode)) {
              counter++;
              suggestedCode = `${baseCode}-${counter}`;
          }

          showToast(`Work Order Code "${newWO.code}" already exists. Suggesting: ${suggestedCode}`, 'warning');
          setNewWO({ ...newWO, code: suggestedCode });
      } else if (res && res.ok) {
          showToast('Work Order created successfully!', 'success');
          setNewWO({ code: '', bom_id: '', location_code: '', qty: 1.0, due_date: '' });
      } else {
          showToast('Failed to create Work Order', 'danger');
      }
  };

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getBOMCode = (id: string) => boms.find((b: any) => b.id === id)?.code || id;
  
  const getAttributeValueName = (valId: string) => {
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'COMPLETED': return 'bg-success';
          case 'IN_PROGRESS': return 'bg-warning text-dark';
          case 'CANCELLED': return 'bg-danger';
          default: return 'bg-secondary';
      }
  };

  return (
      <div className="row g-4 fade-in print-container">
          <CodeConfigModal 
               isOpen={isConfigOpen} 
               onClose={() => setIsConfigOpen(false)} 
               type="WO"
               onSave={handleSaveConfig}
               initialConfig={codeConfig}
               attributes={attributes}
           />

          {/* Create WO Card */}
          <div className="col-md-4 no-print">
              <div className="card h-100 shadow-sm border-0">
                  <div className="card-header bg-success bg-opacity-10 text-success-emphasis">
                      <h5 className="card-title mb-0"><i className="bi bi-play-circle me-2"></i>New Production Run</h5>
                  </div>
                  <div className="card-body">
                      <form onSubmit={handleSubmit}>
                          <div className="mb-3">
                              <label className="form-label d-flex justify-content-between align-items-center small text-muted">
                                  WO Code
                                  <i 
                                      className="bi bi-gear-fill text-muted" 
                                      style={{cursor: 'pointer'}}
                                      onClick={() => setIsConfigOpen(true)}
                                      title="Configure Auto-Suggestion"
                                  ></i>
                              </label>
                              <input className="form-control" placeholder="Auto-generated" value={newWO.code} onChange={e => setNewWO({...newWO, code: e.target.value})} required />
                          </div>
                          <div className="mb-3">
                              <label className="form-label">Select Recipe (BOM)</label>
                              <select className="form-select" value={newWO.bom_id} onChange={handleBOMChange} required>
                                  <option value="">Choose a product recipe...</option>
                                  {boms.map((b: any) => (
                                      <option key={b.id} value={b.id}>
                                          {b.code} - {getItemName(b.item_id)}
                                      </option>
                                  ))}
                              </select>
                          </div>
                          <div className="mb-3">
                              <label className="form-label">Production Location</label>
                              <select className="form-select" value={newWO.location_code} onChange={e => setNewWO({...newWO, location_code: e.target.value})} required>
                                  <option value="">Select Location...</option>
                                  {locations.map((loc: any) => (
                                      <option key={loc.id} value={loc.code}>{loc.name}</option>
                                  ))}
                              </select>
                          </div>
                          <div className="row g-3 mb-4">
                              <div className="col-6">
                                  <label className="form-label">Quantity</label>
                                  <input type="number" className="form-control" placeholder="1.0" value={newWO.qty} onChange={e => setNewWO({...newWO, qty: parseFloat(e.target.value)})} required />
                              </div>
                              <div className="col-6">
                                  <label className="form-label">Due Date</label>
                                  <input type="date" className="form-control" value={newWO.due_date} onChange={e => setNewWO({...newWO, due_date: e.target.value})} />
                              </div>
                          </div>
                          <button type="submit" className="btn btn-success w-100 fw-bold shadow-sm">Generate Work Order</button>
                      </form>
                  </div>
              </div>
          </div>

          {/* Work Order List */}
          <div className="col-md-8 flex-print-fill">
              <div className="card h-100 border-0 shadow-sm">
                  <div className="card-header bg-white d-flex justify-content-between align-items-center no-print">
                      <h5 className="card-title mb-0">Production Schedule</h5>
                      <div className="d-flex gap-2">
                          <div className="input-group input-group-sm">
                              <span className="input-group-text">From</span>
                              <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                          </div>
                          <div className="input-group input-group-sm">
                              <span className="input-group-text">To</span>
                              <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                          </div>
                          <button className="btn btn-outline-primary btn-sm btn-print" onClick={handlePrint}>
                              <i className="bi bi-printer me-1"></i>Print
                          </button>
                      </div>
                  </div>
                  <div className="card-body p-0">
                      <div className="print-header d-none d-print-block p-4 border-bottom mb-4">
                          <h2 className="mb-1">Production Schedule Report</h2>
                          <p className="text-muted mb-0">Period: {startDate || 'All Time'} to {endDate || 'Present'}</p>
                          <p className="text-muted small">Generated on: {new Date().toLocaleString()}</p>
                      </div>
                      <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                              <thead className="table-light">
                                  <tr>
                                      <th className="ps-4">Code</th>
                                      <th>Product</th>
                                      <th>Qty</th>
                                      <th>Status</th>
                                      <th className="text-end pe-4 no-print">Actions</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {filteredWorkOrders.map((wo: any) => (
                                      <tr key={wo.id}>
                                          <td className="ps-4 fw-bold font-monospace">{wo.code}</td>
                                          <td>
                                              <div className="fw-medium">{getItemName(wo.item_id)}</div>
                                              <div className="small text-muted">
                                                  {wo.attribute_value_ids?.map(getAttributeValueName).join(', ') || '-'}
                                              </div>
                                              <div className="small text-primary fst-italic">{getBOMCode(wo.bom_id)}</div>
                                          </td>
                                          <td className="fw-bold">{wo.qty}</td>
                                          <td><span className={`badge ${getStatusBadge(wo.status)}`}>{wo.status}</span></td>
                                          <td className="text-end pe-4 no-print">
                                              {wo.status === 'PENDING' && (
                                                  <button className="btn btn-sm btn-outline-primary shadow-sm" onClick={() => onUpdateStatus(wo.id, 'IN_PROGRESS')}>
                                                      <i className="bi bi-play-fill me-1"></i>Start
                                                  </button>
                                              )}
                                              {wo.status === 'IN_PROGRESS' && (
                                                  <button className="btn btn-sm btn-success text-white shadow-sm" onClick={() => onUpdateStatus(wo.id, 'COMPLETED')}>
                                                      <i className="bi bi-check-lg me-1"></i>Finish
                                                  </button>
                                              )}
                                              {wo.status === 'COMPLETED' && <span className="text-success"><i className="bi bi-check-circle-fill"></i> Done</span>}
                                          </td>
                                      </tr>
                                  ))}
                                  {filteredWorkOrders.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No scheduled production for this period</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
}