import { useState, useEffect, useMemo } from 'react';
import CodeConfigModal, { CodeConfig, buildCodeWithCounter } from '../shared/CodeConfigModal';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import SearchableSelect from '../shared/SearchableSelect';
import PurchaseOrderPrintModal from './PurchaseOrderPrintModal';
import ModalWrapper from '../shared/ModalWrapper';
import { useTheme } from '../../context/ThemeContext';
import { useSortable, SortMark } from '../shared/xpTheme';

export default function PurchaseOrderView({ items, attributes, purchaseOrders, partners, locations, onCreatePO, onDeletePO, onCreateReceipt, onClosePO, companyProfile }: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [printingPO, setPrintingPO] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  // Receipt modal state
  const [receiptTarget, setReceiptTarget] = useState<any>(null);
  const [receiptLineQtys, setReceiptLineQtys] = useState<Record<string, number | ''>>({});
  const [receiptLineBoxes, setReceiptLineBoxes] = useState<Record<string, number | ''>>({});
  const [receiptLineCones, setReceiptLineCones] = useState<Record<string, number | ''>>({});
  const [receiptLineDrums, setReceiptLineDrums] = useState<Record<string, number | ''>>({});
  const [receiptLineLots, setReceiptLineLots] = useState<Record<string, string>>({});
  const [receiptDate, setReceiptDate] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiptLocationId, setReceiptLocationId] = useState('');

  // Expanded rows for receipt history
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const openReceiptModal = (po: any) => {
    // Leave "This Receipt" blank — operator enters actual received qty manually.
    setReceiptLineQtys({});
    setReceiptLineBoxes({});
    setReceiptLineCones({});
    setReceiptLineDrums({});
    setReceiptLineLots({});
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setReceiptNotes('');
    setReceiptLocationId(po.target_location_id || '');
    setReceiptTarget(po);
  };

  const handleReceiptSubmit = () => {
    if (!receiptTarget) return;
    const lines = Object.entries(receiptLineQtys)
      .filter(([, qty]) => qty !== '' && Number(qty) > 0)
      .map(([po_line_id, qty_received]) => {
        const itemId = receiptTarget.lines.find((l: any) => l.id === po_line_id)?.item_id;
        const catType = itemId ? getItemCatType(itemId) : null;
        const numOrNull = (v: number | '' | undefined) => (v !== '' && v !== undefined ? Number(v) : null);
        return {
          po_line_id,
          qty_received: Number(qty_received),
          qty_boxes: numOrNull(receiptLineBoxes[po_line_id]),
          qty_cones: catType === 'raw' ? numOrNull(receiptLineCones[po_line_id]) : null,
          qty_drums: (catType === 'chemical' || catType === 'dye') ? numOrNull(receiptLineDrums[po_line_id]) : null,
          batch_number: (receiptLineLots[po_line_id] || '').trim() || null,
        };
      });
    if (lines.length === 0) { showToast('Enter qty for at least one line', 'error'); return; }
    if (!receiptLocationId) { showToast('Select a receiving warehouse', 'error'); return; }
    onCreateReceipt(receiptTarget.id, { receipt_date: receiptDate || null, notes: receiptNotes || null, location_id: receiptLocationId || null, lines });
    setReceiptTarget(null);
  };

  // ── XP shared inline styles ──────────────────────────────────────────────
  const xpBevel: React.CSSProperties = {
      border: '2px solid',
      borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
      boxShadow: '2px 2px 4px rgba(0,0,0,0.3)',
      background: '#ece9d8',
      borderRadius: 0,
  };

  const xpTitleBar: React.CSSProperties = {
      background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
      color: '#ffffff',
      fontFamily: 'Tahoma, Arial, sans-serif',
      fontSize: '12px',
      fontWeight: 'bold',
      padding: '4px 8px',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
      borderBottom: '1px solid #003080',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: '26px',
      flexWrap: 'wrap' as const,
      gap: '4px',
  };

  const xpToolbar: React.CSSProperties = {
      background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)',
      borderBottom: '1px solid #b0a898',
      padding: '3px 6px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      flexWrap: 'wrap' as const,
  };

  const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
      fontFamily: 'Tahoma, Arial, sans-serif',
      fontSize: '11px',
      padding: '2px 10px',
      cursor: 'pointer',
      background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
      border: '1px solid',
      borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
      color: '#000000',
      borderRadius: 0,
      ...extra,
  });

  const xpInput: React.CSSProperties = {
      fontFamily: 'Tahoma, Arial, sans-serif',
      fontSize: '11px',
      border: '1px solid #7f9db9',
      boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)',
      padding: '1px 6px',
      background: '#ffffff',
      color: '#000000',
      height: '20px',
      outline: 'none',
  };

  const xpSep: React.CSSProperties = {
      width: '1px',
      height: '20px',
      background: '#a0988c',
      margin: '0 2px',
      flexShrink: 0,
  };

  const xpTableHeader: React.CSSProperties = {
      background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
      borderBottom: '2px solid #808080',
      fontSize: '10px',
      fontWeight: 'bold',
      color: '#000000',
  };

  const xpThCell: React.CSSProperties = {
      padding: '3px 6px',
      borderRight: '1px solid #b0aaa0',
      textAlign: 'left' as const,
      whiteSpace: 'nowrap' as const,
      fontFamily: 'Tahoma, Arial, sans-serif',
      position: 'sticky' as const,
      top: 0,
      zIndex: 5,
      background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
      borderBottom: '2px solid #808080',
  };

  const tdBase: React.CSSProperties = {
      padding: '4px 6px',
      borderRight: '1px solid #c0bdb5',
      borderBottom: '1px solid #d0cdc8',
      verticalAlign: 'middle' as const,
      fontFamily: 'Tahoma, Arial, sans-serif',
      fontSize: '11px',
  };

  // Shared label style for create-form fields (classic = XP look)
  const lblStyle: React.CSSProperties | undefined = classic ? { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined;
  const lblCls = classic ? '' : 'form-label small text-muted';

  const freshPO = () => ({
      po_number: '',
      supplier_id: '',
      target_location_id: '',
      order_date: new Date().toISOString().split('T')[0],
      ssn: '',
      rate_mode: 'kurs_pajak',
      kurs_pajak: '',
      ktbi: '',
      code: '',
      payment_term: '',
      category: '',
      vat_percent: 11 as number,
      discount: 0 as number,
      notes: '',
      lines: [] as any[],
  });

  const [newPO, setNewPO] = useState(freshPO);

  const [newLine, setNewLine] = useState({ item_id: '', qty: 0, unit_price: '' as number | '', due_date: '', attribute_value_ids: [] as string[] });

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'PO',
      suffix: '',
      separator: '-',
      includeItemCode: false,
      includeVariant: false,
      variantAttributeNames: [],
      includeYear: true,
      includeMonth: true
  });

  useEffect(() => {
      const savedConfig = localStorage.getItem('real_po_code_config');
      if (savedConfig) {
          try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
      }
  }, []);

  const handleSaveConfig = (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('real_po_code_config', JSON.stringify(newConfig));
      setNewPO(prev => ({ ...prev, po_number: suggestPOCode(newConfig) }));
  };

  const suggestPOCode = (config = codeConfig) => {
      let counter = 1;
      let code = buildCodeWithCounter(config, counter);
      while (purchaseOrders.some((s: any) => s.po_number === code)) {
          counter++;
          code = buildCodeWithCounter(config, counter);
      }
      return code;
  };

  useEffect(() => {
      if (isCreateOpen && !newPO.po_number) {
          setNewPO(prev => ({ ...prev, po_number: suggestPOCode() }));
      }
  }, [isCreateOpen]);

  const handleAddLine = () => {
      if (!newLine.item_id || newLine.qty <= 0) return;
      const line = { ...newLine, unit_price: newLine.unit_price === '' ? null : Number(newLine.unit_price) };
      setNewPO({ ...newPO, lines: [...newPO.lines, line] });
      setNewLine({ item_id: '', qty: 0, unit_price: '', due_date: '', attribute_value_ids: [] });
  };

  const handleRemoveLine = (index: number) => {
      setNewPO({ ...newPO, lines: newPO.lines.filter((_, i) => i !== index) });
  };

  const handleValueChange = (valId: string, attrId: string) => {
      const attr = attributes.find((a: any) => a.id === attrId);
      if (!attr) return;
      const otherValues = newLine.attribute_value_ids.filter(vid => !attr.values.some((v: any) => v.id === vid));
      setNewLine({...newLine, attribute_value_ids: valId ? [...otherValues, valId] : otherValues});
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onCreatePO({
          ...newPO,
          supplier_id: newPO.supplier_id || null,
          target_location_id: newPO.target_location_id || null,
          order_date: newPO.order_date || null,
          vat_percent: Number(newPO.vat_percent) || 0,
          discount: Number(newPO.discount) || 0,
          lines: newPO.lines.map((line: any) => ({ ...line, due_date: line.due_date || null }))
      });
      setNewPO(freshPO());
      setIsCreateOpen(false);
  };

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
  const getItemCode = (id: string) => items.find((i: any) => i.id === id)?.code || id;
  const getItem = (id: string) => items.find((i: any) => i.id === id);
  const getItemUom = (id: string) => getItem(id)?.uom || '';
  // Classify by seeded system categories: "Raw Material", "Chemical", "Dye"
  const getItemCatType = (id: string): 'raw' | 'chemical' | 'dye' | null => {
      const path = (getItem(id)?.category_path || []).map((s: string) => s.toLowerCase());
      if (path.some((p: string) => p.includes('dye'))) return 'dye';
      if (path.some((p: string) => p.includes('chemical'))) return 'chemical';
      if (path.some((p: string) => p.includes('raw material'))) return 'raw';
      return null;
  };
  const getItemCatLabel = (id: string) => {
      const path = getItem(id)?.category_path || [];
      return path.length ? path[path.length - 1] : '';
  };

  const getBoundAttributes = (itemId: string) => {
      const item = items.find((i: any) => i.id === itemId);
      if (!item || !item.attribute_ids) return [];
      return attributes.filter((a: any) => item.attribute_ids.includes(a.id));
  };

  const currentBoundAttrs = getBoundAttributes(newLine.item_id);

  const getAttributeValueName = (valId: string) => {
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  const handlePrintPO = (po: any) => {
      setPrintingPO(po);
  };

  const suppliers = partners.filter((p: any) => p.type === 'SUPPLIER' && p.active);
  const getSupplierName = (id: string) => partners.find((p: any) => p.id === id)?.name || id;

  const STATUS_FILTERS = ['ALL', 'DRAFT', 'RECEIVING', 'RECEIVED'];

  const filteredOrders = purchaseOrders.filter((po: any) => {
      const matchSearch = !searchTerm ||
          po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          getSupplierName(po.supplier_id).toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || po.status === statusFilter;
      return matchSearch && matchStatus;
  });

  const poSortCols = useMemo(() => ({
      po:       (po: any) => po.po_number,
      supplier: (po: any) => getSupplierName(po.supplier_id),
      date:     (po: any) => po.order_date || po.created_at,
      status:   (po: any) => po.status,
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [partners]);
  const { sorted: sortedOrders, sort: poSort, toggle: togglePOSort } = useSortable(filteredOrders, poSortCols);

  const statusBadge = (status: string) => {
    if (classic) {
      const bg = status === 'RECEIVED' ? '#e8f5e9' : status === 'RECEIVING' ? '#fff8e1' : '#e8e8e8';
      const border = status === 'RECEIVED' ? '#2e7d32' : status === 'RECEIVING' ? '#f57f17' : '#6a6a6a';
      const color = status === 'RECEIVED' ? '#1b4620' : status === 'RECEIVING' ? '#5d3800' : '#222';
      return (
        <span style={{ background: bg, border: `1px solid ${border}`, color, padding: '1px 5px', fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}>
          {status}
        </span>
      );
    }
    const cls = status === 'RECEIVED' ? 'bg-success' : status === 'RECEIVING' ? 'bg-warning text-dark' : 'bg-secondary';
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  return (
    <div className="fade-in">
       {/* Print Overlay */}
       {printingPO && (
           <PurchaseOrderPrintModal
               po={printingPO}
               onClose={() => setPrintingPO(null)}
               currentStyle={currentStyle}
               companyProfile={companyProfile}
               items={items}
               attributes={attributes}
               partners={partners}
           />
       )}

       <CodeConfigModal
           isOpen={isConfigOpen}
           onClose={() => setIsConfigOpen(false)}
           type="PO"
           onSave={handleSaveConfig}
           initialConfig={codeConfig}
           attributes={attributes}
       />

       {/* Create PO Modal */}
       <ModalWrapper
           isOpen={isCreateOpen}
           modeless
           onClose={() => { setIsCreateOpen(false); setNewPO(freshPO()); }}
           title={<><i className="bi bi-cart-plus" style={classic?{marginRight:6}:{marginRight:8}}></i>Create Purchase Order</>}
           variant="success"
           size="xl"
           footer={classic ? (
               <>
                   <button type="button" style={xpBtn()} onClick={() => setIsCreateOpen(false)}>{t('cancel')}</button>
                   <button type="button" style={xpBtn({background:'linear-gradient(to bottom,#5ec85e,#2d7a2d)',borderColor:'#1a5e1a #0a3e0a #0a3e0a #1a5e1a',color:'#ffffff',fontWeight:'bold',padding:'2px 16px'})} onClick={handleSubmit as any}><i className="bi bi-floppy" style={{marginRight:4}}></i>{t('save')} PO</button>
               </>
           ) : (
               <>
                   <button type="button" className="btn btn-sm btn-link text-muted" onClick={() => setIsCreateOpen(false)}>{t('cancel')}</button>
                   <button type="button" className="btn btn-sm btn-success px-4 fw-bold" onClick={handleSubmit as any}>{t('save')} PO</button>
               </>
           )}
       >
           <form onSubmit={handleSubmit} id="create-po-form">
               <div className="row g-3 mb-3">
                   <div className="col-md-4">
                       <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}:undefined} className={classic?'':'form-label d-flex justify-content-between align-items-center small text-muted'}>
                           PO Number
                           <i className="bi bi-gear-fill" style={{cursor:'pointer',color:classic?'#555':'',fontSize:classic?'11px':''}} onClick={() => setIsConfigOpen(true)} title="Configure Auto-Suggestion"></i>
                       </label>
                       <input className="form-control" style={classic?xpInput:undefined} placeholder="Auto-generated" value={newPO.po_number} onChange={e => setNewPO({...newPO, po_number: e.target.value})} required />
                   </div>
                   <div className="col-md-5">
                       <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted'}>Supplier</label>
                       <SearchableSelect options={suppliers.map((c: any) => ({ value: c.id, label: c.name, subLabel: c.address }))} value={newPO.supplier_id} onChange={(val) => setNewPO({...newPO, supplier_id: val})} placeholder="Select Supplier…" required />
                   </div>
                   <div className="col-md-3">
                       <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted'}>Date</label>
                       <input type="date" className="form-control" style={classic?{...xpInput,width:'100%',height:'22px'}:undefined} value={newPO.order_date} onChange={e => setNewPO({...newPO, order_date: e.target.value})} required />
                   </div>
                   <div className="col-md-12">
                       <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted'}>Receiving Warehouse</label>
                       <SearchableSelect options={locations.map((l: any) => ({ value: l.id, label: l.name, subLabel: l.code }))} value={newPO.target_location_id} onChange={(val) => setNewPO({...newPO, target_location_id: val})} placeholder="Select receiving location…" required />
                   </div>
               </div>

               {/* ── PO Document Details (rendered on the printed PO) ── */}
               {classic
                   ? <div style={{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'10px',fontWeight:'bold',color:'#444',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4,paddingBottom:2,borderBottom:'1px solid #c0bdb5'}}>Document Details</div>
                   : <h6 className="small text-uppercase text-muted fw-bold mb-2">Document Details</h6>
               }
               <div style={{background:classic?'#f5f4ef':'rgba(0,0,0,0.02)',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'6px 8px':'12px',marginBottom:classic?6:12}}>
                   <div className="row g-2">
                       <div className="col-md-4">
                           <label style={lblStyle} className={lblCls}>SSN</label>
                           <input className="form-control" style={classic?xpInput:undefined} placeholder="e.g. BI 084/KMK/26/06/09" value={newPO.ssn} onChange={e => setNewPO({...newPO, ssn: e.target.value})} />
                       </div>
                       <div className="col-md-4">
                           <label style={lblStyle} className={lblCls}>Rate Variant</label>
                           <select className="form-select form-select-sm" style={classic?{...xpInput,height:'22px',borderRadius:0,width:'100%'}:undefined} value={newPO.rate_mode} onChange={e => setNewPO({...newPO, rate_mode: e.target.value})}>
                               <option value="kurs_pajak">Kurs Pajak</option>
                               <option value="ktbi">KTBI</option>
                           </select>
                       </div>
                       {newPO.rate_mode === 'ktbi' ? (
                           <div className="col-md-4">
                               <label style={lblStyle} className={lblCls}>KTBI</label>
                               <input className="form-control" style={classic?xpInput:undefined} placeholder="e.g. KTBI value" value={newPO.ktbi} onChange={e => setNewPO({...newPO, ktbi: e.target.value})} />
                           </div>
                       ) : (
                           <div className="col-md-4">
                               <label style={lblStyle} className={lblCls}>Kurs Pajak</label>
                               <input className="form-control" style={classic?xpInput:undefined} placeholder="e.g. Rp 17.805 (09.06.26)" value={newPO.kurs_pajak} onChange={e => setNewPO({...newPO, kurs_pajak: e.target.value})} />
                           </div>
                       )}
                       <div className="col-md-4">
                           <label style={lblStyle} className={lblCls}>Code</label>
                           <input className="form-control" style={classic?xpInput:undefined} value={newPO.code} onChange={e => setNewPO({...newPO, code: e.target.value})} />
                       </div>
                       <div className="col-md-4">
                           <label style={lblStyle} className={lblCls}>Payment</label>
                           <input className="form-control" style={classic?xpInput:undefined} placeholder="e.g. Net 45 days" value={newPO.payment_term} onChange={e => setNewPO({...newPO, payment_term: e.target.value})} />
                       </div>
                       <div className="col-md-4">
                           <label style={lblStyle} className={lblCls}>Category</label>
                           <input className="form-control" style={classic?xpInput:undefined} placeholder="e.g. dsc" value={newPO.category} onChange={e => setNewPO({...newPO, category: e.target.value})} />
                       </div>
                       <div className="col-md-3">
                           <label style={lblStyle} className={lblCls}>VAT %</label>
                           <input type="number" className="form-control" style={classic?xpInput:undefined} value={newPO.vat_percent} onChange={e => setNewPO({...newPO, vat_percent: parseFloat(e.target.value) || 0})} />
                       </div>
                       <div className="col-md-3">
                           <label style={lblStyle} className={lblCls}>Discount (Rp)</label>
                           <input type="number" className="form-control" style={classic?xpInput:undefined} value={newPO.discount} onChange={e => setNewPO({...newPO, discount: parseFloat(e.target.value) || 0})} />
                       </div>
                       <div className="col-md-6">
                           <label style={lblStyle} className={lblCls}>Notes</label>
                           <input className="form-control" style={classic?xpInput:undefined} placeholder="Optional notes printed on the PO" value={newPO.notes} onChange={e => setNewPO({...newPO, notes: e.target.value})} />
                       </div>
                   </div>
               </div>

               {classic
                   ? <div style={{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'10px',fontWeight:'bold',color:'#444',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:4,paddingBottom:2,borderBottom:'1px solid #c0bdb5'}}>Order Items</div>
                   : <h6 className="small text-uppercase text-muted fw-bold mb-2">Order Items</h6>
               }
               <div style={{background:classic?'#f5f4ef':'rgba(0,0,0,0.02)',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'6px 8px':'12px',marginBottom:classic?6:12}}>
                   <div className="row g-2 mb-2">
                       <div className="col-4">
                           <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted mb-1'}>Item</label>
                           <SearchableSelect options={items.map((item: any) => ({ value: item.id, label: item.name, subLabel: item.code }))} value={newLine.item_id} onChange={(val) => setNewLine({...newLine, item_id: val, attribute_value_ids: []})} placeholder="Select Item…" />
                       </div>
                       <div className="col-2">
                           <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted mb-1'}>Qty</label>
                           <input type="number" className="form-control" style={classic?xpInput:undefined} placeholder="0" value={newLine.qty || ''} onChange={e => setNewLine({...newLine, qty: parseFloat(e.target.value)})} />
                       </div>
                       <div className="col-2">
                           <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted mb-1'}>Price (Rp)</label>
                           <input type="number" min="0" step="0.01" className="form-control" style={classic?xpInput:undefined} placeholder="0.00" value={newLine.unit_price} onChange={e => setNewLine({...newLine, unit_price: e.target.value === '' ? '' : parseFloat(e.target.value)})} />
                       </div>
                       <div className="col-2">
                           <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted mb-1'}>Expected By</label>
                           <input type="date" className="form-control" style={classic?{...xpInput,width:'100%',height:'22px'}:undefined} value={newLine.due_date} onChange={e => setNewLine({...newLine, due_date: e.target.value})} />
                       </div>
                       <div className="col-2 d-flex align-items-end">
                           <button type="button" style={classic ? xpBtn({background:'linear-gradient(to bottom,#5ec85e,#2d7a2d)',borderColor:'#1a5e1a #0a3e0a #0a3e0a #1a5e1a',color:'#fff',width:'100%',padding:'2px 6px'}) : undefined} className={classic?'':'btn btn-success w-100'} onClick={handleAddLine} disabled={!newLine.item_id || newLine.qty <= 0}>
                               <i className="bi bi-plus-lg" style={classic?{marginRight:3}:{marginRight:4}}></i>{classic?'Add':'Add Item'}
                           </button>
                       </div>
                       {currentBoundAttrs.length > 0 && (
                           <div className="col-12 mt-1">
                               <div style={{background:'#ffffff',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'4px 6px':'8px'}}>
                                   <div style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'10px',fontWeight:'bold',color:'#444',marginBottom:4}:undefined} className={classic?'':'text-muted fw-bold mb-2 small'}>Variants</div>
                                   <div className="row g-2">
                                       {currentBoundAttrs.map((attr: any) => (
                                           <div key={attr.id} className="col-md-4">
                                               <select className="form-select form-select-sm" style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',border:'1px solid #7f9db9',height:'22px',borderRadius:0,padding:'1px 4px',background:'#ffffff',outline:'none'}:undefined} value={newLine.attribute_value_ids.find(vid => attr.values.some((v: any) => v.id === vid)) || ''} onChange={e => handleValueChange(e.target.value, attr.id)}>
                                                   <option value="">Any {attr.name}</option>
                                                   {attr.values.map((v: any) => <option key={v.id} value={v.id}>{v.value}</option>)}
                                               </select>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           </div>
                       )}
                   </div>
                   <div>
                       {newPO.lines.map((line: any, idx) => (
                           <div key={idx} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:classic?'3px 6px':'8px',background:classic?(idx%2===0?'#ffffff':'#f5f3ee'):'white',border:classic?'1px solid #c0bdb5':'1px solid #dee2e6',marginBottom:2,fontFamily:classic?'Tahoma,Arial,sans-serif':undefined,fontSize:classic?'11px':undefined}}>
                               <div>
                                   <span style={{fontWeight:'bold'}}>{getItemName(line.item_id)}</span>
                                   <span style={{color:classic?'#555':'',marginLeft:8,fontSize:classic?'10px':''}}>{getItemCode(line.item_id)}</span>
                                   {getItemUom(line.item_id) && <span style={{display:'inline-block',marginLeft:8,padding:'1px 6px',fontSize:'9px',fontWeight:'bold',background:'#dfe8f5',border:'1px solid #7f9db9',color:'#1a3d6b',borderRadius:classic?0:3,textTransform:'uppercase'}}>{getItemUom(line.item_id)}</span>}
                                   {getItemCatLabel(line.item_id) && <span style={{display:'inline-block',marginLeft:4,padding:'1px 6px',fontSize:'9px',fontWeight:'bold',background:'#f0e8d8',border:'1px solid #b8a060',color:'#6b4e1a',borderRadius:classic?0:3}}>{getItemCatLabel(line.item_id)}</span>}
                                   {line.due_date && <span style={{color:classic?'#666':'',marginLeft:8,fontSize:classic?'10px':''}}><i className="bi bi-calendar2" style={{marginRight:3}}></i>{new Date(line.due_date).toLocaleDateString()}</span>}
                                   {(line.attribute_value_ids||[]).length>0 && <div style={{color:classic?'#666':'',fontSize:classic?'10px':'',fontStyle:'italic'}}>{(line.attribute_value_ids||[]).map(getAttributeValueName).join(', ')}</div>}
                               </div>
                               <div style={{display:'flex',alignItems:'center',gap:12}}>
                                   {line.unit_price != null && <span style={{color:classic?'#555':'',fontSize:classic?'10px':''}}>@ Rp {Number(line.unit_price).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>}
                                   <span style={{fontWeight:'bold'}}>×{line.qty}</span>
                                   <button type="button" style={classic?{...xpBtn(),border:'1px solid transparent',background:'transparent',padding:'1px 5px'}:undefined} className={classic?'':'btn btn-sm btn-link text-danger p-0'} onClick={() => handleRemoveLine(idx)}>
                                       <i className="bi bi-x-circle" style={{color:classic?'#c00000':''}}></i>
                                   </button>
                               </div>
                           </div>
                       ))}
                       {newPO.lines.length === 0 && <div style={{textAlign:'center',padding:'8px',fontFamily:classic?'Tahoma,Arial,sans-serif':'',fontSize:classic?'11px':'',color:classic?'#888':'',fontStyle:'italic'}}>No items added yet</div>}
                   </div>
               </div>
           </form>
       </ModalWrapper>

       {/* Receive Goods Modal */}
       <ModalWrapper
           isOpen={!!receiptTarget}
           modeless
           onClose={() => setReceiptTarget(null)}
           title={<><i className="bi bi-box-arrow-in-down" style={classic?{marginRight:6}:{marginRight:8}}></i>Receive Goods — {receiptTarget?.po_number}</>}
           variant="success"
           size="xl"
           footer={classic ? (
               <>
                   <button type="button" style={xpBtn()} onClick={() => setReceiptTarget(null)}>Cancel</button>
                   <button type="button" style={xpBtn({background:'linear-gradient(to bottom,#5ec85e,#2d7a2d)',borderColor:'#1a5e1a #0a3e0a #0a3e0a #1a5e1a',color:'#ffffff',fontWeight:'bold',padding:'2px 16px'})} onClick={handleReceiptSubmit}><i className="bi bi-check-lg" style={{marginRight:4}}></i>Confirm Receipt</button>
               </>
           ) : (
               <>
                   <button type="button" className="btn btn-sm btn-link text-muted" onClick={() => setReceiptTarget(null)}>Cancel</button>
                   <button type="button" className="btn btn-sm btn-success px-4 fw-bold" onClick={handleReceiptSubmit}>Confirm Receipt</button>
               </>
           )}
       >
           {receiptTarget && (
               <div>
                   <div className="row g-2 mb-3">
                       <div className="col-md-3">
                           <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted'}>Receipt Date</label>
                           <input type="date" className="form-control" style={classic?{...xpInput,width:'100%',height:'22px'}:undefined} value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
                       </div>
                       <div className="col-md-4">
                           <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted'}>Receiving Warehouse</label>
                           <SearchableSelect options={locations.map((l: any) => ({ value: l.id, label: l.name, subLabel: l.code }))} value={receiptLocationId} onChange={(val) => setReceiptLocationId(val)} placeholder="Select warehouse…" required />
                       </div>
                       <div className="col-md-5">
                           <label style={classic?{fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px',color:'#000',display:'block',marginBottom:2}:undefined} className={classic?'':'form-label small text-muted'}>Notes</label>
                           <input type="text" className="form-control" style={classic?xpInput:undefined} placeholder="e.g. Short delivery, weighed on arrival" value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} />
                       </div>
                   </div>
                   <div style={{overflowX:'auto'}}>
                   <table className={classic?'':'table table-sm'} style={classic?{width:'100%',borderCollapse:'collapse',fontFamily:'Tahoma,Arial,sans-serif',fontSize:'11px'}:{minWidth:480}}>
                       <thead>
                           <tr style={classic?{background:'linear-gradient(to bottom,#ffffff,#d4d0c8)',borderBottom:'2px solid #808080',fontSize:'10px',fontWeight:'bold'}:undefined} className={classic?'':'table-light'}>
                               <th style={classic?xpThCell:undefined}>Item</th>
                               <th style={classic?{...xpThCell,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>Ordered</th>
                               <th style={classic?{...xpThCell,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>Rcvd So Far</th>
                               <th style={classic?{...xpThCell,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>This Receipt</th>
                               <th style={classic?{...xpThCell,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>Boxes</th>
                               <th style={classic?{...xpThCell,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>Cones</th>
                               <th style={classic?{...xpThCell,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>Drum</th>
                               <th style={classic?{...xpThCell,borderRight:'none'}:undefined}>Lot No.</th>
                           </tr>
                       </thead>
                       <tbody>
                           {receiptTarget.lines.map((line: any, idx: number) => (
                               <tr key={line.id} style={classic?{background:idx%2===0?'#ffffff':'#f5f3ee',borderBottom:'1px solid #d0cdc8'}:undefined}>
                                   <td style={classic?tdBase:undefined}>
                                       <div style={classic?{fontWeight:'bold'}:undefined} className={classic?'':'fw-bold'}>{line.item_name || getItemName(line.item_id)}</div>
                                       <div style={classic?{fontSize:'10px',color:'#666'}:undefined} className={classic?'':'small text-muted'}>{line.item_code || getItemCode(line.item_id)}</div>
                                   </td>
                                   <td style={classic?{...tdBase,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>{line.qty}</td>
                                   <td style={classic?{...tdBase,textAlign:'right' as const}:undefined} className={classic?'':'text-end text-muted'}>{line.qty_received || 0}</td>
                                   <td style={classic?{...tdBase,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>
                                       <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                                           <input
                                               type="number"
                                               min="0"
                                               step="0.001"
                                               style={classic?{...xpInput,width:90,textAlign:'right'}:{width:100,textAlign:'right' as const}}
                                               className={classic?'':'form-control form-control-sm'}
                                               placeholder="—"
                                               value={receiptLineQtys[line.id] ?? ''}
                                               onChange={e => setReceiptLineQtys(prev => ({ ...prev, [line.id]: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))}
                                           />
                                           <span style={{fontSize:'9px',fontWeight:'bold',color:'#1a3d6b',textTransform:'uppercase'}}>{line.item_uom || getItemUom(line.item_id)}</span>
                                       </div>
                                   </td>
                                   <td style={classic?{...tdBase,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>
                                       <input
                                           type="number"
                                           min="0"
                                           step="1"
                                           placeholder="—"
                                           style={classic?{...xpInput,width:60,textAlign:'right'}:{width:80,textAlign:'right' as const}}
                                           className={classic?'':'form-control form-control-sm'}
                                           value={receiptLineBoxes[line.id] ?? ''}
                                           onChange={e => setReceiptLineBoxes(prev => ({ ...prev, [line.id]: e.target.value === '' ? '' : parseInt(e.target.value) || 0 }))}
                                       />
                                   </td>
                                   <td style={classic?{...tdBase,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>
                                       {getItemCatType(line.item_id) === 'raw' ? (
                                           <input
                                               type="number"
                                               min="0"
                                               step="1"
                                               placeholder="—"
                                               style={classic?{...xpInput,width:60,textAlign:'right'}:{width:80,textAlign:'right' as const}}
                                               className={classic?'':'form-control form-control-sm'}
                                               value={receiptLineCones[line.id] ?? ''}
                                               onChange={e => setReceiptLineCones(prev => ({ ...prev, [line.id]: e.target.value === '' ? '' : parseInt(e.target.value) || 0 }))}
                                           />
                                       ) : <span style={{color:'#bbb'}}>—</span>}
                                   </td>
                                   <td style={classic?{...tdBase,textAlign:'right' as const}:undefined} className={classic?'':'text-end'}>
                                       {(getItemCatType(line.item_id) === 'chemical' || getItemCatType(line.item_id) === 'dye') ? (
                                           <input
                                               type="number"
                                               min="0"
                                               step="1"
                                               placeholder="—"
                                               style={classic?{...xpInput,width:60,textAlign:'right'}:{width:80,textAlign:'right' as const}}
                                               className={classic?'':'form-control form-control-sm'}
                                               value={receiptLineDrums[line.id] ?? ''}
                                               onChange={e => setReceiptLineDrums(prev => ({ ...prev, [line.id]: e.target.value === '' ? '' : parseInt(e.target.value) || 0 }))}
                                           />
                                       ) : <span style={{color:'#bbb'}}>—</span>}
                                   </td>
                                   <td style={classic?{...tdBase,borderRight:'none'}:undefined}>
                                       <input
                                           type="text"
                                           placeholder="Supplier lot (optional)"
                                           style={classic?{...xpInput,width:120}:{width:140}}
                                           className={classic?'':'form-control form-control-sm'}
                                           value={receiptLineLots[line.id] ?? ''}
                                           onChange={e => setReceiptLineLots(prev => ({ ...prev, [line.id]: e.target.value }))}
                                       />
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
                   </div>
               </div>
           )}
       </ModalWrapper>

       {/* ── Outer shell ── */}
       <div
           style={classic ? xpBevel : undefined}
           className={classic ? '' : 'card border-0 shadow-sm'}
       >
           {/* ── Title bar ── */}
           {classic ? (
               <div style={xpTitleBar}>
                   <span>
                       <i className="bi bi-truck" style={{ marginRight: 6 }}></i>
                       {t('purchase_orders')}
                   </span>
                   <button
                       style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' })}
                       onClick={() => setIsCreateOpen(true)}
                   >
                       <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>{t('create')}
                   </button>
               </div>
           ) : (
               <div className="card-header bg-white d-flex justify-content-between align-items-center">
                   <div>
                       <h5 className="card-title mb-0">
                           <i className="bi bi-truck me-2"></i>{t('purchase_orders')}
                       </h5>
                       <p className="text-muted small mb-0 mt-1">Manage outgoing supplier orders and stock receiving</p>
                   </div>
                   <button className="btn btn-sm btn-success text-white" onClick={() => setIsCreateOpen(true)}>
                       <i className="bi bi-plus-lg me-2"></i>{t('create')}
                   </button>
               </div>
           )}

           {/* ── Secondary toolbar: search + status filters + count ── */}
           {classic ? (
               <div style={xpToolbar}>
                   <input
                       style={{ ...xpInput, width: 180 }}
                       placeholder="Search PO# or supplier…"
                       value={searchTerm}
                       onChange={e => setSearchTerm(e.target.value)}
                   />
                   <div style={xpSep}></div>
                   {STATUS_FILTERS.map(s => (
                       <button
                           key={s}
                           style={statusFilter === s
                               ? xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', fontWeight: 'bold' })
                               : xpBtn()
                           }
                           onClick={() => setStatusFilter(s)}
                       >
                           {s}
                       </button>
                   ))}
                   <div style={xpSep}></div>
                   <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#333' }}>
                       {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
                   </span>
               </div>
           ) : (
               <div className="px-3 py-2 border-bottom d-flex align-items-center gap-2 flex-wrap bg-white">
                   <div className="position-relative" style={{ flex: '1 1 160px', maxWidth: 240 }}>
                       <i className="bi bi-search position-absolute" style={{ left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 11, opacity: 0.5 }}></i>
                       <input
                           className="form-control form-control-sm"
                           style={{ paddingLeft: 24 }}
                           placeholder="Search PO# or supplier…"
                           value={searchTerm}
                           onChange={e => setSearchTerm(e.target.value)}
                       />
                   </div>
                   <div className="d-flex gap-1">
                       {STATUS_FILTERS.map(s => (
                           <button
                               key={s}
                               className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-light border'}`}
                               style={{ fontSize: 11 }}
                               onClick={() => setStatusFilter(s)}
                           >
                               {s}
                           </button>
                       ))}
                   </div>
                   <span className="text-muted small ms-1">
                       {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
                   </span>
               </div>
           )}

           {/* ── Table ── */}
           <div className={classic ? '' : 'card-body p-0'}>
               {/* vertical scroll must live on the same element as overflow-x,
                   otherwise sticky headers bind to the inner wrapper and never stick */}
               <div className="table-responsive" style={classic ? { maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' } : undefined}>
                   <table
                       className={classic ? '' : 'table table-hover align-middle mb-0'}
                       style={classic ? { width: '100%', borderCollapse: 'collapse', background: '#fff' } : undefined}
                   >
                       <thead style={classic ? xpTableHeader : undefined} className={classic ? '' : 'table-light'}>
                           <tr>
                               <th style={classic ? { ...xpThCell, width: '20px' } : undefined}></th>
                               <th style={classic ? { ...xpThCell, width: '130px', cursor: 'pointer' } : { cursor: 'pointer' }} className={classic ? '' : 'ps-2'} onClick={() => togglePOSort('po')} title="Sort">PO Number<SortMark sort={poSort} colKey="po" /></th>
                               <th style={classic ? { ...xpThCell, cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => togglePOSort('supplier')} title="Sort">Supplier<SortMark sort={poSort} colKey="supplier" /></th>
                               <th style={classic ? { ...xpThCell, width: '90px', cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => togglePOSort('date')} title="Sort">Date<SortMark sort={poSort} colKey="date" /></th>
                               <th style={classic ? xpThCell : undefined}>Items</th>
                               <th style={classic ? { ...xpThCell, width: '90px', cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => togglePOSort('status')} title="Sort">Status<SortMark sort={poSort} colKey="status" /></th>
                               <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none', width: '130px' } : undefined} className={classic ? '' : 'text-end pe-4'}>Actions</th>
                           </tr>
                       </thead>
                       <tbody>
                           {sortedOrders.map((po: any, rowIndex: number) => (
                               <>
                               <tr
                                   key={po.id}
                                   style={classic ? { background: rowIndex % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: expandedRows[po.id] ? 'none' : '1px solid #c0bdb5' } : undefined}
                               >
                                   <td style={classic ? { ...tdBase, padding: '4px 4px', textAlign: 'center' as const } : undefined} className={classic ? '' : 'ps-3 text-center'}>
                                       <button
                                           onClick={() => setExpandedRows(prev => ({ ...prev, [po.id]: !prev[po.id] }))}
                                           style={classic ? { background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#555', padding: '0 2px' } : undefined}
                                           className={classic ? '' : 'btn btn-sm btn-link p-0 text-muted'}
                                           title={expandedRows[po.id] ? 'Hide receipts' : 'Show receipts'}
                                       >
                                           <i className={`bi bi-chevron-${expandedRows[po.id] ? 'down' : 'right'}`}></i>
                                       </button>
                                   </td>
                                   <td style={classic ? { ...tdBase, fontFamily: "'Courier New', monospace", fontWeight: 'bold', color: '#0058e6' } : undefined} className={classic ? '' : 'ps-2 fw-bold font-monospace text-primary'}>
                                       {po.po_number}
                                   </td>
                                   <td style={classic ? tdBase : undefined}>{getSupplierName(po.supplier_id)}</td>
                                   <td style={classic ? { ...tdBase, fontSize: '10px' } : undefined} className={classic ? '' : 'small'}>
                                       {new Date(po.order_date).toLocaleDateString()}
                                   </td>
                                   <td style={classic ? tdBase : undefined}>
                                       <div>
                                           {classic ? (
                                               <span style={{ background: '#e8e8e8', border: '1px solid #6a6a6a', color: '#222', padding: '1px 5px', fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', fontWeight: 'bold' }}>
                                                   {po.lines.length} item{po.lines.length !== 1 ? 's' : ''}
                                               </span>
                                           ) : (
                                               <span className="badge bg-light text-dark border me-1">{po.lines.length} item{po.lines.length !== 1 ? 's' : ''}</span>
                                           )}
                                       </div>
                                       <div style={{ marginTop: 2 }}>
                                           {po.lines.map((line: any) => (
                                               <div key={line.id} style={classic ? { fontSize: '10px', color: '#333', lineHeight: 1.4 } : undefined} className={classic ? '' : 'small text-muted'}>
                                                   <span style={classic ? { fontWeight: 'bold' } : undefined} className={classic ? '' : 'fw-bold text-dark'}>{line.qty_received || 0}/{line.qty}</span> {line.item_name || getItemName(line.item_id)}
                                               </div>
                                           ))}
                                       </div>
                                   </td>
                                   <td style={classic ? tdBase : undefined}>
                                       {statusBadge(po.status)}
                                   </td>
                                   <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' as const } : undefined} className={classic ? '' : 'pe-4 text-end'}>
                                       <div style={classic ? { display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' } : undefined} className={classic ? '' : 'd-flex justify-content-end align-items-center gap-2'}>
                                           {po.status !== 'RECEIVED' && (
                                               classic ? (
                                                   <button
                                                       style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff' })}
                                                       onClick={() => openReceiptModal(po)}
                                                   >
                                                       <i className="bi bi-box-arrow-in-down" style={{ marginRight: 3 }}></i>Receive
                                                   </button>
                                               ) : (
                                                   <button
                                                       className="btn btn-sm btn-success text-white py-0 px-2"
                                                       style={{fontSize: '0.75rem'}}
                                                       onClick={() => openReceiptModal(po)}
                                                   >
                                                       <i className="bi bi-box-arrow-in-down me-1"></i>Receive Goods
                                                   </button>
                                               )
                                           )}
                                           {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
                                               classic ? (
                                                   <button
                                                       style={xpBtn({ background: 'linear-gradient(to bottom, #f0c000, #c08000)', borderColor: '#a06000 #604000 #604000 #a06000', color: '#000' })}
                                                       title="Mark as received even if quantities are short"
                                                       onClick={() => onClosePO(po.id)}
                                                   >
                                                       <i className="bi bi-check2-circle" style={{ marginRight: 3 }}></i>Close
                                                   </button>
                                               ) : (
                                                   <button
                                                       className="btn btn-sm btn-warning py-0 px-2"
                                                       style={{fontSize: '0.75rem'}}
                                                       title="Mark as received even if quantities are short"
                                                       onClick={() => onClosePO(po.id)}
                                                   >
                                                       <i className="bi bi-check2-circle me-1"></i>Close
                                                   </button>
                                               )
                                           )}
                                           {classic ? (
                                               <>
                                                   <button
                                                       title="Print"
                                                       onClick={() => handlePrintPO(po)}
                                                       style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: '#555', fontSize: '13px' }}
                                                       onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = '#e8f0f8'; }}
                                                       onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                   >
                                                       <i className="bi bi-printer"></i>
                                                   </button>
                                                   <button
                                                       title="Delete"
                                                       onClick={() => onDeletePO(po.id)}
                                                       style={{ background: 'none', border: '1px solid transparent', borderRadius: 2, cursor: 'pointer', padding: '1px 4px', color: '#aa0000', fontSize: '13px' }}
                                                       onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#cc4444'; (e.currentTarget as HTMLButtonElement).style.background = '#fff0f0'; }}
                                                       onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                                                   >
                                                       <i className="bi bi-trash"></i>
                                                   </button>
                                               </>
                                           ) : (
                                               <>
                                                   <button className="btn btn-sm btn-link text-muted p-0" title="Print" onClick={() => handlePrintPO(po)}>
                                                       <i className="bi bi-printer fs-6"></i>
                                                   </button>
                                                   <button className="btn btn-sm btn-link text-danger p-0" title="Delete" onClick={() => onDeletePO(po.id)}>
                                                       <i className="bi bi-trash fs-6"></i>
                                                   </button>
                                               </>
                                           )}
                                       </div>
                                   </td>
                               </tr>
                               {/* Expanded: receipt history */}
                               {expandedRows[po.id] && (
                                   <tr key={`${po.id}-receipts`} style={classic ? { background: '#f0ede4', borderBottom: '1px solid #c0bdb5' } : undefined} className={classic ? '' : 'bg-light'}>
                                       <td colSpan={7} style={classic ? { padding: '6px 16px 8px 32px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px' } : undefined} className={classic ? '' : 'px-4 py-3'}>
                                           {(po.receipts || []).length === 0 ? (
                                               <span style={classic ? { color: '#888', fontStyle: 'italic' } : undefined} className={classic ? '' : 'text-muted fst-italic small'}>No receipts recorded yet.</span>
                                           ) : (
                                               <div>
                                                   <div style={classic ? { fontWeight: 'bold', fontSize: '10px', color: '#444', textTransform: 'uppercase', marginBottom: 4 } : undefined} className={classic ? '' : 'small fw-bold text-muted text-uppercase mb-2'}>Receipt History</div>
                                                   {(po.receipts || []).map((receipt: any) => {
                                                       const rlines = receipt.lines || [];
                                                       const hasBoxes = rlines.some((l: any) => l.qty_boxes != null);
                                                       const hasCones = rlines.some((l: any) => l.qty_cones != null);
                                                       const hasDrums = rlines.some((l: any) => l.qty_drums != null);
                                                       const thXp: React.CSSProperties = { padding: '2px 8px', fontSize: '10px', fontWeight: 'bold', color: '#1a3d6b', background: '#e4e0d4', borderBottom: '1px solid #b0a898', textAlign: 'left' };
                                                       const tdXp: React.CSSProperties = { padding: '2px 8px', fontSize: '10px', color: '#333', borderTop: '1px solid #e6e3da' };
                                                       const numR = { textAlign: 'right' as const };
                                                       return (
                                                           <div key={receipt.id} style={classic ? { marginBottom: 8 } : undefined} className={classic ? '' : 'mb-3'}>
                                                               <div style={classic ? { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 } : undefined} className={classic ? '' : 'd-flex justify-content-between align-items-baseline mb-1'}>
                                                                   <span style={classic ? { fontWeight: 'bold', color: '#1a3d6b' } : undefined} className={classic ? '' : 'fw-bold'}>
                                                                       {new Date(receipt.receipt_date).toLocaleDateString()}
                                                                   </span>
                                                                   {receipt.notes && <span style={classic ? { color: '#666', fontStyle: 'italic', fontSize: '10px' } : undefined} className={classic ? '' : 'text-muted fst-italic small'}>{receipt.notes}</span>}
                                                               </div>
                                                               <table style={classic ? { width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #c0bdb5' } : undefined} className={classic ? '' : 'table table-sm table-bordered bg-white mb-0 align-middle small'}>
                                                                   <thead>
                                                                       <tr className={classic ? '' : 'table-light'}>
                                                                           <th style={classic ? thXp : undefined}>Item</th>
                                                                           <th style={classic ? { ...thXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>Received</th>
                                                                           {hasBoxes && <th style={classic ? { ...thXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>Boxes</th>}
                                                                           {hasCones && <th style={classic ? { ...thXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>Cones</th>}
                                                                           {hasDrums && <th style={classic ? { ...thXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>Drums</th>}
                                                                       </tr>
                                                                   </thead>
                                                                   <tbody>
                                                                       {rlines.map((rl: any) => (
                                                                           <tr key={rl.id}>
                                                                               <td style={classic ? tdXp : undefined} className={classic ? '' : 'fw-semibold text-dark'}>{rl.item_name || getItemName(rl.item_id)}</td>
                                                                               <td style={classic ? { ...tdXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>
                                                                                   <span style={classic ? { fontWeight: 'bold' } : undefined} className={classic ? '' : 'fw-bold'}>{rl.qty_received}</span>
                                                                                   <span style={{ marginLeft: 3, color: '#888', fontSize: '9px', textTransform: 'uppercase' }}>{rl.item_uom || getItemUom(rl.item_id)}</span>
                                                                               </td>
                                                                               {hasBoxes && <td style={classic ? { ...tdXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>{rl.qty_boxes != null ? rl.qty_boxes : <span style={{ color: '#bbb' }}>—</span>}</td>}
                                                                               {hasCones && <td style={classic ? { ...tdXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>{rl.qty_cones != null ? rl.qty_cones : <span style={{ color: '#bbb' }}>—</span>}</td>}
                                                                               {hasDrums && <td style={classic ? { ...tdXp, ...numR } : undefined} className={classic ? '' : 'text-end'}>{rl.qty_drums != null ? rl.qty_drums : <span style={{ color: '#bbb' }}>—</span>}</td>}
                                                                           </tr>
                                                                       ))}
                                                                   </tbody>
                                                               </table>
                                                           </div>
                                                       );
                                                   })}
                                               </div>
                                           )}
                                       </td>
                                   </tr>
                               )}
                               </>
                           ))}
                           {filteredOrders.length === 0 && (
                               <tr>
                                   <td
                                       colSpan={7}
                                       style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'center', padding: '24px 8px', color: '#888', fontStyle: 'italic' } : undefined}
                                       className={classic ? '' : 'text-center py-5 text-muted'}
                                   >
                                       {searchTerm || statusFilter !== 'ALL'
                                           ? 'No orders match the current filter.'
                                           : 'No Purchase Orders found. Create one to get started.'}
                                   </td>
                               </tr>
                           )}
                       </tbody>
                   </table>
               </div>
           </div>

           {/* ── Status bar ── */}
           {classic && (
               <div style={{
                   background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)',
                   borderTop: '1px solid #b0a898',
                   padding: '2px 8px',
                   display: 'flex',
                   gap: '12px',
                   fontFamily: 'Tahoma, Arial, sans-serif',
                   fontSize: '10px',
                   color: '#333',
               }}>
                   <span>{purchaseOrders.length} total</span>
                   <span>|</span>
                   <span>{purchaseOrders.filter((p: any) => p.status === 'DRAFT').length} draft</span>
                   <span>|</span>
                   <span>{purchaseOrders.filter((p: any) => p.status === 'RECEIVING').length} in progress</span>
                   <span>|</span>
                   <span>{purchaseOrders.filter((p: any) => p.status === 'RECEIVED').length} received</span>
               </div>
           )}
       </div>
    </div>
  );
}
