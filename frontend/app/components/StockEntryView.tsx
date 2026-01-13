import { useState } from 'react';

export default function StockEntryView({ items, locations, onRecordStock }: any) {
  const [stockEntry, setStockEntry] = useState({ item_code: '', location_code: '', variant_id: '', qty: 0 });

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onRecordStock(stockEntry);
      setStockEntry({ item_code: '', location_code: '', variant_id: '', qty: 0 });
  };

  const selectedItem = items.find((i: any) => i.code === stockEntry.item_code);
  const availableVariants = selectedItem ? (selectedItem as any).variants : [];

  return (
      <div className="row justify-content-center fade-in">
          <div className="col-md-6">
              <div className="card">
                  <div className="card-header bg-primary bg-opacity-10 text-primary-emphasis text-center py-4">
                      <h4 className="card-title mb-0"><i className="bi bi-box-seam me-2"></i>Stock Movement</h4>
                      <p className="small mb-0 mt-1 opacity-75">Record manual inventory adjustments</p>
                  </div>
                  <div className="card-body p-4">
                      <form onSubmit={handleSubmit}>
                          <div className="mb-4">
                              <label className="form-label text-muted text-uppercase small fw-bold">Product Details</label>
                              <div className="row g-2">
                                  <div className="col-12">
                                      <select className="form-select form-select-lg" value={stockEntry.item_code} onChange={e => setStockEntry({...stockEntry, item_code: e.target.value, variant_id: ''})} required>
                                          <option value="">Select Item...</option>
                                          {items.map((item: any) => <option key={item.id} value={item.code}>{item.name} ({item.code})</option>)}
                                      </select>
                                  </div>
                                  <div className="col-12">
                                      <select className="form-select" value={stockEntry.variant_id} onChange={e => setStockEntry({...stockEntry, variant_id: e.target.value})} disabled={availableVariants.length === 0}>
                                          <option value="">{availableVariants.length > 0 ? 'Select Variant (Optional)' : 'No Variants Available'}</option>
                                          {availableVariants.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
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
      </div>
  );
}
