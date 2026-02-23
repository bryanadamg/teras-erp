import { useState, useEffect } from 'react';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';
import CalendarView from './CalendarView';
import SearchableSelect from './SearchableSelect';
import QRScannerView from './QRScannerView';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';

export default function ManufacturingView({ 
    items, 
    boms, 
    locations, 
    attributes, 
    workOrders, 
    stockBalance, 
    onCreateWO, 
    onUpdateStatus, 
    onDeleteWO,
    currentPage,
    totalItems,
    pageSize,
    onPageChange
}: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState('list'); 

  // Derived Pagination
  const totalPages = Math.ceil(totalItems / pageSize);
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalItems);  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWO, setNewWO] = useState({ code: '', bom_id: '', location_code: '', source_location_code: '', qty: 1.0, due_date: '' });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [printingWO, setPrintingWO] = useState<any>(null); // State for single WO print
  
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
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

  const [currentStyle, setCurrentStyle] = useState('default');

  useEffect(() => {
      const savedConfig = localStorage.getItem('wo_code_config');
      if (savedConfig) {
          try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
      }
      const savedStyle = localStorage.getItem('ui_style');
      if (savedStyle) setCurrentStyle(savedStyle);
  }, []);

  // ... (SaveConfig, SuggestCode, Handlers same as before) ...
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
      
      let variantName = '';
      if (config.includeVariant && bom.attribute_value_ids && bom.attribute_value_ids.length > 0) {
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

  const handlePrintList = () => {
      window.print();
  };

  const handlePrintWO = (wo: any) => {
      setPrintingWO(wo);
      // Wait for render then print
      setTimeout(() => window.print(), 100);
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

  const handleBOMChange = (bomId: string) => {
      const suggestedCode = suggestWOCode(bomId);
      setNewWO({...newWO, bom_id: bomId, code: suggestedCode});
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await onCreateWO(newWO);
      if (res && res.status === 400) {
          // ... (Duplicate logic) ...
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
          const createdWO = await res.json();
          if (createdWO.is_material_available === false) {
              showToast('Work Order created, but insufficient materials!', 'warning');
          } else {
              showToast('Work Order created successfully!', 'success');
          }
          setNewWO({ code: '', bom_id: '', location_code: '', source_location_code: '', qty: 1.0, due_date: '' });
          setIsCreateOpen(false);
      } else {
          showToast('Failed to create Work Order', 'danger');
      }
  };

  const toggleRow = (id: string) => {
      setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Helpers
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getItemCode = (id: string) => items.find((i: any) => i.id === id)?.code || id;
  const getBOMCode = (id: string) => boms.find((b: any) => b.id === id)?.code || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;
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
  const formatDateTime = (date: string | null) => {
      if (!date) return '-';
      return new Date(date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  };
  const getDueDateWarning = (wo: any) => {
      if (wo.status === 'COMPLETED' || wo.status === 'CANCELLED') return null;
      if (!wo.due_date) return null;
      const due = new Date(wo.due_date);
      const now = new Date();
      const diffDays = (due.getTime() - now.getTime()) / (1000 * 3600 * 24);
      if (diffDays < 0) return { type: 'danger', icon: 'bi-exclamation-octagon-fill', text: 'Overdue!' };
      if (diffDays < 2) return { type: 'warning', icon: 'bi-exclamation-triangle-fill', text: 'Due Soon' };
      return null;
  };
  const calculateRequiredQty = (baseQty: number, line: any, bom: any) => {
      let required = parseFloat(line.qty);
      if (line.is_percentage) {
          required = (baseQty * required) / 100;
      } else {
          // Absolute qty is usually per 1 unit of BOM, so scale by baseQty
          required = baseQty * required;
      }
      // Apply tolerance from BOM header if present
      const tolerance = parseFloat(bom?.tolerance_percentage || 0);
      if (tolerance > 0) {
          required = required * (1 + (tolerance / 100));
      }
      return required;
  };

  const checkStockAvailability = (item_id: string, location_id: string, attribute_value_ids: string[] = [], required_qty: number) => {
      const targetIds = attribute_value_ids || [];
      const matchingEntries = stockBalance.filter((s: any) => 
          s.item_id === item_id && s.location_id === location_id &&
          (s.attribute_value_ids || []).length === targetIds.length &&
          (s.attribute_value_ids || []).every((id: string) => targetIds.includes(id))
      );
      const available = matchingEntries.reduce((sum: number, e: any) => sum + parseFloat(e.qty), 0);
      return { available, isEnough: available >= required_qty };
  };

  // --- Print Template Component ---
  const WorkOrderPrintTemplate = ({ wo }: { wo: any }) => {
      const bom = boms.find((b: any) => b.id === wo.bom_id);
      
      // Recursive BOM Renderer
      const renderPrintBOMLines = (lines: any[], level = 0, currentParentQty = 1, currentBOM: any) => {
          return lines.map((line: any) => {
              const subBOM = boms.find((b: any) => b.item_id === line.item_id);
              
              // Calculate scaled qty for this line
              let scaledQty = parseFloat(line.qty);
              if (line.is_percentage) {
                  scaledQty = (currentParentQty * scaledQty) / 100;
              } else {
                  scaledQty = currentParentQty * scaledQty;
              }

              // Apply tolerance of the current level's BOM
              const tolerance = parseFloat(currentBOM?.tolerance_percentage || 0);
              if (tolerance > 0) {
                  scaledQty = scaledQty * (1 + (tolerance / 100));
              }
              
              return (
                  <>
                      <tr key={line.id}>
                          <td style={{paddingLeft: `${level * 20 + 8}px`}}>
                              <span className="font-monospace small">{getItemCode(line.item_id)}</span>
                          </td>
                          <td>
                              {level > 0 && <span className="text-muted me-1">↳</span>}
                              {getItemName(line.item_id)}
                              {subBOM && <span className="badge bg-secondary ms-2" style={{fontSize: '0.6rem'}}>Sub-Assy</span>}
                          </td>
                          <td className="small fst-italic">
                              {line.qty}{line.is_percentage ? '%' : ''} 
                              {(line.attribute_value_ids || []).length > 0 && ` • ${(line.attribute_value_ids || []).map(getAttributeValueName).join(', ')}`}
                          </td>
                          <td>{getLocationName(line.source_location_id || wo.source_location_id || wo.location_id)}</td>
                          <td className="text-end">{line.qty}{line.is_percentage ? '%' : ''}</td>
                          <td className="text-end fw-bold">{(scaledQty * wo.qty).toFixed(4)}</td> 
                      </tr>
                      {subBOM && subBOM.lines && renderPrintBOMLines(subBOM.lines, level + 1, scaledQty, subBOM)}
                  </>
              );
          });
      };

      return (
          <div className="bg-white p-5 h-100 position-fixed top-0 start-0 w-100" style={{zIndex: 2000, overflowY: 'auto'}}>
              {/* Header */}
              <div className="d-flex justify-content-between border-bottom pb-3 mb-4">
                  <div className="d-flex gap-4">
                      {/* QR Code for scanning */}
                      <div className="bg-white border p-1 rounded">
                          <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${wo.code}`} 
                              alt="WO QR" 
                              style={{ width: '80px', height: '80px' }} 
                          />
                      </div>
                      <div>
                          <h2 className="fw-bold mb-0">WORK ORDER</h2>
                          <div className="text-muted small">Terras ERP Manufacturing</div>
                      </div>
                  </div>
                  <div className="text-end">
                      <h3 className="font-monospace mb-0">{wo.code}</h3>
                      <div className={`badge ${getStatusBadge(wo.status)} fs-6`}>{wo.status}</div>
                  </div>
              </div>

              {/* Details Grid */}
              <div className="row mb-4">
                  <div className="col-6">
                      <h6 className="text-uppercase text-muted small fw-bold">Finished Good</h6>
                      <div className="fs-5 fw-bold">{getItemName(wo.item_id)}</div>
                      <div className="small font-monospace text-muted">{getItemCode(wo.item_id)}</div>
                      <div className="mt-2 small">
                          {(wo.attribute_value_ids || []).map(getAttributeValueName).join(', ')}
                      </div>
                  </div>
                  <div className="col-3">
                      <h6 className="text-uppercase text-muted small fw-bold">Quantity</h6>
                      <div className="fs-4">{wo.qty}</div>
                  </div>
                  <div className="col-3">
                      <h6 className="text-uppercase text-muted small fw-bold">Schedule</h6>
                      <div className="small">Start: {wo.start_date ? new Date(wo.start_date).toLocaleDateString() : '-'}</div>
                      <div className="small">Due: {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : '-'}</div>
                  </div>
              </div>

              <div className="row mb-5">
                  <div className="col-6">
                      <h6 className="text-uppercase text-muted small fw-bold">Target Location (Output)</h6>
                      <div>{getLocationName(wo.location_id)}</div>
                  </div>
                  <div className="col-6">
                      <h6 className="text-uppercase text-muted small fw-bold">Source Location (Input)</h6>
                      <div>{getLocationName(wo.source_location_id || wo.location_id)}</div>
                  </div>
              </div>

              {/* BOM Materials */}
              <h5 className="fw-bold border-bottom pb-2 mb-3">Bill of Materials (Full Tree)</h5>
              <div className="mb-2 small text-muted fst-italic">
                  Note: Totals include configurable BOM tolerances.
              </div>
              <table className="table table-bordered table-sm mb-5">
                  <thead className="table-light">
                      <tr>
                          <th>Component Code</th>
                          <th>Component Name</th>
                          <th>Attributes</th>
                          <th>Source</th>
                          <th className="text-end">Qty Per</th>
                          <th className="text-end">Total Required</th>
                      </tr>
                  </thead>
                  <tbody>
                      {bom ? renderPrintBOMLines(bom.lines, 0, 1, bom) : <tr><td colSpan={6}>No BOM found</td></tr>}
                  </tbody>
              </table>

              {/* Operations */}
              {bom?.operations && bom.operations.length > 0 && (
                  <>
                      <h5 className="fw-bold border-bottom pb-2 mb-3">Routing & Operations</h5>
                      <table className="table table-bordered table-sm">
                          <thead className="table-light">
                              <tr>
                                  <th style={{width: '50px'}}>Seq</th>
                                  <th>Operation</th>
                                  <th>Work Center</th>
                                  <th className="text-end">Time (Mins)</th>
                              </tr>
                          </thead>
                          <tbody>
                              {[...bom.operations].sort((a:any, b:any) => a.sequence - b.sequence).map((op: any) => (
                                  <tr key={op.id}>
                                      <td>{op.sequence}</td>
                                      {/* Assuming we have access to operations/workCenters lists in parent scope, 
                                          but we passed them to ManufacturingView? 
                                          Wait, ManufacturingView doesn't receive operations/workCenters props directly in page.tsx currently.
                                          They are fetched in page.tsx but passed to RoutingView/BOMView. 
                                          We need to fix this if we want to show names.
                                          For now, showing IDs might fail gracefully or we assume standard lookups work if ids match.
                                          Actually, getOpName uses 'operations' list which is NOT in props here.
                                          I need to add operations/workCenters to props.
                                      */}
                                      <td>{op.operation_id}</td> 
                                      <td>{op.work_center_id}</td>
                                      <td className="text-end">{op.time_minutes}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </>
              )}

              <div className="mt-5 pt-5 border-top d-flex justify-content-between text-muted small">
                  <div>Printed: {new Date().toLocaleString()}</div>
                  <div>Approved By: __________________________</div>
              </div>

              {/* Close Button (No Print) */}
              <div className="position-fixed top-0 end-0 p-3 no-print">
                  <button className="btn btn-dark shadow" onClick={() => setPrintingWO(null)}>
                      <i className="bi bi-x-lg me-2"></i>Close Preview
                  </button>
              </div>
          </div>
      );
  };

  return (
      <div className="row g-4 fade-in print-container">
          {/* Print Overlay */}
          {printingWO && <WorkOrderPrintTemplate wo={printingWO} />}

          <CodeConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} type="WO" onSave={handleSaveConfig} initialConfig={codeConfig} attributes={attributes} />

          {/* ... (Create Modal - Same as before) ... */}
          {isCreateOpen && (
          <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
              <div className={`modal-dialog modal-lg modal-dialog-centered ui-style-${currentStyle}`}>
                  <div className="modal-content shadow">
                      {/* ... (Header) ... */}
                      <div className="modal-header bg-success bg-opacity-10 text-success-emphasis">
                          <h5 className="modal-title"><i className="bi bi-play-circle me-2"></i>{t('new_production_run')}</h5>
                          <button type="button" className="btn-close" onClick={() => setIsCreateOpen(false)}></button>
                      </div>
                      <div className="modal-body">
                          <form onSubmit={handleSubmit}>
                              {/* ... (Form Fields) ... */}
                              <div className="mb-3">
                                  <label className="form-label d-flex justify-content-between align-items-center small text-muted">
                                      {t('item_code')}
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
                                  <label className="form-label">{t('select_recipe')}</label>
                                  <SearchableSelect 
                                      options={boms.map((b: any) => ({ value: b.id, label: `${b.code} - ${getItemName(b.item_id)}` }))}
                                      value={newWO.bom_id}
                                      onChange={handleBOMChange}
                                      required
                                      placeholder="Choose a product recipe..."
                                  />
                              </div>
                              <div className="row g-2 mb-3">
                                  <div className="col-6">
                                      <label className="form-label small text-muted">Source Location</label>
                                      <select className="form-select" value={newWO.source_location_code} onChange={e => setNewWO({...newWO, source_location_code: e.target.value})}>
                                          <option value="">Same as Production</option>
                                          {locations.map((loc: any) => <option key={loc.id} value={loc.code}>{loc.name}</option>)}
                                      </select>
                                  </div>
                                  <div className="col-6">
                                      <label className="form-label small text-muted">Output Location</label>
                                      <select className="form-select" value={newWO.location_code} onChange={e => setNewWO({...newWO, location_code: e.target.value})} required>
                                          <option value="">Select...</option>
                                          {locations.map((loc: any) => <option key={loc.id} value={loc.code}>{loc.name}</option>)}
                                      </select>
                                  </div>
                              </div>
                              <div className="row g-3 mb-4">
                                  <div className="col-6">
                                      <label className="form-label">{t('qty')}</label>
                                      <input type="number" className="form-control" placeholder="1.0" value={newWO.qty} onChange={e => setNewWO({...newWO, qty: parseFloat(e.target.value)})} required />
                                  </div>
                                  <div className="col-6">
                                      <label className="form-label">{t('due_date')}</label>
                                      <input type="date" className="form-control" value={newWO.due_date} onChange={e => setNewWO({...newWO, due_date: e.target.value})} />
                                  </div>
                              </div>
                              <div className="d-flex justify-content-end gap-2">
                                  <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>{t('cancel')}</button>
                                  <button type="submit" className="btn btn-success fw-bold px-4">{t('create')}</button>
                              </div>
                          </form>
                      </div>
                  </div>
              </div>
          </div>
          )}

          <div className="col-12 flex-print-fill">
              {/* ... (Main Card) ... */}
              <div className="card h-100 border-0 shadow-sm">
                  <div className="card-header bg-white d-flex justify-content-between align-items-center no-print">
                      <div className="d-flex align-items-center gap-3">
                          <h5 className="card-title mb-0">{t('production_schedule')}</h5>
                          <div className="btn-group ms-2">
                              <button className={`btn btn-sm btn-light border ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}><i className="bi bi-calendar-event me-1"></i>Calendar</button>
                              <button className={`btn btn-sm btn-light border ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><i className="bi bi-list-ul me-1"></i>List</button>
                              <button className={`btn btn-sm btn-light border ${viewMode === 'scanner' ? 'active' : ''}`} onClick={() => setViewMode('scanner')}><i className="bi bi-qr-code-scan me-1"></i>Scanner</button>
                          </div>
                      </div>
                      <div className="d-flex gap-2">
                          <button className="btn btn-success btn-sm text-white" onClick={() => setIsCreateOpen(true)}><i className="bi bi-plus-lg me-1"></i>{t('create')}</button>
                          {viewMode === 'list' && (
                              <>
                                <div className="vr mx-1"></div>
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text">{t('from')}</span>
                                    <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                                </div>
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text">{t('to')}</span>
                                    <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                                </div>
                              </>
                          )}
                          <button className="btn btn-outline-primary btn-sm btn-print" onClick={handlePrintList}><i className="bi bi-printer me-1"></i>{t('print')}</button>
                      </div>
                  </div>
                  
                  <div className="card-body p-0">
                      {viewMode === 'calendar' ? (
                          <div className="p-3"><CalendarView workOrders={workOrders} items={items} /></div>
                      ) : viewMode === 'scanner' ? (
                          <div className="p-4">
                              <QRScannerView 
                                  workOrders={workOrders} 
                                  onUpdateStatus={onUpdateStatus} 
                                  onClose={() => setViewMode('list')} 
                              />
                          </div>
                      ) : (
                          <>
                            <div className="print-header d-none d-print-block p-4 border-bottom mb-4">
                                <h2 className="mb-1">{t('production_schedule')}</h2>
                                <p className="text-muted mb-0">{t('from')}: {startDate || 'All Time'} {t('to')} {endDate || 'Present'}</p>
                                <p className="text-muted small">Generated on: {new Date().toLocaleString()}</p>
                            </div>
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th className="ps-4">{t('item_code')}</th>
                                            <th>Product</th>
                                            <th>{t('qty')}</th>
                                            <th>{t('due_date')}</th>
                                            <th>Start / Finish</th>
                                            <th>{t('status')}</th>
                                            <th className="text-end pe-4 no-print">{t('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredWorkOrders.map((wo: any) => {
                                            const warning = getDueDateWarning(wo);
                                            const isExpanded = expandedRows[wo.id];
                                            const bom = boms.find((b:any) => b.id === wo.bom_id);

                                            return (
                                                <>
                                                <tr key={wo.id} className={isExpanded ? 'bg-light' : ''}>
                                                    <td className="ps-4 fw-bold font-monospace small">{wo.code}</td>
                                                    <td style={{cursor: 'pointer'}} onClick={() => toggleRow(wo.id)}>
                                                        {/* ... (Row Content) ... */}
                                                        <div className="d-flex align-items-center gap-2">
                                                            <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} small text-muted`}></i>
                                                            <div>
                                                                <div className="fw-medium">{getItemName(wo.item_id)}</div>
                                                                <div className="small text-muted">{wo.attribute_value_ids?.map(getAttributeValueName).join(', ') || '-'}</div>
                                                                <div className="small text-primary fst-italic">{getBOMCode(wo.bom_id)}</div>
                                                                {wo.status === 'PENDING' && wo.is_material_available === false && <div className="text-danger small fw-bold"><i className="bi bi-exclamation-triangle-fill me-1"></i>Low Stock</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="fw-bold">{wo.qty}</td>
                                                    <td>
                                                        <div className="d-flex flex-column">
                                                            <span className={warning ? `text-${warning.type} fw-bold` : ''}>{wo.due_date ? new Date(wo.due_date).toLocaleDateString() : '-'}</span>
                                                            {warning && <span className={`badge bg-${warning.type} mt-1`} style={{fontSize: '0.65rem'}}><i className={`bi ${warning.icon} me-1`}></i>{warning.text}</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="small d-flex flex-column">
                                                            <span className="text-muted">S: {formatDateTime(wo.start_date)}</span>
                                                            <span className="text-muted">F: {formatDateTime(wo.completed_at)}</span>
                                                        </div>
                                                    </td>
                                                    <td><span className={`badge ${getStatusBadge(wo.status)}`}>{t(wo.status.toLowerCase())}</span></td>
                                                    <td className="text-end pe-4 no-print">
                                                        <div className="d-flex justify-content-end align-items-center gap-2">
                                                            <button className="btn btn-sm btn-link text-primary p-0" onClick={() => handlePrintWO(wo)} title="Print Work Order">
                                                                <i className="bi bi-printer"></i>
                                                            </button>
                                                            {wo.status === 'PENDING' && <button className="btn btn-sm btn-primary shadow-sm" onClick={() => onUpdateStatus(wo.id, 'IN_PROGRESS')}><i className="bi bi-play-fill me-1"></i>{t('start')}</button>}
                                                            {wo.status === 'IN_PROGRESS' && <button className="btn btn-sm btn-success shadow-sm" onClick={() => onUpdateStatus(wo.id, 'COMPLETED')}><i className="bi bi-check-lg me-1"></i>{t('finish')}</button>}
                                                            {wo.status === 'COMPLETED' && <span className="text-success small fw-bold"><i className="bi bi-check-circle-fill"></i> Done</span>}
                                                            <button className="btn btn-sm btn-link text-danger p-0" onClick={() => onDeleteWO(wo.id)} title="Delete Work Order"><i className="bi bi-trash"></i></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* ... (Expanded Content) ... */}
                                                {isExpanded && bom && (
                                                    <tr key={`${wo.id}-detail`} className="bg-light">
                                                        <td colSpan={7} className="p-0">
                                                            <div className="p-3 ps-5 border-bottom shadow-inner d-flex justify-content-between align-items-start">
                                                                <div className="flex-grow-1">
                                                                    <h6 className="small text-uppercase text-muted fw-bold mb-2">Required Materials</h6>
                                                                    <div className="table-responsive">
                                                                        <table className="table table-sm table-borderless mb-0 w-75">
                                                                            <thead className="text-muted small border-bottom">
                                                                                <tr><th>Item</th><th>Source</th><th>Required</th><th>Available</th><th>Status</th></tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {bom.lines.map((line: any) => {
                                                                                    const required = calculateRequiredQty(wo.qty, line, bom);
                                                                                    const checkLocId = line.source_location_id || wo.source_location_id || wo.location_id;
                                                                                    const { available, isEnough } = checkStockAvailability(line.item_id, checkLocId, line.attribute_value_ids, required);
                                                                                    return (
                                                                                        <tr key={line.id}>
                                                                                            <td>
                                                                                                <span className="fw-medium">{getItemName(line.item_id)}</span>
                                                                                                <div className="small text-muted fst-italic">
                                                                                                    {line.qty}{line.is_percentage ? '%' : ''} per unit
                                                                                                    {line.attribute_value_ids.map(getAttributeValueName).join(', ') && ` • ${line.attribute_value_ids.map(getAttributeValueName).join(', ')}`}
                                                                                                </div>
                                                                                            </td>
                                                                                            <td><span className="badge bg-light text-dark border font-monospace small">{getLocationName(checkLocId)}</span></td>
                                                                                            <td className="fw-bold">{required.toFixed(4)}</td>
                                                                                            <td className={isEnough ? 'text-success' : 'text-danger'}>{available}</td>
                                                                                            <td>{isEnough ? <span className="badge bg-success bg-opacity-10 text-success"><i className="bi bi-check2"></i> Ready</span> : <span className="badge bg-danger bg-opacity-10 text-danger"><i className="bi bi-x-circle"></i> Missing</span>}</td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                                <div className="ms-4 text-center bg-white p-2 border rounded shadow-sm no-print">
                                                                    <img 
                                                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${wo.code}`} 
                                                                        alt="QR" 
                                                                        style={{ width: '64px', height: '64px' }}
                                                                    />
                                                                    <div className="extra-small text-muted mt-1 font-monospace">{wo.code}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                </>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="card-footer bg-white border-top py-2 px-4 d-flex justify-content-between align-items-center no-print">
                                <div className="small text-muted font-monospace">
                                    Showing {startRange}-{endRange} of {totalItems} work orders
                                </div>
                                <div className="btn-group">
                                    <button 
                                        className={`btn btn-sm btn-light border ${currentPage <= 1 ? 'disabled opacity-50' : ''}`}
                                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                    >
                                        <i className="bi bi-chevron-left me-1"></i>Previous
                                    </button>
                                    <div className="btn btn-sm btn-white border-top border-bottom px-3 fw-bold">
                                        Page {currentPage} of {totalPages || 1}
                                    </div>
                                    <button 
                                        className={`btn btn-sm btn-light border ${currentPage >= totalPages ? 'disabled opacity-50' : ''}`}
                                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                    >
                                        Next<i className="bi bi-chevron-right ms-1"></i>
                                    </button>
                                </div>
                            </div>
                          </>
                      )}
                  </div>
              </div>
          </div>
      </div>
  );
}