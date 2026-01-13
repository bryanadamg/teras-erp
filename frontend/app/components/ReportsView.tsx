export default function ReportsView({ stockEntries, items, locations, onRefresh }: any) {
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;
  const getVariantName = (itemId: string, variantId: string) => {
      if (!variantId) return '-';
      const item = items.find((i: any) => i.id === itemId);
      if (!item) return variantId;
      const variant = (item as any).variants.find((v: any) => v.id === variantId);
      return variant ? variant.name : variantId;
  };

  return (
      <div className="card fade-in">
          <div className="card-header d-flex justify-content-between align-items-center">
              <div>
                  <h5 className="card-title mb-0">Stock Ledger</h5>
                  <small className="text-muted">History of all inventory movements</small>
              </div>
              <button className="btn btn-outline-secondary btn-sm" onClick={onRefresh}><i className="bi bi-arrow-clockwise me-1"></i>Refresh</button>
          </div>
          <div className="card-body p-0">
              <div className="table-responsive">
                  <table className="table table-hover table-striped mb-0 align-middle">
                      <thead className="table-light">
                          <tr>
                              <th className="ps-4">Date</th>
                              <th>Item</th>
                              <th>Location</th>
                              <th className="text-end">Change</th>
                              <th className="text-end pe-4">Reference</th>
                          </tr>
                      </thead>
                      <tbody>
                          {stockEntries.map((entry: any) => (
                              <tr key={entry.id}>
                                  <td className="ps-4 text-muted small font-monospace">{new Date(entry.created_at).toLocaleString()}</td>
                                  <td>
                                      <div className="fw-medium">{getItemName(entry.item_id)}</div>
                                      <div className="small text-muted">{getVariantName(entry.item_id, entry.variant_id)}</div>
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
                          {stockEntries.length === 0 && <tr><td colSpan={5} className="text-center py-5 text-muted">No records found</td></tr>}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
  );
}
