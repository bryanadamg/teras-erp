import React, { useState, memo } from 'react';
import { useLanguage } from '../context/LanguageContext';

// Helper for action colors
function getActionColor(action: string) {
    switch(action) {
        case 'CREATE': return 'success';
        case 'UPDATE': return 'warning';
        case 'DELETE': return 'danger';
        case 'UPDATE_STATUS': return 'info';
        default: return 'secondary';
    }
}

// Memoized Row Component
const AuditLogRow = memo(({ log }: any) => {
    const [showChanges, setShowChanges] = useState(false);

    return (
        <>
            <tr style={{ cursor: log.changes ? 'pointer' : 'default' }} onClick={() => log.changes && setShowChanges(!showChanges)}>
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
                <td className="text-muted">
                    {log.details}
                    {log.changes && (
                        <i className={`bi bi-chevron-${showChanges ? 'up' : 'down'} ms-2 text-primary`}></i>
                    )}
                </td>
            </tr>
            {showChanges && log.changes && (
                <tr className="bg-light bg-opacity-50">
                    <td colSpan={5} className="p-0">
                        <div className="p-3 ps-5 border-bottom shadow-inner">
                            <h6 className="extra-small fw-bold text-uppercase text-muted mb-2">Technical Diff (JSON)</h6>
                            <pre className="extra-small font-monospace mb-0 overflow-auto bg-white p-2 border rounded" style={{ maxHeight: '200px' }}>
                                {JSON.stringify(log.changes, null, 2)}
                            </pre>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
});

AuditLogRow.displayName = 'AuditLogRow';

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
                  <p className="text-muted small mb-0 mt-1">Track all user activities and system changes. Click rows to see technical details.</p>
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
                              <AuditLogRow key={log.id} log={log} />
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
