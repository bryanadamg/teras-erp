import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function AuditLogsView({ auditLogs, currentPage, totalItems, pageSize, onPageChange }: any) {
  const { t } = useLanguage();
  const [filterType, setFilterType] = useState('');

  // Derived Pagination
  const totalPages = Math.ceil(totalItems / pageSize);
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalItems);

  // Local filtering based on the prop (Note: This might be partial if filtered on server too)
  const filteredLogs = auditLogs.filter((log: any) => {
      if (!filterType) return true;
      return log.entity_type === filterType;
  });

  return (
      <div className="card fade-in border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <div>
                  <h5 className="card-title mb-0">System Audit Logs</h5>
                  <p className="text-muted small mb-0 mt-1">Track all user activities and system changes.</p>
              </div>
              <div className="d-flex gap-2">
                  <div className="input-group input-group-sm" style={{width: '180px'}}>
                      <span className="input-group-text px-2"><i className="bi bi-funnel"></i></span>
                      <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                          <option value="">All Entities</option>
                          <option value="Item">Items</option>
                          <option value="BOM">BOMs</option>
                          <option value="WorkOrder">Work Orders</option>
                          <option value="SalesOrder">Sales Orders</option>
                          <option value="SampleRequest">Samples</option>
                          <option value="StockEntry">Stock</option>
                      </select>
                  </div>
              </div>
          </div>
          <div className="card-body p-0">
              <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0 small">
                      <thead className="table-light">
                          <tr>
                              <th className="ps-4">Timestamp</th>
                              <th>User</th>
                              <th>Action</th>
                              <th>Entity</th>
                              <th>Details</th>
                          </tr>
                      </thead>
                      <tbody>
                          {filteredLogs.map((log: any) => (
                              <tr key={log.id}>
                                  <td className="ps-4 text-muted font-monospace">{new Date(log.timestamp).toLocaleString()}</td>
                                  <td><span className="fw-medium text-dark">User {log.user_id ? log.user_id.split('-')[0] : 'System'}</span></td>
                                  <td>
                                      <span className={`badge bg-${getActionColor(log.action)} bg-opacity-10 text-${getActionColor(log.action)} border border-${getActionColor(log.action)} border-opacity-25`}>
                                          {log.action}
                                      </span>
                                  </td>
                                  <td>
                                      <span className="badge bg-light text-dark border">{log.entity_type}</span>
                                      <span className="ms-1 font-monospace text-muted">{log.entity_id.split('-')[0]}...</span>
                                  </td>
                                  <td className="text-muted">{log.details}</td>
                              </tr>
                          ))}
                          {filteredLogs.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No activity logs found</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
          <div className="card-footer bg-white border-top py-2 px-4 d-flex justify-content-between align-items-center">
              <div className="small text-muted font-monospace">
                  Showing {startRange}-{endRange} of {totalItems} logs
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

function getActionColor(action: string) {
    switch(action) {
        case 'CREATE': return 'success';
        case 'UPDATE': return 'warning';
        case 'DELETE': return 'danger';
        case 'UPDATE_STATUS': return 'info';
        default: return 'secondary';
    }
}