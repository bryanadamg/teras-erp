import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function AttributesView({ 
    attributes,
    onCreateAttribute, 
    onUpdateAttribute, 
    onDeleteAttribute,
    onAddValue, 
    onUpdateValue, 
    onDeleteValue
}: any) {
  const { t } = useLanguage();
  const [newAttribute, setNewAttribute] = useState({ name: '', values: [] as any[] });
  const [newAttributeValue, setNewAttributeValue] = useState('');
  
  // Edit Mode State
  const [editingAttr, setEditingAttr] = useState<any>(null);
  const [newValueForEdit, setNewValueForEdit] = useState('');

  // Declare activeAttribute early so it can be used for sequence logic
  const activeAttribute = editingAttr ? attributes.find((a: any) => a.id === editingAttr.id) : null;

  const getNextValue = (currentValues: any[]) => {
      const numbers = currentValues
          .map(v => parseInt(v.value))
          .filter(n => !isNaN(n));
      
      if (numbers.length > 0) {
          return Math.max(...numbers) + 1;
      }
      return null;
  };

  const nextValForNew = getNextValue(newAttribute.values);
  const nextValForEdit = activeAttribute ? getNextValue(activeAttribute.values) : null;

  // --- Handlers ---

  const handleAddValueToNewAttribute = () => {
    if (!newAttributeValue) return;
    setNewAttribute({ ...newAttribute, values: [...newAttribute.values, { value: newAttributeValue }] });
    setNewAttributeValue('');
  };

  const handleAddNextToNew = () => {
      if (nextValForNew !== null) {
          setNewAttribute({ ...newAttribute, values: [...newAttribute.values, { value: String(nextValForNew) }] });
      }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateAttribute(newAttribute);
      setNewAttribute({ name: '', values: [] });
  };

  const startEditing = (attr: any) => {
      setEditingAttr({ ...attr }); 
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
      }
  };

  const handleAddNextToExisting = () => {
      if (editingAttr && nextValForEdit !== null) {
          onAddValue(editingAttr.id, String(nextValForEdit));
      }
  };

  return (
     <div className="row g-4 fade-in">
        {/* Left Column: Create / Edit */}
        <div className="col-md-5">
           <div className={`card h-100 shadow-sm border-0 ${activeAttribute ? 'border-primary border-2' : ''}`}>
              <div className={`card-header ${activeAttribute ? 'bg-primary bg-opacity-10 text-primary-emphasis' : 'bg-success bg-opacity-10 text-success-emphasis'}`}>
                 <h5 className="card-title mb-0">
                     {activeAttribute ? (
                         <span><i className="bi bi-pencil-square me-2"></i>{t('edit')} Template</span>
                     ) : (
                         <span><i className="bi bi-plus-circle me-2"></i>{t('create')} Template</span>
                     )}
                 </h5>
              </div>
              <div className="card-body">
                 {activeAttribute ? (
                     // --- EDIT MODE ---
                     <div>
                         <div className="d-flex justify-content-between align-items-center mb-3">
                             <span className="badge bg-primary text-white">{activeAttribute.name}</span>
                             <button className="btn btn-sm btn-outline-secondary" onClick={cancelEditing}>{t('cancel')}</button>
                         </div>
                         
                         <div className="mb-3">
                             <label className="form-label small">Template Name</label>
                             <div className="input-group">
                                 <input 
                                    className="form-control" 
                                    value={editingAttr.name} 
                                    onChange={e => setEditingAttr({...editingAttr, name: e.target.value})} 
                                 />
                                 <button className="btn btn-outline-primary" onClick={handleUpdateName}>{t('save')}</button>
                             </div>
                         </div>

                         <label className="form-label small">Values</label>
                         <div className="list-group mb-3" style={{maxHeight: '300px', overflowY: 'auto'}}>
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
                             <button className="btn btn-secondary" onClick={handleAddValueToExisting}>{t('add')}</button>
                             {nextValForEdit !== null && (
                                 <button className="btn btn-outline-success" onClick={handleAddNextToExisting}>
                                     + {nextValForEdit}
                                 </button>
                             )}
                         </div>
                     </div>
                 ) : (
                     // --- CREATE MODE ---
                     <form onSubmit={handleCreateSubmit}>
                        <div className="mb-3">
                           <label className="form-label small text-muted">Name</label>
                           <input className="form-control" placeholder="e.g. Size, Color" value={newAttribute.name} onChange={e => setNewAttribute({...newAttribute, name: e.target.value})} required />
                        </div>
                        
                        <div className="mb-3">
                           <label className="form-label small text-muted">Initial Values</label>
                           <div className="input-group mb-2">
                              <input className="form-control" placeholder="Value (e.g. S, M, L)" value={newAttributeValue} onChange={e => setNewAttributeValue(e.target.value)} />
                              <button type="button" className="btn btn-secondary" onClick={handleAddValueToNewAttribute}>{t('add')}</button>
                              {nextValForNew !== null && (
                                  <button type="button" className="btn btn-outline-success" onClick={handleAddNextToNew}>
                                      + {nextValForNew}
                                  </button>
                              )}
                           </div>
                           
                           <div className="d-flex flex-wrap gap-2 p-2 border rounded bg-light min-h-50">
                                {newAttribute.values.map((v, i) => (
                                    <span key={i} className="badge bg-white text-dark border shadow-sm">{v.value}</span>
                                ))}
                                {newAttribute.values.length === 0 && <small className="text-muted fst-italic">No values added</small>}
                           </div>
                        </div>
                        
                        <button type="submit" className="btn btn-success w-100 fw-bold shadow-sm">{t('create')}</button>
                     </form>
                 )}
              </div>
           </div>
        </div>

        {/* Right Column: List */}
        <div className="col-md-7">
           <div className="card h-100 shadow-sm border-0">
              <div className="card-header bg-white">
                 <h5 className="card-title mb-0">{t('attributes')}</h5>
              </div>
              <div className="card-body p-0" style={{maxHeight: 'calc(100vh - 150px)', overflowY: 'auto'}}>
                 <div className="list-group list-group-flush">
                    {attributes.map((attr: any) => (
                       <div 
                            key={attr.id} 
                            className={`list-group-item list-group-item-action d-flex justify-content-between align-items-start p-3 ${activeAttribute?.id === attr.id ? 'active' : ''}`}
                            onClick={() => startEditing(attr)}
                            style={{cursor: 'pointer'}}
                       >
                          <div className="flex-grow-1 me-3">
                             <div className="d-flex justify-content-between mb-1">
                                 <h6 className="mb-0 fw-bold">{attr.name}</h6>
                                 <span className={`badge ${activeAttribute?.id === attr.id ? 'bg-light text-primary' : 'bg-light text-dark border'}`}>{attr.values.length}</span>
                             </div>
                             <div className="d-flex flex-wrap gap-1">
                                 {attr.values.slice(0, 8).map((v: any) => (
                                    <span key={v.id} className={`badge small ${activeAttribute?.id === attr.id ? 'bg-primary border border-white' : 'bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10'}`}>{v.value}</span>
                                 ))}
                                 {attr.values.length > 8 && <span className="badge text-muted">...</span>}
                             </div>
                          </div>
                          
                          <div className="d-flex flex-column gap-2" onClick={(e) => e.stopPropagation()}>
                              <button className="btn btn-sm btn-link text-danger p-0" title={t('delete')} onClick={() => onDeleteAttribute(attr.id)}>
                                  <i className="bi bi-trash fs-6"></i>
                              </button>
                          </div>
                       </div>
                    ))}
                    {attributes.length === 0 && <div className="text-center text-muted py-5">No templates defined yet.</div>}
                 </div>
              </div>
           </div>
        </div>
     </div>
  );
}