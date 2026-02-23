import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function ReportsView({ 
    stockEntries, 
    items, 
    locations, 
    categories, 
    onRefresh,
    currentPage,
    totalItems,
    pageSize,
    onPageChange
}: any) {
  const { t } = useLanguage();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Derived Pagination
  const totalPages = Math.ceil(totalItems / pageSize);
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalItems);

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
      
      // Date Filter
      if (start && date < start) return false;
      if (end) {
          const endDateTime = new Date(end);
          endDateTime.setHours(23, 59, 59, 999);
          if (date > endDateTime) return false;
      }

      // Category Filter
      if (categoryFilter) {
          const item = items.find((i: any) => i.id === entry.item_id);
          if (!item || item.category !== categoryFilter) return false;
      }

      return true;
  });

  return (
      <div className="card fade-in border-0 shadow-sm print-container">
          <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-3 no-print">
              <div>
                  <h5 className="card-title mb-0">{t('stock_ledger')}</h5>
                  <small className="text-muted">Analyze inventory movements</small>
              </div>
              <div className="d-flex gap-2 align-items-center flex-nowrap">
                  <div className="input-group input-group-sm" style={{width: '180px', minWidth: '180px'}}>
                      <span className="input-group-text px-2"><i className="bi bi-funnel"></i></span>
                      <select 
                          className="form-select" 
                          value={categoryFilter} 
                          onChange={e => setCategoryFilter(e.target.value)}
                      >
                          <option value="">{t('categories')} (All)</option>
                          {categories.map((c: any) => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                          ))}
                      </select>
                  </div>
                  <div className="input-group input-group-sm" style={{width: '160px', minWidth: '160px'}}>
                      <span className="input-group-text px-2">{t('from')}</span>
                      <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div className="input-group input-group-sm" style={{width: '160px', minWidth: '160px'}}>
                      <span className="input-group-text px-2">{t('to')}</span>
                      <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                  <button className="btn btn-outline-primary btn-sm btn-print white-space-nowrap" onClick={handlePrint}>
                      <i className="bi bi-printer me-1"></i>{t('print')}
                  </button>
              </div>
          </div>
          <div className="card-body p-0">
              <div className="print-header d-none d-print-block p-4 border-bottom mb-4">
                  <h2 className="mb-1">{t('stock_ledger')}</h2>
                  <p className="text-muted mb-0">Period: {startDate || 'All Time'} to {endDate || 'Present'}</p>
                  <p className="text-muted small">Generated on: {new Date().toLocaleString()}</p>
                  {categoryFilter && <p className="text-muted small">Category Filter: <strong>{categoryFilter}</strong></p>}
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
          <div className="card-footer bg-white border-top py-2 px-4 d-flex justify-content-between align-items-center no-print">
              <div className="small text-muted font-monospace">
                  Showing {startRange}-{endRange} of {totalItems} movements
              </div>
              <div className="btn-group">
                  <button 
                    className={`btn btn-sm btn-light border ${currentPage <= 1 ? 'disabled opacity-50' : ''}`}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  >
                      <i className="bi bi-chevron-left me-1"></i>Previous
                  </button>
                  <div className="btn btn-sm btn-white border-top border-bottom px-3 fw-bold">
                      Page {currentPage} of {totalPages || 1}
                  </div>
                  <button 
                    className={`btn btn-sm btn-light border ${currentPage >= totalPages ? 'disabled opacity-50' : ''}`}
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                  >
                      Next<i className="bi bi-chevron-right ms-1"></i>
                  </button>
              </div>
          </div>
      </div>
  );
}