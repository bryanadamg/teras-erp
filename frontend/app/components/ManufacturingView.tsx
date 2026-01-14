import { useState, useEffect } from 'react';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';

export default function ManufacturingView({ items, boms, locations, attributes, workOrders, onCreateWO, onUpdateStatus }: any) {
  const [newWO, setNewWO] = useState({ code: '', bom_id: '', location_code: '', qty: 1.0, due_date: '' });

  // Config State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'WO',
      suffix: '',
      separator: '-',
      includeItemCode: true,
      includeVariant: false,
      variantAttributeName: '',
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
      if (config.includeVariant && bom.variant_id) {
          const variant = item?.variants.find((v: any) => v.id === bom.variant_id);
          if (variant) {
              if (config.variantAttributeName) {
                  if (variant.category === config.variantAttributeName) {
                      variantName = variant.name.toUpperCase().replace(/\s+/g, '');
                  }
              } else {
                  variantName = variant.name.toUpperCase().replace(/\s+/g, '');
              }
          }
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

  const handleBOMChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const bomId = e.target.value;
      const suggestedCode = suggestWOCode(bomId);
      setNewWO({...newWO, bom_id: bomId, code: suggestedCode});
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (workOrders.some((w: any) => w.code === newWO.code)) {
          alert('Work Order Code already exists.');
          return;
      }
      onCreateWO(newWO);
      setNewWO({ code: '', bom_id: '', location_code: '', qty: 1.0, due_date: '' });
  };

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getBOMCode = (id: string) => boms.find((b: any) => b.id === id)?.code || id;
  const getVariantName = (itemId: string, variantId: string) => {
      if (!variantId) return '-';
      const item = items.find((i: any) => i.id === itemId);
      if (!item) return variantId;
      const variant = (item as any).variants.find((v: any) => v.id === variantId);
      return variant ? variant.name : variantId;
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
      <div className="row g-4 fade-in">
          <CodeConfigModal 
               isOpen={isConfigOpen} 
               onClose={() => setIsConfigOpen(false)} 
               type="WO"
               onSave={handleSaveConfig}
               initialConfig={codeConfig}
               attributes={attributes}
           />

          {/* Create WO Card */}
          <div className="col-md-4">
              <div className="card h-100">
                  <div className="card-header bg-success bg-opacity-10 text-success-emphasis">
                      <h5 className="card-title mb-0"><i className="bi bi-play-circle me-2"></i>New Production Run</h5>
                  </div>
                  <div className="card-body">
                      <form onSubmit={handleSubmit}>
                          <div className="mb-3">
                              <label className="form-label d-flex justify-content-between align-items-center">
                                  WO Code
                                  <i 
                                      className="bi bi-gear-fill text-muted" 
                                      style={{cursor: 'pointer', fontSize: '0.8rem'}}
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
                                          {b.code} - {getItemName(b.item_id)} {getVariantName(b.item_id, b.variant_id) !== '-' ? `(${getVariantName(b.item_id, b.variant_id)})` : ''}
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
          <div className="col-md-8">
              <div className="card h-100">
                  <div className="card-header d-flex justify-content-between align-items-center">
                      <h5 className="card-title mb-0">Production Schedule</h5>
                      <span className="badge bg-light text-dark border">{workOrders.length} Orders</span>
                  </div>
                  <div className="card-body p-0">
                      <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                              <thead className="table-light">
                                  <tr>
                                      <th>Code</th>
                                      <th>Product</th>
                                      <th>Qty</th>
                                      <th>Status</th>
                                      <th className="text-end">Actions</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {workOrders.map((wo: any) => (
                                      <tr key={wo.id}>
                                          <td className="fw-bold font-monospace">{wo.code}</td>
                                          <td>
                                              <div className="fw-medium">{getItemName(wo.item_id)}</div>
                                              <div className="small text-muted">{getVariantName(wo.item_id, wo.variant_id)}</div>
                                              <div className="small text-primary fst-italic">{getBOMCode(wo.bom_id)}</div>
                                          </td>
                                          <td className="fw-bold">{wo.qty}</td>
                                          <td><span className={`badge ${getStatusBadge(wo.status)}`}>{wo.status}</span></td>
                                          <td className="text-end">
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
                                  {workOrders.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No scheduled production</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
}
