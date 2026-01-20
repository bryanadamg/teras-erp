import { useState, useEffect } from 'react';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';

export default function BOMView({ items, boms, locations, attributes, workCenters, operations, onCreateBOM, onDeleteBOM }: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const [newBOM, setNewBOM] = useState({
      code: '',
      description: '',
      item_code: '',
      attribute_value_ids: [] as string[],
      qty: 1.0,
      lines: [] as any[],
      operations: [] as any[]
  });
  const [newBOMLine, setNewBOMLine] = useState({ item_code: '', attribute_value_ids: [] as string[], qty: 0, source_location_code: '' });
  const [newBOMOp, setNewBOMOp] = useState({ operation_id: '', work_center_id: '', sequence: 10, time_minutes: 0 });
  
  // Tree Expansion State: Record<bom_id, boolean>
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Config State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'BOM',
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
      const savedConfig = localStorage.getItem('bom_code_config');
      if (savedConfig) {
          try {
              setCodeConfig(JSON.parse(savedConfig));
          } catch (e) {
              console.error("Invalid config in localstorage");
          }
      }
      const savedStyle = localStorage.getItem('ui_style');
      if (savedStyle) setCurrentStyle(savedStyle);
  }, []);

  const handleSaveConfig = (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('bom_code_config', JSON.stringify(newConfig));
      
      if (newBOM.item_code) {
          const suggested = suggestBOMCode(newBOM.item_code, newBOM.attribute_value_ids, newConfig);
          setNewBOM(prev => ({ ...prev, code: suggested }));
      }
  };

  const suggestBOMCode = (itemCode: string, attributeValueIds: string[] = [], config = codeConfig) => {
      const parts = [];
      if (config.prefix) parts.push(config.prefix);
      if (config.includeItemCode && itemCode) parts.push(itemCode);
      
      if (config.includeVariant && attributeValueIds.length > 0) {
          const valueNames: string[] = [];
          for (const valId of attributeValueIds) {
              for (const attr of attributes) {
                  const val = attr.values.find((v: any) => v.id === valId);
                  if (val) {
                      if (!config.variantAttributeNames || config.variantAttributeNames.length === 0 || config.variantAttributeNames.includes(attr.name)) {
                          valueNames.push(val.value.toUpperCase().replace(/\s+/g, ''));
                      }
                      break;
                  }
              }
          }
          if (valueNames.length > 0) parts.push(...valueNames);
      }
      
      const now = new Date();
      if (config.includeYear) parts.push(now.getFullYear());
      if (config.includeMonth) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
      if (config.suffix) parts.push(config.suffix);

      const basePattern = parts.join(config.separator);
      
      let counter = 1;
      let baseCode = `${basePattern}${config.separator}001`;
      
      while (boms.some((b: any) => b.code === baseCode)) {
          counter++;
          baseCode = `${basePattern}${config.separator}${String(counter).padStart(3, '0')}`;
      }
      return baseCode;
  };

  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const itemCode = e.target.value;
      const suggestedCode = suggestBOMCode(itemCode, []);
      setNewBOM({...newBOM, item_code: itemCode, code: suggestedCode, attribute_value_ids: []});
  };

  const handleValueChange = (valId: string, attrId: string, isHeader: boolean) => {
      if (isHeader) {
          const attr = attributes.find((a: any) => a.id === attrId);
          if (!attr) return;

          const otherValues = newBOM.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
          const newValues = valId ? [...otherValues, valId] : otherValues;
          
          const suggested = suggestBOMCode(newBOM.item_code, newValues);
          setNewBOM({...newBOM, attribute_value_ids: newValues, code: suggested});
      } else {
          const attr = attributes.find((a: any) => a.id === attrId);
          if (!attr) return;

          const otherValues = newBOMLine.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
          const newValues = valId ? [...otherValues, valId] : otherValues;
          setNewBOMLine({...newBOMLine, attribute_value_ids: newValues});
      }
  };

  const handleAddLineToBOM = () => {
      if (!newBOMLine.item_code || newBOMLine.qty <= 0) return;
      setNewBOM({ ...newBOM, lines: [...newBOM.lines, { ...newBOMLine }] });
      setNewBOMLine({ item_code: '', attribute_value_ids: [], qty: 0, source_location_code: '' });
  };

  const handleAddOpToBOM = () => {
      if (!newBOMOp.operation_id) return;
      setNewBOM({ ...newBOM, operations: [...newBOM.operations, { ...newBOMOp }] });
      setNewBOMOp({ operation_id: '', work_center_id: '', sequence: newBOMOp.sequence + 10, time_minutes: 0 });
  };

  const handleRemoveLine = (index: number) => {
      setNewBOM({ ...newBOM, lines: newBOM.lines.filter((_, i) => i !== index) });
  };

  const handleRemoveOp = (index: number) => {
      setNewBOM({ ...newBOM, operations: newBOM.operations.filter((_, i) => i !== index) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await onCreateBOM(newBOM);
      
      if (res && res.status === 400) {
          let baseCode = newBOM.code;
          const baseMatch = baseCode.match(/^(.*)-(\d+)$/);
          if (baseMatch) baseCode = baseMatch[1];

          let counter = 1;
          let suggestedCode = `${baseCode}-${counter}`;
          while (boms.some((b: any) => b.code === suggestedCode)) {
              counter++;
              suggestedCode = `${baseCode}-${counter}`;
          }

          showToast(`BOM Code "${newBOM.code}" already exists. Suggesting: ${suggestedCode}`, 'warning');
          setNewBOM({ ...newBOM, code: suggestedCode });
      } else if (res && res.ok) {
          showToast('BOM created successfully!', 'success');
          setNewBOM({ code: '', description: '', item_code: '', attribute_value_ids: [], qty: 1.0, lines: [], operations: [] });
          setIsCreateOpen(false); // Close modal on success
      } else {
          showToast('Failed to create BOM', 'danger');
      }
  };

  const toggleNode = (nodeId: string) => {
      setExpandedNodes(prev => ({...prev, [nodeId]: !prev[nodeId]}));
  };

  // Helpers
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getOpName = (id: string) => operations.find((o: any) => o.id === id)?.name || id;
  const getWCName = (id: string) => workCenters.find((w: any) => w.id === id)?.name || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || 'Default';
  const getLocationNameByCode = (code: string) => locations.find((l: any) => l.code === code)?.name || code;
  
  const getAttributeValueName = (valId: string) => {
      if (!valId || !attributes) return '-';
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  const getBoundAttributes = (itemCode: string) => {
      const item = items.find((i: any) => i.code === itemCode);
      if (!item || !item.attribute_ids) return [];
      return attributes.filter((a: any) => item.attribute_ids.includes(a.id));
  };

  const headerBoundAttrs = getBoundAttributes(newBOM.item_code);
  const lineBoundAttrs = getBoundAttributes(newBOMLine.item_code);

  // Recursive Tree Renderer
  const renderBOMTree = (bomLines: any[], level = 0) => {
      return (
          <div className="d-flex flex-column gap-1">
              {bomLines.map((line: any) => {
                  const subBOM = boms.find((b: any) => b.item_id === line.item_id);
                  const isExpandable = !!subBOM;
                  const isExpanded = expandedNodes[line.id];

                  return (
                      <div key={line.id} className="small">
                          <div className={`d-flex align-items-center ${level > 0 ? 'ps-3 border-start border-2' : ''} ${level > 0 ? 'ms-1' : ''}`}>
                              {isExpandable && (
                                  <i 
                                    className={`bi bi-caret-${isExpanded ? 'down' : 'right'}-fill me-1 text-muted`} 
                                    style={{cursor: 'pointer', fontSize: '0.7rem'}}
                                    onClick={() => toggleNode(line.id)}
                                  ></i>
                              )}
                              {!isExpandable && level > 0 && <span className="me-2 text-muted" style={{width: '10px'}}></span>}
                              
                              <div className="d-flex align-items-center gap-1 border-bottom pb-1 border-light w-100">
                                  <span className="fw-bold text-primary">{line.qty}</span> x {getItemName(line.item_id)}
                                  <div className="text-muted fst-italic" style={{fontSize: '0.7rem'}}>
                                      {(line.attribute_value_ids || []).map(getAttributeValueName).join(', ')}
                                  </div>
                                  {line.source_location_id && (
                                      <span className="badge bg-light text-dark border ms-2" style={{fontSize: '0.6rem'}}>
                                          <i className="bi bi-geo-alt me-1"></i>{getLocationName(line.source_location_id)}
                                      </span>
                                  )}
                                  {isExpandable && <span className="badge bg-secondary ms-auto" style={{fontSize: '0.6rem'}}>Sub-Assy</span>}
                              </div>
                          </div>
                          
                          {isExpandable && isExpanded && subBOM.lines && (
                              <div className="mt-1">
                                  {renderBOMTree(subBOM.lines, level + 1)}
                              </div>
                          )}
                      </div>
                  );
              })}
          </div>
      );
  };

  return (
    <div className="row g-4 fade-in">
       <CodeConfigModal 
           isOpen={isConfigOpen} 
           onClose={() => setIsConfigOpen(false)} 
           type="BOM"
           onSave={handleSaveConfig}
           initialConfig={codeConfig}
           attributes={attributes}
       />

       {/* Create BOM Modal */}
       {isCreateOpen && (
       <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
            <div className={`modal-dialog modal-xl modal-dialog-scrollable ui-style-${currentStyle}`}>
                <div className="modal-content shadow">
                    <div className="modal-header bg-warning bg-opacity-10 text-warning-emphasis">
                        <h5 className="modal-title"><i className="bi bi-file-earmark-plus me-2"></i>{t('create_recipe')}</h5>
                        <button type="button" className="btn-close" onClick={() => setIsCreateOpen(false)}></button>
                    </div>
                    <div className="modal-body">
                        <form onSubmit={handleSubmit}>
                            <div className="row g-3 mb-3">
                                <div className="col-md-8">
                                    <label className="form-label d-flex justify-content-between align-items-center small text-muted">
                                        {t('item_code')}
                                        <i className="bi bi-gear-fill text-muted" style={{cursor: 'pointer'}} onClick={() => setIsConfigOpen(true)}></i>
                                    </label>
                                    <input className="form-control" placeholder="Auto-generated" value={newBOM.code} onChange={e => setNewBOM({...newBOM, code: e.target.value})} required />
                                </div>
                                <div className="col-md-4">
                                    <label className="form-label small text-muted">{t('qty')}</label>
                                    <input type="number" className="form-control" value={newBOM.qty} onChange={e => setNewBOM({...newBOM, qty: parseFloat(e.target.value)})} required />
                                </div>
                            </div>
                            
                            <div className="p-3 bg-light rounded-3 mb-4 border border-warning border-opacity-25">
                                <h6 className="small text-uppercase text-muted fw-bold mb-3 border-bottom pb-2">{t('finished_good')}</h6>
                                <select className="form-select mb-3" value={newBOM.item_code} onChange={handleItemChange} required>
                                    <option value="">{t('search')}...</option>
                                    {items.map((item: any) => <option key={item.id} value={item.code}>{item.name} ({item.code})</option>)}
                                </select>

                                {headerBoundAttrs.map((attr: any) => (
                                    <div key={attr.id} className="mb-2">
                                        <label className="form-label small mb-1 text-muted">{attr.name}</label>
                                        <select 
                                            className="form-select form-select-sm"
                                            value={newBOM.attribute_value_ids.find(vid => attr.values.some((v:any) => v.id === vid)) || ''}
                                            onChange={e => handleValueChange(e.target.value, attr.id, true)}
                                        >
                                            <option value="">Select {attr.name}...</option>
                                            {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>

                            <div className="row g-4">
                                {/* Routing Section */}
                                <div className="col-md-6">
                                    <h6 className="small text-uppercase text-muted fw-bold mb-3">{t('routing_operations')}</h6>
                                    <div className="bg-light p-3 rounded-3 mb-4 border border-dashed h-100">
                                        <div className="row g-2 mb-3 align-items-end">
                                            <div className="col-3">
                                                <label className="form-label small text-muted">Seq</label>
                                                <input className="form-control form-control-sm" value={newBOMOp.sequence} onChange={e => setNewBOMOp({...newBOMOp, sequence: parseInt(e.target.value)})} />
                                            </div>
                                            <div className="col-9">
                                                <label className="form-label small text-muted">Operation</label>
                                                <select className="form-select form-select-sm" value={newBOMOp.operation_id} onChange={e => setNewBOMOp({...newBOMOp, operation_id: e.target.value})}>
                                                    <option value="">Select...</option>
                                                    {(operations || []).map((op: any) => <option key={op.id} value={op.id}>{op.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-6">
                                                <label className="form-label small text-muted">Station</label>
                                                <select className="form-select form-select-sm" value={newBOMOp.work_center_id} onChange={e => setNewBOMOp({...newBOMOp, work_center_id: e.target.value})}>
                                                    <option value="">Optional...</option>
                                                    {(workCenters || []).map((wc: any) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-3">
                                                <label className="form-label small text-muted">Time(m)</label>
                                                <input type="number" className="form-control form-control-sm" value={newBOMOp.time_minutes} onChange={e => setNewBOMOp({...newBOMOp, time_minutes: parseFloat(e.target.value)})} />
                                            </div>
                                            <div className="col-3">
                                                <button type="button" className="btn btn-sm btn-info w-100" onClick={handleAddOpToBOM} disabled={!newBOMOp.operation_id}>
                                                    <i className="bi bi-plus-lg"></i>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-2" style={{maxHeight: '200px', overflowY: 'auto'}}>
                                            {(newBOM.operations || []).sort((a:any,b:any) => a.sequence - b.sequence).map((op: any, idx) => (
                                                <div key={idx} className="d-flex justify-content-between align-items-center p-2 bg-white rounded border mb-1 small shadow-sm">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="badge bg-secondary">{op.sequence}</span>
                                                        <span className="fw-bold">{getOpName(op.operation_id)}</span> 
                                                        {op.work_center_id && <span className="text-muted fst-italic">@ {getWCName(op.work_center_id)}</span>}
                                                    </div>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="text-muted">{op.time_minutes}m</span>
                                                        <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => handleRemoveOp(idx)}>
                                                            <i className="bi bi-x-circle"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Materials Section */}
                                <div className="col-md-6">
                                    <h6 className="small text-uppercase text-muted fw-bold mb-3">{t('materials')}</h6>
                                    <div className="bg-light p-3 rounded-3 mb-3 border border-dashed h-100">
                                        <div className="row g-2 mb-3">
                                            <div className="col-12">
                                                <label className="form-label small text-muted">Item</label>
                                                <select className="form-select form-select-sm" value={newBOMLine.item_code} onChange={e => setNewBOMLine({...newBOMLine, item_code: e.target.value, attribute_value_ids: []})}>
                                                    <option value="">Select...</option>
                                                    {items.map((item: any) => <option key={item.id} value={item.code}>{item.name}</option>)}
                                                </select>
                                            </div>
                                            
                                            {lineBoundAttrs.map((attr: any) => (
                                                <div key={attr.id} className="col-6">
                                                    <label className="form-label small text-muted">{attr.name}</label>
                                                    <select 
                                                        className="form-select form-select-sm"
                                                        value={newBOMLine.attribute_value_ids.find(vid => attr.values.some((v:any) => v.id === vid)) || ''}
                                                        onChange={e => handleValueChange(e.target.value, attr.id, false)}
                                                    >
                                                        <option value="">Any {attr.name}</option>
                                                        {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                                    </select>
                                                </div>
                                            ))}

                                            <div className="col-6">
                                                <label className="form-label small text-muted">Qty</label>
                                                <input type="number" className="form-control form-control-sm" placeholder="0" value={newBOMLine.qty} onChange={e => setNewBOMLine({...newBOMLine, qty: parseFloat(e.target.value)})} />
                                            </div>
                                            
                                            <div className="col-6">
                                                <label className="form-label small text-muted">Source (Opt)</label>
                                                <select className="form-select form-select-sm" value={newBOMLine.source_location_code} onChange={e => setNewBOMLine({...newBOMLine, source_location_code: e.target.value})}>
                                                    <option value="">Default...</option>
                                                    {(locations || []).map((l: any) => (
                                                        <option key={l.id} value={l.code}>{l.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="col-12 mt-2 text-end">
                                                <button type="button" className="btn btn-sm btn-secondary px-3" onClick={handleAddLineToBOM} disabled={!newBOMLine.item_code}>{t('add')}</button>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-2" style={{maxHeight: '200px', overflowY: 'auto'}}>
                                            {newBOM.lines.map((line: any, idx) => (
                                                <div key={idx} className="d-flex justify-content-between align-items-center p-2 bg-white rounded border mb-1 small shadow-sm">
                                                    <div>
                                                        <span className="fw-bold">{line.item_code}</span> 
                                                        <div className="text-muted" style={{fontSize: '0.75rem'}}>
                                                            {(line.attribute_value_ids || []).map(getAttributeValueName).join(', ') || 'No variations'}
                                                        </div>
                                                        {line.source_location_code && (
                                                            <div className="text-primary fst-italic" style={{fontSize: '0.7rem'}}>
                                                                <i className="bi bi-geo-alt"></i> {getLocationNameByCode(line.source_location_code)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="badge bg-secondary">{line.qty}</span>
                                                        <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => handleRemoveLine(idx)}>
                                                            <i className="bi bi-x-circle"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="d-flex justify-content-end gap-2 mt-3">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>{t('cancel')}</button>
                                <button type="submit" className="btn btn-warning fw-bold px-4">{t('save')} BOM</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
       </div>
       )}

       {/* BOM List */}
       <div className="col-12">
          <div className="card h-100 shadow-sm border-0">
             <div className="card-header bg-white d-flex justify-content-between align-items-center">
                 <h5 className="card-title mb-0">{t('active_boms')}</h5>
                 <button className="btn btn-sm btn-primary" onClick={() => setIsCreateOpen(true)}>
                     <i className="bi bi-plus-lg me-2"></i>{t('create_recipe')}
                 </button>
             </div>
             <div className="card-body p-0" style={{maxHeight: 'calc(100vh - 150px)', overflowY: 'auto'}}>
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th className="ps-4">{t('item_code')}</th>
                                <th>{t('finished_good')}</th>
                                <th>{t('routing')}</th>
                                <th>{t('materials')}</th>
                                <th style={{width: '50px'}}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {boms.map((bom: any) => (
                                <tr key={bom.id}>
                                    <td className="ps-4 align-top"><span className="badge bg-light text-dark border font-monospace">{bom.code}</span></td>
                                    <td className="align-top">
                                        <div className="fw-medium">{getItemName(bom.item_id)}</div>
                                        <div className="text-muted small">
                                            {(bom.attribute_value_ids || []).map(getAttributeValueName).join(', ') || '-'}
                                        </div>
                                    </td>
                                    <td className="align-top">
                                        {bom.operations && bom.operations.length > 0 ? (
                                            <div className="small">
                                                {[...bom.operations].sort((a:any,b:any) => a.sequence - b.sequence).map((op: any) => (
                                                    <div key={op.id} className="text-muted">
                                                        {op.sequence}. {getOpName(op.operation_id)}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : <span className="text-muted small">-</span>}
                                    </td>
                                    <td className="align-top">
                                        {/* Recursive Tree View */}
                                        {renderBOMTree(bom.lines)}
                                    </td>
                                    <td className="pe-4 text-end align-top">
                                        <button className="btn btn-sm btn-link text-danger" onClick={() => onDeleteBOM(bom.id)}>
                                            <i className="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}