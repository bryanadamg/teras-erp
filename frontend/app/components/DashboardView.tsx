import { useLanguage } from '../context/LanguageContext';

export default function DashboardView({ items, locations, stockBalance, workOrders, stockEntries }: any) {
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

  // Location Analysis
  const locationStats = locations.map((loc: any) => {
      const stockInLoc = stockBalance.filter((s: any) => s.location_id === loc.id);
      const totalQty = stockInLoc.reduce((acc: number, curr: any) => acc + parseFloat(curr.qty), 0);
      const itemCount = stockInLoc.length;
      return { ...loc, totalQty, itemCount };
  }).sort((a: any, b: any) => b.totalQty - a.totalQty);

  const totalStockQty = locationStats.reduce((acc: number, curr: any) => acc + curr.totalQty, 0);

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;

  return (
    <div className="fade-in">
        <h4 className="fw-bold mb-4 text-capitalize">{t('dashboard') || 'Dashboard'}</h4>
        
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
            {/* Stock Distribution by Location */}
            <div className="col-md-4">
                <div className="card h-100 shadow-sm border-0">
                    <div className="card-header bg-white">
                        <h5 className="card-title mb-0">Warehouse Distribution</h5>
                    </div>
                    <div className="card-body">
                        <div className="d-flex flex-column gap-4">
                            {locationStats.map((loc: any, idx: number) => {
                                const percentage = totalStockQty > 0 ? (loc.totalQty / totalStockQty) * 100 : 0;
                                const colors = ['bg-primary', 'bg-success', 'bg-info', 'bg-warning', 'bg-danger'];
                                const color = colors[idx % colors.length];
                                
                                return (
                                    <div key={loc.id}>
                                        <div className="d-flex justify-content-between mb-1">
                                            <span className="fw-bold text-dark">{loc.name}</span>
                                            <span className="small text-muted">{loc.totalQty} units</span>
                                        </div>
                                        <div className="progress" style={{height: '8px'}}>
                                            <div 
                                                className={`progress-bar ${color}`} 
                                                role="progressbar" 
                                                style={{width: `${percentage}%`}} 
                                                aria-valuenow={percentage} 
                                                aria-valuemin={0} 
                                                aria-valuemax={100}
                                            ></div>
                                        </div>
                                        <div className="mt-1 small text-muted">
                                            {loc.itemCount} unique items stored
                                        </div>
                                    </div>
                                );
                            })}
                            {locationStats.length === 0 && <div className="text-center text-muted fst-italic">No locations defined</div>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Production */}
            <div className="col-md-4">
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
                                        <th className="text-end pe-3">Due</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {workOrders.filter((w: any) => w.status === 'IN_PROGRESS').slice(0, 5).map((wo: any) => {
                                        let warning = null;
                                        if (wo.due_date) {
                                            const due = new Date(wo.due_date);
                                            const now = new Date();
                                            const diffDays = (due.getTime() - now.getTime()) / (1000 * 3600 * 24);
                                            if (diffDays < 0) warning = { type: 'danger', icon: 'bi-exclamation-octagon-fill', text: 'Overdue' };
                                            else if (diffDays < 2) warning = { type: 'warning', icon: 'bi-exclamation-triangle-fill', text: 'Soon' };
                                        }

                                        return (
                                            <tr key={wo.id}>
                                                <td className="ps-3 font-monospace small">{wo.code}</td>
                                                <td>
                                                    <div className="text-truncate" style={{maxWidth: '120px'}} title={getItemName(wo.item_id)}>
                                                        {getItemName(wo.item_id)}
                                                    </div>
                                                </td>
                                                <td className="text-end pe-3">
                                                    {warning ? (
                                                        <span className={`badge bg-${warning.type}`} title={warning.text}>{warning.text}</span>
                                                    ) : (
                                                        <span className="small text-muted">{wo.due_date ? new Date(wo.due_date).toLocaleDateString() : '-'}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {workOrders.filter((w: any) => w.status === 'IN_PROGRESS').length === 0 && (
                                        <tr><td colSpan={3} className="text-center text-muted py-3">No active production</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="col-md-4">
                <div className="card h-100 shadow-sm border-0">
                    <div className="card-header bg-white">
                        <h5 className="card-title mb-0">Recent Activity</h5>
                    </div>
                    <div className="card-body p-0">
                        <ul className="list-group list-group-flush">
                            {recentActivity.map((entry: any) => (
                                <li key={entry.id} className="list-group-item d-flex justify-content-between align-items-center">
                                    <div style={{minWidth: 0}}>
                                        <div className="fw-medium text-truncate" title={getItemName(entry.item_id)}>{getItemName(entry.item_id)}</div>
                                        <small className="text-muted d-block">{new Date(entry.created_at).toLocaleDateString()}</small>
                                    </div>
                                    <div className={`fw-bold ms-2 ${entry.qty_change > 0 ? 'text-success' : 'text-danger'}`}>
                                        {entry.qty_change > 0 ? '+' : ''}{entry.qty_change}
                                    </div>
                                </li>
                            ))}
                            {recentActivity.length === 0 && <li className="list-group-item text-muted text-center py-3">No recent activity</li>}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}