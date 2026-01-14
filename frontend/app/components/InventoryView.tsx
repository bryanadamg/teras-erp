import { useState } from 'react';

export default function InventoryView({ 
    items, 
    attributes,
    categories,
    onCreateItem, 
    onUpdateItem,
    onCreateCategory,
    onRefresh 
}: any) {
  // Creation State
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '', category: '', source_sample_id: '', attribute_ids: [] as string[] });
  
  // Editing State
  const [editingItem, setEditingItem] = useState<any>(null);
  
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);

  // Filtering
  const [categoryFilter, setCategoryFilter] = useState('');

  // --- Item Handlers ---

  const handleSubmitItem = (e: React.FormEvent) => {
      e.preventDefault();
      const payload: any = { ...newItem };
      if (!payload.source_sample_id) delete payload.source_sample_id;
      
      onCreateItem(payload);
      setNewItem({ code: '', name: '', uom: '', category: '', source_sample_id: '', attribute_ids: [] });
  };

  const handleUpdateItemSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingItem) return;
      
      const payload: any = {
          code: editingItem.code,
          name: editingItem.name,
          uom: editingItem.uom,
          category: editingItem.category,
          attribute_ids: editingItem.attribute_ids || [],
          source_sample_id: editingItem.source_sample_id || null
      };

      onUpdateItem(editingItem.id, payload);
      setEditingItem(null);
  };

  const toggleAttribute = (id: string, isEdit: boolean) => {
      if (isEdit) {
          const current = editingItem.attribute_ids || [];
          if (current.includes(id)) {
              setEditingItem({...editingItem, attribute_ids: current.filter((a:string) => a !== id)});
          } else {
              setEditingItem({...editingItem, attribute_ids: [...current, id]});
          }
      } else {
          const current = newItem.attribute_ids;
          if (current.includes(id)) {
              setNewItem({...newItem, attribute_ids: current.filter(a => a !== id)});
          } else {
              setNewItem({...newItem, attribute_ids: [...current, id]});
          }
      }
  };

  const handleAddCategory = () => {
      if (newCategoryName) {
          onCreateCategory(newCategoryName);
          setNewCategoryName('');
          setShowCatInput(false);
      }
  };

  // Derived
  const activeEditingItem = editingItem ? items.find((i: any) => i.id === editingItem.id) : null;

  // Filtered Items
  const filteredItems = categoryFilter 
      ? items.filter((i: any) => i.category === categoryFilter)
      : items;
      
  const sampleItems = items.filter((i: any) => i.category === 'Sample');

  const getAttributeNames = (ids: string[]) => {
      if (!ids || ids.length === 0) return '-';
      return ids.map(id => attributes.find((a: any) => a.id === id)?.name).filter(Boolean).join(', ');
  };

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
                    <th>Attributes</th>
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
                      <td><span className="text-muted small">{getAttributeNames(item.attribute_ids)}</span></td>
                      <td>
                          <button className="btn btn-sm btn-link text-primary" onClick={() => setEditingItem({...item, attribute_ids: item.attribute_ids || []})}>
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
                            <label className="form-label small text-muted">Code</label>
                            <input className="form-control" value={editingItem.code} onChange={e => setEditingItem({...editingItem, code: e.target.value})} required />
                        </div>
                        <div className="mb-3">
                            <label className="form-label small text-muted">Name</label>
                            <input className="form-control" value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} required />
                        </div>
                        <div className="row g-2 mb-3">
                            <div className="col-6">
                                <label className="form-label small text-muted">Category</label>
                                <select className="form-select" value={editingItem.category || ''} onChange={e => setEditingItem({...editingItem, category: e.target.value})}>
                                    <option value="">Select...</option>
                                    {categories.map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="col-6">
                                <label className="form-label small text-muted">UOM</label>
                                <input className="form-control" value={editingItem.uom} onChange={e => setEditingItem({...editingItem, uom: e.target.value})} required />
                            </div>
                        </div>
                        
                        <div className="mb-3">
                            <label className="form-label small text-muted d-block">Attribute Types</label>
                            <div className="d-flex flex-wrap gap-2 p-2 border rounded bg-light">
                                {attributes.map((attr: any) => (
                                    <div key={attr.id} className="form-check">
                                        <input 
                                            className="form-check-input" 
                                            type="checkbox" 
                                            id={`edit-attr-${attr.id}`}
                                            checked={editingItem.attribute_ids?.includes(attr.id)}
                                            onChange={() => toggleAttribute(attr.id, true)}
                                        />
                                        <label className="form-check-label small" htmlFor={`edit-attr-${attr.id}`}>
                                            {attr.name}
                                        </label>
                                    </div>
                                ))}
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
                </div>
            ) : (
                // --- CREATE MODE ---
                <form onSubmit={handleSubmitItem}>
                  <div className="mb-3">
                      <label className="form-label small text-muted">Item Code</label>
                      <input className="form-control" placeholder="ITM-001" value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} required />
                  </div>
                  <div className="mb-3">
                      <label className="form-label small text-muted">Item Name</label>
                      <input className="form-control" placeholder="Product Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required />
                  </div>
                  <div className="row g-2 mb-3">
                      <div className="col-7">
                          <label className="form-label d-flex justify-content-between small text-muted">
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
                          <label className="form-label small text-muted">UOM</label>
                          <input className="form-control" placeholder="Unit" value={newItem.uom} onChange={e => setNewItem({...newItem, uom: e.target.value})} required />
                      </div>
                  </div>
                  
                  <div className="mb-3">
                      <label className="form-label small text-muted d-block">Attribute Types (Variations)</label>
                      <div className="d-flex flex-wrap gap-2 p-2 border rounded bg-light" style={{maxHeight: '120px', overflowY: 'auto'}}>
                          {attributes.map((attr: any) => (
                              <div key={attr.id} className="form-check">
                                  <input 
                                      className="form-check-input" 
                                      type="checkbox" 
                                      id={`new-attr-${attr.id}`}
                                      checked={newItem.attribute_ids.includes(attr.id)}
                                      onChange={() => toggleAttribute(attr.id, false)}
                                  />
                                  <label className="form-check-label small" htmlFor={`new-attr-${attr.id}`}>
                                      {attr.name}
                                  </label>
                              </div>
                          ))}
                          {attributes.length === 0 && <small className="text-muted fst-italic">No attributes defined</small>}
                      </div>
                      <div className="form-text small text-muted">Select all attributes that apply to this item.</div>
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
                  
                  <button type="submit" className="btn btn-primary w-100 fw-bold shadow-sm">Create Item</button>
                </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
