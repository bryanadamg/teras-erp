import { useState } from 'react';

export default function AttributesView({ 
    attributes, 
    onCreateAttribute, 
    onUpdateAttribute, 
    onAddValue, 
    onUpdateValue, 
    onDeleteValue 
}: any) {
  const [newAttribute, setNewAttribute] = useState({ name: '', values: [] as any[] });
  const [newAttributeValue, setNewAttributeValue] = useState('');
  
  // Edit Mode State
  const [editingAttr, setEditingAttr] = useState<any>(null);
  const [editValueText, setEditValueText] = useState('');
  const [newValueForEdit, setNewValueForEdit] = useState('');

  // Creation Handlers
  const handleAddValueToNewAttribute = () => {
    if (!newAttributeValue) return;
    setNewAttribute({ ...newAttribute, values: [...newAttribute.values, { value: newAttributeValue }] });
    setNewAttributeValue('');
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateAttribute(newAttribute);
      setNewAttribute({ name: '', values: [] });
  };

  // Edit Handlers
  const startEditing = (attr: any) => {
      setEditingAttr({ ...attr }); // Deep copy? Shallow is fine for now
  };

  const cancelEditing = () => {
      setEditingAttr(null);
      setNewValueForEdit('');
  };

  const handleUpdateName = () => {
      if (editingAttr && editingAttr.name) {
          onUpdateAttribute(editingAttr.id, editingAttr.name);
      }
  };

  const handleAddValueToExisting = () => {
      if (editingAttr && newValueForEdit) {
          onAddValue(editingAttr.id, newValueForEdit);
          setNewValueForEdit('');
          // Optimistic update or wait for refresh? 
          // The parent refreshes data, so AttributesView will re-render with new data. 
          // We just need to keep editingAttr in sync if we want immediate feedback, 
          // but relying on parent refresh is safer for ID consistency.
          // However, if parent refreshes, editingAttr might be stale.
          // Better strategy: Close edit mode or update local state if we want to stay open.
          // Let's rely on props update.
      }
  };

  // We need to sync editingAttr with incoming attributes prop changes if we want to keep the modal open
  // But strictly, simpler is to just close or re-fetch.
  // Actually, we can just find the currently editing attribute from the new props
  const activeAttribute = editingAttr ? attributes.find((a: any) => a.id === editingAttr.id) : null;

  return (
     <div className="row justify-content-center fade-in">
        <div className="col-md-8">
           <div className="card">
              <div className="card-header bg-white d-flex justify-content-between align-items-center">
                 <div>
                    <h5 className="card-title mb-0">Attribute Templates</h5>
                    <p className="text-muted small mb-0 mt-1">Manage reusable variant sets.</p>
                 </div>
                 {activeAttribute && <button className="btn btn-sm btn-outline-secondary" onClick={cancelEditing}>Close Editor</button>}
              </div>
              <div className="card-body">
                 
                 {/* EDITOR MODE */}
                 {activeAttribute ? (
                     <div className="mb-4 p-4 bg-light rounded-3 border border-primary border-opacity-25">
                         <div className="d-flex justify-content-between align-items-center mb-3">
                             <h6 className="text-primary fw-bold mb-0">Editing: {activeAttribute.name}</h6>
                             <button className="btn-close" onClick={cancelEditing}></button>
                         </div>
                         
                         <div className="mb-3">
                             <label className="form-label small">Template Name</label>
                             <div className="input-group">
                                 <input 
                                    className="form-control" 
                                    value={editingAttr.name} 
                                    onChange={e => setEditingAttr({...editingAttr, name: e.target.value})} 
                                 />
                                 <button className="btn btn-outline-primary" onClick={handleUpdateName}>Rename</button>
                             </div>
                         </div>

                         <label className="form-label small">Values</label>
                         <div className="list-group mb-3">
                             {activeAttribute.values.map((val: any) => (
                                 <div key={val.id} className="list-group-item d-flex justify-content-between align-items-center p-2">
                                     <input 
                                        className="form-control form-control-sm border-0 bg-transparent" 
                                        defaultValue={val.value}
                                        onBlur={(e) => {
                                            if (e.target.value !== val.value) {
                                                onUpdateValue(val.id, e.target.value);
                                            }
                                        }}
                                     />
                                     <button className="btn btn-sm text-danger" onClick={() => onDeleteValue(val.id)}>
                                         <i className="bi bi-trash"></i>
                                     </button>
                                 </div>
                             ))}
                         </div>

                         <div className="input-group input-group-sm">
                             <input 
                                className="form-control" 
                                placeholder="Add new value..." 
                                value={newValueForEdit} 
                                onChange={e => setNewValueForEdit(e.target.value)} 
                             />
                             <button className="btn btn-secondary" onClick={handleAddValueToExisting}>Add</button>
                         </div>
                     </div>
                 ) : (
                     /* CREATION MODE */
                     <form onSubmit={handleCreateSubmit} className="mb-5 p-4 bg-light rounded-3 border border-dashed">
                        <div className="row g-3 align-items-end">
                            <div className="col-md-5">
                               <label className="form-label">New Template Name</label>
                               <input className="form-control" placeholder="e.g. Size" value={newAttribute.name} onChange={e => setNewAttribute({...newAttribute, name: e.target.value})} required />
                            </div>
                            <div className="col-md-7">
                               <label className="form-label">Values</label>
                               <div className="input-group">
                                  <input className="form-control" placeholder="Add value (e.g. S, M, L)" value={newAttributeValue} onChange={e => setNewAttributeValue(e.target.value)} />
                                  <button type="button" className="btn btn-secondary" onClick={handleAddValueToNewAttribute}>Add Value</button>
                               </div>
                            </div>
                        </div>
                        
                        <div className="mt-3 d-flex justify-content-between align-items-center">
                            <div className="d-flex flex-wrap gap-2">
                                {newAttribute.values.map((v, i) => (
                                    <span key={i} className="badge bg-white text-dark border">{v.value}</span>
                                ))}
                            </div>
                            <button type="submit" className="btn btn-primary px-4">Create Template</button>
                        </div>
                     </form>
                 )}

                 {/* LIST */}
                 <h6 className="text-uppercase text-muted small fw-bold mb-3">Existing Templates</h6>
                 <div className="row g-3">
                    {attributes.map((attr: any) => (
                       <div key={attr.id} className="col-md-6">
                           <div 
                                className={`p-3 border rounded-3 h-100 position-relative ${activeAttribute?.id === attr.id ? 'border-primary bg-primary bg-opacity-10' : 'bg-white hover-shadow'}`} 
                                style={{cursor: 'pointer', transition: 'all 0.2s'}}
                                onClick={() => startEditing(attr)}
                           >
                              <div className="d-flex w-100 justify-content-between mb-2">
                                 <h6 className="mb-0 fw-bold">{attr.name}</h6>
                                 <span className="badge bg-light text-muted border">{attr.values.length}</span>
                              </div>
                              <div className="d-flex flex-wrap gap-1">
                                 {attr.values.slice(0, 5).map((v: any) => (
                                    <span key={v.id} className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10">{v.value}</span>
                                 ))}
                                 {attr.values.length > 5 && <span className="badge text-muted">+{attr.values.length - 5}</span>}
                              </div>
                              
                              <div className="position-absolute top-0 end-0 p-2">
                                  <i className="bi bi-pencil-square text-muted opacity-50"></i>
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