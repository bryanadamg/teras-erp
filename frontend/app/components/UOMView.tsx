import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function UOMView({ uoms, onCreateUOM, onDeleteUOM, onRefresh }: any) {
  const { t } = useLanguage();
  const [newUOMName, setNewUOMName] = useState('');

  const handleCreateUOM = (e: React.FormEvent) => {
      e.preventDefault();
      if (newUOMName) {
          onCreateUOM(newUOMName);
          setNewUOMName('');
      }
  };

  return (
    <div className="row justify-content-center fade-in">
        <div className="col-md-8">
            <div className="card h-100 shadow-sm border-0">
                <div className="card-header bg-white d-flex justify-content-between align-items-center">
                    <div>
                        <h5 className="card-title mb-0">Units of Measure (UOM)</h5>
                        <p className="text-muted small mb-0 mt-1">Manage standard units for items (e.g. kg, pcs, m).</p>
                    </div>
                    <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}><i className="bi bi-arrow-clockwise"></i> {t('refresh')}</button>
                </div>
                <div className="card-body">
                    <form onSubmit={handleCreateUOM} className="mb-4 p-4 bg-light rounded-3 border border-dashed">
                        <label className="form-label fw-bold">Create New UOM</label>
                        <div className="input-group">
                            <input className="form-control" placeholder="e.g. Dozen, Box, Litre..." value={newUOMName} onChange={e => setNewUOMName(e.target.value)} required />
                            <button type="submit" className="btn btn-success px-4">{t('add')}</button>
                        </div>
                    </form>

                    <h6 className="text-uppercase text-muted small fw-bold mb-3">Existing Units</h6>
                    <div className="list-group list-group-flush border rounded">
                        {uoms && uoms.map((uom: any) => (
                            <div key={uom.id} className="list-group-item d-flex justify-content-between align-items-center">
                                <span className="fw-medium font-monospace">{uom.name}</span>
                                <button className="btn btn-sm text-danger hover-bg-danger-light" onClick={() => onDeleteUOM(uom.id)}>
                                    <i className="bi bi-trash me-1"></i> {t('delete')}
                                </button>
                            </div>
                        ))}
                        {uoms && uoms.length === 0 && (
                            <div className="list-group-item text-center text-muted py-4 fst-italic">No UOMs defined</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
