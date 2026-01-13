import { useState } from 'react';

export default function InventoryView({ items, locations, attributes, onCreateItem, onCreateLocation, onRefresh }: any) {
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '', variants: [] as any[] });
  const [newVariant, setNewVariant] = useState({ name: '', category: '' });
  const [selectedAttributeId, setSelectedAttributeId] = useState('');
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });

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
          setNewItem({ ...newItem, variants: generatedVariants });
      }
  };

  const handleSubmitItem = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateItem(newItem);
      setNewItem({ code: '', name: '', uom: '', variants: [] });
      setSelectedAttributeId('');
  };

  const handleSubmitLocation = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateLocation(newLocation);
      setNewLocation({ code: '', name: '' });
  };

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
                
                <div className="row g-2 mb-2">
                    <div className="col-md-5">
                        <select 
                            className="form-select form-select-sm" 
                            value={selectedAttributeId} 
                            onChange={e => handleApplyAttributeTemplate(e.target.value)}
                        >
                            <option value="">Load Template...</option>
                            {attributes.map((attr: any) => (
                                <option key={attr.id} value={attr.id}>{attr.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-7">
                        <div className="input-group input-group-sm">
                            <input className="form-control" placeholder="Variant (e.g. Red)" value={newVariant.name} onChange={e => setNewVariant({...newVariant, name: e.target.value})} />
                            <input className="form-control" placeholder="Category" value={newVariant.category} onChange={e => setNewVariant({...newVariant, category: e.target.value})} />
                            <button type="button" className="btn btn-outline-secondary" onClick={handleAddVariantToItem}>Add</button>
                        </div>
                    </div>
                </div>
                
                <div className="d-flex flex-wrap gap-2 mt-2">
                    {newItem.variants.map((v, idx) => (
                        <span key={idx} className="badge bg-white text-dark border shadow-sm">
                            {v.category && <span className="text-muted fw-normal me-1">{v.category}:</span>}
                            {v.name}
                        </span>
                    ))}
                    {newItem.variants.length === 0 && <small className="text-muted fst-italic">No variants defined</small>}
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
