import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function ReportsView({ stockEntries, items, locations, onRefresh }: any) {
  const { t } = useLanguage();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;
  const getVariantName = (itemId: string, variantId: string) => {
      if (!variantId) return '-';
      const item = items.find((i: any) => i.id === itemId);
      if (!item) return variantId;
      const variant = (item as any).variants.find((v: any) => v.id === variantId);
      return variant ? variant.name : variantId;
  };

  const handlePrint = () => {
      window.print();
  };

  const filteredEntries = stockEntries.filter((entry: any) => {
      const date = new Date(entry.created_at);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      
      if (start && date < start) return false;
      if (end) {
          const endDateTime = new Date(end);
          endDateTime.setHours(23, 59, 59, 999);
          if (date > endDateTime) return false;
      }
      return true;
  });

  return (
      <div className="card fade-in border-0 shadow-sm print-container">
          <div className="card-header bg-white d-flex justify-content-between align-items-center no-print">
              <div>
                  <h5 className="card-title mb-0">{t('stock_ledger')}</h5>
                  <small className="text-muted">Analyze inventory movements</small>
              </div>
              <div className="d-flex gap-2 align-items-center">
                  <div className="input-group input-group-sm">
                      <span className="input-group-text">{t('from')}</span>
                      <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div className="input-group input-group-sm">
                      <span className="input-group-text">{t('to')}</span>
                      <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                  <button className="btn btn-outline-primary btn-sm btn-print" onClick={handlePrint}>
                      <i className="bi bi-printer me-1"></i>{t('print')}
                  </button>
                  <button className="btn btn-outline-secondary btn-sm" onClick={onRefresh}>
                      <i className="bi bi-arrow-clockwise me-1"></i>{t('refresh')}
                  </button>
              </div>
          </div>
          <div className="card-body p-0">
              <div className="print-header d-none d-print-block p-4 border-bottom mb-4">
                  <h2 className="mb-1">{t('stock_ledger')}</h2>
                  <p className="text-muted mb-0">Period: {startDate || 'All Time'} to {endDate || 'Present'}</p>
                  <p className="text-muted small">Generated on: {new Date().toLocaleString()}</p>
              </div>
              <div className="table-responsive">
                  <table className="table table-hover table-striped mb-0 align-middle">
                      <thead className="table-light">
                          <tr>
                              <th className="ps-4">{t('date')}</th>
                              <th>{t('item_code')}</th>
                              <th>{t('locations')}</th>
                              <th className="text-end">Change</th>
                              <th className="text-end pe-4">Reference</th>
                          </tr>
                      </thead>
                      <tbody>
                          {filteredEntries.map((entry: any) => (
                              <tr key={entry.id}>
                                  <td className="ps-4 text-muted small font-monospace">{new Date(entry.created_at).toLocaleString()}</td>
                                  <td>
                                      <div className="fw-medium">{getItemName(entry.item_id)}</div>
                                      <div className="small text-muted">
                                          {entry.attribute_values?.map((v:any) => v.value).join(', ') || '-'}
                                      </div>
                                  </td>
                                  <td>{getLocationName(entry.location_id)}</td>
                                  <td className={`text-end fw-bold ${entry.qty_change >= 0 ? 'text-success' : 'text-danger'}`}>
                                      {entry.qty_change > 0 ? '+' : ''}{entry.qty_change}
                                  </td>
                                  <td className="text-end pe-4">
                                      <span className="badge bg-light text-dark border font-monospace small">{entry.reference_type}</span>
                                      <span className="ms-2 text-muted small">#{entry.reference_id}</span>
                                  </td>
                              </tr>
                          ))}
                          {filteredEntries.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No records found for this period</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
  );
}
