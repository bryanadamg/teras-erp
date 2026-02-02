import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function AuditLogsView({ onRefresh }: any) {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [filterType, setFilterType] = useState('');
  
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

  const fetchLogs = async () => {
      try {
          const token = localStorage.getItem('access_token');
          let url = `${API_BASE}/audit-logs?limit=100`;
          if (filterType) url += `&entity_type=${filterType}`;
          
          const res = await fetch(url, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
              setLogs(await res.json());
          }
      } catch (e) {
          console.error("Failed to fetch logs", e);
      }
  };

  useEffect(() => {
      fetchLogs();
  }, [filterType]);

  const handleRefresh = () => {
      fetchLogs();
      if (onRefresh) onRefresh();
  };

  return (
      <div className="card fade-in border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <div>
                  <h5 className="card-title mb-0">System Audit Logs</h5>
                  <p className="text-muted small mb-0 mt-1">Track all user activities and system changes.</p>
              </div>
              <div className="d-flex gap-2">
                  <select className="form-select form-select-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                      <option value="">All Entities</option>
                      <option value="Item">Items</option>
                      <option value="BOM">BOMs</option>
                      <option value="WorkOrder">Work Orders</option>
                      <option value="SalesOrder">Sales Orders</option>
                      <option value="SampleRequest">Samples</option>
                      <option value="StockEntry">Stock</option>
                  </select>
                  <button className="btn btn-outline-secondary btn-sm" onClick={handleRefresh}>
                      <i className="bi bi-arrow-clockwise"></i> Refresh
                  </button>
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
                          {logs.map((log: any) => (
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
                          {logs.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No activity logs found</td></tr>}
                      </tbody>
                  </table>
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
