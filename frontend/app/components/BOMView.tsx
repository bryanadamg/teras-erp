import { useState, useEffect } from 'react';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';

export default function BOMView({ items, boms, attributes, onCreateBOM }: any) {
  const [newBOM, setNewBOM] = useState({
      code: '',
      description: '',
      item_code: '',
      attribute_value_id: '',
      qty: 1.0,
      lines: [] as any[]
  });
  const [newBOMLine, setNewBOMLine] = useState({ item_code: '', attribute_value_id: '', qty: 0 });
  
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
          const suggested = suggestBOMCode(newBOM.item_code, newBOM.attribute_value_id, newConfig);
          setNewBOM(prev => ({ ...prev, code: suggested }));
      }
  };

  const suggestBOMCode = (itemCode: string, attributeValueId: string = '', config = codeConfig) => {
      const parts = [];
      if (config.prefix) parts.push(config.prefix);
      if (config.includeItemCode && itemCode) parts.push(itemCode);
      
      if (config.includeVariant && attributeValueId) {
          // Find the attribute value name
          let foundValueName = "";
          for (const attr of attributes) {
              const val = attr.values.find((v: any) => v.id === attributeValueId);
              if (val) {
                  if (!config.variantAttributeNames || config.variantAttributeNames.length === 0 || config.variantAttributeNames.includes(attr.name)) {
                      foundValueName = val.value.toUpperCase().replace(/\s+/g, '');
                  }
                  break;
              }
          }
          if (foundValueName) parts.push(foundValueName);
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
      const suggestedCode = suggestBOMCode(itemCode, newBOM.attribute_value_id);
      setNewBOM({...newBOM, item_code: itemCode, code: suggestedCode, attribute_value_id: ''});
  };

  const handleAttributeValueChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const valId = e.target.value;
      const suggestedCode = suggestBOMCode(newBOM.item_code, valId);
      setNewBOM({...newBOM, attribute_value_id: valId, code: suggestedCode});
  };

  const handleAddLineToBOM = () => {
      if (!newBOMLine.item_code || newBOMLine.qty <= 0) return;
      const linePayload: any = { ...newBOMLine };
      if (!linePayload.attribute_value_id) delete linePayload.attribute_value_id;
      
      setNewBOM({ ...newBOM, lines: [...newBOM.lines, linePayload] });
      setNewBOMLine({ item_code: '', attribute_value_id: '', qty: 0 });
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (boms.some((b: any) => b.code === newBOM.code)) {
          alert('BOM Code already exists. Please choose a unique code.');
          return;
      }
      onCreateBOM(newBOM);
      setNewBOM({ code: '', description: '', item_code: '', attribute_value_id: '', qty: 1.0, lines: [] });
  };

  // Helpers
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getAttributeValueName = (valId: string) => {
      if (!valId) return '-';
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  const getAvailableValues = (itemCode: string) => {
      const item = items.find((i: any) => i.code === itemCode);
      if (!item || !item.attribute_id) return [];
      const attr = attributes.find((a: any) => a.id === item.attribute_id);
      return attr ? attr.values : [];
  };

  const availableValuesForBOM = getAvailableValues(newBOM.item_code);
  const availableValuesForLine = getAvailableValues(newBOMLine.item_code);

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

       {/* Create BOM Form */}
       <div className="col-md-5">
          <div className="card h-100">
             <div className="card-header bg-warning bg-opacity-10 text-warning-emphasis">
                 <h5 className="card-title mb-0"><i className="bi bi-file-earmark-plus me-2"></i>Create Recipe</h5>
             </div>
             <div className="card-body">
                <form onSubmit={handleSubmit}>
                    <div className="row g-3 mb-3">
                        <div className="col-md-8">
                            <label className="form-label d-flex justify-content-between align-items-center">
                                BOM Code
                                <i className="bi bi-gear-fill text-muted" style={{cursor: 'pointer', fontSize: '0.8rem'}} onClick={() => setIsConfigOpen(true)} title="Configure Auto-Suggestion"></i>
                            </label>
                            <input className="form-control" placeholder="Auto-generated" value={newBOM.code} onChange={e => setNewBOM({...newBOM, code: e.target.value})} required />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label">Output Qty</label>
                            <input type="number" className="form-control" placeholder="1.0" value={newBOM.qty} onChange={e => setNewBOM({...newBOM, qty: parseFloat(e.target.value)})} required />
                        </div>
                        <div className="col-12">
                            <label className="form-label">Description</label>
                            <input className="form-control" placeholder="Recipe description..." value={newBOM.description} onChange={e => setNewBOM({...newBOM, description: e.target.value})} />
                        </div>
                    </div>
                    
                    <div className="p-3 bg-light rounded-3 mb-4">
                        <h6 className="small text-uppercase text-muted fw-bold mb-3">Finished Good</h6>
                        <div className="row g-2">
                            <div className="col-7">
                                <select className="form-select" value={newBOM.item_code} onChange={handleItemChange} required>
                                    <option value="">Select Item...</option>
                                    {items.map((item: any) => <option key={item.id} value={item.code}>{item.name}</option>)}
                                </select>
                            </div>
                            <div className="col-5">
                                <select className="form-select" value={newBOM.attribute_value_id} onChange={handleAttributeValueChange} disabled={availableValuesForBOM.length === 0}>
                                    <option value="">{availableValuesForBOM.length > 0 ? 'Select Value' : 'No Variations'}</option>
                                    {availableValuesForBOM.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <h6 className="card-title text-muted small text-uppercase mb-3">Raw Materials</h6>
                    <div className="bg-light p-3 rounded-3 mb-3 border border-dashed">
                        <div className="row g-2 align-items-end">
                            <div className="col-5">
                                <label className="form-label small">Item</label>
                                <select className="form-select form-select-sm" value={newBOMLine.item_code} onChange={e => setNewBOMLine({...newBOMLine, item_code: e.target.value, attribute_value_id: ''})}>
                                    <option value="">Select...</option>
                                    {items.map((item: any) => <option key={item.id} value={item.code}>{item.name}</option>)}
                                </select>
                            </div>
                            <div className="col-4">
                                <label className="form-label small">Value</label>
                                <select className="form-select form-select-sm" value={newBOMLine.attribute_value_id} onChange={e => setNewBOMLine({...newBOMLine, attribute_value_id: e.target.value})} disabled={availableValuesForLine.length === 0}>
                                    <option value="">{availableValuesForLine.length > 0 ? 'Value' : '-'}</option>
                                    {availableValuesForLine.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                </select>
                            </div>
                            <div className="col-3">
                                <label className="form-label small">Qty</label>
                                <input type="number" className="form-control form-control-sm" placeholder="0" value={newBOMLine.qty} onChange={e => setNewBOMLine({...newBOMLine, qty: parseFloat(e.target.value)})} />
                            </div>
                            <div className="col-12 mt-2">
                                <button type="button" className="btn btn-sm btn-secondary w-100" onClick={handleAddLineToBOM}><i className="bi bi-plus-lg"></i> Add Line</button>
                            </div>
                        </div>
                        
                        <div className="mt-3">
                            {newBOM.lines.map((line: any, idx) => (
                                <div key={idx} className="d-flex justify-content-between align-items-center p-2 bg-white rounded border mb-1 shadow-sm">
                                    <div className="small">
                                        <span className="fw-bold">{line.item_code}</span> 
                                        {line.attribute_value_id && <span className="text-muted ms-1">({getAttributeValueName(line.attribute_value_id)})</span>}
                                    </div>
                                    <span className="badge bg-secondary">{line.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="btn btn-warning w-100 text-dark fw-bold">Save BOM</button>
                </form>
             </div>
          </div>
       </div>

       {/* BOM List */}
       <div className="col-md-7">
          <div className="card h-100">
             <div className="card-header">
                 <h5 className="card-title mb-0">Active BOMs</h5>
             </div>
             <div className="card-body p-0">
                <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                <th>BOM Code</th>
                                <th>Product</th>
                                <th className="text-end">Output</th>
                                <th>Materials</th>
                            </tr>
                        </thead>
                        <tbody>
                            {boms.map((bom: any) => (
                                <tr key={bom.id}>
                                    <td><span className="badge bg-light text-dark border font-monospace">{bom.code}</span></td>
                                    <td>
                                        <div className="fw-medium">{getItemName(bom.item_id)}</div>
                                        <div className="small text-muted">{getAttributeValueName(bom.attribute_value_id)}</div>
                                    </td>
                                    <td className="text-end fw-bold">{bom.qty}</td>
                                    <td>
                                        <div className="d-flex flex-column gap-1">
                                            {bom.lines.map((line: any) => (
                                                <div key={line.id} className="small border-bottom pb-1 border-light">
                                                    <span className="fw-bold text-primary">{line.qty}</span> x {getItemName(line.item_id)}
                                                    <span className="text-muted ms-1"> {getAttributeValueName(line.attribute_value_id) !== '-' ? `(${getAttributeValueName(line.attribute_value_id)})` : ''}</span>
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
