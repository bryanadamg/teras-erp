import React, { useState, memo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { xpToolbar as sharedXpToolbar, ShellWindow, ShellTitleBar } from '../shared/shellTheme';
import { lvTh } from '../shared/listViewTheme';
import Pager from '../shared/Pager';

function getActionXPStyle(action: string): React.CSSProperties {
    const map: Record<string, { bg: string; border: string; color: string }> = {
        CREATE:        { bg: '#e8f5e9', border: '#2e7d32', color: '#1b4620' },
        UPDATE:        { bg: '#fff8e1', border: '#c77800', color: '#4a3000' },
        DELETE:        { bg: '#fce4ec', border: '#b71c1c', color: '#6b0000' },
        UPDATE_STATUS: { bg: '#e3f2fd', border: '#1565c0', color: '#0a3070' },
    };
    const s = map[action] || { bg: '#e8e8e8', border: '#6a6a6a', color: '#222' };
    return {
        background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        padding: '1px 5px', fontSize: '9px', fontFamily: 'Tahoma,Arial,sans-serif',
        fontWeight: 'bold', whiteSpace: 'nowrap' as const,
    };
}

function getActionColor(action: string) {
    switch (action) {
        case 'CREATE': return 'success';
        case 'UPDATE': return 'warning';
        case 'DELETE': return 'danger';
        case 'UPDATE_STATUS': return 'info';
        default: return 'secondary';
    }
}

const AuditLogRow = memo(({ log, classic }: any) => {
    const [showChanges, setShowChanges] = useState(false);
    const { formatDateTime: tzDateTime } = useTimezone();

    if (classic) {
        return (
            <>
                <tr
                    style={{ cursor: log.changes ? 'pointer' : 'default', background: showChanges ? '#e8f0ff' : undefined }}
                    onClick={() => log.changes && setShowChanges(!showChanges)}
                >
                    <td style={{ padding: '3px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#555', fontVariant: 'all-small-caps' }}>
                        {tzDateTime(log.timestamp)}
                    </td>
                    <td style={{ padding: '3px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#000' }}>
                        User {log.user_id ? log.user_id.split('-')[0] : 'System'}
                    </td>
                    <td style={{ padding: '3px 8px' }}>
                        <span style={getActionXPStyle(log.action)}>{log.action}</span>
                    </td>
                    <td style={{ padding: '3px 8px' }}>
                        <span style={{ background: '#e0dfd8', border: '1px solid #b0a898', padding: '0 4px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#333' }}>{log.entity_type}</span>
                        <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#777', marginLeft: 4 }}>{log.entity_id.split('-')[0]}…</span>
                    </td>
                    <td style={{ padding: '3px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#444' }}>
                        {log.details}
                        {log.changes && (
                            <i className={`bi bi-chevron-${showChanges ? 'up' : 'down'} ms-2`} style={{ color: '#0058e6', fontSize: '10px' }}></i>
                        )}
                    </td>
                </tr>
                {showChanges && log.changes && (
                    <tr style={{ background: '#f0f4ff' }}>
                        <td colSpan={5} style={{ padding: 0 }}>
                            <div style={{ padding: '6px 12px 8px 32px', borderBottom: '1px solid #c0bdb5' }}>
                                <div style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase', marginBottom: 4 }}>Technical Diff (JSON)</div>
                                <pre style={{ fontFamily: 'Consolas,monospace', fontSize: '10px', background: '#ffffff', border: '1px solid #7f9db9', padding: '4px 6px', margin: 0, maxHeight: '160px', overflowY: 'auto', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)' }}>
                                    {JSON.stringify(log.changes, null, 2)}
                                </pre>
                            </div>
                        </td>
                    </tr>
                )}
            </>
        );
    }

    return (
        <>
            <tr style={{ cursor: log.changes ? 'pointer' : 'default' }} onClick={() => log.changes && setShowChanges(!showChanges)}>
                <td className="ps-4 text-muted font-monospace">{tzDateTime(log.timestamp)}</td>
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
                    {log.changes && <i className={`bi bi-chevron-${showChanges ? 'up' : 'down'} ms-2 text-primary`}></i>}
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

export default function AuditLogsView({ auditLogs, currentPage, totalItems, pageSize, onPageChange, filterType, onFilterChange }: any) {
  const { t } = useLanguage();
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  // ── XP inline styles ─────────────────────────────────────────────────────
  const xpToolbar: React.CSSProperties = sharedXpToolbar();
  const xpSelect: React.CSSProperties = {
      fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', border: '1px solid #7f9db9',
      boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 4px',
      background: '#ffffff', color: '#000000', height: '22px', outline: 'none',
  };
  const xpSep: React.CSSProperties = {
      width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0,
  };

  if (classic) {
      return (
          <ShellWindow classic fill="page" className="fade-in">
              <ShellTitleBar classic icon="bi-shield-check" title="System Audit Logs" />

              {/* Filters toolbar */}
              <div style={xpToolbar}>
                  <i className="bi bi-funnel" style={{ fontSize: '11px', color: '#666' }}></i>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#444' }}>Entity:</span>
                  <select style={{ ...xpSelect, width: 150 }} value={filterType} onChange={e => onFilterChange(e.target.value)}>
                      <option value="">All Entities</option>
                      <option value="Item">Items</option>
                      <option value="BOM">BOMs</option>
                      <option value="WorkOrder">Work Orders</option>
                      <option value="SalesOrder">Sales Orders</option>
                      <option value="SampleRequest">Samples</option>
                      <option value="StockEntry">Stock</option>
                  </select>
                  <div style={xpSep} />
                  <span style={{ marginLeft: 'auto', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#444' }}>
                      <b>{totalItems}</b> total entries · click a row to expand diff
                  </span>
              </div>

              {/* Table */}
              <div style={{ flex: 1, minHeight: 0, background: '#ffffff', overflowY: 'auto', overflowX: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                          <tr>
                              <th style={{ ...lvTh(true), width: 150 }}>Timestamp</th>
                              <th style={{ ...lvTh(true), width: 110 }}>User</th>
                              <th style={{ ...lvTh(true), width: 100 }}>Action</th>
                              <th style={{ ...lvTh(true), width: 160 }}>Entity</th>
                              <th style={{ ...lvTh(true), borderRight: 'none' }}>Details</th>
                          </tr>
                      </thead>
                      <tbody>
                          {auditLogs.map((log: any, i: number) => (
                              <React.Fragment key={log.id}>
                                  <AuditLogRow log={log} classic={true} rowIndex={i} />
                              </React.Fragment>
                          ))}
                          {auditLogs.length === 0 && (
                              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>No activity logs found</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>

              <Pager page={currentPage} total={totalItems} pageSize={pageSize} onPageChange={onPageChange} />
          </ShellWindow>
      );
  }

  // ── Modern (Bootstrap) mode ───────────────────────────────────────────────
  return (
      <ShellWindow classic={false} fill="page" className="fade-in">
          <ShellTitleBar
              classic={false}
              icon="bi-shield-check"
              title="System Audit Logs"
              subtitle="Track all user activities and system changes. Click rows to see technical details."
              right={
                  <div className="input-group input-group-sm" style={{ width: '180px' }}>
                      <span className="input-group-text px-2"><i className="bi bi-funnel"></i></span>
                      <select className="form-select" value={filterType} onChange={e => onFilterChange(e.target.value)}>
                          <option value="">All Entities</option>
                          <option value="Item">Items</option>
                          <option value="BOM">BOMs</option>
                          <option value="WorkOrder">Work Orders</option>
                          <option value="SalesOrder">Sales Orders</option>
                          <option value="SampleRequest">Samples</option>
                          <option value="StockEntry">Stock</option>
                      </select>
                  </div>
              }
          />
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              <table className="table table-hover align-middle mb-0 small" style={{ tableLayout: 'fixed' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                          <th style={{ ...lvTh(false), width: 150 }} className="ps-4">Timestamp</th>
                          <th style={{ ...lvTh(false), width: 110 }}>User</th>
                          <th style={{ ...lvTh(false), width: 100 }}>Action</th>
                          <th style={{ ...lvTh(false), width: 160 }}>Entity</th>
                          <th style={lvTh(false)}>Details</th>
                      </tr>
                  </thead>
                  <tbody>
                      {auditLogs.map((log: any) => (
                          <AuditLogRow key={log.id} log={log} classic={false} />
                      ))}
                      {auditLogs.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No activity logs found</td></tr>}
                  </tbody>
              </table>
          </div>
          <Pager page={currentPage} total={totalItems} pageSize={pageSize} onPageChange={onPageChange} />
      </ShellWindow>
  );
}
