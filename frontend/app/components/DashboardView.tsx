import { useLanguage } from '../context/LanguageContext';
import CalendarView from './CalendarView';

export default function DashboardView({ items, locations, stockBalance, workOrders, stockEntries, samples, salesOrders, kpis }: any) {
  const { t } = useLanguage();

  // Unified Metric Access (prefer backend KPIs, fallback to local calc for small sets)
  const metrics = {
      totalItems: kpis?.total_items ?? items.length,
      lowStock: kpis?.low_stock ?? 0,
      activeWO: kpis?.active_wo ?? 0,
      pendingWO: kpis?.pending_wo ?? 0,
      activeSamples: kpis?.active_samples ?? 0,
      openOrders: kpis?.open_sos ?? 0
  };

  // Recent Activity (Last 5 stock entries)
  const recentActivity = [...stockEntries]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

  // Optimized Location Analysis
  const locationStats = (locations || []).map((loc: any) => {
      // Find all balance records for this location (sum across different variants/items)
      // Ensure robust ID comparison (String casting)
      const stockInLoc = (stockBalance || []).filter((s: any) => String(s.location_id) === String(loc.id));
      const totalQty = stockInLoc.reduce((acc: number, curr: any) => acc + parseFloat(curr.qty), 0);
      return { ...loc, totalQty };
  }).filter((l: any) => l.totalQty > 0).sort((a: any, b: any) => b.totalQty - a.totalQty);

  const totalStockQty = locationStats.reduce((acc: number, curr: any) => acc + curr.totalQty, 0);

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;

  const KPICard = ({ title, value, subtext, icon, colorClass }: any) => (
      <div className="col-md-4 col-lg-2">
          <div className={`card h-100 border-0 shadow-sm ${colorClass} text-white`}>
              <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="card-title mb-0 opacity-75 small text-uppercase fw-bold text-white">{title}</h6>
                      <i className={`bi ${icon} fs-4 opacity-50`}></i>
                  </div>
                  <h3 className="fw-bold mb-0">{value}</h3>
                  <small className="opacity-75" style={{fontSize: '0.75rem'}}>{subtext}</small>
              </div>
          </div>
      </div>
  );

  return (
    <div className="fade-in">
        <div className="d-flex justify-content-between align-items-center mb-4">
            <h4 className="fw-bold mb-0 text-capitalize">{t('dashboard') || 'Dashboard'}</h4>
            <span className="text-muted small">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        
        {/* KPI Grid */}
        <div className="row g-3 mb-4">
            <KPICard title={t('item_inventory')} value={metrics.totalItems} subtext="Total SKUs" icon="bi-box-seam" colorClass="bg-primary" />
            <KPICard title="Low Stock" value={metrics.lowStock} subtext="Global Alert" icon="bi-exclamation-triangle" colorClass="bg-warning text-dark" />
            <KPICard title="Active WO" value={metrics.activeWO} subtext="Production" icon="bi-gear-wide-connected" colorClass="bg-success" />
            <KPICard title="Pending WO" value={metrics.pendingWO} subtext="In Queue" icon="bi-clock-history" colorClass="bg-info" />
            <KPICard title="Samples" value={metrics.activeSamples} subtext="In Development" icon="bi-eyedropper" colorClass="bg-secondary" />
            <KPICard title="Open Orders" value={metrics.openOrders} subtext="Sales Pipeline" icon="bi-receipt" colorClass="bg-dark" />
        </div>

        <div className="row g-4 mb-4">
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
                                            <span className="small text-muted">{loc.totalQty.toLocaleString()} units</span>
                                        </div>
                                        <div className="progress shadow-sm" style={{height: '10px'}}>
                                            <div className={`progress-bar ${color}`} role="progressbar" style={{width: `${percentage}%`}}></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {locationStats.length === 0 && (
                                <div className="text-center py-5">
                                    <i className="bi bi-pie-chart text-muted opacity-25 display-1"></i>
                                    <p className="text-muted small mt-2">No inventory recorded in any location.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Production Mini Calendar */}
            <div className="col-md-4">
                <div className="card h-100 shadow-sm border-0">
                    <div className="card-header bg-white">
                        <h5 className="card-title mb-0">Production Deadlines</h5>
                    </div>
                    <div className="card-body">
                        <CalendarView workOrders={workOrders} items={items} compact={true} />
                        <div className="mt-3 d-flex flex-wrap gap-2 justify-content-center">
                            <small className="text-muted d-flex align-items-center"><span className="bg-primary rounded-circle me-1" style={{width: 6, height: 6, display: 'inline-block'}}></span> Pending</small>
                            <small className="text-muted d-flex align-items-center"><span className="bg-warning rounded-circle me-1" style={{width: 6, height: 6, display: 'inline-block'}}></span> Active</small>
                            <small className="text-muted d-flex align-items-center"><span className="bg-success rounded-circle me-1" style={{width: 6, height: 6, display: 'inline-block'}}></span> Done</small>
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
                                <li key={entry.id} className="list-group-item d-flex justify-content-between align-items-center py-2 border-0 border-bottom">
                                    <div style={{minWidth: 0}}>
                                        <div className="fw-medium text-truncate small" title={getItemName(entry.item_id)}>{getItemName(entry.item_id)}</div>
                                        <small className="text-muted d-block font-monospace" style={{fontSize: '0.65rem'}}>{new Date(entry.created_at).toLocaleString()}</small>
                                    </div>
                                    <div className={`fw-bold ms-2 small ${entry.qty_change > 0 ? 'text-success' : 'text-danger'}`}>
                                        {entry.qty_change > 0 ? '+' : ''}{entry.qty_change}
                                    </div>
                                </li>
                            ))}
                            {recentActivity.length === 0 && <li className="list-group-item text-center py-5 text-muted small italic">No recent movements</li>}
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        {/* Active Production Detail Table */}
        <div className="row">
            <div className="col-12">
                <div className="card shadow-sm border-0">
                    <div className="card-header bg-white">
                        <h5 className="card-title mb-0">Manufacturing Monitoring</h5>
                    </div>
                    <div className="card-body p-0">
                        <div className="table-responsive">
                            <table className="table table-hover align-middle mb-0 small">
                                <thead className="table-light">
                                    <tr>
                                        <th className="ps-3">Code</th>
                                        <th>Product</th>
                                        <th>Status</th>
                                        <th>Progress</th>
                                        <th className="text-end pe-3">Target</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {workOrders.filter((w: any) => ['IN_PROGRESS', 'PENDING'].includes(w.status)).slice(0, 8).map((wo: any) => (
                                        <tr key={wo.id}>
                                            <td className="ps-3 font-monospace fw-bold">{wo.code}</td>
                                            <td>{getItemName(wo.item_id)}</td>
                                            <td>
                                                <span className={`badge ${wo.status === 'IN_PROGRESS' ? 'bg-warning text-dark' : 'bg-secondary'} extra-small`}>
                                                    {wo.status}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="progress" style={{height: '6px', width: '120px'}}>
                                                    <div className={`progress-bar ${wo.status === 'IN_PROGRESS' ? 'bg-warning progress-bar-striped progress-bar-animated' : 'bg-secondary'}`} style={{width: wo.status === 'IN_PROGRESS' ? '60%' : '0%'}}></div>
                                                </div>
                                            </td>
                                            <td className="text-end pe-3 fw-bold">{wo.qty.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    {workOrders.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-muted">No active production runs</td></tr>}
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
