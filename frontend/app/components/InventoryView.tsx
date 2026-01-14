import { useState } from 'react';

export default function InventoryView({ 
    items, 
    attributes,
    categories,
    onCreateItem, 
    onUpdateItem,
    onAddVariant,
    onDeleteVariant,
    onCreateCategory,
    onRefresh 
}: any) {
  // Creation State
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '', category: '', source_sample_id: '', variants: [] as any[] });
  
  // Editing State
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Shared State (Variant Adding)
  const [newVariant, setNewVariant] = useState({ name: '', category: '' });
  const [selectedAttributeId, setSelectedAttributeId] = useState('');
  const [selectedAttributeValue, setSelectedAttributeValue] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);

  // Filtering
  const [categoryFilter, setCategoryFilter] = useState('');

  // --- Variant Handlers ---
  
  const handleAddVariantToLocal = () => {
      if (!newVariant.name) return;
      setNewItem({ ...newItem, variants: [...newItem.variants, newVariant] });
      setNewVariant({ name: '', category: '' });
  };

  const handleAddFromTemplateToLocal = () => {
      if (!selectedAttributeId || !selectedAttributeValue) return;
      const attr = attributes.find((a: any) => a.id === selectedAttributeId);
      if (!attr) return;

      const variant = { name: selectedAttributeValue, category: attr.name };
      
      if (newItem.variants.some(v => v.name === variant.name && v.category === variant.category)) {
          alert('Variant already added');
          return;
      }
      setNewItem({ ...newItem, variants: [...newItem.variants, variant] });
      setSelectedAttributeValue('');
  };

  const handleAddVariantToExisting = async () => {
      if (!editingItem) return;
      
      let variantToAdd = null;

      if (selectedAttributeId && selectedAttributeValue) {
          const attr = attributes.find((a: any) => a.id === selectedAttributeId);
          if (attr) {
              variantToAdd = { name: selectedAttributeValue, category: attr.name };
          }
      } else if (newVariant.name) {
          variantToAdd = newVariant;
      }

      if (variantToAdd) {
          await onAddVariant(editingItem.id, variantToAdd);
          setNewVariant({ name: '', category: '' });
          setSelectedAttributeValue('');
      }
  };

  const handleDeleteExistingVariant = async (variantId: string) => {
      await onDeleteVariant(variantId);
  };

  // --- Item Handlers ---

  const handleSubmitItem = (e: React.FormEvent) => {
      e.preventDefault();
      const payload: any = { ...newItem };
      if (!payload.source_sample_id) delete payload.source_sample_id;
      
      onCreateItem(payload);
      setNewItem({ code: '', name: '', uom: '', category: '', source_sample_id: '', variants: [] });
      setSelectedAttributeId('');
      setSelectedAttributeValue('');
  };

  const handleUpdateItemSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingItem) return;
      
      const payload: any = {
          code: editingItem.code,
          name: editingItem.name,
          uom: editingItem.uom,
          category: editingItem.category
      };
      if (editingItem.source_sample_id) payload.source_sample_id = editingItem.source_sample_id;

      onUpdateItem(editingItem.id, payload);
      setEditingItem(null);
  };

  const handleAddCategory = () => {
      if (newCategoryName) {
          onCreateCategory(newCategoryName);
          setNewCategoryName('');
          setShowCatInput(false);
      }
  };

  // Derived
  const activeAttribute = attributes.find((a: any) => a.id === selectedAttributeId);
  const activeEditingItem = editingItem ? items.find((i: any) => i.id === editingItem.id) : null;

  // Filtered Items
  const filteredItems = categoryFilter 
      ? items.filter((i: any) => i.category === categoryFilter)
      : items;
      
  const sampleItems = items.filter((i: any) => i.category === 'Sample');

  return (
    <div className="row g-4 fade-in">
      
      {/* LEFT COLUMN: Items List */}
      <div className="col-md-8 order-2 order-md-1">
        <div className="card h-100">
          <div className="card-header d-flex justify-content-between align-items-center bg-white">
            <div>
                <h5 className="card-title mb-0">Item Inventory</h5>
                <p className="text-muted small mb-0 mt-1">Master list of all products and materials</p>
            </div>
            <div className="d-flex align-items-center gap-2">
                <select className="form-select form-select-sm" style={{width: '180px'}} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">All Categories</option>
                    {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}><i className="bi bi-arrow-clockwise"></i></button>
            </div>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-4">Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Variants</th>
                    <th style={{width: '50px'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item: any) => (
                    <tr key={item.id} className={editingItem?.id === item.id ? 'table-primary' : ''}>
                      <td className="ps-4 fw-medium font-monospace">
                          {item.code}
                          {item.source_sample_id && <div className="text-muted small" style={{fontSize: '0.7rem'}}><i className="bi bi-link-45deg"></i> Linked</div>}
                      </td>
                      <td>{item.name}</td>
                      <td>{item.category && <span className="badge bg-light text-dark border">{item.category}</span>}</td>
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                        {item.variants && item.variants.map((v: any) => (
                            <span key={v.id} className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10 small">{v.name}</span>
                        ))}
                        </div>
                      </td>
                      <td>
                          <button className="btn btn-sm btn-link text-primary" onClick={() => setEditingItem(item)}>
                              <i className="bi bi-pencil-square"></i>
                          </button>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-5">No items found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Create / Edit Form */}
      <div className="col-md-4 order-1 order-md-2">
        <div className={`card sticky-top border-0 ${activeEditingItem ? 'shadow-lg border-primary border-opacity-50' : 'shadow-sm'}`} style={{top: '24px', zIndex: 100}}>
          <div className={`card-header ${activeEditingItem ? 'bg-primary text-white' : 'bg-white'}`}>
             <h5 className="card-title mb-0">
                 {activeEditingItem ? <span><i className="bi bi-pencil-square me-2"></i>Edit Item</span> : <span><i className="bi bi-plus-circle me-2"></i>Create Item</span>}
             </h5>
          </div>
          <div className="card-body">
            
            {activeEditingItem ? (
                // --- EDIT MODE ---
                <div>
                    <form onSubmit={handleUpdateItemSubmit} className="mb-4">
                        <div className="mb-3">
                            <label className="form-label small">Code</label>
                            <input className="form-control" value={editingItem.code} onChange={e => setEditingItem({...editingItem, code: e.target.value})} required />
                        </div>
                        <div className="mb-3">
                            <label className="form-label small">Name</label>
                            <input className="form-control" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} required />
                        </div>
                        <div className="row g-2 mb-3">
                            <div className="col-6">
                                <label className="form-label small">Category</label>
                                <select className="form-select" value={editingItem.category || ''} onChange={e => setEditingItem({...editingItem, category: e.target.value})}>
                                    <option value="">Select...</option>
                                    {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="col-6">
                                <label className="form-label small">UOM</label>
                                <input className="form-control" value={editingItem.uom} onChange={e => setEditingItem({...editingItem, uom: e.target.value})} required />
                            </div>
                        </div>
                        
                        <div className="mb-3">
                            <label className="form-label small text-muted">Source Sample</label>
                            <select className="form-select" value={editingItem.source_sample_id || ''} onChange={e => setEditingItem({...editingItem, source_sample_id: e.target.value})}>
                                <option value="">None</option>
                                {sampleItems.map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="d-flex justify-content-between">
                            <button type="button" className="btn btn-sm btn-light text-muted" onClick={() => setEditingItem(null)}>Cancel</button>
                            <button type="submit" className="btn btn-primary btn-sm px-3">Save Changes</button>
                        </div>
                    </form>

                    <hr className="my-3 opacity-25"/>

                    <h6 className="small text-muted text-uppercase fw-bold mb-3">Variants</h6>
                    
                    {/* Add Variant to Existing */}
                    <div className="mb-3">
                        <div className="input-group input-group-sm mb-2">
                            <select className="form-select" style={{maxWidth: '100px'}} value={selectedAttributeId} onChange={e => { setSelectedAttributeId(e.target.value); setSelectedAttributeValue(''); }}>
                                <option value="">Template</option>
                                {attributes.map((attr: any) => <option key={attr.id} value={attr.id}>{attr.name}</option>)}
                            </select>
                            {activeAttribute ? (
                                <select className="form-select" value={selectedAttributeValue} onChange={e => setSelectedAttributeValue(e.target.value)}>
                                    <option value="">Value...</option>
                                    {activeAttribute.values.map((val: any) => <option key={val.id} value={val.value}>{val.value}</option>)}
                                </select>
                            ) : (
                                <input className="form-control" placeholder="Manual" value={newVariant.name} onChange={e => setNewVariant({...newVariant, name: e.target.value})} />
                            )}
                            <button className="btn btn-success" onClick={handleAddVariantToExisting}><i className="bi bi-plus"></i></button>
                        </div>
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                        {activeEditingItem.variants.map((v: any) => (
                            <span key={v.id} className="badge bg-white text-dark border shadow-sm">
                                {v.category && <span className="text-muted fw-normal me-1">{v.category}:</span>}
                                {v.name}
                                <i className="bi bi-trash ms-2 text-danger" style={{cursor: 'pointer'}} onClick={() => handleDeleteExistingVariant(v.id)}></i>
                            </span>
                        ))}
                        {activeEditingItem.variants.length === 0 && <small className="text-muted fst-italic">No variants</small>}
                    </div>
                </div>
            ) : (
                // --- CREATE MODE ---
                <form onSubmit={handleSubmitItem}>
                  <div className="mb-3">
                      <label className="form-label">Item Code</label>
                      <input className="form-control" placeholder="ITM-001" value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                      <label className="form-label">Item Name</label>
                      <input className="form-control" placeholder="Product Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required />
                  </div>
                  <div className="row g-2 mb-3">
                      <div className="col-7">
                          <label className="form-label d-flex justify-content-between">
                              Category 
                              <span className="text-primary" style={{cursor:'pointer'}} onClick={() => setShowCatInput(!showCatInput)}><i className="bi bi-plus-circle"></i></span>
                          </label>
                          {showCatInput ? (
                              <div className="input-group input-group-sm">
                                  <input className="form-control" placeholder="New..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} autoFocus />
                                  <button type="button" className="btn btn-primary" onClick={handleAddCategory}><i className="bi bi-check"></i></button>
                              </div>
                          ) : (
                              <select className="form-select" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                                  <option value="">Select...</option>
                                  {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                          )}
                      </div>
                      <div className="col-5">
                          <label className="form-label">UOM</label>
                          <input className="form-control" placeholder="Unit" value={newItem.uom} onChange={e => setNewItem({...newItem, uom: e.target.value})} required />
                      </div>
                  </div>
                  
                  <div className="mb-3">
                      <label className="form-label small text-muted">Source Sample (Optional)</label>
                      <select className="form-select" value={newItem.source_sample_id} onChange={e => setNewItem({...newItem, source_sample_id: e.target.value})}>
                          <option value="">None</option>
                          {sampleItems.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                          ))}
                      </select>
                  </div>
                  
                  {/* Variant Input Section */}
                  <div className="mb-3 p-3 bg-light rounded-3 border border-dashed">
                    <label className="form-label small text-muted text-uppercase mb-2 fw-bold">Variants</label>
                    
                    <div className="mb-2">
                        <div className="input-group input-group-sm">
                            <span className="input-group-text bg-white">1</span>
                            <select className="form-select" value={selectedAttributeId} onChange={e => { setSelectedAttributeId(e.target.value); setSelectedAttributeValue(''); }}>
                                <option value="">Attribute...</option>
                                {attributes.map((attr: any) => <option key={attr.id} value={attr.id}>{attr.name}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="mb-2">
                        <div className="input-group input-group-sm">
                            <span className="input-group-text bg-white">2</span>
                            <select className="form-select" value={selectedAttributeValue} onChange={e => setSelectedAttributeValue(e.target.value)} disabled={!activeAttribute}>
                                <option value="">Select Value...</option>
                                {activeAttribute?.values.map((val: any) => <option key={val.id} value={val.value}>{val.value}</option>)}
                            </select>
                            <button type="button" className="btn btn-secondary" onClick={handleAddFromTemplateToLocal} disabled={!selectedAttributeValue}>
                                <i className="bi bi-plus-lg"></i>
                            </button>
                        </div>
                    </div>

                    <div className="text-center text-muted small my-1">- OR -</div>

                    <div className="input-group input-group-sm mb-2">
                        <input className="form-control" placeholder="Manual Name" value={newVariant.name} onChange={e => setNewVariant({...newVariant, name: e.target.value})} />
                        <input className="form-control" placeholder="Cat" style={{maxWidth: '60px'}} value={newVariant.category} onChange={e => setNewVariant({...newVariant, category: e.target.value})} />
                        <button type="button" className="btn btn-outline-secondary" onClick={handleAddVariantToLocal}>Add</button>
                    </div>
                    
                    <div className="d-flex flex-wrap gap-1 mt-2">
                        {newItem.variants.map((v, idx) => (
                            <span key={idx} className="badge bg-white text-dark border shadow-sm">
                                {v.category && <span className="text-muted fw-normal me-1">{v.category}:</span>}
                                {v.name}
                                <i className="bi bi-x ms-1 text-danger" style={{cursor: 'pointer'}} onClick={() => {
                                    const updated = newItem.variants.filter((_, i) => i !== idx);
                                    setNewItem({...newItem, variants: updated});
                                }}></i>
                            </span>
                        ))}
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary w-100 fw-bold">Create Item</button>
                </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
