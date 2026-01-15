import { useLanguage } from '../context/LanguageContext';

export default function DashboardView({ items, stockBalance, workOrders, stockEntries }: any) {
  const { t } = useLanguage();

  // Metrics
  const totalItems = items.length;
  const lowStockItems = stockBalance.filter((s: any) => s.qty < 10).length; // Threshold example
  const pendingWO = workOrders.filter((w: any) => w.status === 'PENDING').length;
  const activeWO = workOrders.filter((w: any) => w.status === 'IN_PROGRESS').length;

  // Recent Activity (Last 5 stock entries)
  const recentActivity = [...stockEntries]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;

  return (
    <div className="fade-in">
        <h4 className="fw-bold mb-4">{t('dashboard') || 'Dashboard'}</h4>
        
        {/* KPI Cards */}
        <div className="row g-4 mb-4">
            <div className="col-md-3">
                <div className="card h-100 border-0 shadow-sm bg-primary text-white">
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="card-title mb-0 opacity-75">{t('item_inventory')}</h6>
                            <i className="bi bi-box-seam fs-4 opacity-50"></i>
                        </div>
                        <h2 className="display-6 fw-bold mb-0">{totalItems}</h2>
                        <small className="opacity-75">Total SKUs</small>
                    </div>
                </div>
            </div>
            <div className="col-md-3">
                <div className="card h-100 border-0 shadow-sm bg-warning text-dark">
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="card-title mb-0 opacity-75">Low Stock</h6>
                            <i className="bi bi-exclamation-triangle fs-4 opacity-50"></i>
                        </div>
                        <h2 className="display-6 fw-bold mb-0">{lowStockItems}</h2>
                        <small className="opacity-75">Items below threshold</small>
                    </div>
                </div>
            </div>
            <div className="col-md-3">
                <div className="card h-100 border-0 shadow-sm bg-info text-white">
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="card-title mb-0 opacity-75">Pending Orders</h6>
                            <i className="bi bi-clock-history fs-4 opacity-50"></i>
                        </div>
                        <h2 className="display-6 fw-bold mb-0">{pendingWO}</h2>
                        <small className="opacity-75">Waiting to start</small>
                    </div>
                </div>
            </div>
            <div className="col-md-3">
                <div className="card h-100 border-0 shadow-sm bg-success text-white">
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="card-title mb-0 opacity-75">In Production</h6>
                            <i className="bi bi-gear-wide-connected fs-4 opacity-50"></i>
                        </div>
                        <h2 className="display-6 fw-bold mb-0">{activeWO}</h2>
                        <small className="opacity-75">Work Orders in progress</small>
                    </div>
                </div>
            </div>
        </div>

        <div className="row g-4">
            {/* Recent Activity */}
            <div className="col-md-6">
                <div className="card h-100 shadow-sm border-0">
                    <div className="card-header bg-white">
                        <h5 className="card-title mb-0">Recent Stock Movements</h5>
                    </div>
                    <div className="card-body p-0">
                        <ul className="list-group list-group-flush">
                            {recentActivity.map((entry: any) => (
                                <li key={entry.id} className="list-group-item d-flex justify-content-between align-items-center">
                                    <div>
                                        <div className="fw-medium">{getItemName(entry.item_id)}</div>
                                        <small className="text-muted">{new Date(entry.created_at).toLocaleString()}</small>
                                    </div>
                                    <div className={`fw-bold ${entry.qty_change > 0 ? 'text-success' : 'text-danger'}`}>
                                        {entry.qty_change > 0 ? '+' : ''}{entry.qty_change}
                                    </div>
                                </li>
                            ))}
                            {recentActivity.length === 0 && <li className="list-group-item text-muted text-center py-3">No recent activity</li>}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Active Production */}
            <div className="col-md-6">
                <div className="card h-100 shadow-sm border-0">
                    <div className="card-header bg-white">
                        <h5 className="card-title mb-0">Active Production</h5>
                    </div>
                    <div className="card-body p-0">
                        <div className="table-responsive">
                            <table className="table table-hover align-middle mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th className="ps-3">Code</th>
                                        <th>Product</th>
                                        <th className="text-end pe-3">Qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {workOrders.filter((w: any) => w.status === 'IN_PROGRESS').slice(0, 5).map((wo: any) => (
                                        <tr key={wo.id}>
                                            <td className="ps-3 font-monospace small">{wo.code}</td>
                                            <td>{getItemName(wo.item_id)}</td>
                                            <td className="text-end pe-3 fw-bold">{wo.qty}</td>
                                        </tr>
                                    ))}
                                    {workOrders.filter((w: any) => w.status === 'IN_PROGRESS').length === 0 && (
                                        <tr><td colSpan={3} className="text-center text-muted py-3">No active production</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}
