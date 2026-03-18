import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import CodeConfigModal, { CodeConfig } from './CodeConfigModal';
import CalendarView from './CalendarView';
import SearchableSelect from './SearchableSelect';
import QRScannerView from './QRScannerView';
import { useToast } from './Toast';
import { useLanguage } from '../context/LanguageContext';
import { useData } from '../context/DataContext';
import ModalWrapper from './ModalWrapper';
import PrintHeader from './PrintHeader';

export default function ManufacturingView({ 
    items, 
    boms, 
    locations, 
    attributes, 
    workOrders, 
    stockBalance, 
    workCenters, 
    operations, 
    onCreateWO, 
    onUpdateStatus, 
    onDeleteWO, 
    currentPage, 
    totalItems, 
    pageSize, 
    onPageChange,
    initialCreateState,
    onClearInitialState 
}: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { authFetch } = useData();
  const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
  const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
  const [viewMode, setViewMode] = useState('list');

  // Derived Pagination
  const totalPages = Math.ceil(totalItems / pageSize);
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalItems);

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
      create_nested: false // Default to false
  });
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [printingWO, setPrintingWO] = useState<any>(null); 
  const [qrDataUrl, setQrDataUrl] = useState<string>(''); 
  
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedTreeNodes, setSelectedTreeNodes] = useState<Record<string, string>>({});
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [scanningWOId, setScanningWOId] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'WO',
      suffix: '',
      separator: '-',
      includeItemCode: true,
      includeVariant: false,
      variantAttributeNames: [],
      includeYear: false,
      includeMonth: false
  });

  const [currentStyle, setCurrentStyle] = useState('default');

  // Handle Automated Creation from Sales Order
  useEffect(() => {
      if (initialCreateState && items.length > 0 && boms.length > 0) {
          const { bom_id, qty, sales_order_id } = initialCreateState;

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
                      sales_order_id: sales_order_id || ''
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

  useEffect(() => {
      const savedConfig = localStorage.getItem('wo_code_config');
      if (savedConfig) {
          try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
      }
      const savedStyle = localStorage.getItem('ui_style');
      if (savedStyle) setCurrentStyle(savedStyle);
  }, []);

  useEffect(() => {
      const expandedIds = Object.keys(expandedRows).filter(id => expandedRows[id]);
      for (const woId of expandedIds) {
          const wo = workOrders.find((w: any) => w.id === woId);
          if (!wo) continue;
          const nodes = flattenTree(wo);
          for (const { wo: node } of nodes) {
              if (!qrDataUrls[node.code]) {
                  QRCode.toDataURL(node.code, { margin: 1, width: 160 })
                      .then(url => setQrDataUrls(prev => ({ ...prev, [node.code]: url })))
                      .catch(() => {});
              }
          }
      }
  }, [expandedRows, workOrders]);

  const buildWOBasePattern = (bomId: string, config = codeConfig) => {
      const bom = boms.find((b: any) => b.id === bomId);
      if (!bom) return '';
      const item = items.find((i: any) => i.id === bom.item_id);
      const itemCode = item ? item.code : 'PROD';

      let variantName = '';
      if (config.includeVariant && bom.attribute_value_ids && bom.attribute_value_ids.length > 0) {
          const names: string[] = [];
          for (const valId of bom.attribute_value_ids) {
              for (const attr of attributes) {
                  const val = attr.values.find((v: any) => v.id === valId);
                  if (val) {
                      if (!config.variantAttributeNames || config.variantAttributeNames.length === 0 || config.variantAttributeNames.includes(attr.name)) {
                          names.push(val.value.toUpperCase().replace(/\s+/g, ''));
                      }
                      break;
                  }
              }
          }
          variantName = names.join('');
      }

      const parts = [];
      if (config.prefix) parts.push(config.prefix);
      if (config.includeItemCode) parts.push(itemCode);
      if (config.includeVariant && variantName) parts.push(variantName);
      const now = new Date();
      if (config.includeYear) parts.push(now.getFullYear());
      if (config.includeMonth) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
      if (config.suffix) parts.push(config.suffix);
      return parts.join(config.separator);
  };

  const fetchAvailableCode = async (base: string): Promise<string> => {
      try {
          const res = await authFetch(`${API_BASE}/work-orders/available-code?base=${encodeURIComponent(base)}`);
          if (res.ok) {
              const data = await res.json();
              return data.code;
          }
      } catch (_) {}
      return `${base}-001`;
  };

  const handleSaveConfig = async (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('wo_code_config', JSON.stringify(newConfig));
      if (newWO.bom_id) {
          const base = buildWOBasePattern(newWO.bom_id, newConfig);
          const suggested = await fetchAvailableCode(base);
          setNewWO(prev => ({ ...prev, code: suggested }));
      }
  };

  const handlePrintList = () => {
      window.print();
  };

  const handlePrintWO = async (wo: any) => {
      try {
          const url = await QRCode.toDataURL(wo.code, { margin: 1, width: 200 });
          setQrDataUrl(url);
          setPrintingWO(wo);
          setTimeout(() => window.print(), 300);
      } catch (err) {
          console.error("QR Generation failed", err);
          setPrintingWO(wo);
          setTimeout(() => window.print(), 300);
      }
  };

  const filteredWorkOrders = workOrders.filter((wo: any) => {
      const date = new Date(wo.created_at);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (start && date < start) return false;
      if (end) {
          const endDateTime = new Date(end);
          endDateTime.setHours(23, 59, 59, 999);
          if (date > endDateTime) return false;
      }
      return true;
  });

  const handleBOMChange = async (bomId: string) => {
      const base = buildWOBasePattern(bomId);
      const suggestedCode = base ? await fetchAvailableCode(base) : '';
      setNewWO({...newWO, bom_id: bomId, code: suggestedCode});
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
          // Clean dates: convert empty strings to null for Pydantic
          const payload = {
              ...newWO,
              target_start_date: newWO.target_start_date || null,
              target_end_date: newWO.target_end_date || null,
              sales_order_id: newWO.sales_order_id || null
          };

          const res = await onCreateWO(payload);
          if (res && res.status === 400) {
              const baseMatch = newWO.code.match(/^(.*)-\d+$/);
              const base = baseMatch ? baseMatch[1] : newWO.code;
              const suggestedCode = await fetchAvailableCode(base);
              showToast(`Work Order Code "${newWO.code}" already exists. Suggesting: ${suggestedCode}`, 'warning');
              setNewWO({ ...newWO, code: suggestedCode });
          } else if (res && res.ok) {
              const createdWO = await res.json();
              if (createdWO.is_material_available === false) {
                  showToast('Work Order created, but insufficient materials!', 'warning');
              } else {
                  showToast('Work Order created successfully!', 'success');
              }
              setNewWO({ code: '', bom_id: '', location_code: '', source_location_code: '', qty: 1.0, target_start_date: '', target_end_date: '' });
              setIsCreateOpen(false);
          } else {
              showToast('Failed to create Work Order', 'danger');
          }
      } finally {
          setIsSubmitting(false);
      }
  };

  const toggleRow = (id: string) => {
      setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Helpers
  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getItemCode = (id: string) => items.find((i: any) => i.id === id)?.code || id;
  const getBOMCode = (id: string) => boms.find((b: any) => b.id === id)?.code || id;
  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;
  const getOpName = (id: string) => operations.find((o: any) => o.id === id)?.name || id;
  const getWCName = (id: string) => workCenters.find((w: any) => w.id === id)?.name || id;

  const findNodeById = (node: any, id: string): any => {
      if (node.id === id) return node;
      for (const child of (node.child_wos || [])) {
          const found = findNodeById(child, id);
          if (found) return found;
      }
      return null;
  };

  const flattenTree = (node: any, level = 0): Array<{wo: any; level: number}> => {
      const result: Array<{wo: any; level: number}> = [{wo: node, level}];
      for (const child of (node.child_wos || [])) {
          result.push(...flattenTree(child, level + 1));
      }
      return result;
  };
  
  const getAttributeValueName = (valId: string) => {
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  const getStatusBadge = (status: string) => {
      switch(status) {
          case 'COMPLETED': return 'bg-success';
          case 'IN_PROGRESS': return 'bg-warning text-dark';
          case 'CANCELLED': return 'bg-danger';
          default: return 'bg-secondary';
      }
  };

  const formatDate = (date: string | null) => {
      if (!date) return '-';
      return new Date(date).toLocaleDateString();
  };

  const formatDateTime = (date: string | null) => {
      if (!date) return '-';
      return new Date(date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  };

  const getDueDateWarning = (wo: any) => {
      if (wo.status === 'COMPLETED' || wo.status === 'CANCELLED') return null;
      if (!wo.target_end_date) return null;
      const due = new Date(wo.target_end_date);
      const now = new Date();
      const diffDays = (due.getTime() - now.getTime()) / (1000 * 3600 * 24);
      if (diffDays < 0) return { type: 'danger', icon: 'bi-exclamation-octagon-fill', text: 'Overdue!' };
      if (diffDays < 2) return { type: 'warning', icon: 'bi-exclamation-triangle-fill', text: 'Due Soon' };
      return null;
  };

  const calculateRequiredQty = (baseQty: number, line: any, bom: any) => {
      let required = parseFloat(line.qty);
      if (line.is_percentage) {
          required = (baseQty * required) / 100;
      } else {
          required = baseQty * required;
      }
      const tolerance = parseFloat(bom?.tolerance_percentage || 0);
      if (tolerance > 0) {
          required = required * (1 + (tolerance / 100));
      }
      return required;
  };

  const checkStockAvailability = (item_id: string, location_id: string, attribute_value_ids: string[] = [], required_qty: number) => {
      const targetIds = attribute_value_ids || [];
      const matchingEntries = stockBalance.filter((s: any) => 
          String(s.item_id) === String(item_id) && String(s.location_id) === String(location_id)
      );
      const available = matchingEntries.reduce((sum: number, e: any) => sum + parseFloat(e.qty), 0);
      return { available, isEnough: available >= required_qty };
  };

  // --- Inline QR Scanner Widget ---
  const InlineScanWidget = ({ rootWoId, onClose }: { rootWoId: string; onClose: () => void }) => {
      const scannerRef2 = useRef<any>(null);
      const readerId = `reader-${rootWoId}`;

      useEffect(() => {
          const timer = setTimeout(() => {
              if (!document.getElementById(readerId)) return;
              const scanner = new Html5QrcodeScanner(readerId, { fps: 10, qrbox: { width: 180, height: 180 } }, false);
              scannerRef2.current = scanner;
              scanner.render((code: string) => {
                  const found = workOrders.find((w: any) => w.code === code);
                  if (found) {
                      scanner.clear().catch(() => {});
                      onUpdateStatus(found.id, found.status === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED');
                      onClose();
                  } else {
                      showToast(`WO "${code}" not found`, 'danger');
                  }
              }, () => {});
          }, 100);
          return () => {
              clearTimeout(timer);
              scannerRef2.current?.clear().catch(() => {});
          };
      }, [readerId]);

      return (
          <div style={{ width: '100%' }}>
              <div id={readerId} style={{ width: '100%' }}></div>
              <button className="btn btn-sm btn-outline-secondary w-100 mt-1 extra-small" onClick={onClose}>
                  <i className="bi bi-x me-1"></i>Cancel Scan
              </button>
          </div>
      );
  };

  // --- Work Order Expanded Panel (Tree + Detail) ---
  const WOExpandedPanel = ({ wo }: { wo: any }) => {
      const selectedNodeId = selectedTreeNodes[wo.id] ?? wo.id;
      const selectedNode = findNodeById(wo, selectedNodeId) ?? wo;
      const bom = boms.find((b: any) => b.id === selectedNode.bom_id);
      const treeNodes = flattenTree(wo);
      const isScanActive = scanningWOId === wo.id;
      const classic = currentStyle === 'classic';

      const selectNode = (nodeId: string) => {
          setSelectedTreeNodes(prev => ({ ...prev, [wo.id]: nodeId }));
          if (scanningWOId === wo.id) setScanningWOId(null);
      };

      return (
          <div style={{ display: 'flex', minHeight: '280px', background: classic ? '#f5f3ee' : '#f8f9fa', border: classic ? '1px solid #808080' : undefined }}>

              {/* ── LEFT: WO Tree ── */}
              <div style={{
                  width: '210px', minWidth: '210px',
                  borderRight: classic ? '2px solid #808080' : '1px solid #dee2e6',
                  background: '#fff',
                  display: 'flex', flexDirection: 'column'
              }}>
                  <div style={{
                      background: classic ? 'linear-gradient(to right,#0058e6,#08a5ff)' : '#343a40',
                      color: '#fff', fontWeight: 'bold', fontSize: '11px',
                      padding: '5px 8px', letterSpacing: '0.3px'
                  }}>
                      <i className="bi bi-diagram-3-fill me-2"></i>WO Tree
                  </div>
                  <div style={{ padding: '4px', overflowY: 'auto', flex: 1 }}>
                      {treeNodes.map(({ wo: node, level }) => {
                          const isActive = node.id === selectedNodeId;
                          const statusColor = node.status === 'COMPLETED' ? '#2d7a2d' : node.status === 'IN_PROGRESS' ? (classic ? '#0058e6' : '#fd7e14') : '#6c757d';
                          return (
                              <div
                                  key={node.id}
                                  onClick={() => selectNode(node.id)}
                                  style={{
                                      display: 'flex', alignItems: 'flex-start', gap: '4px',
                                      padding: `3px 6px 3px ${level * 14 + 6}px`,
                                      cursor: 'pointer', borderRadius: classic ? '0' : '3px',
                                      background: isActive ? (classic ? '#316ac5' : '#0d6efd') : 'transparent',
                                      color: isActive ? '#fff' : '#000',
                                      border: isActive ? (classic ? '1px solid #003080' : 'none') : '1px solid transparent',
                                      marginBottom: '1px',
                                      userSelect: 'none'
                                  }}
                              >
                                  <span style={{ fontSize: '10px', color: isActive ? '#cce0ff' : '#888', minWidth: '10px', marginTop: '1px' }}>
                                      {level === 0 ? '●' : '└'}
                                  </span>
                                  <div style={{ flex: 1, overflow: 'hidden' }}>
                                      <div style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {node.code}
                                      </div>
                                      <div style={{ fontSize: '10px', color: isActive ? '#e0ecff' : '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {node.item_name}
                                      </div>
                                  </div>
                                  <span style={{ fontSize: '8px', background: statusColor, color: '#fff', padding: '1px 4px', borderRadius: classic ? '0' : '2px', whiteSpace: 'nowrap', alignSelf: 'center', flexShrink: 0 }}>
                                      {node.status === 'IN_PROGRESS' ? 'IN PROG' : node.status}
                                  </span>
                              </div>
                          );
                      })}
                  </div>
              </div>

              {/* ── CENTRE: BOM Components ── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Detail header */}
                  <div style={{
                      background: classic ? 'linear-gradient(to bottom,#fff,#e8e4d8)' : '#fff',
                      borderBottom: classic ? '1px solid #808080' : '1px solid #dee2e6',
                      padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'
                  }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold', color: '#000' }}>{selectedNode.code}</span>
                      <span style={{ fontSize: '12px', color: '#000' }}>{selectedNode.item_name}</span>
                      {bom && <span style={{ fontSize: '10px', color: '#444' }}>BOM: <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}>{bom.code}</span></span>}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                          {selectedNode.status === 'PENDING' && (
                              <button className="btn btn-sm btn-primary py-0 px-2" style={{ fontSize: '0.72rem' }} onClick={() => onUpdateStatus(selectedNode.id, 'IN_PROGRESS')}>
                                  <i className="bi bi-play-fill me-1"></i>Start
                              </button>
                          )}
                          {selectedNode.status === 'IN_PROGRESS' && (
                              <button className="btn btn-sm btn-success py-0 px-2" style={{ fontSize: '0.72rem' }} onClick={() => onUpdateStatus(selectedNode.id, 'COMPLETED')}>
                                  <i className="bi bi-check-lg me-1"></i>Finish
                              </button>
                          )}
                      </div>
                  </div>

                  {/* Section title */}
                  <div style={{
                      background: classic ? '#d4d0c8' : '#f1f3f5',
                      borderBottom: classic ? '1px solid #808080' : '1px solid #dee2e6',
                      padding: '2px 10px', fontSize: '10px', fontWeight: 'bold', color: '#000',
                      display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                      <i className="bi bi-boxes"></i>BOM Components
                      {!bom && <span style={{ fontWeight: 'normal', color: '#888' }}>— No BOM linked</span>}
                  </div>

                  {/* Components table */}
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                      {bom ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                              <thead>
                                  <tr style={{ background: classic ? 'linear-gradient(to bottom,#fff,#d4d0c8)' : '#f8f9fa', position: 'sticky', top: 0 }}>
                                      {['Component', 'Variant', 'Required', 'In Stock', '✔', 'Source'].map(h => (
                                          <th key={h} style={{ border: classic ? '1px solid #808080' : '1px solid #dee2e6', padding: '3px 6px', textAlign: h === 'Required' || h === 'In Stock' ? 'right' : h === '✔' ? 'center' : 'left', color: '#000', fontSize: '10px' }}>{h}</th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {bom.lines.map((line: any, i: number) => {
                                      const req = calculateRequiredQty(selectedNode.qty, line, bom);
                                      const locId = line.source_location_id || selectedNode.source_location_id || selectedNode.location_id;
                                      const { available, isEnough } = checkStockAvailability(line.item_id, locId, line.attribute_value_ids || [], req);
                                      const hasSubBOM = boms.some((b: any) => b.item_id === line.item_id && b.active !== false);
                                      const attrLabel = (line.attribute_value_ids || []).map(getAttributeValueName).filter(Boolean).join(', ');
                                      const rowBg = i % 2 === 0 ? '#fff' : (classic ? '#f5f3ee' : '#f8f9fa');
                                      return (
                                          <tr key={line.id} style={{ background: rowBg }}>
                                              <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', color: '#000' }}>
                                                  <div style={{ fontWeight: 500 }}>{line.item_name || getItemName(line.item_id)}</div>
                                                  <div style={{ fontSize: '9px', color: '#555', fontFamily: 'monospace' }}>{line.item_code || getItemCode(line.item_id)}</div>
                                                  {hasSubBOM && <span style={{ fontSize: '8px', background: '#fff3cd', border: '1px solid #b8860b', color: '#6b4e00', padding: '0 4px', fontWeight: 'bold' }}>SUB-BOM</span>}
                                              </td>
                                              <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', color: '#333', fontSize: '10px' }}>{attrLabel || '—'}</td>
                                              <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#000', fontWeight: 'bold' }}>{req.toFixed(2)}</td>
                                              <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', color: isEnough ? '#1a6e1a' : '#c00000', fontWeight: 'bold' }}>{available.toFixed(2)}</td>
                                              <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', textAlign: 'center' }}>
                                                  {hasSubBOM ? <span style={{ color: '#b8860b' }}>⟳</span> : isEnough ? <i className="bi bi-check-circle-fill text-success"></i> : <i className="bi bi-x-circle-fill text-danger"></i>}
                                              </td>
                                              <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', color: '#444', fontSize: '10px' }}>{getLocationName(locId)}</td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      ) : (
                          <div style={{ padding: '16px', color: '#555', fontSize: '11px', textAlign: 'center' }}>No BOM lines to display for this work order.</div>
                      )}
                  </div>
              </div>

              {/* ── RIGHT: Meta + QR ── */}
              <div style={{
                  width: '170px', minWidth: '170px',
                  borderLeft: classic ? '2px solid #808080' : '1px solid #dee2e6',
                  background: classic ? '#fafaf7' : '#fff',
                  display: 'flex', flexDirection: 'column'
              }}>
                  {/* Timeline */}
                  <div style={{ borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '6px 8px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', marginBottom: '4px' }}>Timeline</div>
                      {([
                          { label: 'Target S', val: formatDate(selectedNode.target_start_date), warn: null },
                          { label: 'Target E', val: formatDate(selectedNode.target_end_date), warn: getDueDateWarning(selectedNode) },
                          { label: 'Actual S', val: formatDateTime(selectedNode.actual_start_date), warn: null },
                          { label: 'Actual E', val: formatDateTime(selectedNode.actual_end_date), warn: null },
                      ] as {label:string;val:string;warn:any}[]).map(({ label, val, warn }) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                              <span style={{ color: '#555' }}>{label}:</span>
                              <span style={{ fontWeight: 'bold', color: warn ? '#c00000' : '#000' }}>{val}</span>
                          </div>
                      ))}
                  </div>

                  {/* Output */}
                  <div style={{ borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '6px 8px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', marginBottom: '4px' }}>Output</div>
                      <div style={{ fontSize: '10px', color: '#000', fontWeight: 'bold' }}>{getLocationName(selectedNode.location_id)}</div>
                      <div style={{ fontSize: '10px', color: '#444' }}>Qty: <strong style={{ color: '#000' }}>{selectedNode.qty}</strong></div>
                  </div>

                  {/* QR + Scan */}
                  <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flex: 1 }}>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', alignSelf: 'flex-start' }}>QR Code</div>
                      {!isScanActive ? (
                          <>
                              {qrDataUrls[selectedNode.code] ? (
                                  <img src={qrDataUrls[selectedNode.code]} alt="QR" style={{ width: '90px', height: '90px', border: '2px solid #000' }} />
                              ) : (
                                  <div style={{ width: '90px', height: '90px', background: '#eee', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#888' }}>Loading...</div>
                              )}
                              <div style={{ fontFamily: 'monospace', fontSize: '8px', color: '#000', textAlign: 'center', wordBreak: 'break-all' }}>{selectedNode.code}</div>
                              <button
                                  style={{
                                      width: '100%', padding: '3px 0', fontSize: '10px',
                                      background: classic ? 'linear-gradient(to bottom,#fff,#d4d0c8)' : '#e9ecef',
                                      border: classic ? '1px solid #808080' : '1px solid #ced4da',
                                      cursor: 'pointer', color: '#000', fontFamily: 'inherit', fontWeight: 'bold'
                                  }}
                                  onClick={() => setScanningWOId(wo.id)}
                              >
                                  <i className="bi bi-qr-code-scan me-1"></i>Scan
                              </button>
                          </>
                      ) : (
                          <InlineScanWidget rootWoId={wo.id} onClose={() => setScanningWOId(null)} />
                      )}
                  </div>
              </div>
          </div>
      );
  };

  // --- Print Template Component ---
  const WorkOrderPrintTemplate = ({ wo }: { wo: any }) => {
      const bom = boms.find((b: any) => b.id === wo.bom_id);
      
      const renderPrintBOMLines = (lines: any[], level = 0, currentParentQty = 1, currentBOM: any) => {
          return lines.map((line: any) => {
              const subBOM = boms.find((b: any) => b.item_id === line.item_id);
              let scaledQty = parseFloat(line.qty);
              if (line.is_percentage) {
                  scaledQty = (currentParentQty * scaledQty) / 100;
              } else {
                  scaledQty = currentParentQty * scaledQty;
              }
              const tolerance = parseFloat(currentBOM?.tolerance_percentage || 0);
              if (tolerance > 0) {
                  scaledQty = scaledQty * (1 + (tolerance / 100));
              }
              
              return (
                  <>
                      <tr key={line.id}>
                          <td style={{paddingLeft: `${level * 12 + 8}px`}}>
                              <span className="font-monospace extra-small">{line.item_code || getItemCode(line.item_id)}</span>
                          </td>
                          <td>
                              <div style={{fontSize: '9pt'}}>
                                  {level > 0 && <span className="text-muted me-1 small">↳</span>}
                                  {line.item_name || getItemName(line.item_id)}
                              </div>
                          </td>
                          <td className="extra-small fst-italic">
                              {line.qty}{line.is_percentage ? '%' : ''} 
                              {(line.attribute_value_ids || []).length > 0 && ` • ${(line.attribute_value_ids || []).map(getAttributeValueName).join(', ')}`}
                          </td>
                          <td><span className="extra-small">{getLocationName(line.source_location_id || wo.source_location_id || wo.location_id)}</span></td>
                          <td className="text-end fw-bold small">{(scaledQty * wo.qty).toFixed(3)}</td> 
                      </tr>
                      {subBOM && subBOM.lines && renderPrintBOMLines(subBOM.lines, level + 1, scaledQty, subBOM)}
                  </>
              );
          });
      };

      const renderChildWOsPrint = (children: any[]) => {
          if (!children || children.length === 0) return null;
          return (
              <div className="mt-5 pt-4 border-top">
                  <h6 className="fw-bold text-uppercase text-muted extra-small mb-3"><i className="bi bi-diagram-3-fill me-2"></i>Child Work Orders (Nested Chain)</h6>
                  <div className="row g-3">
                      {children.map(child => (
                          <div key={child.id} className="col-12 border rounded p-2 bg-light bg-opacity-10 d-flex justify-content-between align-items-center">
                              <div className="d-flex align-items-center gap-3">
                                  <img 
                                      src={qrDataUrls[child.code] || ''}
                                      alt="QR"
                                      style={{ width: '60px', height: '60px' }}
                                  />
                                  <div>
                                      <div className="font-monospace extra-small fw-bold text-primary">{child.code}</div>
                                      <div className="fw-bold small">{child.item_name || getItemName(child.item_id)}</div>
                                      <div className="extra-small text-muted">Qty: {child.qty} • Loc: {getLocationName(child.location_id)}</div>
                                  </div>
                              </div>
                              <div className="text-end pe-2">
                                  <div className="extra-small text-muted">Status: {child.status}</div>
                                  <div className="extra-small text-muted">Due: {formatDate(child.target_end_date)}</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          );
      };

      return (
          <div className="bg-white p-4 h-100 position-fixed top-0 start-0 w-100 print-container" style={{zIndex: 2000, overflowY: 'auto'}}>
              <PrintHeader title="Work Order" />

              <div className="d-flex justify-content-between border-bottom pb-2 mb-3 mt-4">
                  <div className="d-flex gap-3">
                      <div className="bg-white border p-1 rounded">
                          <img src={qrDataUrl} alt="WO QR" style={{ width: '100px', height: '100px' }} />
                      </div>
                      <div>
                          <h4 className="font-monospace mb-0 fw-bold text-primary">{wo.code}</h4>
                          <div className={`badge ${getStatusBadge(wo.status)} small mt-1`}>{wo.status}</div>
                      </div>
                  </div>
                  <div className="text-end">
                      <div className="extra-small text-muted mb-1">Production Timeline</div>
                      <div className="extra-small d-flex justify-content-end gap-2">
                          <span className="text-muted">Target:</span> 
                          <strong>{formatDate(wo.target_start_date)} - {formatDate(wo.target_end_date)}</strong>
                      </div>
                  </div>
              </div>

              <div className="row mb-3 g-2">
                  <div className="col-5">
                      <h6 className="text-uppercase text-muted extra-small fw-bold mb-1">Finished Good</h6>
                      <div className="fw-bold" style={{fontSize: '11pt'}}>{getItemName(wo.item_id)}</div>
                      <div className="extra-small font-monospace text-muted">{getItemCode(wo.item_id)}</div>
                  </div>
                  <div className="col-2 text-center border-start border-end">
                      <h6 className="text-uppercase text-muted extra-small fw-bold mb-1">Target Qty</h6>
                      <div className="fw-bold fs-4">{wo.qty}</div>
                  </div>
                  <div className="col-5 text-end">
                      <h6 className="text-uppercase text-muted extra-small fw-bold mb-1">Production Timeline</h6>
                      <div className="extra-small d-flex justify-content-end gap-2">
                          <span className="text-muted">Target:</span> 
                          <strong>{formatDate(wo.target_start_date)} - {formatDate(wo.target_end_date)}</strong>
                      </div>
                      <div className="extra-small d-flex justify-content-end gap-2 mt-1">
                          <span className="text-muted">Actual Start:</span> 
                          <strong>{formatDateTime(wo.actual_start_date)}</strong>
                      </div>
                      <div className="extra-small d-flex justify-content-end gap-2">
                          <span className="text-muted">Actual End:</span> 
                          <strong>{formatDateTime(wo.actual_end_date)}</strong>
                      </div>
                  </div>
              </div>

              <h6 className="fw-bold border-bottom pb-1 mb-2 mt-4">Bill of Materials (Full Tree)</h6>
              <table className="table table-bordered table-sm mb-4">
                  <thead className="table-light">
                      <tr style={{fontSize: '8pt'}}>
                          <th style={{width: '15%'}}>Code</th>
                          <th style={{width: '35%'}}>Component Name</th>
                          <th style={{width: '20%'}}>Attributes / Specs</th>
                          <th style={{width: '15%'}}>Source</th>
                          <th style={{width: '15%'}} className="text-end">Required Qty</th>
                      </tr>
                  </thead>
                  <tbody>
                      {bom ? renderPrintBOMLines(bom.lines, 0, 1, bom) : <tr><td colSpan={5}>No BOM found</td></tr>}
                  </tbody>
              </table>

              {renderChildWOsPrint(wo.child_wos)}

              <div className="mt-5 pt-5 border-top d-flex justify-content-between text-muted small">
                  <div>Printed: {new Date().toLocaleString()}</div>
                  <div className="text-center" style={{width: '200px'}}>
                      <div className="border-bottom mb-1" style={{height: '40px'}}></div>
                      Authorized Signature
                  </div>
              </div>

              <div className="position-fixed top-0 end-0 p-3 no-print" style={{ zIndex: 3000 }}>
                  <button className="btn btn-dark shadow" onClick={() => setPrintingWO(null)}>
                      <i className="bi bi-x-lg me-2"></i>Close Preview
                  </button>
              </div>
          </div>
      );
  };

  return (
      <div className="row g-4 fade-in print-container">
          {printingWO && <WorkOrderPrintTemplate wo={printingWO} />}

          <CodeConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} type="WO" onSave={handleSaveConfig} initialConfig={codeConfig} attributes={attributes} />

          <ModalWrapper
              isOpen={isCreateOpen}
              onClose={() => setIsCreateOpen(false)}
              title={<><i className="bi bi-play-circle me-1"></i> NEW PRODUCTION RUN</>}
              variant="success"
              size="lg"
              footer={
                  <>
                      <button type="button" className="btn btn-sm btn-link text-muted text-decoration-none" onClick={() => setIsCreateOpen(false)}>{t('cancel')}</button>
                      <button type="button" className="btn btn-sm btn-success px-4 fw-bold shadow-sm" onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'CREATE WORK ORDER'}</button>
                  </>
              }
          >
              <div className="row g-3 mb-3">
                  <div className="col-md-6">
                      <label className="form-label extra-small fw-bold text-muted uppercase">WO Reference Code</label>
                      <div className="input-group">
                          <input className="form-control form-control-sm" placeholder="Auto-generated" value={newWO.code} onChange={e => setNewWO({...newWO, code: e.target.value})} required />
                          <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setIsConfigOpen(true)}><i className="bi bi-gear-fill"></i></button>
                      </div>
                  </div>
                  <div className="col-md-6">
                      <label className="form-label extra-small fw-bold text-muted uppercase">Target Quantity</label>
                      <input type="number" className="form-control form-control-sm" value={newWO.qty} onChange={e => setNewWO({...newWO, qty: parseFloat(e.target.value)})} required />
                  </div>
              </div>

              <div className="mb-3">
                  <label className="form-label extra-small fw-bold text-muted uppercase">Product Recipe (BOM)</label>
                  <SearchableSelect 
                      options={boms.map((b: any) => ({ value: b.id, label: `${b.code} - ${getItemName(b.item_id)}` }))}
                      value={newWO.bom_id}
                      onChange={handleBOMChange}
                      required
                      placeholder="Choose a product recipe..."
                  />
              </div>

              <div className="row g-3 mb-3">
                  <div className="col-md-6">
                      <label className="form-label extra-small fw-bold text-muted uppercase">Target Start Date</label>
                      <input type="date" className="form-control form-control-sm" value={newWO.target_start_date} onChange={e => setNewWO({...newWO, target_start_date: e.target.value})} />
                  </div>
                  <div className="col-md-6">
                      <label className="form-label extra-small fw-bold text-muted uppercase">Target End Date</label>
                      <input type="date" className="form-control form-control-sm" value={newWO.target_end_date} onChange={e => setNewWO({...newWO, target_end_date: e.target.value})} />
                  </div>
              </div>

              <div className="row g-2 mb-3">
                  <div className="col-6">
                      <label className="form-label extra-small fw-bold text-muted uppercase">Output Target Location</label>
                      <select className="form-select form-select-sm" value={newWO.location_code} onChange={e => setNewWO({...newWO, location_code: e.target.value})} required>
                          <option value="">Select...</option>
                          {locations.map((loc: any) => <option key={loc.id} value={loc.code}>{loc.name}</option>)}
                      </select>
                  </div>
                  <div className="col-6">
                      <label className="form-label extra-small fw-bold text-muted uppercase">Material Source Location</label>
                      <select className="form-select form-select-sm" value={newWO.source_location_code} onChange={e => setNewWO({...newWO, source_location_code: e.target.value})}>
                          <option value="">Same as Production</option>
                          {locations.map((loc: any) => <option key={loc.id} value={loc.code}>{loc.name}</option>)}
                      </select>
                  </div>
              </div>

              <div className="mb-3 p-2 bg-info bg-opacity-10 border border-info border-opacity-25 rounded">
                  <div className="form-check form-switch">
                      <input 
                          className="form-check-input" 
                          type="checkbox" 
                          id="nested-wo-switch"
                          checked={newWO.create_nested}
                          onChange={e => setNewWO({...newWO, create_nested: e.target.checked})}
                      />
                      <label className="form-check-label small fw-bold text-info-emphasis" htmlFor="nested-wo-switch">
                          <i className="bi bi-diagram-3-fill me-2"></i>
                          Create child Work Orders for all nested BOMs
                      </label>
                  </div>
                  <div className="extra-small text-muted mt-1 ms-4 ps-1">
                      Automatically generate production runs for every sub-assembly in the recipe.
                  </div>
              </div>
          </ModalWrapper>

          <div className="col-12 flex-print-fill">
              <div className="card h-100 border-0 shadow-sm">
                  <div className="card-header bg-white d-flex justify-content-between align-items-center no-print">
                      <div className="d-flex align-items-center gap-3">
                          <h5 className="card-title mb-0">{t('production_schedule')}</h5>
                          <div className="btn-group ms-2">
                              <button className={`btn btn-sm btn-light border ${viewMode === 'calendar' ? 'active' : ''}`} onClick={() => setViewMode('calendar')}><i className="bi bi-calendar-event me-1"></i>Calendar</button>
                              <button className={`btn btn-sm btn-light border ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><i className="bi bi-list-ul me-1"></i>List</button>
                              <button className={`btn btn-sm btn-light border ${viewMode === 'scanner' ? 'active' : ''}`} onClick={() => setViewMode('scanner')}><i className="bi bi-qr-code-scan me-1"></i>Scanner</button>
                          </div>
                      </div>
                      <div className="d-flex gap-2">
                          <button className="btn btn-success btn-sm text-white" onClick={() => setIsCreateOpen(true)}><i className="bi bi-plus-lg me-1"></i>{t('create')}</button>
                          <button className="btn btn-outline-primary btn-sm btn-print" onClick={handlePrintList}><i className="bi bi-printer me-1"></i>{t('print')}</button>
                      </div>
                  </div>
                  
                  <div className="card-body p-0">
                      {viewMode === 'calendar' ? (
                          <div className="p-3"><CalendarView workOrders={workOrders} items={items} /></div>
                      ) : (
                          <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                        <tr style={{fontSize: '9pt'}}>
                                            <th className="ps-4">WO Code</th>
                                            <th>Product / Variant</th>
                                            <th className="text-center">Qty</th>
                                            <th>Target Timeline</th>
                                            <th>Actual Progression</th>
                                            <th>{t('status')}</th>
                                            <th className="text-end pe-4 no-print">{t('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredWorkOrders.map((wo: any) => {
                                            const warning = getDueDateWarning(wo);
                                            const isExpanded = expandedRows[wo.id];

                                            return (
                                                <>
                                                <tr key={wo.id} className={isExpanded ? 'table-primary bg-opacity-10' : ''}>
                                                    <td className="ps-4 fw-bold font-monospace small">{wo.code}</td>
                                                    <td style={{cursor: 'pointer'}} onClick={() => toggleRow(wo.id)}>
                                                        <div className="d-flex align-items-center gap-2">
                                                            <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} text-muted`}></i>
                                                            <div>
                                                                <div className="fw-bold text-dark" style={{fontSize: '9pt'}}>{wo.item_name || getItemName(wo.item_id)}</div>
                                                                <div className="extra-small text-muted">
                                                                    BOM: {getBOMCode(wo.bom_id)}
                                                                    {wo.sales_order_id && <span className="ms-2 text-primary fw-bold">From SO</span>}
                                                                    {wo.child_wos && wo.child_wos.length > 0 && <span className="ms-2 badge bg-info bg-opacity-10 text-info border border-info border-opacity-25" style={{fontSize: '0.65rem'}}>NESTED ({wo.child_wos.length})</span>}
                                                                </div>
                                                                {wo.status === 'PENDING' && wo.is_material_available === false && <span className="badge bg-danger p-1 extra-small mt-1">LOW STOCK</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="text-center fw-bold">{wo.qty}</td>
                                                    <td>
                                                        <div className="extra-small d-flex flex-column gap-1">
                                                            <span>S: {formatDate(wo.target_start_date)}</span>
                                                            <span className={warning ? `text-${warning.type} fw-bold` : ''}>E: {formatDate(wo.target_end_date)}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="extra-small d-flex flex-column gap-1 text-muted">
                                                            <span>Start: {formatDateTime(wo.actual_start_date)}</span>
                                                            <span>End: {formatDateTime(wo.actual_end_date)}</span>
                                                        </div>
                                                    </td>
                                                    <td><span className={`badge ${getStatusBadge(wo.status)} extra-small`}>{wo.status}</span></td>
                                                    <td className="text-end pe-4 no-print">
                                                        <div className="d-flex justify-content-end align-items-center gap-2">
                                                            <button className="btn btn-sm btn-link text-primary p-0" onClick={() => handlePrintWO(wo)} title="Print Work Order">
                                                                <i className="bi bi-printer fs-5"></i>
                                                            </button>
                                                            {wo.status === 'PENDING' && <button className="btn btn-sm btn-primary py-0 px-2" style={{fontSize: '0.75rem'}} onClick={() => onUpdateStatus(wo.id, 'IN_PROGRESS')}>START</button>}
                                                            {wo.status === 'IN_PROGRESS' && <button className="btn btn-sm btn-success py-0 px-2" style={{fontSize: '0.75rem'}} onClick={() => onUpdateStatus(wo.id, 'COMPLETED')}>FINISH</button>}
                                                            <button className="btn btn-sm btn-link text-danger p-0" onClick={() => onDeleteWO(wo.id)} title="Delete"><i className="bi bi-trash fs-5"></i></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr key={`${wo.id}-detail`}>
                                                        <td colSpan={7} className="p-0 border-0">
                                                            <WOExpandedPanel wo={wo} />
                                                        </td>
                                                    </tr>
                                                )}
                                                </>
                                            );
                                        })}
                                    </tbody>
                                </table>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>
  );
}
