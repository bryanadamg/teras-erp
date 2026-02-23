import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface HistoryPaneProps {
    entityType: 'Item' | 'SampleRequest' | 'BOM' | 'WorkOrder';
    entityId: string;
    onClose: () => void;
}

export default function HistoryPane({ entityType, entityId, onClose }: HistoryPaneProps) {
    const { t } = useLanguage();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('access_token');
                const res = await fetch(`${API_BASE}/audit-logs?entity_type=${entityType}&entity_id=${entityId}&limit=50`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setLogs(data.items);
                }
            } catch (e) {
                console.error("Failed to fetch entity history", e);
            } finally {
                setLoading(false);
            }
        };
        if (entityId) fetchHistory();
    }, [entityId, entityType]);

    const getActionBadge = (action: string) => {
        switch(action) {
            case 'CREATE': return 'bg-success';
            case 'UPDATE': return 'bg-info text-dark';
            case 'DELETE': return 'bg-danger';
            case 'STATUS_CHANGE': return 'bg-warning text-dark';
            default: return 'bg-secondary';
        }
    };

    const renderChanges = (changes: any) => {
        if (!changes || typeof changes !== 'object') return null;
        return (
            <div className="mt-2 p-2 bg-light rounded border small font-monospace overflow-auto" style={{maxHeight: '150px'}}>
                {Object.entries(changes).map(([key, value]) => (
                    <div key={key}>
                        <span className="text-primary">{key}:</span> {JSON.stringify(value)}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="offcanvas offcanvas-end show border-start shadow-lg" style={{ visibility: 'visible', width: '450px' }}>
            <div className="offcanvas-header bg-dark text-white">
                <h5 className="offcanvas-title small fw-bold text-uppercase">
                    <i className="bi bi-clock-history me-2 text-info"></i>
                    {entityType} History
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
            </div>
            <div className="offcanvas-body p-0 d-flex flex-column bg-white">
                {loading ? (
                    <div className="flex-grow-1 d-flex align-items-center justify-content-center">
                        <div className="spinner-border text-primary spinner-border-sm" role="status"></div>
                    </div>
                ) : (
                    <div className="flex-grow-1 overflow-auto p-3">
                        {logs.length === 0 ? (
                            <div className="text-center py-5 text-muted small italic">No history found for this record</div>
                        ) : (
                            <div className="timeline">
                                {logs.map((log, idx) => (
                                    <div key={log.id} className="mb-4 position-relative ps-4 border-start border-2 border-light ms-2">
                                        <div className="position-absolute" style={{left: '-11px', top: '0'}}>
                                            <div className={`rounded-circle ${getActionBadge(log.action)}`} style={{width: '20px', height: '20px', border: '4px solid white'}}></div>
                                        </div>
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <span className={`badge ${getActionBadge(log.action)} extra-small`}>{log.action}</span>
                                            <span className="extra-small text-muted font-monospace">{new Date(log.timestamp).toLocaleString()}</span>
                                        </div>
                                        <div className="fw-bold small">{log.details || 'System Activity'}</div>
                                        <div className="extra-small text-muted mb-2">Performed by User ID: {log.user_id || 'System'}</div>
                                        {renderChanges(log.changes)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div className="p-3 bg-light border-top text-center">
                    <small className="text-muted italic">Tracking active since system initialization</small>
                </div>
            </div>
        </div>
    );
}
