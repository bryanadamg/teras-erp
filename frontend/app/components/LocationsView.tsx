import { useState } from 'react';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';

export default function LocationsView({ locations, onCreateLocation, onDeleteLocation, onRefresh }: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });

  const handleSubmitLocation = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await onCreateLocation(newLocation);
      
      if (res && res.status === 400) {
          let baseCode = newLocation.code;
          const baseMatch = baseCode.match(/^(.*)-(\d+)$/);
          if (baseMatch) baseCode = baseMatch[1];

          let counter = 1;
          let suggestedCode = `${baseCode}-${counter}`;
          while (locations.some((l: any) => l.code === suggestedCode)) {
              counter++;
              suggestedCode = `${baseCode}-${counter}`;
          }

          showToast(`Location Code "${newLocation.code}" already exists. Suggesting: ${suggestedCode}`, 'warning');
          setNewLocation({ ...newLocation, code: suggestedCode });
      } else if (res && res.ok) {
          showToast('Location added successfully!', 'success');
          setNewLocation({ code: '', name: '' });
      } else {
          showToast('Failed to add location', 'danger');
      }
  };

  return (
    <div className="row justify-content-center fade-in">
      <div className="col-md-8">
        <div className="card h-100">
          <div className="card-header d-flex justify-content-between align-items-center bg-white">
             <h5 className="card-title mb-0">{t('locations')}</h5>
             <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}><i className="bi bi-arrow-clockwise"></i> {t('refresh')}</button>
          </div>
          <div className="card-body">
            <div className="row g-4">
                <div className="col-md-5 border-end">
                    <h6 className="text-muted text-uppercase small fw-bold mb-3">{t('create')} {t('locations')}</h6>
                    <form onSubmit={handleSubmitLocation}>
                        <div className="mb-3">
                            <label className="form-label">{t('item_code')}</label>
                            <input className="form-control" placeholder="WH-01" value={newLocation.code} onChange={e => setNewLocation({...newLocation, code: e.target.value})} required />
                        </div>
                        <div className="mb-3">
                            <label className="form-label">{t('item_name')}</label>
                            <input className="form-control" placeholder="Main Warehouse" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} required />
                        </div>
                        <button type="submit" className="btn btn-success w-100"><i className="bi bi-plus-lg me-1"></i> {t('add')}</button>
                    </form>
                </div>
                
                <div className="col-md-7">
                    <h6 className="text-muted text-uppercase small fw-bold mb-3">{t('locations')}</h6>
                    <div className="table-responsive">
                       <table className="table table-hover align-middle">
                        <thead className="table-light">
                          <tr>
                            <th>{t('item_code')}</th>
                            <th>{t('item_name')}</th>
                            <th style={{width: '50px'}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {locations.map((loc: any) => (
                            <tr key={loc.id}>
                              <td className="fw-medium font-monospace text-primary">{loc.code}</td>
                              <td>{loc.name}</td>
                              <td className="text-end">
                                  <button className="btn btn-sm btn-link text-danger" onClick={() => onDeleteLocation(loc.id)}>
                                      <i className="bi bi-trash"></i>
                                  </button>
                              </td>
                            </tr>
                          ))}
                          {locations.length === 0 && <tr><td colSpan={3} className="text-center text-muted py-3">No locations found</td></tr>}
                        </tbody>
                      </table>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
