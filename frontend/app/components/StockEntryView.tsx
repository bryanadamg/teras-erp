import { useState } from 'react';

export default function StockEntryView({ items, locations, attributes, stockBalance, onRecordStock }: any) {
  const [stockEntry, setStockEntry] = useState({ item_code: '', location_code: '', attribute_value_ids: [] as string[], qty: 0 });

  const handleValueChange = (valId: string, attrId: string) => {
      const attr = attributes.find((a: any) => a.id === attrId);
      if (!attr) return;

      // Find current value ID that belongs to this attribute and remove it
      const otherValues = stockEntry.attribute_value_ids.filter(vid => !attr.values.some((v:any) => v.id === vid));
      const newValues = valId ? [...otherValues, valId] : otherValues;
      
      setStockEntry({...stockEntry, attribute_value_ids: newValues});
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onRecordStock(stockEntry);
      setStockEntry({ item_code: '', location_code: '', attribute_value_ids: [], qty: 0 });
  };

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getItemCode = (id: string) => items.find((i: any) => i.id === id)?.code || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;
  
  const getAttributeValueName = (valId: string) => {
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  const getBoundAttributes = (itemCode: string) => {
      const item = items.find((i: any) => i.code === itemCode);
      if (!item || !item.attribute_ids) return [];
      return attributes.filter((a: any) => item.attribute_ids.includes(a.id));
  };

  const boundAttrs = getBoundAttributes(stockEntry.item_code);

  return (
      <div className="row g-4 fade-in">
          {/* LEFT: Stock Entry Form */}
          <div className="col-md-5">
              <div className="card h-100 shadow-sm border-0">
                  <div className="card-header bg-primary bg-opacity-10 text-primary-emphasis py-3">
                      <h5 className="card-title mb-0"><i className="bi bi-box-seam me-2"></i>Stock Movement</h5>
                  </div>
                  <div className="card-body">
                      <form onSubmit={handleSubmit}>
                          <div className="mb-4 p-3 bg-light rounded-3 border border-dashed">
                              <label className="form-label text-muted text-uppercase small fw-bold mb-3">Product Selection</label>
                              <select className="form-select mb-3" value={stockEntry.item_code} onChange={e => setStockEntry({...stockEntry, item_code: e.target.value, attribute_value_ids: []})} required>
                                  <option value="">Select Item...</option>
                                  {items.map((item: any) => <option key={item.id} value={item.code}>{item.name} ({item.code})</option>)}
                              </select>

                              {boundAttrs.map((attr: any) => (
                                  <div key={attr.id} className="mb-2">
                                      <label className="form-label small mb-1 text-muted">{attr.name}</label>
                                      <select 
                                          className="form-select form-select-sm shadow-sm"
                                          value={stockEntry.attribute_value_ids.find(vid => attr.values.some((v:any) => v.id === vid)) || ''}
                                          onChange={e => handleValueChange(e.target.value, attr.id)}
                                      >
                                          <option value="">Any {attr.name}</option>
                                          {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                      </select>
                                  </div>
                              ))}
                          </div>

                          <div className="mb-4">
                              <label className="form-label text-muted text-uppercase small fw-bold">Transaction Details</label>
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
              <div className="card h-100 shadow-sm border-0">
                  <div className="card-header bg-white py-3 border-bottom-0">
                      <h5 className="card-title mb-0">Live Inventory Balance</h5>
                  </div>
                  <div className="card-body p-0">
                      <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                              <thead className="table-light">
                                  <tr>
                                      <th className="ps-4">Item</th>
                                      <th>Variations</th>
                                      <th>Location</th>
                                      <th className="text-end pe-4">Qty</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {stockBalance.map((bal: any, idx: number) => (
                                      <tr key={idx}>
                                          <td className="ps-4">
                                              <div className="fw-bold text-dark">{getItemName(bal.item_id)}</div>
                                              <div className="small text-muted font-monospace">{getItemCode(bal.item_id)}</div>
                                          </td>
                                          <td>
                                              <div className="d-flex flex-wrap gap-1">
                                                  {bal.attribute_value_ids && bal.attribute_value_ids.length > 0 ? (
                                                      bal.attribute_value_ids.map((vid: string) => (
                                                          <span key={vid} className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10 small">{getAttributeValueName(vid)}</span>
                                                      ))
                                                  ) : (
                                                      <span className="text-muted small fst-italic">Standard</span>
                                                  )}
                                              </div>
                                          </td>
                                          <td><span className="small">{getLocationName(bal.location_id)}</span></td>
                                          <td className="text-end pe-4">
                                              <span className={`fw-bold font-monospace ${bal.qty < 0 ? 'text-danger' : 'text-primary'}`}>{bal.qty}</span>
                                          </td>
                                      </tr>
                                  ))}
                                  {stockBalance.length === 0 && <tr><td colSpan={4} className="text-center py-5 text-muted fst-italic">Warehouse is empty</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
}