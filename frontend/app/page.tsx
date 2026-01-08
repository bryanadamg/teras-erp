'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000';

export default function Home() {
  const [activeTab, setActiveTab] = useState('inventory');

  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);

  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '', variants: [] as any[] });
  const [newVariant, setNewVariant] = useState({ name: '', category: '' });
  const [selectedAttributeId, setSelectedAttributeId] = useState('');
  
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });
  
  const [newAttribute, setNewAttribute] = useState({ name: '', values: [] as any[] });
  const [newAttributeValue, setNewAttributeValue] = useState('');

  const [stockEntry, setStockEntry] = useState({ item_code: '', location_code: '', variant_id: '', qty: 0 });

  const fetchData = async () => {
    try {
      const itemsRes = await fetch(`${API_BASE}/items`);
      const locsRes = await fetch(`${API_BASE}/locations`);
      const stockRes = await fetch(`${API_BASE}/stock`);
      const attrsRes = await fetch(`${API_BASE}/attributes`);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (locsRes.ok) setLocations(await locsRes.json());
      if (stockRes.ok) setStockEntries(await stockRes.json());
      if (attrsRes.ok) setAttributes(await attrsRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Attribute Management ---
  const handleAddValueToAttribute = () => {
    if (!newAttributeValue) return;
    setNewAttribute({ ...newAttribute, values: [...newAttribute.values, { value: newAttributeValue }] });
    setNewAttributeValue('');
  };

  const handleCreateAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`${API_BASE}/attributes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAttribute)
    });
    setNewAttribute({ name: '', values: [] });
    fetchData();
  };

  // --- Item Management ---
  const handleAddVariantToItem = () => {
    if (!newVariant.name) return;
    setNewItem({ ...newItem, variants: [...newItem.variants, newVariant] });
    setNewVariant({ name: '', category: '' });
  };

  const handleApplyAttributeTemplate = (attributeId: string) => {
      setSelectedAttributeId(attributeId);
      if (!attributeId) return;

      const attr: any = attributes.find((a: any) => a.id === attributeId);
      if (attr) {
          const generatedVariants = attr.values.map((v: any) => ({
              name: v.value,
              category: attr.name
          }));
          // Merge with existing variants or replace? Replacing is cleaner for "Template" feel.
          setNewItem({ ...newItem, variants: generatedVariants });
      }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    setNewItem({ code: '', name: '', uom: '', variants: [] });
    setSelectedAttributeId('');
    fetchData();
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`${API_BASE}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLocation)
    });
    setNewLocation({ code: '', name: '' });
    fetchData();
  };

  // --- Stock Management ---
  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...stockEntry };
    if (!payload.variant_id) delete payload.variant_id; // Don't send empty string

    await fetch(`${API_BASE}/items/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setStockEntry({ item_code: '', location_code: '', variant_id: '', qty: 0 });
    alert('Stock recorded successfully!');
    fetchData();
  };

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;
  
  const selectedItem = items.find((i: any) => i.code === stockEntry.item_code);
  const availableVariants = selectedItem ? (selectedItem as any).variants : [];
  
  const getVariantName = (itemId: string, variantId: string) => {
      if (!variantId) return '-';
      const item = items.find((i: any) => i.id === itemId);
      if (!item) return variantId;
      const variant = (item as any).variants.find((v: any) => v.id === variantId);
      return variant ? variant.name : variantId;
  };

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm mb-4">
        <div className="container">
          <a className="navbar-brand fw-bold" href="#">Teras ERP</a>
        </div>
      </nav>

      <div className="container">
        
        {/* Tabs Navigation */}
        <ul className="nav nav-pills mb-4 bg-white p-2 rounded shadow-sm">
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>Inventory Master</button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'attributes' ? 'active' : ''}`} onClick={() => setActiveTab('attributes')}>Attributes (Templates)</button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>Stock Entry</button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Reports</button>
          </li>
        </ul>

        {/* Tab Content */}
        <div className="tab-content">
          
          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <div className="row g-4 fade-in">
              {/* Items Card */}
              <div className="col-md-6">
                <div className="card shadow-sm h-100 border-0">
                  <div className="card-header bg-white border-bottom-0 pt-3 pb-0">
                    <h5 className="card-title text-primary mb-0">Items</h5>
                  </div>
                  <div className="card-body">
                    <form onSubmit={handleCreateItem} className="mb-3 border-bottom pb-3">
                      <div className="row g-2 align-items-end mb-2">
                        <div className="col-md-4">
                            <input className="form-control form-control-sm" placeholder="Code" value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} required />
                        </div>
                        <div className="col-md-5">
                            <input className="form-control form-control-sm" placeholder="Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required />
                        </div>
                        <div className="col-md-3">
                            <input className="form-control form-control-sm" placeholder="UOM" value={newItem.uom} onChange={e => setNewItem({...newItem, uom: e.target.value})} required />
                        </div>
                      </div>
                      
                      {/* Variant Input Section */}
                      <div className="bg-light p-2 rounded mb-2">
                        <label className="small text-muted mb-1 fw-bold">Variants</label>
                        
                        {/* Template Selection */}
                        <div className="mb-2">
                            <select 
                                className="form-select form-select-sm" 
                                value={selectedAttributeId} 
                                onChange={e => handleApplyAttributeTemplate(e.target.value)}
                            >
                                <option value="">Select a Template (Optional)...</option>
                                {attributes.map((attr: any) => (
                                    <option key={attr.id} value={attr.id}>{attr.name} ({attr.values.length} values)</option>
                                ))}
                            </select>
                        </div>

                        {/* Manual Add */}
                        <div className="d-flex gap-2 mb-2">
                            <input className="form-control form-control-sm" placeholder="Variant Name (e.g. Red)" value={newVariant.name} onChange={e => setNewVariant({...newVariant, name: e.target.value})} />
                            <input className="form-control form-control-sm" placeholder="Category (e.g. Color)" value={newVariant.category} onChange={e => setNewVariant({...newVariant, category: e.target.value})} />
                            <button type="button" className="btn btn-sm btn-secondary" onClick={handleAddVariantToItem}>Add</button>
                        </div>
                        
                        {/* List */}
                        <div className="mt-1 d-flex flex-wrap gap-1">
                            {newItem.variants.map((v, idx) => (
                                <span key={idx} className="badge bg-secondary">{v.category ? `${v.category}: ` : ''}{v.name}</span>
                            ))}
                            {newItem.variants.length === 0 && <span className="text-muted small fst-italic">No variants selected</span>}
                        </div>
                      </div>

                      <button type="submit" className="btn btn-sm btn-outline-primary w-100">Create Item</button>
                    </form>
                    
                    <div className="table-responsive" style={{ maxHeight: '400px' }}>
                      <table className="table table-hover table-sm small mb-0">
                        <thead className="table-light sticky-top">
                          <tr>
                            <th>Code</th>
                            <th>Name</th>
                            <th>Variants</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item: any) => (
                            <tr key={item.id}>
                              <td className="fw-medium">{item.code}</td>
                              <td>{item.name}</td>
                              <td>
                                {item.variants && item.variants.map((v: any) => (
                                    <span key={v.id} className="badge bg-light text-dark border me-1">{v.name}</span>
                                ))}
                              </td>
                            </tr>
                          ))}
                          {items.length === 0 && (
                            <tr><td colSpan={3} className="text-center text-muted">No items found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Locations Card */}
              <div className="col-md-6">
                <div className="card shadow-sm h-100 border-0">
                  <div className="card-header bg-white border-bottom-0 pt-3 pb-0">
                     <h5 className="card-title text-success mb-0">Locations</h5>
                  </div>
                  <div className="card-body">
                    <form onSubmit={handleCreateLocation} className="row g-2 mb-3 align-items-end border-bottom pb-3">
                      <div className="col-md-4">
                        <label className="form-label small text-muted">Code</label>
                        <input className="form-control form-control-sm" placeholder="WH-001" value={newLocation.code} onChange={e => setNewLocation({...newLocation, code: e.target.value})} required />
                      </div>
                      <div className="col-md-5">
                        <label className="form-label small text-muted">Name</label>
                        <input className="form-control form-control-sm" placeholder="Main Warehouse" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} required />
                      </div>
                      <div className="col-md-3">
                        <button type="submit" className="btn btn-sm btn-outline-success w-100">Add</button>
                      </div>
                    </form>

                    <div className="table-responsive" style={{ maxHeight: '400px' }}>
                       <table className="table table-hover table-sm small mb-0">
                        <thead className="table-light sticky-top">
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
                          {locations.length === 0 && (
                            <tr><td colSpan={2} className="text-center text-muted">No locations found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Attributes Tab */}
          {activeTab === 'attributes' && (
             <div className="row justify-content-center fade-in">
                <div className="col-md-8">
                   <div className="card shadow-sm border-0">
                      <div className="card-header bg-white pt-3 border-bottom-0">
                         <h5 className="card-title text-info mb-0">Attribute Templates</h5>
                         <small className="text-muted">Define reusable variant sets (e.g. Color: Red, Blue)</small>
                      </div>
                      <div className="card-body">
                         <form onSubmit={handleCreateAttribute} className="mb-4 bg-light p-3 rounded">
                            <div className="mb-3">
                               <label className="form-label small fw-bold">Attribute Name</label>
                               <input className="form-control" placeholder="e.g. Color, Size" value={newAttribute.name} onChange={e => setNewAttribute({...newAttribute, name: e.target.value})} required />
                            </div>
                            <div className="mb-3">
                               <label className="form-label small fw-bold">Values</label>
                               <div className="d-flex gap-2">
                                  <input className="form-control form-control-sm" placeholder="Add value (e.g. Red)" value={newAttributeValue} onChange={e => setNewAttributeValue(e.target.value)} />
                                  <button type="button" className="btn btn-sm btn-secondary" onClick={handleAddValueToAttribute}>Add</button>
                               </div>
                               <div className="mt-2 d-flex flex-wrap gap-1">
                                  {newAttribute.values.map((v, i) => (
                                     <span key={i} className="badge bg-white text-dark border">{v.value}</span>
                                  ))}
                               </div>
                            </div>
                            <button type="submit" className="btn btn-info text-white w-100">Create Attribute Template</button>
                         </form>

                         <h6 className="text-muted border-bottom pb-2">Existing Templates</h6>
                         <div className="list-group">
                            {attributes.map((attr: any) => (
                               <div key={attr.id} className="list-group-item">
                                  <div className="d-flex w-100 justify-content-between">
                                     <h6 className="mb-1">{attr.name}</h6>
                                  </div>
                                  <div>
                                     {attr.values.map((v: any) => (
                                        <span key={v.id} className="badge bg-light text-dark border me-1">{v.value}</span>
                                     ))}
                                  </div>
                               </div>
                            ))}
                            {attributes.length === 0 && <div className="text-center text-muted py-3">No templates defined</div>}
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          )}

          {/* Stock Entry Tab */}
          {activeTab === 'stock' && (
            <div className="row justify-content-center fade-in">
              <div className="col-md-8">
                <div className="card shadow-sm border-0 bg-white">
                  <div className="card-header bg-white pt-3 border-bottom-0">
                     <h5 className="card-title text-dark mb-0">Record Stock Movement</h5>
                  </div>
                  <div className="card-body">
                    <form onSubmit={handleAddStock}>
                       <div className="mb-3">
                          <label className="form-label text-muted">Item</label>
                          <select className="form-select form-select-lg" value={stockEntry.item_code} onChange={e => setStockEntry({...stockEntry, item_code: e.target.value, variant_id: ''})} required>
                            <option value="">Select Item...</option>
                            {items.map((item: any) => <option key={item.id} value={item.code}>{item.name} ({item.code})</option>)}
                          </select>
                       </div>
                       
                       <div className="mb-3">
                          <label className="form-label text-muted">Variant</label>
                          <select className="form-select" value={stockEntry.variant_id} onChange={e => setStockEntry({...stockEntry, variant_id: e.target.value})} disabled={availableVariants.length === 0}>
                            <option value="">{availableVariants.length > 0 ? 'Select Variant (Optional)' : 'No Variants Available'}</option>
                            {availableVariants.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                       </div>

                       <div className="row g-3 mb-4">
                           <div className="col-md-8">
                              <label className="form-label text-muted">Location</label>
                              <select className="form-select" value={stockEntry.location_code} onChange={e => setStockEntry({...stockEntry, location_code: e.target.value})} required>
                                <option value="">Select Location...</option>
                                {locations.map((loc: any) => <option key={loc.id} value={loc.code}>{loc.name}</option>)}
                              </select>
                           </div>
                           <div className="col-md-4">
                              <label className="form-label text-muted">Quantity</label>
                              <input type="number" className="form-control" placeholder="0" value={stockEntry.qty} onChange={e => setStockEntry({...stockEntry, qty: parseFloat(e.target.value)})} required />
                           </div>
                       </div>
                       
                       <button type="submit" className="btn btn-primary w-100 py-2 fw-bold">Record Stock</button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="card shadow-sm border-0 fade-in">
              <div className="card-header bg-white pt-3 d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Stock Ledger</h5>
                <button className="btn btn-sm btn-outline-secondary" onClick={fetchData}>Refresh</button>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-striped mb-0">
                    <thead className="table-light">
                      <tr>
                        <th scope="col" className="ps-4">Date</th>
                        <th scope="col">Item</th>
                        <th scope="col">Variant</th>
                        <th scope="col">Location</th>
                        <th scope="col" className="text-end">Qty Change</th>
                        <th scope="col" className="pe-4 text-end">Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockEntries.map((entry: any) => (
                        <tr key={entry.id}>
                          <td className="ps-4 text-muted small">{new Date(entry.created_at).toLocaleString()}</td>
                          <td className="fw-medium">{getItemName(entry.item_id)}</td>
                          <td>{getVariantName(entry.item_id, entry.variant_id)}</td>
                          <td>{getLocationName(entry.location_id)}</td>
                          <td className={`text-end fw-bold ${entry.qty_change >= 0 ? 'text-success' : 'text-danger'}`}>
                            {entry.qty_change > 0 ? '+' : ''}{entry.qty_change}
                          </td>
                          <td className="pe-4 text-end text-muted small">{entry.reference_type} <span className="text-secondary">#{entry.reference_id}</span></td>
                        </tr>
                      ))}
                      {stockEntries.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-4 text-muted">No records found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}