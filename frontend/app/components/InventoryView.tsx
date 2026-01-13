import { useState } from 'react';

export default function InventoryView({ 
    items, 
    locations, 
    attributes,
    categories,
    onCreateItem, 
    onUpdateItem,
    onAddVariant,
    onDeleteVariant,
    onCreateLocation, 
    onCreateCategory,
    onRefresh 
}: any) {
  // Creation State
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '', category: '', variants: [] as any[] });
  
  // Editing State
  const [editingItem, setEditingItem] = useState<any>(null);
  
  // Shared State (Variant Adding)
  const [newVariant, setNewVariant] = useState({ name: '', category: '' });
  const [selectedAttributeId, setSelectedAttributeId] = useState('');
  const [selectedAttributeValue, setSelectedAttributeValue] = useState('');
  
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });
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
      onCreateItem(newItem);
      setNewItem({ code: '', name: '', uom: '', category: '', variants: [] });
      setSelectedAttributeId('');
      setSelectedAttributeValue('');
  };

  const handleUpdateItemSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingItem) return;
      onUpdateItem(editingItem.id, {
          code: editingItem.code,
          name: editingItem.name,
          uom: editingItem.uom,
          category: editingItem.category
      });
      setEditingItem(null);
  };

  const handleSubmitLocation = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateLocation(newLocation);
      setNewLocation({ code: '', name: '' });
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

  return (
    <div className="row g-4 fade-in">
      {/* Items Card */}
      <div className="col-md-8">
        <div className="card h-100">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0">Item Master</h5>
            <div className="d-flex align-items-center gap-2">
                <span className="badge bg-primary rounded-pill">{items.length} Items</span>
                {editingItem && <button className="btn btn-sm btn-secondary" onClick={() => setEditingItem(null)}>Cancel Edit</button>}
            </div>
          </div>
          <div className="card-body">
            
            {activeEditingItem ? (
                // --- EDIT MODE ---
                <div className="mb-4 p-4 bg-light rounded-3 border border-primary border-opacity-25">
                    <h6 className="text-primary fw-bold mb-3">Editing: {activeEditingItem.code}</h6>
                    
                    <form onSubmit={handleUpdateItemSubmit} className="mb-4">
                        <div className="row g-3">
                            <div className="col-md-3">
                                <label className="form-label small">Code</label>
                                <input className="form-control" value={editingItem.code} onChange={e => setEditingItem({...editingItem, code: e.target.value})} required />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label small">Name</label>
                                <input className="form-control" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} required />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label small">Category</label>
                                <select className="form-select" value={editingItem.category || ''} onChange={e => setEditingItem({...editingItem, category: e.target.value})}>
                                    <option value="">Select...</option>
                                    {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <label className="form-label small">UOM</label>
                                <input className="form-control" value={editingItem.uom} onChange={e => setEditingItem({...editingItem, uom: e.target.value})} required />
                            </div>
                            <div className="col-12 text-end">
                                <button type="submit" className="btn btn-primary btn-sm">Update Details</button>
                            </div>
                        </div>
                    </form>

                    <hr className="my-3 opacity-25"/>

                    <h6 className="small text-muted text-uppercase fw-bold mb-2">Manage Variants</h6>
                    
                    <div className="row g-2 mb-3 align-items-end">
                        <div className="col-md-4">
                            <select className="form-select form-select-sm" value={selectedAttributeId} onChange={e => { setSelectedAttributeId(e.target.value); setSelectedAttributeValue(''); }}>
                                <option value="">Template...</option>
                                {attributes.map((attr: any) => <option key={attr.id} value={attr.id}>{attr.name}</option>)}
                            </select>
                        </div>
                        <div className="col-md-4">
                            {activeAttribute ? (
                                <select className="form-select form-select-sm" value={selectedAttributeValue} onChange={e => setSelectedAttributeValue(e.target.value)}>
                                    <option value="">Value...</option>
                                    {activeAttribute.values.map((val: any) => <option key={val.id} value={val.value}>{val.value}</option>)}
                                </select>
                            ) : (
                                <input className="form-control form-control-sm" placeholder="Manual Name" value={newVariant.name} onChange={e => setNewVariant({...newVariant, name: e.target.value})} />
                            )}
                        </div>
                        <div className="col-md-4">
                            <button type="button" className="btn btn-sm btn-success w-100" onClick={handleAddVariantToExisting}>Add Variant</button>
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
                <form onSubmit={handleSubmitItem} className="mb-4">
                  <div className="row g-3">
                    <div className="col-md-3">
                        <label className="form-label">Code</label>
                        <input className="form-control" placeholder="ITM-001" value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} required />
                    </div>
                    <div className="col-md-4">
                        <label className="form-label">Name</label>
                        <input className="form-control" placeholder="Product Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label d-flex justify-content-between">
                            Category 
                            <span className="text-primary" style={{cursor:'pointer'}} onClick={() => setShowCatInput(!showCatInput)}><i className="bi bi-plus-circle"></i></span>
                        </label>
                        {showCatInput ? (
                            <div className="input-group input-group-sm">
                                <input className="form-control" placeholder="New Cat..." value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} autoFocus />
                                <button type="button" className="btn btn-primary" onClick={handleAddCategory}><i className="bi bi-check"></i></button>
                            </div>
                        ) : (
                            <select className="form-select" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                                <option value="">Select...</option>
                                {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        )}
                    </div>
                    <div className="col-md-2">
                        <label className="form-label">UOM</label>
                        <input className="form-control" placeholder="Unit" value={newItem.uom} onChange={e => setNewItem({...newItem, uom: e.target.value})} required />
                    </div>
                  </div>
                  
                  {/* Variant Input Section */}
                  <div className="mt-3 p-3 bg-light rounded-3">
                    <label className="form-label small text-muted text-uppercase mb-2">Variants Configuration</label>
                    
                    <div className="row g-2 mb-3 align-items-end">
                        <div className="col-md-4">
                            <label className="form-label small mb-1">1. Attribute</label>
                            <select className="form-select form-select-sm" value={selectedAttributeId} onChange={e => { setSelectedAttributeId(e.target.value); setSelectedAttributeValue(''); }}>
                                <option value="">Select...</option>
                                {attributes.map((attr: any) => <option key={attr.id} value={attr.id}>{attr.name}</option>)}
                            </select>
                        </div>
                        <div className="col-md-4">
                            <label className="form-label small mb-1">2. Value</label>
                            <select className="form-select form-select-sm" value={selectedAttributeValue} onChange={e => setSelectedAttributeValue(e.target.value)} disabled={!activeAttribute}>
                                <option value="">Select Value...</option>
                                {activeAttribute?.values.map((val: any) => <option key={val.id} value={val.value}>{val.value}</option>)}
                            </select>
                        </div>
                        <div className="col-md-4">
                            <button type="button" className="btn btn-sm btn-secondary w-100" onClick={handleAddFromTemplateToLocal} disabled={!selectedAttributeValue}>
                                <i className="bi bi-plus-lg me-1"></i> Add Variant
                            </button>
                        </div>
                    </div>

                    <div className="text-center text-muted small my-2">- OR -</div>

                    <div className="row g-2 mb-2">
                        <div className="col-md-12">
                            <div className="input-group input-group-sm">
                                <input className="form-control" placeholder="Manual Name (e.g. XL)" value={newVariant.name} onChange={e => setNewVariant({...newVariant, name: e.target.value})} />
                                <input className="form-control" placeholder="Category (e.g. Size)" value={newVariant.category} onChange={e => setNewVariant({...newVariant, category: e.target.value})} />
                                <button type="button" className="btn btn-outline-secondary" onClick={handleAddVariantToLocal}>Add Manual</button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="d-flex flex-wrap gap-2 mt-3 pt-2 border-top">
                        {newItem.variants.map((v, idx) => (
                            <span key={idx} className="badge bg-white text-dark border shadow-sm">
                                {v.category && <span className="text-muted fw-normal me-1">{v.category}:</span>}
                                {v.name}
                                <i className="bi bi-x ms-2 text-danger" style={{cursor: 'pointer'}} onClick={() => {
                                    const updated = newItem.variants.filter((_, i) => i !== idx);
                                    setNewItem({...newItem, variants: updated});
                                }}></i>
                            </span>
                        ))}
                        {newItem.variants.length === 0 && <small className="text-muted fst-italic">No variants selected</small>}
                    </div>
                  </div>

                  <div className="mt-3 text-end">
                      <button type="submit" className="btn btn-primary px-4">Create Item</button>
                  </div>
                </form>
            )}
            
            {/* Filter */}
            <div className="mb-3 d-flex align-items-center gap-2">
                <i className="bi bi-funnel text-muted"></i>
                <select className="form-select form-select-sm" style={{width: '200px'}} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">All Categories</option>
                    {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Variants</th>
                    <th style={{width: '50px'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item: any) => (
                    <tr key={item.id} className={editingItem?.id === item.id ? 'table-primary' : ''}>
                      <td className="fw-medium">{item.code}</td>
                      <td>{item.name}</td>
                      <td>{item.category && <span className="badge bg-light text-dark border">{item.category}</span>}</td>
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                        {item.variants && item.variants.map((v: any) => (
                            <span key={v.id} className="badge bg-light text-dark border">{v.name}</span>
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
                  {filteredItems.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-3">No items found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Locations Card */}
      <div className="col-md-4">
        <div className="card h-100">
          <div className="card-header d-flex justify-content-between align-items-center">
             <h5 className="card-title mb-0">Locations</h5>
             <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}><i className="bi bi-arrow-clockwise"></i></button>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmitLocation} className="mb-4">
              <div className="row g-2">
                <div className="col-md-4">
                  <label className="form-label">Code</label>
                  <input className="form-control" placeholder="WH-01" value={newLocation.code} onChange={e => setNewLocation({...newLocation, code: e.target.value})} required />
                </div>
                <div className="col-md-8">
                  <label className="form-label">Name</label>
                  <div className="input-group">
                    <input className="form-control" placeholder="Main Warehouse" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} required />
                    <button type="submit" className="btn btn-success">Add</button>
                  </div>
                </div>
              </div>
            </form>

            <div className="table-responsive">
               <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc: any) => (
                    <tr key={loc.id}>
                      <td className="fw-medium">{loc.code}</td>
                      <td>{loc.name}</td>
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
