import { useState } from 'react';

export default function BOMView({ items, boms, onCreateBOM }: any) {
  const [newBOM, setNewBOM] = useState({
      code: '',
      description: '',
      item_code: '',
      variant_id: '',
      qty: 1.0,
      lines: [] as any[]
  });
  const [newBOMLine, setNewBOMLine] = useState({ item_code: '', variant_id: '', qty: 0 });

  const handleAddLineToBOM = () => {
      if (!newBOMLine.item_code || newBOMLine.qty <= 0) return;
      const linePayload: any = { ...newBOMLine };
      if (!linePayload.variant_id) delete linePayload.variant_id;
      
      setNewBOM({ ...newBOM, lines: [...newBOM.lines, linePayload] });
      setNewBOMLine({ item_code: '', variant_id: '', qty: 0 });
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateBOM(newBOM);
      // Reset is handled by parent or manual here? Parent doesn't reset state passed down usually.
      // We'll rely on the parent to re-render or we reset here. Ideally reset here.
      setNewBOM({ code: '', description: '', item_code: '', variant_id: '', qty: 1.0, lines: [] });
  };

  // Helpers
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getVariantName = (itemId: string, variantId: string) => {
      if (!variantId) return '-';
      const item = items.find((i: any) => i.id === itemId);
      if (!item) return variantId;
      const variant = (item as any).variants.find((v: any) => v.id === variantId);
      return variant ? variant.name : variantId;
  };

  const selectedItemForBOM = items.find((i: any) => i.code === newBOM.item_code);
  const availableVariantsForBOM = selectedItemForBOM ? (selectedItemForBOM as any).variants : [];

  const selectedLineItemForBOM = items.find((i: any) => i.code === newBOMLine.item_code);
  const availableLineVariantsForBOM = selectedLineItemForBOM ? (selectedLineItemForBOM as any).variants : [];

  return (
    <div className="row g-4 fade-in">
       {/* Create BOM Form */}
       <div className="col-md-5">
          <div className="card h-100">
             <div className="card-header bg-warning bg-opacity-10 text-warning-emphasis">
                 <h5 className="card-title mb-0"><i className="bi bi-file-earmark-plus me-2"></i>Create Recipe</h5>
             </div>
             <div className="card-body">
                <form onSubmit={handleSubmit}>
                    <div className="row g-3 mb-3">
                        <div className="col-md-6">
                            <label className="form-label">BOM Code</label>
                            <input className="form-control" placeholder="BOM-001" value={newBOM.code} onChange={e => setNewBOM({...newBOM, code: e.target.value})} required />
                        </div>
                        <div className="col-md-6">
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
                                <select className="form-select" value={newBOM.item_code} onChange={e => setNewBOM({...newBOM, item_code: e.target.value, variant_id: ''})} required>
                                    <option value="">Select Item...</option>
                                    {items.map((item: any) => <option key={item.id} value={item.code}>{item.name}</option>)}
                                </select>
                            </div>
                            <div className="col-5">
                                <select className="form-select" value={newBOM.variant_id} onChange={e => setNewBOM({...newBOM, variant_id: e.target.value})} disabled={availableVariantsForBOM.length === 0}>
                                    <option value="">{availableVariantsForBOM.length > 0 ? 'Variant' : '-'}</option>
                                    {availableVariantsForBOM.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <h6 className="card-title text-muted small text-uppercase mb-3">Raw Materials</h6>
                    <div className="bg-light p-3 rounded-3 mb-3 border border-dashed">
                        <div className="row g-2 align-items-end">
                            <div className="col-5">
                                <label className="form-label small">Item</label>
                                <select className="form-select form-select-sm" value={newBOMLine.item_code} onChange={e => setNewBOMLine({...newBOMLine, item_code: e.target.value, variant_id: ''})}>
                                    <option value="">Select...</option>
                                    {items.map((item: any) => <option key={item.id} value={item.code}>{item.name}</option>)}
                                </select>
                            </div>
                            <div className="col-4">
                                <label className="form-label small">Variant</label>
                                <select className="form-select form-select-sm" value={newBOMLine.variant_id} onChange={e => setNewBOMLine({...newBOMLine, variant_id: e.target.value})} disabled={availableLineVariantsForBOM.length === 0}>
                                    <option value="">{availableLineVariantsForBOM.length > 0 ? 'Variant' : '-'}</option>
                                    {availableLineVariantsForBOM.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
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
                                        {line.variant_id && <span className="text-muted ms-1">({items.find((i:any) => i.code === line.item_code)?.variants.find((v:any) => v.id === line.variant_id)?.name})</span>}
                                    </div>
                                    <span className="badge bg-secondary">{line.qty}</span>
                                </div>
                            ))}
                            {newBOM.lines.length === 0 && <div className="text-center text-muted small fst-italic py-2">No materials added</div>}
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
                                        <div className="small text-muted">{getVariantName(bom.item_id, bom.variant_id)}</div>
                                    </td>
                                    <td className="text-end fw-bold">{bom.qty}</td>
                                    <td>
                                        <div className="d-flex flex-column gap-1">
                                            {bom.lines.map((line: any) => (
                                                <div key={line.id} className="small border-bottom pb-1 border-light">
                                                    <span className="fw-bold text-primary">{line.qty}</span> x {getItemName(line.item_id)}
                                                    <span className="text-muted ms-1"> {getVariantName(line.item_id, line.variant_id) !== '-' ? `(${getVariantName(line.item_id, line.variant_id)})` : ''}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {boms.length === 0 && <tr><td colSpan={4} className="text-center py-5 text-muted">No BOMs found</td></tr>}
                        </tbody>
                    </table>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}
