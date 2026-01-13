import { useState } from 'react';

export default function AttributesView({ attributes, onCreateAttribute }: any) {
  const [newAttribute, setNewAttribute] = useState({ name: '', values: [] as any[] });
  const [newAttributeValue, setNewAttributeValue] = useState('');

  const handleAddValueToAttribute = () => {
    if (!newAttributeValue) return;
    setNewAttribute({ ...newAttribute, values: [...newAttribute.values, { value: newAttributeValue }] });
    setNewAttributeValue('');
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateAttribute(newAttribute);
      setNewAttribute({ name: '', values: [] });
  };

  return (
     <div className="row justify-content-center fade-in">
        <div className="col-md-8">
           <div className="card">
              <div className="card-header">
                 <h5 className="card-title mb-0">Attribute Templates</h5>
                 <p className="text-muted small mb-0 mt-1">Define reusable variant sets (e.g. Color: Red, Blue) to speed up item creation.</p>
              </div>
              <div className="card-body">
                 <form onSubmit={handleSubmit} className="mb-5 p-4 bg-light rounded-3 border border-dashed">
                    <div className="row g-3 align-items-end">
                        <div className="col-md-5">
                           <label className="form-label">Template Name</label>
                           <input className="form-control" placeholder="e.g. Size" value={newAttribute.name} onChange={e => setNewAttribute({...newAttribute, name: e.target.value})} required />
                        </div>
                        <div className="col-md-7">
                           <label className="form-label">Values</label>
                           <div className="input-group">
                              <input className="form-control" placeholder="Add value (e.g. S, M, L)" value={newAttributeValue} onChange={e => setNewAttributeValue(e.target.value)} />
                              <button type="button" className="btn btn-secondary" onClick={handleAddValueToAttribute}>Add Value</button>
                           </div>
                        </div>
                    </div>
                    
                    <div className="mt-3 d-flex justify-content-between align-items-center">
                        <div className="d-flex flex-wrap gap-2">
                            {newAttribute.values.map((v, i) => (
                                <span key={i} className="badge bg-white text-dark border">{v.value}</span>
                            ))}
                        </div>
                        <button type="submit" className="btn btn-primary px-4">Save Template</button>
                    </div>
                 </form>

                 <h6 className="text-uppercase text-muted small fw-bold mb-3">Existing Templates</h6>
                 <div className="row g-3">
                    {attributes.map((attr: any) => (
                       <div key={attr.id} className="col-md-6">
                           <div className="p-3 border rounded-3 h-100">
                              <div className="d-flex w-100 justify-content-between mb-2">
                                 <h6 className="mb-0 fw-bold">{attr.name}</h6>
                                 <span className="badge bg-light text-muted">{attr.values.length} values</span>
                              </div>
                              <div className="d-flex flex-wrap gap-1">
                                 {attr.values.map((v: any) => (
                                    <span key={v.id} className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10">{v.value}</span>
                                 ))}
                              </div>
                           </div>
                       </div>
                    ))}
                    {attributes.length === 0 && <div className="col-12 text-center text-muted py-4">No templates defined yet.</div>}
                 </div>
              </div>
           </div>
        </div>
     </div>
  );
}
