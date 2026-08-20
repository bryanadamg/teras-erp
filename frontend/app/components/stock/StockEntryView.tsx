import { useState } from 'react';
import SearchableSelect from '../shared/SearchableSelect';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar, xpToolbar as sharedXpToolbar, SearchField, ToolbarCount } from '../shared/shellTheme';
import { CodeChip, CODE_FONT, xpFont } from '../shared/xpTheme';
import { lvThead, LV_STICKY_THEAD, lvZebra, Dash } from '../shared/listViewTheme';

export default function StockEntryView({ items, selectItems, onSearchItems, locations, attributes, stockBalance, onRecordStock }: any) {
  const itemOptions = (selectItems ?? items);
  const { t } = useLanguage();
  const [stockEntry, setStockEntry] = useState({ item_code: '', location_code: '', attribute_value_ids: [] as string[], qty: 0 });
  const [balanceSearch, setBalanceSearch] = useState('');
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  const handleValueChange = (valId: string, attrId: string) => {
      const attr = attributes.find((a: any) => a.id === attrId);
      if (!attr) return;
      const otherValues = stockEntry.attribute_value_ids.filter(vid => !attr.values.some((v: any) => v.id === vid));
      const newValues = valId ? [...otherValues, valId] : otherValues;
      setStockEntry({ ...stockEntry, attribute_value_ids: newValues });
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onRecordStock(stockEntry);
      setStockEntry({ item_code: '', location_code: '', attribute_value_ids: [], qty: 0 });
  };

  const getItemName = (bal: any) => bal.item_name || items.find((i: any) => i.id === bal.item_id)?.name || bal.item_id;
  const getItemCode = (bal: any) => bal.item_code || items.find((i: any) => i.id === bal.item_id)?.code || bal.item_id;
  const getItemUom = (bal: any) => bal.item_uom || items.find((i: any) => i.id === bal.item_id)?.uom || '';
  const getItemEnds = (bal: any) => items.find((i: any) => i.id === bal.item_id)?.ends ?? null;
  // Packaging counts (no UOM conversion) — show only nonzero units.
  const pkgParts = (bal: any): { n: number; label: string }[] => {
      const out: { n: number; label: string }[] = [];
      const c = bal.qty_cones || 0, b = bal.qty_boxes || 0, d = bal.qty_drums || 0;
      if (c) out.push({ n: c, label: c === 1 || c === -1 ? 'cone' : 'cones' });
      if (b) out.push({ n: b, label: b === 1 || b === -1 ? 'box' : 'boxes' });
      if (d) out.push({ n: d, label: d === 1 || d === -1 ? 'drum' : 'drums' });
      return out;
  };
  const getLocationName = (bal: any) => bal.location_name || locations.find((l: any) => l.id === bal.location_id)?.name || bal.location_id;
  const getWarehouseName = (bal: any) => locations.find((l: any) => l.id === bal.location_id)?.parent_name || '';
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

  const filteredBalance = (stockBalance || []).filter((bal: any) => {
      const name = getItemName(bal).toLowerCase();
      const code = getItemCode(bal).toLowerCase();
      const loc = getLocationName(bal).toLowerCase();
      const wh = getWarehouseName(bal).toLowerCase();
      const s = balanceSearch.toLowerCase();
      return name.includes(s) || code.includes(s) || loc.includes(s) || wh.includes(s);
  });

  // ── XP inline styles ─────────────────────────────────────────────────────
  const xpBevel: React.CSSProperties = sharedXpBevel();
  const xpTitleBar = (extra: any = {}): React.CSSProperties => sharedXpTitleBar(extra);
  const xpToolbar: React.CSSProperties = sharedXpToolbar();
  const xpBtn = (extra: any = {}) => ({
      fontFamily: xpFont, fontSize: '11px', padding: '2px 10px', cursor: 'pointer',
      background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid',
      borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000000', borderRadius: 0, ...extra,
  });
  const xpInput: React.CSSProperties = {
      fontFamily: xpFont, fontSize: '11px', border: '1px solid #7f9db9',
      boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px',
      background: '#ffffff', color: '#000000', height: '20px', outline: 'none',
  };
  const xpSelect: React.CSSProperties = {
      ...xpInput, height: '22px', paddingRight: 4,
  };
  const xpSep: React.CSSProperties = {
      width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0,
  };
  const xpTableHeader: React.CSSProperties = lvThead(true);
  const xpLabel: React.CSSProperties = {
      fontFamily: xpFont, fontSize: '11px', color: '#000', display: 'block', marginBottom: 2,
  };
  const xpSectionHead: React.CSSProperties = {
      fontFamily: xpFont, fontSize: '10px', fontWeight: 'bold', color: '#444',
      textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 4, paddingBottom: 2,
      borderBottom: '1px solid #c0bdb5',
  };

  const balanceTable = (
      <table style={classic ? { width: '100%', borderCollapse: 'collapse' } : undefined} className={classic ? undefined : 'table table-hover align-middle mb-0'}>
          <thead className={classic ? undefined : 'table-light'} style={classic ? LV_STICKY_THEAD : undefined}>
              <tr>
                  <th style={classic ? { ...xpTableHeader, padding: '3px 8px' } : undefined} className={classic ? undefined : 'ps-4'}>{t('item_code')}</th>
                  <th style={classic ? { ...xpTableHeader, padding: '3px 8px' } : undefined}>{t('attributes')}</th>
                  <th style={classic ? { ...xpTableHeader, padding: '3px 8px' } : undefined}>{t('locations')}</th>
                  <th style={classic ? { ...xpTableHeader, padding: '3px 8px', textAlign: 'right' } : undefined} className={classic ? undefined : 'text-end'}>{t('qty')}</th>
                  <th style={classic ? { ...xpTableHeader, padding: '3px 8px' } : undefined}>UOM</th>
                  <th style={classic ? { ...xpTableHeader, padding: '3px 8px' } : undefined}>Packaging</th>
                  <th style={classic ? { ...xpTableHeader, padding: '3px 8px', textAlign: 'right' } : undefined} className={classic ? undefined : 'text-end'}>Ends</th>
              </tr>
          </thead>
          <tbody>
              {filteredBalance.map((bal: any, i: number) => (
                  <tr key={i} style={classic ? { background: lvZebra(true, i), borderBottom: '1px solid #c0bdb5' } : undefined}>
                      <td style={classic ? { padding: '4px 8px' } : undefined} className={classic ? undefined : 'ps-4'}>
                          <div style={classic ? { fontFamily: xpFont, fontSize: '11px', fontWeight: 'bold', color: '#000' } : undefined} className={classic ? undefined : 'fw-bold text-dark'}>{getItemName(bal)}</div>
                          {classic ? (
                              <div style={{ fontFamily: xpFont, fontSize: '10px', color: '#666', fontVariant: 'all-small-caps' }}>{getItemCode(bal)}</div>
                          ) : (
                              <CodeChip code={getItemCode(bal)} classic={false} tier={2} style={{ display: 'block' }} />
                          )}
                      </td>
                      <td style={classic ? { padding: '4px 8px' } : undefined}>
                          <div style={classic ? { display: 'flex', flexWrap: 'wrap', gap: 3 } : undefined} className={classic ? undefined : 'd-flex flex-wrap gap-1'}>
                              {bal.attribute_value_ids && bal.attribute_value_ids.length > 0 ? (
                                  bal.attribute_value_ids.map((vid: string) => (
                                      <span key={vid} style={classic ? { background: '#dde8f5', border: '1px solid #7f9db9', padding: '0 4px', fontFamily: xpFont, fontSize: '10px', color: '#333' } : undefined} className={classic ? undefined : 'badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-10 small'}>{getAttributeValueName(vid)}</span>
                                  ))
                              ) : (
                                  <span style={classic ? { fontFamily: xpFont, fontSize: '10px', color: '#888', fontStyle: 'italic' } : undefined} className={classic ? undefined : 'text-muted small fst-italic'}>Standard</span>
                              )}
                          </div>
                      </td>
                      <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '11px' } : undefined}>
                          <div style={classic ? { display: 'flex', flexWrap: 'wrap', gap: 3 } : undefined} className={classic ? undefined : 'd-flex flex-wrap gap-1'}>
                              {getWarehouseName(bal) && (
                                  <span style={classic ? { background: '#eef0e4', border: '1px solid #b7bb8f', padding: '0 5px', fontSize: '10px', color: '#4a4a2a' } : undefined} className={classic ? undefined : 'badge bg-secondary-subtle text-secondary-emphasis'}>{getWarehouseName(bal)}</span>
                              )}
                              <span style={classic ? { background: '#e8e1f0', border: '1px solid #a890c0', padding: '0 5px', fontSize: '10px', color: '#3a2a4a' } : undefined} className={classic ? undefined : 'badge bg-primary-subtle text-primary-emphasis'}>{getLocationName(bal)}</span>
                          </div>
                      </td>
                      <td style={classic ? { padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', fontWeight: 'bold', color: bal.qty < 0 ? '#c00000' : '#00008b', whiteSpace: 'nowrap' } : undefined} className={classic ? undefined : 'text-end'}>
                          {classic ? bal.qty : (
                              <span className={`fw-bold ${bal.qty < 0 ? 'text-danger' : 'text-primary'}`} style={{ fontFamily: CODE_FONT }}>{bal.qty}</span>
                          )}
                      </td>
                      <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', color: '#666', whiteSpace: 'nowrap' } : undefined} className={classic ? undefined : 'text-muted small'}>
                          {getItemUom(bal) || ''}
                      </td>
                      <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }} className={classic ? undefined : 'small'}>
                          {pkgParts(bal).length === 0
                              ? <Dash classic={classic} />
                              : pkgParts(bal).map((p, idx) => (
                                  <span key={idx} style={classic ? { color: p.n < 0 ? '#c00000' : '#5a3c00' } : undefined} className={classic ? undefined : (p.n < 0 ? 'text-danger' : '')}>
                                      {idx > 0 ? ' / ' : ''}{p.n} {p.label}
                                  </span>
                              ))}
                      </td>
                      <td style={classic ? { padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', color: '#444', whiteSpace: 'nowrap' } : undefined} className={classic ? undefined : 'text-end small'}>
                          {getItemEnds(bal) != null ? getItemEnds(bal) : ''}
                      </td>
                  </tr>
              ))}
              {filteredBalance.length === 0 && (
                  <tr><td colSpan={7} style={classic ? { textAlign: 'center', padding: '24px', fontFamily: xpFont, fontSize: '11px', color: '#666', fontStyle: 'italic' } : undefined} className={classic ? undefined : 'text-center py-5 text-muted fst-italic'}>Warehouse is empty</td></tr>
              )}
          </tbody>
      </table>
  );

  return (
      <div className={classic ? 'row g-3 fade-in' : 'row g-4 fade-in'}>
          {/* LEFT: Stock Entry Form */}
          <div className="col-md-4">
              <div style={classic ? { ...xpBevel, display: 'flex', flexDirection: 'column' } : undefined} className={classic ? undefined : 'card h-100 shadow-sm border-0'}>
                  <div style={classic ? xpTitleBar({ background: 'linear-gradient(to right, #6a3a8e 0%, #a06ac8 100%)', borderBottom: '1px solid #3d1a5e' }) : undefined} className={classic ? undefined : 'card-header bg-primary bg-opacity-10 text-primary-emphasis py-3'}>
                      {classic ? (
                          <span><i className="bi bi-box-seam" style={{ marginRight: 6 }}></i>{t('stock_adjustment')}</span>
                      ) : (
                          <h5 className="card-title mb-0"><i className="bi bi-box-seam me-2"></i>{t('stock_adjustment')}</h5>
                      )}
                  </div>
                  <div style={classic ? { padding: '8px', background: '#f5f4ef' } : undefined} className={classic ? undefined : 'card-body'}>
                      <form onSubmit={handleSubmit}>
                          {/* Item section */}
                          <div style={classic ? { marginBottom: 8 } : undefined} className={classic ? undefined : 'mb-4 p-3 bg-light rounded-3 border border-dashed'}>
                              {classic ? (
                                  <div style={xpSectionHead}><i className="bi bi-box2" style={{ marginRight: 4 }}></i>{t('item_inventory')}</div>
                              ) : (
                                  <label className="form-label text-muted text-uppercase small fw-bold mb-3">{t('item_inventory')}</label>
                              )}
                              {classic && <label style={xpLabel}>Item</label>}
                              <div style={classic ? { marginBottom: 6 } : undefined} className={classic ? undefined : 'mb-3'}>
                                  <SearchableSelect
                                      options={itemOptions.map((item: any) => ({ value: item.code, label: item.name, subLabel: item.code }))}
                                      onSearch={onSearchItems}
                                      value={stockEntry.item_code}
                                      onChange={(code: string) => setStockEntry({ ...stockEntry, item_code: code, attribute_value_ids: [] })}
                                      required
                                      placeholder={t('search') + '...'}
                                      size={classic ? 'sm' : undefined}
                                  />
                              </div>
                              {boundAttrs.map((attr: any) => (
                                  <div key={attr.id} style={classic ? { marginBottom: 4 } : undefined} className={classic ? undefined : 'mb-2'}>
                                      <label style={classic ? xpLabel : undefined} className={classic ? undefined : 'form-label small mb-1 text-muted'}>{attr.name}</label>
                                      <select
                                          style={classic ? { ...xpSelect, width: '100%' } : undefined}
                                          className={classic ? undefined : 'form-select form-select-sm shadow-sm'}
                                          value={stockEntry.attribute_value_ids.find(vid => attr.values.some((v: any) => v.id === vid)) || ''}
                                          onChange={e => handleValueChange(e.target.value, attr.id)}
                                      >
                                          <option value="">Select {attr.name}...</option>
                                          {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                      </select>
                                  </div>
                              ))}
                          </div>
                          {/* Transaction details */}
                          <div style={classic ? { marginBottom: 8 } : undefined} className={classic ? undefined : 'mb-4'}>
                              {classic ? (
                                  <div style={xpSectionHead}><i className="bi bi-arrow-left-right" style={{ marginRight: 4 }}></i>Transaction Details</div>
                              ) : (
                                  <label className="form-label text-muted text-uppercase small fw-bold">Transaction Details</label>
                              )}
                              {classic ? (
                                  <>
                                      <label style={xpLabel}>{t('locations')}</label>
                                      <div style={{ marginBottom: 6 }}>
                                          <SearchableSelect
                                              options={locations.map((loc: any) => ({ value: loc.code, label: loc.full_path || (loc.parent_name ? `${loc.parent_name} / ${loc.name}` : loc.name), subLabel: loc.code }))}
                                              value={stockEntry.location_code}
                                              onChange={(code: string) => setStockEntry({ ...stockEntry, location_code: code })}
                                              required
                                              placeholder={t('locations') + '...'}
                                              size="sm"
                                          />
                                      </div>
                                      <label style={xpLabel}>{t('qty')} <span style={{ color: '#666', fontWeight: 'normal' }}>(use negative to subtract)</span></label>
                                      <input
                                          type="number"
                                          style={{ ...xpInput, width: '100%' }}
                                          placeholder="0"
                                          value={stockEntry.qty || ''}
                                          onChange={e => setStockEntry({ ...stockEntry, qty: parseFloat(e.target.value) })}
                                          required
                                      />
                                  </>
                              ) : (
                                  <div className="row g-2">
                                      <div className="col-8">
                                          <SearchableSelect
                                              options={locations.map((loc: any) => ({ value: loc.code, label: loc.full_path || (loc.parent_name ? `${loc.parent_name} / ${loc.name}` : loc.name), subLabel: loc.code }))}
                                              value={stockEntry.location_code}
                                              onChange={(code: string) => setStockEntry({ ...stockEntry, location_code: code })}
                                              required
                                              placeholder={t('locations') + '...'}
                                          />
                                      </div>
                                      <div className="col-4">
                                          <input type="number" className="form-control" placeholder={t('qty')} value={stockEntry.qty} onChange={e => setStockEntry({ ...stockEntry, qty: parseFloat(e.target.value) })} required />
                                      </div>
                                  </div>
                              )}
                          </div>
                          <button
                              type="submit"
                              style={classic ? { ...xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' }), width: '100%', padding: '4px 10px' } : undefined}
                              className={classic ? undefined : 'btn btn-primary w-100 py-2 fw-bold shadow-sm'}
                          >
                              {classic ? (<><i className="bi bi-floppy" style={{ marginRight: 6 }}></i>{t('save')}</>) : t('save')}
                          </button>
                      </form>
                  </div>
              </div>
          </div>

          {/* RIGHT: Stock Balance */}
          <div className="col-md-8">
              <div style={classic ? { ...xpBevel, display: 'flex', flexDirection: 'column' } : undefined} className={classic ? undefined : 'card h-100 shadow-sm border-0'}>
                  <div style={classic ? xpTitleBar() : undefined} className={classic ? undefined : 'card-header bg-white py-3 border-bottom-0 d-flex justify-content-between align-items-center'}>
                      {classic ? (
                          <span><i className="bi bi-table" style={{ marginRight: 6 }}></i>{t('stock_ledger')} (Live)</span>
                      ) : (
                          <h5 className="card-title mb-0">{t('stock_ledger')} (Live)</h5>
                      )}
                      {classic && <span style={{ fontSize: '10px', opacity: 0.85 }}>{(stockBalance || []).length} records</span>}
                      {!classic && <SearchField classic={false} value={balanceSearch} onChange={setBalanceSearch} placeholder="Search..." width={220} />}
                  </div>
                  {classic && (
                      <div style={xpToolbar}>
                          <SearchField classic value={balanceSearch} onChange={setBalanceSearch} placeholder="Search item or location..." width={240} grow />
                          <div style={xpSep} />
                          <ToolbarCount classic>{filteredBalance.length} row{filteredBalance.length === 1 ? '' : 's'}</ToolbarCount>
                      </div>
                  )}
                  {classic ? (
                      <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff', maxHeight: 'calc(var(--app-vh) - 200px)' }}>
                          {balanceTable}
                      </div>
                  ) : (
                      <div className="card-body p-0">
                          <div className="table-responsive">
                              {balanceTable}
                          </div>
                      </div>
                  )}
                  {classic && (
                      <div style={{
                          background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                          padding: '2px 8px', display: 'flex', gap: 16,
                          fontFamily: xpFont, fontSize: '11px', color: '#333',
                      }}>
                          <span><b>{(stockBalance || []).length}</b> Total SKUs</span>
                          <span style={{ color: '#c00000' }}><b>{(stockBalance || []).filter((b: any) => b.qty < 0).length}</b> Negative</span>
                      </div>
                  )}
              </div>
          </div>
      </div>
  );
}
