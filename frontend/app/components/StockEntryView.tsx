import { useState } from 'react';

export default function StockEntryView({ items, locations, attributes, stockBalance, onRecordStock }: any) {
  const [stockEntry, setStockEntry] = useState({ item_code: '', location_code: '', attribute_value_id: '', qty: 0 });

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onRecordStock(stockEntry);
      setStockEntry({ item_code: '', location_code: '', attribute_value_id: '', qty: 0 });
  };

  const selectedItem = items.find((i: any) => i.code === stockEntry.item_code);
  
  const getAvailableValues = (itemCode: string) => {
      const item = items.find((i: any) => i.code === itemCode);
      if (!item || !item.attribute_id) return [];
      const attr = attributes.find((a: any) => a.id === item.attribute_id);
      return attr ? attr.values : [];
  };

  const availableValues = getAvailableValues(stockEntry.item_code);

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getItemCode = (id: string) => items.find((i: any) => i.id === id)?.code || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;
  
  const getAttributeValueName = (valId: string) => {
      if (!valId) return '-';
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  return (
      <div className="row g-4 fade-in">
          {/* LEFT: Stock Entry Form */}
          <div className="col-md-5">
              <div className="card h-100">
                  <div className="card-header bg-primary bg-opacity-10 text-primary-emphasis py-3">
                      <h5 className="card-title mb-0"><i className="bi bi-box-seam me-2"></i>Stock Movement</h5>
                  </div>
                  <div className="card-body">
                      <form onSubmit={handleSubmit}>
                          <div className="mb-4">
                              <label className="form-label text-muted text-uppercase small fw-bold">Product Details</label>
                              <div className="row g-2">
                                  <div className="col-12">
                                      <select className="form-select form-select-lg" value={stockEntry.item_code} onChange={e => setStockEntry({...stockEntry, item_code: e.target.value, attribute_value_id: ''})} required>
                                          <option value="">Select Item...</option>
                                          {items.map((item: any) => <option key={item.id} value={item.code}>{item.name} ({item.code})</option>)}
                                      </select>
                                  </div>
                                  <div className="col-12">
                                      <select className="form-select" value={stockEntry.attribute_value_id} onChange={e => setStockEntry({...stockEntry, attribute_value_id: e.target.value})} disabled={availableValues.length === 0}>
                                          <option value="">{availableValues.length > 0 ? 'Select Value...' : 'No Variations'}</option>
                                          {availableValues.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                      </select>
                                  </div>
                              </div>
                          </div>

                          <div className="mb-4">
                              <label className="form-label text-muted text-uppercase small fw-bold">Movement Details</label>
                              <div className="row g-2">
                                  <div className="col-8">
                                      <select className="form-select" value={stockEntry.location_code} onChange={e => setStockEntry({...stockEntry, location_code: e.target.value})} required>
                                          <option value="">Select Location...</option>
                                          {locations.map((loc: any) => <option key={loc.id} value={loc.code}>{loc.name}</option>)}
                                      </select>
                                  </div>
                                  <div className="col-4">
                                      <input type="number" className="form-control" placeholder="Qty" value={stockEntry.qty} onChange={e => setStockEntry({...stockEntry, qty: parseFloat(e.target.value)})} required />
                                  </div>
                              </div>
                          </div>

                          <button type="submit" className="btn btn-primary w-100 py-2 fw-bold shadow-sm">Record Transaction</button>
                      </form>
                  </div>
              </div>
          </div>

          {/* RIGHT: Stock Levels */}
          <div className="col-md-7">
              <div className="card h-100">
                  <div className="card-header bg-white py-3">
                      <h5 className="card-title mb-0">Current Stock Levels</h5>
                  </div>
                  <div className="card-body p-0">
                      <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                              <thead className="table-light">
                                  <tr>
                                      <th className="ps-4">Item</th>
                                      <th>Location</th>
                                      <th className="text-end pe-4">Qty</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {stockBalance.map((bal: any, idx: number) => (
                                      <tr key={idx}>
                                          <td className="ps-4">
                                              <div className="fw-medium">{getItemName(bal.item_id)}</div>
                                              <div className="small text-muted font-monospace">{getItemCode(bal.item_id)}</div>
                                              {bal.attribute_value_id && <div className="badge bg-light text-dark border mt-1">{getAttributeValueName(bal.attribute_value_id)}</div>}
                                          </td>
                                          <td>{getLocationName(bal.location_id)}</td>
                                          <td className="text-end pe-4">
                                              <span className={`fw-bold ${bal.qty < 0 ? 'text-danger' : 'text-dark'}`}>{bal.qty}</span>
                                          </td>
                                      </tr>
                                  ))}
                                  {stockBalance.length === 0 && <tr><td colSpan={3} className="text-center py-5 text-muted">No stock data available</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
}
