import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CodeConfigModal, { CodeConfig, buildCodeParts } from '../shared/CodeConfigModal';
import SearchableSelect from '../shared/SearchableSelect';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { useUser } from '../../context/UserContext';
import ModalWrapper from '../shared/ModalWrapper';
import ProductionRunModal from './ProductionRunModal';
import MOCreationPreview from './MOCreationPreview';
import { xpFont, xpInput, xpLabel, ModalFooterActions } from '../shared/xpTheme';
import { useManufacturingHelpers } from './useManufacturingHelpers';
import ProductionRunsTab from './ProductionRunsTab';
import ManufacturingOrdersTab from './ManufacturingOrdersTab';

export default function ManufacturingView({
    items,
    boms,
    locations,
    attributes,
    manufacturingOrders,
    productionRuns,
    stockBalance,
    workCenters,
    operations,
    onCreateMO,
    onUpdateStatus,
    onDeleteMO,
    onCreateProductionRun,
    onDeleteProductionRun,
    onUpdatePRStatus,
    onCreateWO,
    onUpdateWO,
    onUpdateWOStatus,
    onDeleteWO,
    currentPage,
    totalItems,
    pageSize,
    onPageChange,
    prPage,
    prTotal,
    setPrPage,
    initialCreateState,
    onClearInitialState,
    initialPRState,
    onClearInitialPRState,
    initialTab,
    showTabSwitcher = true,
    initialMOFilter,
    initialPRFilter,
}: any) {
  const { showToast } = useToast();
  const router = useRouter();
  const { t } = useLanguage();
  const { authFetch, companyProfile, pagination, itemIndex } = useData();
  const { hasPermission } = useUser();
  const canManage = hasPermission('work_order.manage');
  const { moSearch, setMoSearch, prSearch: prSearchCtx, setPrSearch: setPrSearchCtx } = pagination;
  const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
  const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
  const [viewMode, setViewMode] = useState('list');

  // Tab state: 'production-runs' | 'manufacturing-orders'
  const [activeTab, setActiveTab] = useState<'production-runs' | 'manufacturing-orders'>(initialTab || 'production-runs');
  const [isPRModalOpen, setIsPRModalOpen] = useState(false);
  const [prModalBom, setPrModalBom] = useState<any>(null);
  const [prModalInitialSizes, setPrModalInitialSizes] = useState<Record<string, string> | undefined>(undefined);
  const [prModalTotalQty, setPrModalTotalQty] = useState<string | undefined>(undefined);
  const [prModalSalesOrderId, setPrModalSalesOrderId] = useState<string | undefined>(undefined);
  const [prModalSalesOrderCode, setPrModalSalesOrderCode] = useState<string | undefined>(undefined);
  const [prModalInitialEntries, setPrModalInitialEntries] = useState<Array<{bomId: string; sizeQtys: Record<string,string>; totalQty: string; locked?: boolean}> | undefined>(undefined);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWO, setNewWO] = useState({
      code: '',
      bom_id: '',
      location_code: '',
      source_location_code: '',
      qty: 1.0,
      target_start_date: '',
      target_end_date: '',
      sales_order_id: '',
      bom_size_id: '',
      create_nested: true,
  });

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'MO',
      suffix: '',
      separator: '-',
      includeItemCode: true,
      includeVariant: false,
      variantAttributeNames: [],
      includeYear: false,
      includeMonth: false
  });
  // Local search inputs (debounced into context, which drives server-side paginated search)
  const [moCodeFilter, setMoCodeFilter] = useState<string>(initialMOFilter || moSearch || '');
  const [prSearch, setPrSearch] = useState<string>(initialPRFilter || prSearchCtx || '');

  useEffect(() => {
      if (initialMOFilter) setMoCodeFilter(initialMOFilter);
  }, [initialMOFilter]);

  useEffect(() => {
      if (initialPRFilter) setPrSearch(initialPRFilter);
  }, [initialPRFilter]);

  // Debounce MO search input → context (resets to page 1 + refetches matching page)
  useEffect(() => {
      const id = setTimeout(() => {
          if (moCodeFilter !== moSearch) setMoSearch(moCodeFilter);
      }, 350);
      return () => clearTimeout(id);
  }, [moCodeFilter]);

  // Debounce PR search input → context
  useEffect(() => {
      const id = setTimeout(() => {
          if (prSearch !== prSearchCtx) setPrSearchCtx(prSearch);
      }, 350);
      return () => clearTimeout(id);
  }, [prSearch]);

  // prSearchCtx lives in DataContext, so it outlives this view — leaving the page
  // with a deep-link PR filter still applied (e.g. after clicking a PR badge from
  // SO) would leave the shared productionRuns list narrowed to that one PR for
  // every other page reading it. Clear it on unmount so the list goes back to unfiltered.
  useEffect(() => {
      // unconditional: the cleanup closure captures prSearchCtx from mount time,
      // so checking it here would read a stale value instead of the latest one
      return () => setPrSearchCtx('');
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  const helpers = useManufacturingHelpers({ items, boms, locations, operations, workCenters, attributes, stockBalance, itemIndex });
  const { getItemName, getAttributeValueName, getBomSizeLabel } = helpers;

  // Handle Automated Creation from Sales Order
  useEffect(() => {
      if (initialCreateState && items.length > 0 && boms.length > 0) {
          const { bom_id, qty, sales_order_id, bom_size_id } = initialCreateState;

          // Use the bom_id passed from the SO page (already matched on item + attributes)
          const bom = boms.find((b: any) => b.id === bom_id);

          if (bom) {
              const base = buildWOBasePattern(bom.id);
              fetchAvailableCode(base).then(suggestedCode => {
                  setNewWO(prev => ({
                      ...prev,
                      code: suggestedCode,
                      bom_id: bom.id,
                      qty: qty,
                      sales_order_id: sales_order_id || '',
                      bom_size_id: bom_size_id || '',
                  }));
                  setIsCreateOpen(true);
                  onClearInitialState();
                  showToast('Production details pre-filled from Sales Order', 'info');
              });
          } else {
              showToast('No active BOM found for the requested item.', 'warning');
              onClearInitialState();
          }
      }
  }, [initialCreateState, items, boms, onClearInitialState]);

  // Handle PR creation pre-fill from Sales Order
  useEffect(() => {
      if (initialPRState && boms.length > 0) {
          if (initialPRState.bom_entries) {
              // Multi-BOM entries path
              const entries = (initialPRState.bom_entries as any[]).map((e: any) => {
                  const bom = boms.find((b: any) => b.id === e.bom_id);
                  if (!bom) return null;
                  const sizeMap: Record<string, string> = {};
                  (e.sizes || []).forEach((s: any) => { sizeMap[s.bom_size_id] = String(s.qty); });
                  return { bomId: e.bom_id, sizeQtys: sizeMap, totalQty: e.total_qty ? String(e.total_qty) : '', attributeValueIds: e.attribute_value_ids || [], colorId: e.color_id || undefined, labdipVariantCode: e.labdip_variant_code || undefined, locked: true };
              }).filter(Boolean) as Array<{bomId: string; sizeQtys: Record<string,string>; totalQty: string; attributeValueIds?: string[]; colorId?: string; labdipVariantCode?: string; locked?: boolean}>;

              if (entries.length > 0) {
                  setActiveTab('production-runs');
                  setPrModalInitialEntries(entries);
                  setPrModalSalesOrderId(initialPRState.sales_order_id || undefined);
                  setPrModalSalesOrderCode(initialPRState.sales_order_code || undefined);
                  setIsPRModalOpen(true);
                  onClearInitialPRState?.();
                  const count = entries.length;
                  showToast(`Production Run pre-filled with ${count} BOM${count > 1 ? 's' : ''} from Sales Order`, 'info');
              } else {
                  showToast('No matching BOMs found for Production Run.', 'warning');
                  onClearInitialPRState?.();
              }
          } else {
              // Legacy single-BOM path
              const { bom_id, sizes, sales_order_id, total_qty } = initialPRState;
              const bom = boms.find((b: any) => b.id === bom_id);
              if (bom) {
                  const sizeMap: Record<string, string> = {};
                  (sizes || []).forEach((s: any) => { sizeMap[s.bom_size_id] = String(s.qty); });
                  setActiveTab('production-runs');
                  setPrModalBom(bom);
                  setPrModalInitialSizes(Object.keys(sizeMap).length > 0 ? sizeMap : undefined);
                  setPrModalTotalQty(total_qty ? String(total_qty) : undefined);
                  setPrModalSalesOrderId(sales_order_id || undefined);
                  setPrModalSalesOrderCode(initialPRState.sales_order_code || undefined);
                  setIsPRModalOpen(true);
                  onClearInitialPRState?.();
                  showToast('Production Run pre-filled from Sales Order', 'info');
              } else {
                  showToast('No matching BOM found for Production Run.', 'warning');
                  onClearInitialPRState?.();
              }
          }
      }
  }, [initialPRState, boms]);

  useEffect(() => {
      const savedConfig = localStorage.getItem('mo_code_config');
      if (savedConfig) {
          try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
      }
  }, []);

  const buildWOBasePattern = (bomId: string, config = codeConfig) => {
      const bom = boms.find((b: any) => b.id === bomId);
      if (!bom) return '';
      const item = items.find((i: any) => i.id === bom.item_id);
      const itemCode = item ? item.code : 'PROD';

      const names: string[] = [];
      if (config.includeVariant && bom.attribute_value_ids) {
          for (const attrName of (config.variantAttributeNames ?? [])) {
              const attr = attributes.find((a: any) => a.name === attrName);
              if (!attr) continue;
              const selectedVal = attr.values.find((v: any) => bom.attribute_value_ids.includes(v.id));
              if (selectedVal) names.push(selectedVal.value.toUpperCase().replace(/\s+/g, ''));
          }
      }

      return buildCodeParts(config, itemCode, names).join(config.separator);
  };

  const fetchAvailableCode = async (base: string): Promise<string> => {
      try {
          const res = await authFetch(`${API_BASE}/manufacturing-orders/available-code?base=${encodeURIComponent(base)}`);
          if (res.ok) {
              const data = await res.json();
              return data.code;
          }
      } catch (_) {}
      return `${base}-00001`;
  };

  const handleSaveConfig = async (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('mo_code_config', JSON.stringify(newConfig));
      let base: string;
      if (newWO.bom_id) {
          base = buildWOBasePattern(newWO.bom_id, newConfig);
      } else {
          const parts = [];
          if (newConfig.prefix) parts.push(newConfig.prefix);
          const now = new Date();
          if (newConfig.includeYear) parts.push(now.getFullYear());
          if (newConfig.includeMonth) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
          if (newConfig.suffix) parts.push(newConfig.suffix);
          base = parts.join(newConfig.separator);
      }
      if (base) {
          const suggested = await fetchAvailableCode(base);
          setNewWO(prev => ({ ...prev, code: suggested }));
      }
  };

  const handlePrintList = () => {
      window.print();
  };

  const handleBOMChange = async (bomId: string) => {
      const base = buildWOBasePattern(bomId);
      const suggestedCode = base ? await fetchAvailableCode(base) : '';
      setNewWO({...newWO, bom_id: bomId, code: suggestedCode});
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      if (!newWO.bom_id) { showToast('Select a product recipe (BOM).', 'danger'); return; }
      if (!newWO.code) { showToast('Enter an MO code.', 'danger'); return; }
      if (!newWO.qty || newWO.qty <= 0) { showToast('Quantity must be greater than 0.', 'danger'); return; }
      setIsSubmitting(true);
      try {
          // Clean dates: convert empty strings to null for Pydantic
          const payload = {
              ...newWO,
              target_start_date: newWO.target_start_date || null,
              target_end_date: newWO.target_end_date || null,
              sales_order_id: newWO.sales_order_id || null,
              bom_size_id: newWO.bom_size_id || null,
          };

          const res = await onCreateMO(payload);
          if (res && res.status === 400) {
              const baseMatch = newWO.code.match(/^(.*)-\d+$/);
              const base = baseMatch ? baseMatch[1] : newWO.code;
              const suggestedCode = await fetchAvailableCode(base);
              showToast(`Manufacturing Order Code "${newWO.code}" already exists. Suggesting: ${suggestedCode}`, 'warning');
              setNewWO({ ...newWO, code: suggestedCode });
          } else if (res && res.ok) {
              const createdMO = await res.json();
              if (createdMO.is_material_available === false) {
                  showToast('Manufacturing Order created, but insufficient materials!', 'warning');
              } else {
                  showToast('Manufacturing Order created successfully!', 'success');
              }
              setNewWO({ code: '', bom_id: '', location_code: '', source_location_code: '', qty: 1.0, target_start_date: '', target_end_date: '', sales_order_id: '', bom_size_id: '', create_nested: true });
              setIsCreateOpen(false);
          } else {
              let detail = 'Failed to create Manufacturing Order';
              try { const body = await res.json(); if (body.detail) detail = body.detail; } catch {}
              showToast(detail, 'danger');
          }
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
      <div className="row g-4 fade-in print-container">
          <CodeConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} type="MO" onSave={handleSaveConfig} initialConfig={codeConfig} attributes={attributes} />

          <ModalWrapper
              isOpen={isCreateOpen}
              modeless
              onClose={() => setIsCreateOpen(false)}
              title={<><i className="bi bi-gear-wide-connected me-1"></i> NEW MANUFACTURING ORDER</>}
              variant="success"
              size="xxl"
              footer={
                  <ModalFooterActions
                      onCancel={() => setIsCreateOpen(false)}
                      cancelLabel={t('cancel')}
                      onSubmit={handleSubmit}
                      submitting={isSubmitting}
                      submitLabel="CREATE MANUFACTURING ORDER"
                      submittingLabel="Creating..."
                      variant="success"
                  />
              }
          >
              {/* Two-panel layout: left=form, right=live preview */}
              <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>

                  {/* ── LEFT: Form ── */}
                  <div style={{
                      width: 380, minWidth: 380, flexShrink: 0,
                      paddingRight: 20,
                      borderRight: `1px solid ${classic ? '#aca899' : '#e2e8f0'}`,
                  }}>
                      {/* Variant context badge */}
                      {(() => {
                          const bom = boms.find((b: any) => b.id === newWO.bom_id);
                          const attrNames: string[] = bom ? (bom.attribute_value_ids || []).map(getAttributeValueName).filter(Boolean) : [];
                          const sizeLabel = bom && newWO.bom_size_id ? getBomSizeLabel(bom.id, newWO.bom_size_id) : '';
                          if (!attrNames.length && !sizeLabel) return null;
                          return (
                              <div className="mb-2 px-2 py-1 rounded" style={{ background: '#f6f8ff', border: '1px solid #c8d8f8' }}>
                                  <div style={{ fontFamily: xpFont, fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#888', marginBottom: 4 }}>
                                      <i className="bi bi-tag-fill me-1 text-primary opacity-75"></i>Product Variant
                                  </div>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                                      {attrNames.map((name: string, i: number) => (
                                          <span key={i} style={{ fontSize: 10, padding: '1px 6px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 3, fontWeight: 700 }}>{name}</span>
                                      ))}
                                      {sizeLabel && (
                                          <span style={{ fontSize: 10, padding: '1px 6px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 3, fontWeight: 700 }}>
                                              <i className="bi bi-rulers me-1"></i>{sizeLabel}
                                          </span>
                                      )}
                                  </div>
                              </div>
                          );
                      })()}

                      {/* MO Details */}
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888', borderBottom: `1px solid ${classic ? '#c0bdb5' : '#e2e8f0'}`, paddingBottom: 2, marginBottom: 8 }}>MO Details</div>

                      <div className="mb-2">
                          <label style={xpLabel()}>MO Reference Code</label>
                          <div style={{ display: 'flex' }}>
                              <input
                                  placeholder="Auto-generated"
                                  value={newWO.code}
                                  onChange={e => setNewWO({...newWO, code: e.target.value})}
                                  required
                                  style={xpInput({ flex: 1, borderRight: 'none', height: '22px', borderRadius: 0 })}
                              />
                              <button
                                  type="button"
                                  onClick={() => setIsConfigOpen(true)}
                                  style={{ fontFamily: 'Tahoma, "Segoe UI", sans-serif', fontSize: 11, height: 24, padding: '0 7px', background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', borderRadius: 0, cursor: 'pointer', boxSizing: 'border-box' as const }}
                                  title="Configure code format"
                              ><i className="bi bi-gear-fill" style={{ fontSize: 10 }}></i></button>
                          </div>
                      </div>

                      <div className="mb-2">
                          <label style={xpLabel()}>Target Quantity</label>
                          <input type="number" style={xpInput({ width: '100%', height: '22px', borderRadius: 0 })} value={newWO.qty} onChange={e => setNewWO({...newWO, qty: parseFloat(e.target.value)})} required />
                      </div>

                      <div className="mb-2">
                          <label style={xpLabel()}>Product Recipe (BOM)</label>
                          <SearchableSelect
                              options={boms.map((b: any) => ({ value: b.id, label: `[${b.code}]  ${getItemName(b.item_id)}` }))}
                              value={newWO.bom_id}
                              onChange={handleBOMChange}
                              required
                              placeholder="Choose a product recipe..."
                          />
                      </div>

                      {/* Schedule */}
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888', borderBottom: `1px solid ${classic ? '#c0bdb5' : '#e2e8f0'}`, paddingBottom: 2, marginBottom: 8, marginTop: 14 }}>Schedule</div>
                      <div className="row g-2 mb-2">
                          <div className="col-6">
                              <label style={xpLabel()}>Start Date</label>
                              <input type="date" style={xpInput({ width: '100%', height: '22px', borderRadius: 0 })} value={newWO.target_start_date} onChange={e => setNewWO({...newWO, target_start_date: e.target.value})} />
                          </div>
                          <div className="col-6">
                              <label style={xpLabel()}>End Date</label>
                              <input type="date" style={xpInput({ width: '100%', height: '22px', borderRadius: 0 })} value={newWO.target_end_date} onChange={e => setNewWO({...newWO, target_end_date: e.target.value})} />
                          </div>
                      </div>

                      {/* Locations are no longer set on the order. Output follows the
                          final work-order's output location; material source follows the
                          item master default / BOM-line override, resolved at staging. */}

                      {/* Nested toggle — clean */}
                      <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${classic ? '#aca899' : '#e2e8f0'}` }}>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', margin: 0 }}>
                              <input
                                  type="checkbox"
                                  checked={newWO.create_nested}
                                  onChange={e => setNewWO({...newWO, create_nested: e.target.checked})}
                                  style={{ marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
                              />
                              <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: classic ? '#000084' : '#1e40af' }}>
                                      <i className="bi bi-diagram-3-fill me-1"></i>
                                      Create child MOs for nested BOMs
                                  </div>
                                  <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                                      Auto-generates sub-assembly orders for all nested recipes
                                  </div>
                              </div>
                          </label>
                      </div>
                  </div>

                  {/* ── RIGHT: Live Preview ── */}
                  <div style={{ flex: 1, paddingLeft: 20, minHeight: 280 }}>
                      {newWO.bom_id && newWO.qty > 0 ? (
                          <MOCreationPreview
                              bomId={newWO.bom_id}
                              qty={newWO.qty}
                              locationCode={newWO.location_code}
                              sourceLocationCode={newWO.source_location_code}
                              createNested={newWO.create_nested}
                              boms={boms}
                              locations={locations}
                              stockBalance={stockBalance}
                          />
                      ) : (
                          <div style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              height: '100%', minHeight: 280, gap: 10,
                              color: classic ? '#888' : '#94a3b8',
                          }}>
                              <i className="bi bi-diagram-3" style={{ fontSize: 40, opacity: 0.35 }}></i>
                              <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 200 }}>
                                  Select a BOM and enter quantity to preview the MO
                              </div>
                          </div>
                      )}
                  </div>

              </div>
          </ModalWrapper>

          <div className="col-12 flex-print-fill">
              {/* ── Outer window shell ── */}
              <div style={{
                  border: classic ? '2px solid' : undefined,
                  borderColor: classic ? '#dfdfdf #808080 #808080 #dfdfdf' : undefined,
                  borderRadius: 0,
                  boxShadow: classic ? '2px 2px 4px rgba(0,0,0,0.3)' : undefined,
                  background: classic ? '#ece9d8' : undefined,
                  display: 'flex', flexDirection: 'column',
                  height: 'calc(100vh - 80px)',
              }} className={classic ? '' : 'card h-100 border-0 shadow-sm'}>

                  {/* ── Title bar / toolbar ── */}
                  <div
                      className="no-print"
                      style={{
                          background: classic
                              ? 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)'
                              : '#fff',
                          borderBottom: classic ? '1px solid #003080' : '1px solid #dee2e6',
                          padding: classic ? '4px 8px' : '8px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: classic ? 'inset 0 1px 0 rgba(255,255,255,0.3)' : undefined,
                      }}
                  >
                      {/* Left: title + view switcher */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                              fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined,
                              fontSize: classic ? '12px' : undefined,
                              fontWeight: 'bold',
                              color: classic ? '#fff' : '#000',
                              textShadow: classic ? '1px 1px 1px rgba(0,0,0,0.4)' : undefined,
                              letterSpacing: classic ? '0.3px' : undefined,
                          }}>
                              <i className={`bi ${activeTab === 'manufacturing-orders' ? 'bi-list-task' : 'bi-collection-play'} me-2`} style={{ fontSize: '13px' }}></i>
                              {activeTab === 'manufacturing-orders' ? (t('manufacturing_orders') || 'Manufacturing Orders') : 'Production Runs'}
                          </span>

                          {/* View-mode buttons */}
                          <div style={{ display: 'flex', gap: classic ? '2px' : '0' }}>
                              {[
                                  { key: 'calendar', icon: 'bi-calendar-event', label: 'Calendar' },
                                  { key: 'list',     icon: 'bi-list-ul',        label: 'List' },
                                  { key: 'scanner',  icon: 'bi-qr-code-scan',   label: 'Scanner' },
                              ].map(({ key, icon, label }) => {
                                  const isActive = viewMode === key;
                                  const handleClick = () => key === 'scanner' ? router.push('/scanner') : setViewMode(key);
                                  if (classic) {
                                      return (
                                          <button
                                              key={key}
                                              onClick={handleClick}
                                              style={{
                                                  fontFamily: 'Tahoma, Arial, sans-serif',
                                                  fontSize: '11px',
                                                  padding: '2px 8px',
                                                  background: isActive
                                                      ? 'linear-gradient(to bottom,#fff 0%,#d4d0c8 100%)'
                                                      : 'linear-gradient(to bottom,#d4d0c8 0%,#b8b4ac 100%)',
                                                  border: '1px solid',
                                                  borderColor: isActive
                                                      ? '#808080 #dfdfdf #dfdfdf #808080'
                                                      : '#dfdfdf #808080 #808080 #dfdfdf',
                                                  color: '#000',
                                                  cursor: 'pointer',
                                                  fontWeight: isActive ? 'bold' : 'normal',
                                              }}
                                          >
                                              <i className={`bi ${icon} me-1`}></i>{label}
                                          </button>
                                      );
                                  }
                                  return (
                                      <button key={key} className={`btn btn-sm btn-light border ${isActive ? 'active' : ''}`} onClick={handleClick}>
                                          <i className={`bi ${icon} me-1`}></i>{label}
                                      </button>
                                  );
                              })}
                          </div>
                      </div>

                      {/* Right: New Production Run + Create MO + Print */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                          {classic ? (
                              <>
                                  {canManage && (
                                  <button
                                      onClick={() => setIsPRModalOpen(true)}
                                      style={{
                                          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px',
                                          padding: '2px 10px', cursor: 'pointer', fontWeight: 'bold',
                                          background: 'linear-gradient(to bottom,#5a9ae0,#0058e6)',
                                          border: '1px solid', borderColor: '#003080 #001840 #001840 #003080',
                                          color: '#fff',
                                      }}
                                  >
                                      <i className="bi bi-collection-play me-1"></i>New Production Run
                                  </button>
                                  )}
                                  {canManage && (
                                  <button
                                      onClick={() => setIsCreateOpen(true)}
                                      style={{
                                          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px',
                                          padding: '2px 10px', cursor: 'pointer', fontWeight: 'bold',
                                          background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)',
                                          border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a',
                                          color: '#fff',
                                      }}
                                  >
                                      <i className="bi bi-plus-lg me-1"></i>New MO
                                  </button>
                                  )}
                                  <button
                                      onClick={handlePrintList}
                                      style={{
                                          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px',
                                          padding: '2px 10px', cursor: 'pointer',
                                          background: 'linear-gradient(to bottom,#fff,#d4d0c8)',
                                          border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                                          color: '#000',
                                      }}
                                  >
                                      <i className="bi bi-printer me-1"></i>{t('print')}
                                  </button>
                              </>
                          ) : (
                              <>
                                  {canManage && <button className="btn btn-primary btn-sm" onClick={() => setIsPRModalOpen(true)}><i className="bi bi-collection-play me-1"></i>New Production Run</button>}
                                  {canManage && <button className="btn btn-success btn-sm text-white" onClick={() => setIsCreateOpen(true)}><i className="bi bi-plus-lg me-1"></i>New MO</button>}
                                  <button className="btn btn-outline-primary btn-sm btn-print" onClick={handlePrintList}><i className="bi bi-printer me-1"></i>{t('print')}</button>
                              </>
                          )}
                      </div>
                  </div>

                  {/* ── Tab bar ── */}
                  {showTabSwitcher && <div className="no-print" style={{
                      background: classic ? '#ece9d8' : '#f8f9fa',
                      borderBottom: classic ? '1px solid #808080' : '1px solid #dee2e6',
                      display: 'flex', gap: classic ? '0' : '4px',
                      padding: classic ? '4px 8px 0' : '6px 12px 0',
                  }}>
                      {[
                          { key: 'production-runs', label: 'Production Runs', icon: 'bi-collection-play' },
                          { key: 'manufacturing-orders', label: 'Manufacturing Orders', icon: 'bi-list-task' },
                      ].map(({ key, label, icon }) => {
                          const isActive = activeTab === key;
                          if (classic) {
                              return (
                                  <button
                                      key={key}
                                      onClick={() => setActiveTab(key as any)}
                                      style={{
                                          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px',
                                          padding: '3px 12px',
                                          background: isActive ? '#ece9d8' : 'linear-gradient(to bottom,#d4d0c8,#b8b4ac)',
                                          border: '1px solid #808080',
                                          borderBottom: isActive ? '1px solid #ece9d8' : '1px solid #808080',
                                          color: '#000', cursor: 'pointer',
                                          fontWeight: isActive ? 'bold' : 'normal',
                                          marginRight: 2, position: 'relative', top: 1,
                                      }}
                                  >
                                      <i className={`bi ${icon} me-1`}></i>{label}
                                  </button>
                              );
                          }
                          return (
                              <button key={key}
                                  onClick={() => setActiveTab(key as any)}
                                  style={{
                                      fontSize: '12px', padding: '4px 14px', cursor: 'pointer',
                                      background: isActive ? '#fff' : 'transparent',
                                      border: '1px solid',
                                      borderColor: isActive ? '#dee2e6 #dee2e6 #fff' : 'transparent',
                                      borderBottom: isActive ? '1px solid #fff' : '1px solid transparent',
                                      fontWeight: isActive ? 'bold' : 'normal',
                                      color: isActive ? '#000' : '#555',
                                      borderRadius: '4px 4px 0 0',
                                  }}
                              >
                                  <i className={`bi ${icon} me-1`}></i>{label}
                              </button>
                          );
                      })}
                  </div>}

                  {/* ── Body ── */}
                  <div style={{ background: classic ? '#ece9d8' : undefined, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }} className={classic ? '' : 'card-body p-0'}>

                      {/* Production Runs tab content */}
                      {activeTab === 'production-runs' && (
                          <ProductionRunsTab
                              productionRuns={productionRuns}
                              prPage={prPage}
                              prTotal={prTotal}
                              setPrPage={setPrPage}
                              pageSize={pageSize}
                              prSearch={prSearch}
                              setPrSearch={setPrSearch}
                              onDeleteProductionRun={onDeleteProductionRun}
                              currentStyle={currentStyle}
                              canManage={canManage}
                              companyProfile={companyProfile}
                              helpers={helpers}
                          />
                      )}

                      {/* Manufacturing Orders tab content */}
                      {activeTab === 'manufacturing-orders' && (
                          <ManufacturingOrdersTab
                              items={items}
                              boms={boms}
                              locations={locations}
                              attributes={attributes}
                              manufacturingOrders={manufacturingOrders}
                              productionRuns={productionRuns}
                              workCenters={workCenters}
                              onUpdateStatus={onUpdateStatus}
                              onDeleteMO={onDeleteMO}
                              onCreateWO={onCreateWO}
                              onUpdateWO={onUpdateWO}
                              onUpdateWOStatus={onUpdateWOStatus}
                              onDeleteWO={onDeleteWO}
                              currentPage={currentPage}
                              totalItems={totalItems}
                              pageSize={pageSize}
                              onPageChange={onPageChange}
                              moCodeFilter={moCodeFilter}
                              setMoCodeFilter={setMoCodeFilter}
                              viewMode={viewMode}
                              setViewMode={setViewMode}
                              currentStyle={currentStyle}
                              canManage={canManage}
                              companyProfile={companyProfile}
                              helpers={helpers}
                          />
                      )}
                  </div>
              </div>
          </div>

          {isPRModalOpen && (
              <ProductionRunModal
                  boms={boms}
                  items={items}
                  attributes={attributes}
                  locations={locations}
                  onSave={onCreateProductionRun}
                  onClose={() => { setIsPRModalOpen(false); setPrModalBom(null); setPrModalInitialSizes(undefined); setPrModalTotalQty(undefined); setPrModalSalesOrderId(undefined); setPrModalSalesOrderCode(undefined); setPrModalInitialEntries(undefined); }}
                  initialBomId={prModalBom?.id}
                  initialSizes={prModalInitialSizes}
                  initialTotalQty={prModalTotalQty}
                  initialBomEntries={prModalInitialEntries}
                  salesOrderId={prModalSalesOrderId}
                  salesOrderCode={prModalSalesOrderCode}
                  productionRuns={productionRuns}
              />
          )}
      </div>
  );
}
