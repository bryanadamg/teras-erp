import { useState, useEffect } from 'react';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';

export default function BOMView({ items, boms, attributes, onCreateBOM }: any) {
  const [newBOM, setNewBOM] = useState({
      code: '',
      description: '',
      item_code: '',
      attribute_value_ids: [] as string[],
      qty: 1.0,
      lines: [] as any[]
  });
  const [newBOMLine, setNewBOMLine] = useState({ item_code: '', attribute_value_ids: [] as string[], qty: 0 });
  
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

  useEffect(() => {
      const savedConfig = localStorage.getItem('bom_code_config');
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
          // Find the attribute value names for selected attributes
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
          // Update the list of selected values for the header product
          // We need to replace the value for this specific attribute type if it exists
          const currentItem = items.find((i: any) => i.code === newBOM.item_code);
          const attr = attributes.find((a: any) => a.id === attrId);
          if (!attr) return;

          // Find current value ID that belongs to this attribute and remove it
          const otherValues = newBOM.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
          const newValues = valId ? [...otherValues, valId] : otherValues;
          
          const suggested = suggestBOMCode(newBOM.item_code, newValues);
          setNewBOM({...newBOM, attribute_value_ids: newValues, code: suggested});
      } else {
          const currentItem = items.find((i: any) => i.code === newBOMLine.item_code);
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
      setNewBOMLine({ item_code: '', attribute_value_ids: [], qty: 0 });
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (boms.some((b: any) => b.code === newBOM.code)) {
          alert('BOM Code already exists.');
          return;
      }
      onCreateBOM(newBOM);
      setNewBOM({ code: '', description: '', item_code: '', attribute_value_ids: [], qty: 1.0, lines: [] });
  };

  // Helpers
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  
  const getAttributeValueName = (valId: string) => {
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

       <div className="col-md-5">
          <div className="card h-100 shadow-sm border-0">
             <div className="card-header bg-warning bg-opacity-10 text-warning-emphasis">
                 <h5 className="card-title mb-0"><i className="bi bi-file-earmark-plus me-2"></i>Create Recipe</h5>
             </div>
             <div className="card-body">
                <form onSubmit={handleSubmit}>
                    <div className="row g-3 mb-3">
                        <div className="col-md-8">
                            <label className="form-label d-flex justify-content-between align-items-center small text-muted">
                                BOM Code
                                <i className="bi bi-gear-fill text-muted" style={{cursor: 'pointer'}} onClick={() => setIsConfigOpen(true)}></i>
                            </label>
                            <input className="form-control" placeholder="Auto-generated" value={newBOM.code} onChange={e => setNewBOM({...newBOM, code: e.target.value})} required />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small text-muted">Output Qty</label>
                            <input type="number" className="form-control" value={newBOM.qty} onChange={e => setNewBOM({...newBOM, qty: parseFloat(e.target.value)})} required />
                        </div>
                    </div>
                    
                    <div className="p-3 bg-light rounded-3 mb-4">
                        <h6 className="small text-uppercase text-muted fw-bold mb-3 border-bottom pb-2">Finished Good</h6>
                        <select className="form-select mb-3" value={newBOM.item_code} onChange={handleItemChange} required>
                            <option value="">Select Item...</option>
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

                    <h6 className="small text-uppercase text-muted fw-bold mb-3">Materials (Lines)</h6>
                    <div className="bg-light p-3 rounded-3 mb-3 border border-dashed">
                        <div className="row g-2 mb-3">
                            <div className="col-12">
                                <label className="form-label small text-muted">Item</label>
                                <select className="form-select form-select-sm" value={newBOMLine.item_code} onChange={e => setNewBOMLine({...newBOMLine, item_code: e.target.value, attribute_value_ids: []})}>
                                    <option value="">Select...</option>
                                    {items.map((item: any) => <option key={item.id} value={item.code}>{item.name}</option>)}
                                </select>
                            </div>
                            
                            {lineBoundAttrs.map((attr: any) => (
                                <div key={attr.id} className="col-md-6">
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

                            <div className="col-12">
                                <label className="form-label small text-muted">Quantity</label>
                                <div className="input-group input-group-sm">
                                    <input type="number" className="form-control" placeholder="0" value={newBOMLine.qty} onChange={e => setNewBOMLine({...newBOMLine, qty: parseFloat(e.target.value)})} />
                                    <button type="button" className="btn btn-secondary px-3" onClick={handleAddLineToBOM} disabled={!newBOMLine.item_code}>Add</button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-2">
                            {newBOM.lines.map((line: any, idx) => (
                                <div key={idx} className="d-flex justify-content-between align-items-center p-2 bg-white rounded border mb-1 small shadow-sm">
                                    <div>
                                        <span className="fw-bold">{line.item_code}</span> 
                                        <div className="text-muted" style={{fontSize: '0.75rem'}}>
                                            {line.attribute_value_ids.map(getAttributeValueName).join(', ') || 'No variations'}
                                        </div>
                                    </div>
                                    <span className="badge bg-secondary">{line.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="btn btn-warning w-100 fw-bold">Save BOM</button>
                </form>
             </div>
          </div>
       </div>

       {/* BOM List */}
       <div className="col-md-7">
          <div className="card h-100 shadow-sm border-0">
             <div className="card-header bg-white">
                 <h5 className="card-title mb-0">Active BOMs</h5>
             </div>
             <div className="card-body p-0">
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th className="ps-4">Code</th>
                                <th>Product</th>
                                <th className="text-end">Output</th>
                                <th>Materials</th>
                            </tr>
                        </thead>
                        <tbody>
                            {boms.map((bom: any) => (
                                <tr key={bom.id}>
                                    <td className="ps-4"><span className="badge bg-light text-dark border font-monospace">{bom.code}</span></td>
                                    <td>
                                        <div className="fw-medium">{getItemName(bom.item_id)}</div>
                                        <div className="text-muted small">
                                            {bom.attribute_value_ids.map(getAttributeValueName).join(', ') || '-'}
                                        </div>
                                    </td>
                                    <td className="text-end fw-bold">{bom.qty}</td>
                                    <td>
                                        <div className="d-flex flex-column gap-1">
                                            {bom.lines.map((line: any) => (
                                                <div key={line.id} className="small border-bottom pb-1 border-light">
                                                    <span className="fw-bold text-primary">{line.qty}</span> x {getItemName(line.item_id)}
                                                    <div className="text-muted" style={{fontSize: '0.7rem'}}>
                                                        {line.attribute_value_ids.map(getAttributeValueName).join(', ')}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
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