import { useState } from 'react';

export default function InventoryView({ items, locations, attributes, onCreateItem, onCreateLocation, onRefresh }: any) {
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '', variants: [] as any[] });
  const [newVariant, setNewVariant] = useState({ name: '', category: '' });
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });
  
  // Selection States
  const [selectedAttributeId, setSelectedAttributeId] = useState('');
  const [selectedAttributeValue, setSelectedAttributeValue] = useState('');

  const handleAddVariantToItem = () => {
    if (!newVariant.name) return;
    setNewItem({ ...newItem, variants: [...newItem.variants, newVariant] });
    setNewVariant({ name: '', category: '' });
  };

  const handleAddFromTemplate = () => {
      if (!selectedAttributeId || !selectedAttributeValue) return;
      
      const attr = attributes.find((a: any) => a.id === selectedAttributeId);
      if (!attr) return;

      const variant = {
          name: selectedAttributeValue,
          category: attr.name
      };

      // Check for duplicates
      if (newItem.variants.some(v => v.name === variant.name && v.category === variant.category)) {
          alert('Variant already added');
          return;
      }

      setNewItem({ ...newItem, variants: [...newItem.variants, variant] });
      setSelectedAttributeValue(''); // Reset value selection to allow adding another
  };

  const handleSubmitItem = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateItem(newItem);
      setNewItem({ code: '', name: '', uom: '', variants: [] });
      setSelectedAttributeId('');
      setSelectedAttributeValue('');
  };

  const handleSubmitLocation = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateLocation(newLocation);
      setNewLocation({ code: '', name: '' });
  };

  // Derived state for the second dropdown
  const activeAttribute = attributes.find((a: any) => a.id === selectedAttributeId);

  return (
    <div className="row g-4 fade-in">
      {/* Items Card */}
      <div className="col-md-7">
        <div className="card h-100">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5 className="card-title mb-0">Item Master</h5>
            <span className="badge bg-primary rounded-pill">{items.length} Items</span>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmitItem} className="mb-4">
              <div className="row g-3">
                <div className="col-md-4">
                    <label className="form-label">Code</label>
                    <input className="form-control" placeholder="ITM-001" value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} required />
                </div>
                <div className="col-md-5">
                    <label className="form-label">Name</label>
                    <input className="form-control" placeholder="Product Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required />
                </div>
                <div className="col-md-3">
                    <label className="form-label">UOM</label>
                    <input className="form-control" placeholder="Pcs/Kg" value={newItem.uom} onChange={e => setNewItem({...newItem, uom: e.target.value})} required />
                </div>
              </div>
              
              {/* Variant Input Section */}
              <div className="mt-3 p-3 bg-light rounded-3">
                <label className="form-label small text-muted text-uppercase mb-2">Variants Configuration</label>
                
                {/* Template Selection Row */}
                <div className="row g-2 mb-3 align-items-end">
                    <div className="col-md-4">
                        <label className="form-label small mb-1">1. Attribute</label>
                        <select 
                            className="form-select form-select-sm" 
                            value={selectedAttributeId} 
                            onChange={e => {
                                setSelectedAttributeId(e.target.value);
                                setSelectedAttributeValue('');
                            }}
                        >
                            <option value="">Select...</option>
                            {attributes.map((attr: any) => (
                                <option key={attr.id} value={attr.id}>{attr.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-4">
                        <label className="form-label small mb-1">2. Value</label>
                        <select 
                            className="form-select form-select-sm" 
                            value={selectedAttributeValue} 
                            onChange={e => setSelectedAttributeValue(e.target.value)}
                            disabled={!activeAttribute}
                        >
                            <option value="">Select Value...</option>
                            {activeAttribute?.values.map((val: any) => (
                                <option key={val.id} value={val.value}>{val.value}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-4">
                        <button type="button" className="btn btn-sm btn-secondary w-100" onClick={handleAddFromTemplate} disabled={!selectedAttributeValue}>
                            <i className="bi bi-plus-lg me-1"></i> Add Variant
                        </button>
                    </div>
                </div>

                <div className="text-center text-muted small my-2">- OR -</div>

                {/* Manual Entry Row */}
                <div className="row g-2 mb-2">
                    <div className="col-md-12">
                        <div className="input-group input-group-sm">
                            <input className="form-control" placeholder="Manual Name (e.g. XL)" value={newVariant.name} onChange={e => setNewVariant({...newVariant, name: e.target.value})} />
                            <input className="form-control" placeholder="Category (e.g. Size)" value={newVariant.category} onChange={e => setNewVariant({...newVariant, category: e.target.value})} />
                            <button type="button" className="btn btn-outline-secondary" onClick={handleAddVariantToItem}>Add Manual</button>
                        </div>
                    </div>
                </div>
                
                {/* Variant List */}
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
            
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
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
                        <div className="d-flex flex-wrap gap-1">
                        {item.variants && item.variants.map((v: any) => (
                            <span key={v.id} className="badge bg-light text-dark border">{v.name}</span>
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

      {/* Locations Card */}
      <div className="col-md-5">
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