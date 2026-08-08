import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import CodeConfigModal, { CodeConfig, buildCodeWithCounter } from '../shared/CodeConfigModal';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import SearchableSelect from '../shared/SearchableSelect';
import ModalWrapper from '../shared/ModalWrapper';
const SalesPrintModal = dynamic(() => import('./SalesPrintModal'), { ssr: false });
const SOTablePrintModal = dynamic(() => import('./SOTablePrintModal'), { ssr: false });
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useData } from '../../context/DataContext';
import { useUser } from '../../context/UserContext';
import { useSortable, SortMark, StatusChip, statusTint, XPLoading, useFloatingMenu, MenuTriggerButton, FloatingMenu, FormSection, FieldLabel, xpBtn, xpInput as xpInputBase, CodeChip, CODE_FONT, xpFont } from '../shared/xpTheme';
import { useComboSearch } from '../shared/useEntitySearch';
import Pager from '../shared/Pager';
import { ShellWindow, ShellTitleBar, xpToolbar, SearchField, FilterChipBar, ToolbarCount } from '../shared/shellTheme';
import { useRouter } from 'next/navigation';
import { lvThead } from '../shared/listViewTheme';

const SO_PAGE_SIZE = 50;
// Sum of the twelve <th> widths below. Keep in step when a column is added or
// resized — it is the floor the table refuses to squeeze past before scrolling.
const SO_TABLE_MIN_WIDTH = 1342;

export default function SalesOrderView({ items, itemResults, onSearchItems, attributes, boms, salesOrders, partners, onCreateSO, onDeleteSO, onEditSO, onUpdateSOStatus, onGenerateWO, productionRuns }: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSOId, setEditingSOId] = useState<string | null>(null);
  const [printingSO, setPrintingSO] = useState<any>(null);
  const [isTablePrintOpen, setIsTablePrintOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [soPage, setSoPage] = useState(1);
  const { uiStyle: currentStyle } = useTheme();
  const { companyProfile, uoms, authFetch, itemIndex, loading: dataLoading } = useData();
  const { hasPermission, hasAnyPermission } = useUser();
  const canManage = hasAnyPermission('sales_order.create', 'sales_order.edit', 'sales_order.delete', 'sales_order.close');

  // Floating "more actions" menu (Edit / Print / Delete)
  const { openId: openMenuId, pos: menuPos, toggle: toggleMenu, close: closeMenu } = useFloatingMenu();

  // Lineage (SO → PR → MO → WO → beam) trace modal
  const router = useRouter();
  const lineageEnvBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
  const LINEAGE_API_BASE = lineageEnvBase.endsWith('/api') ? lineageEnvBase : `${lineageEnvBase}/api`;

  // Combo Library governs which combos are offered — server-searched (thousands of
  // combos won't fit in a client-rendered <select>), scoped to active combos only.
  const { results: comboResults, onSearch: onSearchCombos } = useComboSearch();
  const [lineageSO, setLineageSO] = useState<any>(null);
  const [lineageData, setLineageData] = useState<any>(null);
  const [lineageLoading, setLineageLoading] = useState(false);

  const openLineage = async (so: any) => {
    setLineageSO(so);
    setLineageData(null);
    setLineageLoading(true);
    try {
      const res = await authFetch(`${LINEAGE_API_BASE}/sales-orders/${so.id}/lineage`);
      if (res.ok) setLineageData(await res.json());
      else showToast('Failed to load lineage', 'danger');
    } catch {
      showToast('Failed to load lineage', 'danger');
    } finally {
      setLineageLoading(false);
    }
  };

  const closeLineage = () => { setLineageSO(null); setLineageData(null); };
  const goToMO = (code: string) => { closeLineage(); router.push(`/manufacturing-orders?mo=${encodeURIComponent(code)}`); };
  const goToPR = (code: string) => { closeLineage(); router.push(`/production-runs?pr=${encodeURIComponent(code)}`); };

  const lineageStatusBadge = (s: string) => {
    const { background: bg, borderColor: bd, color: fg } = statusTint(s);
    return (
      <span style={{ fontSize: '0.68rem', background: bg, border: `1px solid ${bd}`, color: fg, padding: '0 6px', borderRadius: classic ? 0 : 10, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
        {(s || 'PENDING').replace('_', ' ')}
      </span>
    );
  };

  // Clickable code chip (MO / PR). onClick navigates to the relevant page.
  // Deliberate exception to the CodeChip tiering: inside the lineage tree the tint
  // encodes WHICH ENTITY the code belongs to (green = PR, blue = MO), which is the
  // whole point of the view. Elsewhere a code must not carry a fill. Font stays on
  // CODE_FONT so it still matches the rest of the app.
  const lineageCodeChip = (code: string, onClick: () => void, scheme: 'mo' | 'pr') => {
    const colors = scheme === 'pr'
      ? { bg: '#e4f5e4', bd: '#90c090', fg: '#1a5e1a' }
      : { bg: '#dce8ff', bd: '#9ab0e0', fg: '#003ea6' };
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Open ${code}`}
        style={{
          fontFamily: CODE_FONT, fontWeight: 'bold', fontSize: '0.72rem',
          background: colors.bg, border: `1px solid ${colors.bd}`, color: colors.fg,
          padding: '1px 7px', borderRadius: classic ? 0 : 4, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(0.93)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
      >
        <i className={`bi ${scheme === 'pr' ? 'bi-collection-play' : 'bi-box'}`} style={{ fontSize: '0.7rem' }}></i>
        {code}
        <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.6rem', opacity: 0.6 }}></i>
      </button>
    );
  };

  const lineageChip = (text: React.ReactNode, bg: string, bd: string, fg: string, icon?: string) => (
    <span style={{ fontSize: '0.68rem', background: bg, border: `1px solid ${bd}`, color: fg, padding: '0 6px', borderRadius: classic ? 0 : 3, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {icon && <i className={`bi ${icon}`} style={{ fontSize: '0.62rem' }}></i>}{text}
    </span>
  );

  const lineageProgressBar = (pct: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ flex: 1, minWidth: 50, maxWidth: 130, height: 6, background: '#e4e4e4', borderRadius: 3, border: classic ? '1px solid #b0b0b0' : undefined, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#2d7a2d' : '#0058e6', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.66rem', fontFamily: CODE_FONT, color: '#666', minWidth: 28 }}>{pct}%</span>
    </div>
  );

  // Flatten an MO subtree into typed rows (mo / beam) with an indent level.
  // WOs are omitted (too many); their output beams are re-parented directly under the MO.
  const flattenMO = (mo: any, level: number, isComponent: boolean, out: any[]) => {
    out.push({ kind: 'mo', level, mo, isComponent });
    (mo.work_orders || []).forEach((wo: any) => {
      (wo.beams || []).forEach((bm: any) => out.push({ kind: 'beam', level: level + 1, beam: bm }));
    });
    (mo.component_mos || []).forEach((c: any) => flattenMO(c, level + 1, true, out));
    return out;
  };

  const lineageTd = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    padding: '3px 8px', borderBottom: classic ? '1px solid #e2dfd6' : '1px solid #eee',
    verticalAlign: 'middle', ...extra,
  });

  const renderLineageRow = (row: any, key: string) => {
    const indent = 6 + row.level * 16;
    const itemStyle: React.CSSProperties = { fontSize: '0.68rem', color: '#999' };
    if (row.kind === 'mo') {
      const mo = row.mo;
      const wos = mo.work_orders || [];
      const done = wos.filter((w: any) => w.status === 'COMPLETED').length;
      // DELIVERED = planned qty met (order merely not closed yet) — counts as done.
      const pct = wos.length ? Math.round((done / wos.length) * 100) : (['COMPLETED', 'DELIVERED'].includes(mo.status) ? 100 : 0);
      return (
        <tr key={key} style={{ background: row.isComponent ? (classic ? '#f3f6ff' : '#f7faff') : (classic ? '#fff' : undefined) }}>
          <td style={lineageTd({ paddingLeft: indent })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {lineageCodeChip(mo.code, () => goToMO(mo.code), 'mo')}
              {row.isComponent && lineageChip(`SHARED${mo.dep_qty != null ? ` · ${mo.dep_qty}` : ''}`, '#eef4ff', '#b8ccf0', '#003ea6', 'bi-diagram-2')}
            </div>
          </td>
          <td style={lineageTd()}><span style={itemStyle}>{mo.item_code}</span></td>
          <td style={lineageTd({ textAlign: 'right', fontFamily: CODE_FONT, fontSize: '0.72rem' })}>{mo.qty}</td>
          <td style={lineageTd()}>{lineageStatusBadge(mo.status)}</td>
          <td style={lineageTd({ minWidth: 120 })}>{lineageProgressBar(pct)}</td>
        </tr>
      );
    }
    // beam
    const bm = row.beam;
    return (
      <tr key={key}>
        <td style={lineageTd({ paddingLeft: indent })}>
          <span title={`Beam ${bm.batch_number}`} style={{ fontSize: '0.68rem', background: '#fdf3e0', border: '1px solid #e0c08a', color: '#8a5a00', padding: '1px 7px', borderRadius: classic ? 0 : 4, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <i className="bi bi-box-seam"></i><span style={{ fontFamily: CODE_FONT, fontWeight: 'bold' }}>{bm.batch_number}</span>
          </span>
        </td>
        <td style={lineageTd()}><span style={itemStyle}>{bm.item_code}{bm.ends != null ? ` · ${bm.ends}e` : ''}</span></td>
        <td style={lineageTd({ textAlign: 'right' })}></td>
        <td style={lineageTd()}>
          <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: bm.remaining > 0 ? '#1a5e1a' : '#999' }}>{bm.remaining > 0 ? `${bm.remaining} left` : 'depleted'}</span>
        </td>
        <td style={lineageTd()}></td>
      </tr>
    );
  };


  const classic = currentStyle === 'classic';

  // ── XP shared inline styles ──────────────────────────────────────────────
  // Local wrapper keeps this form's inset-shadow input treatment while sourcing
  // the base style from the shared xpTheme factory (was a hand-duplicated object).
  const xpInput = (extra: React.CSSProperties = {}): React.CSSProperties =>
      xpInputBase({ boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', ...extra });

  const xpSep: React.CSSProperties = {
      width: '1px',
      height: '20px',
      background: '#a0988c',
      margin: '0 2px',
      flexShrink: 0,
  };

  const xpTableHeader: React.CSSProperties = {
      ...lvThead(true),
      fontSize: '10px',
      fontWeight: 'bold',
      color: '#000000',
  };

  const xpThCell: React.CSSProperties = {
      padding: '3px 6px',
      borderRight: '1px solid #b0aaa0',
      textAlign: 'left' as const,
      whiteSpace: 'nowrap' as const,
      fontFamily: xpFont,
      position: 'sticky' as const,
      top: 0,
      zIndex: 5,
      ...lvThead(true)
  };

  const tdBase: React.CSSProperties = {
      padding: '4px 6px',
      borderRight: '1px solid #c0bdb5',
      borderBottom: '1px solid #d0cdc8',
      verticalAlign: 'middle' as const,
      fontFamily: xpFont,
      fontSize: '11px',
  };


  const [newSO, setNewSO] = useState({
      po_number: '',
      customer_po_ref: '',
      customer_name: '',
      order_date: new Date().toISOString().split('T')[0],
      lines: [] as any[]
  });

  const [newLine, setNewLine] = useState({
      item_id: '', qty: 0, due_date: '', attribute_value_ids: [] as string[],
      ket_stock: '', internal_confirmation_date: '', qty_kg: '', qty2: '', uom2: '',
      uom2_factor: null as number | null,
      bom_id: '',
      bom_size_id: '',
      color_id: '',
      color_label: '',
      color_hex: '',
      labdip_variant_code: '',
      labdip_item_id: '',
      labdip_label: '',
      // Customer ordered the shade but hasn't sent the physical swatch. Cleared
      // by editing the SO line once it arrives; display-only, gates nothing.
      no_color_swatch: false,
  });
  const [colorSearch, setColorSearch] = useState('');
  const [colorResults, setColorResults] = useState<any[]>([]);
  const [colorFocused, setColorFocused] = useState(false);
  // Pending shades (lab dips still in progress) for the selected item — orderable
  // before approval; the minted color backfills onto the MO once approved.
  const [labdipResults, setLabdipResults] = useState<any[]>([]);
  const [lastDeliveryDates, setLastDeliveryDates] = useState({ due_date: '', internal_confirmation_date: '' });
  const [qtyMeter, setQtyMeter] = useState('');
  const [qtyGrossYd, setQtyGrossYd] = useState('');
  const [kgAuto, setKgAuto] = useState(true);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'SO',
      suffix: '',
      separator: '-',
      includeItemCode: false,
      includeVariant: false,
      variantAttributeNames: [],
      includeYear: true,
      includeMonth: true
  });

  useEffect(() => {
      const savedConfig = localStorage.getItem('so_code_config');
      if (savedConfig) {
          try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
      }
  }, []);

  const handleSaveConfig = (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('so_code_config', JSON.stringify(newConfig));
      setNewSO(prev => ({ ...prev, po_number: suggestSOCode(newConfig) }));
  };

  const suggestSOCode = (config = codeConfig) => {
      let counter = 1;
      let code = buildCodeWithCounter(config, counter);
      while (salesOrders.some((s: any) => s.po_number === code)) {
          counter++;
          code = buildCodeWithCounter(config, counter);
      }
      return code;
  };

  useEffect(() => {
      if (isCreateOpen && !newSO.po_number) {
          setNewSO(prev => ({ ...prev, po_number: suggestSOCode() }));
      }
  }, [isCreateOpen]);

  const handleAddLine = () => {
      if (!newLine.item_id || newLine.qty <= 0) return;
      const variantErr = variantGateError(newLine);
      if (variantErr) { showToast(variantErr, 'warning'); return; }
      // With more than one candidate recipe the BOM picker is on screen and the
      // choice is real — an unpicked line would reach the PR pre-fill with nothing
      // to disambiguate it and silently land on an arbitrary recipe.
      const candidateBoms = getItemBoms(newLine.item_id, newLine.attribute_value_ids);
      if (candidateBoms.length > 1 && !newLine.bom_id) {
          showToast('This item has more than one BOM — select which one this line is ordered against.', 'warning');
          return;
      }
      // bom_id rides along to the server: one item can own several attribute-less
      // BOMs (a root per shade), so the pick is the only thing that says which
      // recipe was ordered. The PR pre-fill reads it back.
      setNewSO({ ...newSO, lines: [...newSO.lines, { ...newLine, bom_id: newLine.bom_id || null, bom_size_id: newLine.bom_size_id || null }] });
      const nextDates = { due_date: newLine.due_date, internal_confirmation_date: newLine.internal_confirmation_date };
      setLastDeliveryDates(nextDates);
      setNewLine({ item_id: '', qty: 0, due_date: nextDates.due_date, attribute_value_ids: [], ket_stock: '', internal_confirmation_date: nextDates.internal_confirmation_date, qty_kg: '', qty2: '', uom2: '', uom2_factor: null, bom_id: '', bom_size_id: '', color_id: '', color_label: '', color_hex: '', labdip_variant_code: '', labdip_item_id: '', labdip_label: '', no_color_swatch: false });
      setQtyMeter('');
      setQtyGrossYd('');
      setKgAuto(true);
  };

  // Toggle in place on an already-added line: the swatch usually arrives after
  // the order is placed, so unchecking must not mean remove-and-re-add.
  const handleLineSwatchToggle = (index: number) => {
      setNewSO(prev => ({
          ...prev,
          lines: prev.lines.map((l: any, i: number) => i === index ? { ...l, no_color_swatch: !l.no_color_swatch } : l),
      }));
  };

  const handleRemoveLine = (index: number) => {
      setNewSO({ ...newSO, lines: newSO.lines.filter((_, i) => i !== index) });
  };

  const handleLineDateChange = (index: number, field: 'due_date' | 'internal_confirmation_date', value: string) => {
      setNewSO(prev => ({
          ...prev,
          lines: prev.lines.map((l: any, i: number) => i === index ? { ...l, [field]: value } : l),
      }));
  };

  // Edit an already-added line's qty in place (no remove + re-add). Recomputes
  // the same length/weight derivatives Add Line would have produced.
  const handleLineQtyChange = (index: number, ydStr: string) => {
      const yd = parseFloat(ydStr) || 0;
      setNewSO(prev => ({
          ...prev,
          lines: prev.lines.map((l: any, i: number) => {
              if (i !== index) return l;
              const m = yd > 0 ? Math.round(yd * 0.9144 * 100) / 100 : 0;
              const kg = calcKgAuto(l.item_id, yd, m);
              return { ...l, qty: yd, qty_kg: kg !== null ? kg : l.qty_kg };
          }),
      }));
  };

  const comboAttr = (attributes || []).find((a: any) => a.system_role === 'combo');
  const colorAttr = (attributes || []).find((a: any) => a.system_role === 'color');

  // A variant FG ordered without its variant identity is unbuildable: a color line
  // with neither an approved color_id nor a pending lab dip code has no shade for
  // the DYEING recipe match, and a combo line with no Combo value can't pick a BOM.
  // Returns an error message, or null when the line is complete.
  const variantGateError = (line: any): string | null => {
      const vt = resolveItem(line.item_id)?.variant_type || '';
      if (vt === 'color' && !line.color_id && !line.labdip_variant_code) {
          return 'This is a color item — pick an approved color code or a pending lab dip code.';
      }
      if (vt === 'combo' && comboAttr) {
          const hasCombo = (line.attribute_value_ids || []).some((vid: string) => comboAttr.values?.some((v: any) => v.id === vid));
          if (!hasCombo) return 'This is a combo item — select a Combo before adding the line.';
      }
      return null;
  };

  const handleValueChange = (valId: string, attrId: string) => {
      const attr = attributes.find((a: any) => a.id === attrId);
      if (!attr) return;
      const otherValues = newLine.attribute_value_ids.filter(vid => !attr.values.some((v: any) => v.id === vid));
      const newAttrValues = valId ? [...otherValues, valId] : otherValues;
      // Changing Combo invalidates the current BOM selection; auto-pick if only one matches
      const comboChanged = comboAttr && comboAttr.id === attrId;
      let bomOverride: { bom_id?: string; bom_size_id?: string } = {};
      if (comboChanged) {
          const filteredBoms = getItemBoms(newLine.item_id, newAttrValues);
          bomOverride = { bom_id: filteredBoms.length === 1 ? filteredBoms[0].id : '', bom_size_id: '' };
      }
      setNewLine({ ...newLine, attribute_value_ids: newAttrValues, ...bomOverride });
  };

  // The item picker is a server-side, finished-goods-scoped typeahead (itemResults + onSearchItems),
  // so it scales past any client-side cap. Accumulate every item seen (the context page plus each
  // search page) into a cache so the creation modal's weight / attribute / BOM lookups keep
  // resolving items that fall outside the current search page.
  const [itemCache, setItemCache] = useState<Record<string, any>>({});
  useEffect(() => {
      const merge = (arr: any[]) => {
          if (!arr?.length) return;
          setItemCache(prev => { const n = { ...prev }; for (const it of arr) n[it.id] = it; return n; });
      };
      merge(items); merge(itemResults);
  }, [items, itemResults]);
  const resolveItem = (id: string) =>
      itemCache[id] || (items || []).find((i: any) => i.id === id) || (itemResults || []).find((i: any) => i.id === id);

  const getItemWeight = (id: string) => resolveItem(id)?.weight_per_unit ?? null;
  const getItemWeightUnit = (id: string): string => resolveItem(id)?.weight_unit ?? '';

  // Only g/y and g/m can auto-calculate KG from a length qty alone.
  // gsm / g/m² require fabric width, so auto-calc is disabled for those.
  const isAutoCalcSupported = (id: string) => {
      const w = getItemWeight(id);
      const unit = getItemWeightUnit(id);
      return !!w && (unit === 'g/y' || unit === 'g/m');
  };

  const calcKgAuto = (id: string, yd: number, m: number): string | null => {
      const w = getItemWeight(id);
      const unit = getItemWeightUnit(id);
      if (!w || yd <= 0) return null;
      if (unit === 'g/y') return String(Math.round(w * yd / 1000 * 1000) / 1000);
      if (unit === 'g/m' && m > 0) return String(Math.round(w * m / 1000 * 1000) / 1000);
      return null;
  };

  const calcYdFromKg = (id: string, kg: number): { yd: number; m: number } | null => {
      const w = getItemWeight(id);
      const unit = getItemWeightUnit(id);
      if (!w || kg <= 0) return null;
      if (unit === 'g/y') {
          const yd = Math.round(kg * 1000 / w * 100) / 100;
          const m = Math.round(yd * 0.9144 * 100) / 100;
          return { yd, m };
      }
      if (unit === 'g/m') {
          const m = Math.round(kg * 1000 / w * 100) / 100;
          const yd = Math.round(m / 0.9144 * 100) / 100;
          return { yd, m };
      }
      return null;
  };

  const handleLineItemChange = (val: string) => {
      const m = parseFloat(qtyMeter) || 0;
      const kg = kgAuto ? calcKgAuto(val, newLine.qty, m) : null;
      // Item change resets attributes, so no Combo filter yet — show all BOMs for item
      const itemBoms = (boms || []).filter((b: any) => b.item_id === val);
      const autoBomId = itemBoms.length === 1 ? itemBoms[0].id : '';
      setNewLine({ ...newLine, item_id: val, attribute_value_ids: [], bom_id: autoBomId, bom_size_id: '', color_id: '', color_label: '', color_hex: '', labdip_variant_code: '', labdip_item_id: '', labdip_label: '', no_color_swatch: false, qty_kg: kg !== null ? kg : newLine.qty_kg });
  };

  // Combo (system_role='combo') gates BOM selection: if a Combo value is chosen on
  // the SO line, only BOMs that carry that same Combo attribute value are shown.
  // All other attributes (e.g. Colors) remain annotations and do not filter BOMs.
  const getItemBoms = (itemId: string, attrValueIds: string[] = []) => {
      if (!boms || !itemId) return [];
      const forItem = boms.filter((b: any) => b.item_id === itemId);
      if (!comboAttr) return forItem;
      const comboValueId = attrValueIds.find(vid => comboAttr.values?.some((v: any) => v.id === vid));
      if (!comboValueId) return forItem;
      return forItem.filter((b: any) => (b.attribute_value_ids || []).map(String).includes(String(comboValueId)));
  };

  const getSelectedBom = (itemId: string, bomId: string, attrValueIds: string[] = []) => {
      const itemBoms = getItemBoms(itemId, attrValueIds);
      if (itemBoms.length === 1) return itemBoms[0];
      return itemBoms.find((b: any) => b.id === bomId) || null;
  };

  const formatBomSizeLabel = (bs: any): string => {
      const parts: string[] = [];
      const sizeName = bs.size_name || bs.size?.name;
      if (sizeName) parts.push(sizeName);
      if (bs.label) parts.push(bs.label);
      if (bs.target_measurement != null) {
          let meas = `${parseFloat(bs.target_measurement)}`;
          if (bs.measurement_min != null && bs.measurement_max != null) {
              meas += ` (${parseFloat(bs.measurement_min)}–${parseFloat(bs.measurement_max)})`;
          }
          parts.push(meas + ' cm');
      }
      return parts.join(' — ') || `Size ${bs.id.slice(0, 6)}`;
  };

  const getBomSizeLabelById = (bomSizeId: string): string => {
      if (!boms || !bomSizeId) return '';
      for (const bom of boms) {
          const bs = (bom.sizes || []).find((s: any) => s.id === bomSizeId);
          if (bs) return formatBomSizeLabel(bs);
      }
      return '';
  };

  const handleQtyYardChange = (ydStr: string) => {
      const yd = parseFloat(ydStr) || 0;
      const m = yd > 0 ? Math.round(yd * 0.9144 * 100) / 100 : 0;
      const gross = yd > 0 ? Math.round(yd / 144 * 10000) / 10000 : 0;
      setQtyMeter(m > 0 ? String(m) : '');
      setQtyGrossYd(gross > 0 ? String(gross) : '');
      const kg = kgAuto ? calcKgAuto(newLine.item_id, yd, m) : null;
      setNewLine({ ...newLine, qty: yd, qty_kg: kg !== null ? kg : newLine.qty_kg });
  };

  const handleQtyMeterChange = (mStr: string) => {
      setQtyMeter(mStr);
      const m = parseFloat(mStr) || 0;
      const yd = m > 0 ? Math.round(m / 0.9144 * 100) / 100 : 0;
      const gross = yd > 0 ? Math.round(yd / 144 * 10000) / 10000 : 0;
      setQtyGrossYd(gross > 0 ? String(gross) : '');
      const kg = kgAuto ? calcKgAuto(newLine.item_id, yd, m) : null;
      setNewLine({ ...newLine, qty: yd, qty_kg: kg !== null ? kg : newLine.qty_kg });
  };

  const handleQtyGrossYdChange = (grossStr: string) => {
      setQtyGrossYd(grossStr);
      const gross = parseFloat(grossStr) || 0;
      const yd = gross > 0 ? Math.round(gross * 144 * 100) / 100 : 0;
      const m = yd > 0 ? Math.round(yd * 0.9144 * 100) / 100 : 0;
      setQtyMeter(m > 0 ? String(m) : '');
      const kg = kgAuto ? calcKgAuto(newLine.item_id, yd, m) : null;
      setNewLine({ ...newLine, qty: yd, qty_kg: kg !== null ? kg : newLine.qty_kg });
  };

  const toggleKgAuto = () => {
      const newAuto = !kgAuto;
      setKgAuto(newAuto);
      if (newAuto) {
          const m = parseFloat(qtyMeter) || 0;
          const kg = calcKgAuto(newLine.item_id, newLine.qty, m);
          if (kg !== null) setNewLine(prev => ({ ...prev, qty_kg: kg }));
      }
  };

  const handleQtyKgChange = (kgStr: string) => {
      setNewLine(prev => ({ ...prev, qty_kg: kgStr }));
      if (!kgAuto) return;
      const kg = parseFloat(kgStr) || 0;
      const result = calcYdFromKg(newLine.item_id, kg);
      if (!result) return;
      const { yd, m } = result;
      const gross = yd > 0 ? Math.round(yd / 144 * 10000) / 10000 : 0;
      setQtyMeter(m > 0 ? String(m) : '');
      setQtyGrossYd(gross > 0 ? String(gross) : '');
      setNewLine(prev => ({ ...prev, qty_kg: kgStr, qty: yd }));
  };

  const applyFactor = (qty2Str: string, factorVal: number | null) => {
      const qty2 = parseFloat(qty2Str as string) || 0;
      if (!factorVal || qty2 <= 0) return;
      const uomObj = uoms.find((u: any) => u.name === newLine.uom2);
      const factorObj = (uomObj?.factors || []).find((f: any) => parseFloat(f.value) === factorVal);
      const toUnit = (factorObj?.to_uom_name || '').toLowerCase();
      const rawQty = qty2 * factorVal;
      const yd = toUnit === 'm' || toUnit === 'meter'
          ? Math.round(rawQty / 0.9144 * 100) / 100
          : Math.round(rawQty * 100) / 100;
      const m = Math.round(yd * 0.9144 * 100) / 100;
      const gross = Math.round(yd / 144 * 10000) / 10000;
      setQtyMeter(m > 0 ? String(m) : '');
      setQtyGrossYd(gross > 0 ? String(gross) : '');
      const kg = kgAuto ? calcKgAuto(newLine.item_id, yd, m) : null;
      setNewLine(prev => ({ ...prev, qty: yd, qty_kg: kg !== null ? kg : prev.qty_kg }));
  };

  const handleQty2Change = (val: string) => {
      setNewLine(prev => ({ ...prev, qty2: val }));
      applyFactor(val, newLine.uom2_factor);
  };

  const handleUom2FactorChange = (factorStr: string) => {
      const factorVal = factorStr ? parseFloat(factorStr) : null;
      setNewLine(prev => ({ ...prev, uom2_factor: factorVal }));
      applyFactor(newLine.qty2, factorVal);
  };

  const resetForm = () => {
      setNewSO({ po_number: '', customer_po_ref: '', customer_name: '', order_date: new Date().toISOString().split('T')[0], lines: [] });
      setLastDeliveryDates({ due_date: '', internal_confirmation_date: '' });
      setNewLine({ item_id: '', qty: 0, due_date: '', attribute_value_ids: [], ket_stock: '', internal_confirmation_date: '', qty_kg: '', qty2: '', uom2: '', uom2_factor: null, bom_id: '', bom_size_id: '', color_id: '', color_label: '', color_hex: '', labdip_variant_code: '', labdip_item_id: '', labdip_label: '', no_color_swatch: false });
      setQtyMeter('');
      setQtyGrossYd('');
      setKgAuto(true);
  };

  const handleEditOpen = (so: any) => {
      setEditingSOId(so.id);
      setNewSO({
          po_number: so.po_number,
          customer_po_ref: so.customer_po_ref || '',
          customer_name: so.customer_name,
          order_date: so.order_date ? so.order_date.split('T')[0] : new Date().toISOString().split('T')[0],
          lines: (so.lines || []).map((l: any) => ({
              item_id: l.item_id,
              qty: l.qty,
              due_date: l.due_date ? l.due_date.split('T')[0] : '',
              internal_confirmation_date: l.internal_confirmation_date ? l.internal_confirmation_date.split('T')[0] : '',
              ket_stock: l.ket_stock || '',
              qty_kg: l.qty_kg != null ? String(l.qty_kg) : '',
              qty2: l.qty2 != null ? String(l.qty2) : '',
              uom2: l.uom2 || '',
              uom2_factor: l.uom2_factor ?? null,
              bom_id: l.bom_id || '',
              bom_size_id: l.bom_size_id || '',
              attribute_value_ids: l.attribute_value_ids || [],
              color_id: l.color_id || '',
              color_label: l.color_code ? `${l.color_code}${l.color_name ? ' — ' + l.color_name : ''}` : '',
              color_hex: l.color_hex || '',
              labdip_variant_code: l.labdip_variant_code || '',
              labdip_item_id: l.labdip_item_id || '',
              labdip_label: l.labdip_variant_code ? `${l.labdip_variant_code}${l.labdip_status ? ' · ' + l.labdip_status : ''}` : '',
              no_color_swatch: !!l.no_color_swatch,
          })),
      });
      setLastDeliveryDates({ due_date: '', internal_confirmation_date: '' });
      setIsCreateOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      // Re-check every line, not just the one being typed: edit mode loads lines
      // saved before this gate existed, and an item's variant_type can change.
      for (let i = 0; i < newSO.lines.length; i++) {
          const err = variantGateError(newSO.lines[i]);
          if (err) { showToast(`Line ${i + 1} (${getItemCode(newSO.lines[i].item_id, newSO.lines[i].item_code)}): ${err}`, 'warning'); return; }
      }
      const payload = {
          ...newSO,
          customer_po_ref: newSO.customer_po_ref || null,
          order_date: newSO.order_date || null,
          lines: newSO.lines.map((line: any) => {
              const { color_label, color_hex, labdip_label, ...rest } = line;
              return {
                  ...rest,
                  due_date: line.due_date || null,
                  internal_confirmation_date: line.internal_confirmation_date || null,
                  qty_kg: line.qty_kg !== '' ? parseFloat(line.qty_kg) || null : null,
                  qty2: line.qty2 !== '' ? parseFloat(line.qty2) || null : null,
                  bom_size_id: line.bom_size_id || null,
                  color_id: line.color_id || null,
                  labdip_variant_code: line.labdip_variant_code || null,
                  labdip_item_id: line.labdip_item_id || null,
                  no_color_swatch: !!line.no_color_swatch,
              };
          })
      };

      if (editingSOId) {
          const res = await onEditSO(editingSOId, payload);
          if (res && res.ok) {
              setEditingSOId(null);
              resetForm();
              setIsCreateOpen(false);
              showToast('Sales Order updated successfully', 'success');
          } else if (res) {
              const err = await res.json();
              showToast(`Error: ${err.detail}`, 'danger');
          }
          return;
      }

      const res = await onCreateSO(payload);
      if (res && res.status === 400) {
          let basePO = newSO.po_number;
          const baseMatch = basePO.match(/^(.*)-(\d+)$/);
          if (baseMatch) basePO = baseMatch[1];
          let counter = 1;
          let suggestedPO = `${basePO}-${counter}`;
          while (salesOrders.some((s: any) => s.po_number === suggestedPO)) { counter++; suggestedPO = `${basePO}-${counter}`; }
          showToast(`PO# "${newSO.po_number}" already exists. Suggesting: ${suggestedPO}`, 'warning');
          setNewSO({ ...newSO, po_number: suggestedPO });
      } else if (res && res.ok) {
          setNewSO({ po_number: '', customer_po_ref: '', customer_name: '', order_date: new Date().toISOString().split('T')[0], lines: [] });
          setLastDeliveryDates({ due_date: '', internal_confirmation_date: '' });
          setIsCreateOpen(false);
          showToast('Sales Order created successfully', 'success');
      }
  };

  const getItemName = (id: string, embedded?: string) => resolveItem(id)?.name || embedded || itemIndex?.[String(id)]?.name || id;
  const getItemCode = (id: string, embedded?: string) => resolveItem(id)?.code || embedded || itemIndex?.[String(id)]?.code || id;
  const isSample = (id: string) => resolveItem(id)?.category === 'Sample';

  const { formatDate: tzDate, formatCustom: tzFmt } = useTimezone();

  const formatDate = (date: string | null) => {
      if (!date) return '—';
      return tzDate(date);
  };

  const formatShortDate = (date: string | null | undefined) => {
      if (!date) return '';
      try {
          return tzFmt(date, { day: '2-digit', month: '2-digit' }, 'en-GB');
      } catch { return ''; }
  };

  // Variant picker source is driven by the finished-good's variant_type:
  //   'combo' -> the Combo attribute dropdown (gates BOM, unchanged)
  //   'color' -> BOTH the Color Library typeahead (color_id, drives dyeing recipe match)
  //              AND the registered Colors attribute dropdown (attribute_value_ids,
  //              the actual product variant — e.g. Item-A-Black-318)
  //   null    -> no variant picker
  const currentItem = resolveItem(newLine.item_id);
  const currentVariantType: string = currentItem?.variant_type || '';
  const currentBoundAttrs = currentVariantType === 'combo' && comboAttr ? [comboAttr]
      : currentVariantType === 'color' && colorAttr ? [colorAttr]
      : [];

  // Variant gate on the line being composed — greys out Add Line and says why.
  const newLineVariantErr = newLine.item_id ? variantGateError(newLine) : null;
  const addLineDisabled = !newLine.item_id || newLine.qty <= 0 || !!newLineVariantErr;
  const addLineTitle = !newLine.item_id ? 'Select an item first'
      : newLine.qty <= 0 ? 'Enter Qty (Yd) first'
      : newLineVariantErr || 'Add item to order';

  // Color Library typeahead — server-side search (30k+ shades can't be client-cached).
  useEffect(() => {
      if (currentVariantType !== 'color') { setColorResults([]); return; }
      const q = colorSearch.trim();
      const h = setTimeout(async () => {
          try {
              const res = await authFetch(`${LINEAGE_API_BASE}/colors?search=${encodeURIComponent(q)}&size=20`);
              if (res.ok) {
                  const data = await res.json();
                  setColorResults(Array.isArray(data) ? data : (data.items || []));
              }
          } catch { /* transient */ }
      }, 300);
      return () => clearTimeout(h);
  }, [colorSearch, currentVariantType]);

  // Pending lab dip shades for the selected item — orderable before approval.
  useEffect(() => {
      if (currentVariantType !== 'color' || !newLine.item_id) { setLabdipResults([]); return; }
      let cancelled = false;
      (async () => {
          try {
              const res = await authFetch(`${LINEAGE_API_BASE}/lab-dips/pending-variants?item_id=${encodeURIComponent(newLine.item_id)}`);
              if (res.ok && !cancelled) setLabdipResults(await res.json());
          } catch { /* transient */ }
      })();
      return () => { cancelled = true; };
  }, [newLine.item_id, currentVariantType]);

  const selectColor = (c: any) => {
      // Approved shade clears any pending lab dip selection (mutually exclusive).
      setNewLine(prev => ({ ...prev, color_id: c.id, color_label: `${c.code}${c.name ? ' — ' + c.name : ''}`, color_hex: c.hex || '', labdip_variant_code: '', labdip_item_id: '', labdip_label: '' }));
      setColorSearch('');
      setColorResults([]);
  };
  const clearColor = () => setNewLine(prev => ({ ...prev, color_id: '', color_label: '', color_hex: '' }));

  const selectLabdip = (v: any) => {
      // Pending shade clears any approved color (mutually exclusive).
      setNewLine(prev => ({ ...prev, labdip_variant_code: v.variant_code, labdip_item_id: v.labdip_item_id, labdip_label: `${v.variant_code} (${v.request_code || 'lab dip'} · ${v.status})`, color_id: '', color_label: '', color_hex: '' }));
      setColorSearch('');
      setColorResults([]);
  };
  const clearLabdip = () => setNewLine(prev => ({ ...prev, labdip_variant_code: '', labdip_item_id: '', labdip_label: '' }));

  const getAttributeValueName = (valId: string) => {
      for (const attr of attributes) {
          const val = attr.values.find((v: any) => v.id === valId);
          if (val) return val.value;
      }
      return valId;
  };

  const getAttributeValueHex = (valId: string): string | null => {
      for (const attr of attributes) {
          const val = attr.values?.find((v: any) => v.id === valId);
          if (val) return val.hex || null;
      }
      return null;
  };

  // Splits a line's attribute_value_ids into "registered color variant" chips
  // (the Colors-attribute value, e.g. Black-318) vs plain-text attrs (size, etc.),
  // and builds a matching chip for the Color Library code if present.
  // A pending lab dip code is the line's colour identity until approval backfills
  // color_id, so it renders as a chip in the same row (amber) instead of vanishing.
  const buildVariantChips = (attrIds: string[], colorLabel?: string | null, colorHex?: string | null, pendingLabdip?: string | null) => {
      const colorValId = colorAttr ? attrIds.find(vid => colorAttr.values?.some((v: any) => v.id === vid)) : undefined;
      const plainIds = attrIds.filter(vid => vid !== colorValId);
      const chips: { label: string; hex: string | null; pending?: boolean }[] = [];
      if (colorValId) chips.push({ label: getAttributeValueName(colorValId), hex: getAttributeValueHex(colorValId) });
      if (colorLabel) chips.push({ label: colorLabel, hex: colorHex || null });
      else if (pendingLabdip) chips.push({ label: pendingLabdip, hex: null, pending: true });
      return { chips, plainIds };
  };

  const renderChipRow = (chips: { label: string; hex: string | null; pending?: boolean }[]) => (
      <div style={{display:'flex',flexWrap:'wrap' as const,gap:4,marginTop:2}}>
          {chips.map((c, i) => (
              <span key={i} title={c.pending ? 'Pending lab dip — colour not approved yet' : undefined}
                  style={{display:'inline-flex',alignItems:'center',gap:4,
                  background:c.pending?(classic?'#fff5d6':'#fff8e1'):(classic?'#f0ede4':'#eef1f4'),
                  border:c.pending?'1px solid #c8a000':(classic?'1px solid #b0a898':'1px solid #dee2e6'),
                  borderRadius:classic?0:10,
                  padding:'1px 6px 1px 4px',
                  fontSize:'9px',
                  fontFamily:classic?xpFont:undefined,
                  color:c.pending?'#8a6d00':(classic?'#333':'#495057')}}>
                  {c.pending && <i className="bi bi-eyedropper" style={{fontSize:'8px'}}></i>}
                  {c.hex && <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,display:'inline-block',background:c.hex,border:'1px solid rgba(0,0,0,0.25)'}}></span>}
                  {c.label}
              </span>
          ))}
      </div>
  );

  // --- Per-line fulfilment (derived server-side by so_fulfilment_service) ---
  // made >= packed >= in-stock/shipped, so the three are drawn as nested stages on
  // one track rather than stacked segments — they are not additive.
  const lineFulfilment = (line: any) => {
      const ordered = Number(line.qty) || 0;
      const made = Number(line.qty_made) || 0;
      const packed = Number(line.qty_packed) || 0;
      const available = Number(line.qty_packed_available) || 0;
      const shipped = Number(line.qty_dispatched) || 0;
      const pct = (v: number) => (ordered > 0 ? Math.min(100, Math.round((v / ordered) * 100)) : 0);
      return { ordered, made, packed, available, shipped, pct,
          // Shippable = cartons actually in stock. Dispatched stock has left, so a
          // shipped line reads complete off `shipped`, not off what remains.
          isReady: ordered > 0 && (available >= ordered - 0.0001 || shipped >= ordered - 0.0001) };
  };

  const isLineLate = (line: any) => {
      if (!line.due_date) return false;
      const f = lineFulfilment(line);
      if (f.isReady) return false;
      const due = new Date(line.due_date);
      return !isNaN(due.getTime()) && due.getTime() < Date.now();
  };

  // Pro-rata `made` splits produce values like 1.6666666666666665 — clamp the
  // display to 2dp and drop trailing zeros so whole numbers stay whole.
  const fmtQty = (v: number) => (Math.round(v * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const fulfilmentCell = (line: any) => {
      const f = lineFulfilment(line);
      if (f.ordered <= 0) return <span style={{ fontFamily:xpFont, fontSize:'9px', color:'#ccc' }}>—</span>;
      const seg = (width: number, color: string, z: number) => (
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${width}%`, background:color, zIndex:z }} />
      );
      const title = `Made ${fmtQty(f.made)} · Packed ${fmtQty(f.packed)} · In stock ${fmtQty(f.available)} · Shipped ${fmtQty(f.shipped)} — of ${fmtQty(f.ordered)} ordered`;
      return (
          <div title={title} style={{ display:'flex', flexDirection:'column', gap:2, minWidth:78 }}>
              <div style={{ position:'relative', height:6, background: classic ? '#e8e5dd' : '#eceff1',
                  border: classic ? '1px solid #b0a898' : '1px solid #dde2e6', borderRadius: classic ? 0 : 3, overflow:'hidden' }}>
                  {seg(f.pct(f.made), classic ? '#c3ccdb' : '#cbd5e1', 1)}
                  {seg(f.pct(f.packed), classic ? '#5a9ae0' : '#3b82f6', 2)}
                  {seg(f.pct(f.shipped), classic ? '#2d7a2d' : '#16a34a', 3)}
              </div>
              <div style={{ fontFamily:xpFont, fontSize:'9px', color: f.isReady ? (classic ? '#1a5e1a' : '#166534') : '#777' }}>
                  {f.shipped > 0
                      ? `${fmtQty(f.shipped)} shipped`
                      : f.packed > 0
                          ? `${fmtQty(f.available)} packed`
                          : f.made > 0 ? `${fmtQty(f.made)} made` : 'not started'}
              </div>
          </div>
      );
  };

  const handlePrintSO = (so: any) => {
      setPrintingSO(so);
  };

  const customers = partners.filter((p: any) => p.type === 'CUSTOMER' && p.active);
  // SO lines can only order Finished Goods — raw/WIP/sample/chemical items are not orderable.
  // Items expose category_path (root-first list of names), not a flat category string.
  // Picker options come from the server typeahead page (already Finished-Goods-scoped);
  // the defensive category filter keeps it correct even if the server contract changes.
  const finishedGoodsItems = useMemo(
      () => (itemResults || []).filter((i: any) => (i.category_path || []).includes('Finished Goods')),
      [itemResults]
  );
  const STATUS_FILTERS = ['ALL', 'PENDING', 'READY', 'PARTIAL', 'SENT', 'DELIVERED'];

  const filteredOrders = salesOrders.filter((so: any) => {
      const matchPO = !searchTerm ||
          so.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (so.customer_po_ref || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCustomer = !customerSearch ||
          so.customer_name.toLowerCase().includes(customerSearch.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || so.status === statusFilter;
      return matchPO && matchCustomer && matchStatus;
  });

  const soSortCols = useMemo(() => ({
      po:       (so: any) => so.po_number,
      customer: (so: any) => so.customer_name,
      date:     (so: any) => so.order_date,
      status:   (so: any) => so.status,
  }), []);
  const { sorted: sortedOrders, sort: soSort, toggle: toggleSOSort } = useSortable(filteredOrders, soSortCols);

  // Client-side pagination by order (not raw table row — each SO expands into
  // its own line rows via rowSpan, so the page window slices sortedOrders).
  useEffect(() => { setSoPage(1); }, [searchTerm, customerSearch, statusFilter]);
  const soPageCount = Math.max(1, Math.ceil(sortedOrders.length / SO_PAGE_SIZE));
  const clampedSoPage = Math.min(soPage, soPageCount);
  const pageOrders = sortedOrders.slice((clampedSoPage - 1) * SO_PAGE_SIZE, clampedSoPage * SO_PAGE_SIZE);



  return (
    <>
       {/* Table Print Modal */}
       {isTablePrintOpen && (
           <SOTablePrintModal
               salesOrders={filteredOrders}
               onClose={() => setIsTablePrintOpen(false)}
               currentStyle={currentStyle}
               companyProfile={companyProfile}
               items={items}
               attributes={attributes}
               partners={partners}
           />
       )}

       {/* Single SO Print Modal */}
       {printingSO && (
           <SalesPrintModal
               so={printingSO}
               onClose={() => setPrintingSO(null)}
               currentStyle={currentStyle}
               companyProfile={companyProfile}
               items={items}
               attributes={attributes}
               partners={partners}
           />
       )}

       {/* Production Lineage Modal — SO → PR → MO → WO → beams */}
       {(lineageSO || lineageData) && (
           <ModalWrapper
               isOpen={!!(lineageSO || lineageData)}
               onClose={() => { setLineageSO(null); setLineageData(null); }}
               title={<>
                   <i className="bi bi-diagram-3 me-2"></i>Production Lineage — {lineageSO?.po_number}
                   {lineageSO?.customer_name && <span style={{ fontWeight: 'normal', fontSize: '0.85em', marginLeft: 8, opacity: 0.9 }}>{lineageSO.customer_name}</span>}
               </>}
               size="xxl"
               modeless
               footer={<button className={classic ? '' : 'btn btn-sm btn-secondary'} style={classic ? xpBtn() : undefined} onClick={() => { setLineageSO(null); setLineageData(null); }}>Close</button>}
           >
                       <div style={{ fontSize: classic ? 12 : 13, fontFamily: classic ? xpFont : undefined }}>
                           {lineageLoading && <p className="text-muted">Loading lineage...</p>}
                           {!lineageLoading && lineageData && (lineageData.production_runs || []).length === 0 && (
                               <p className="text-muted">No Production Runs created from this Sales Order yet. Everything produced for this order will appear here once a PR is created.</p>
                           )}
                           {!lineageLoading && lineageData && (lineageData.production_runs || []).map((pr: any) => {
                               const prMos = pr.manufacturing_orders || [];
                               const rows: any[] = [];
                               prMos.forEach((mo: any) => flattenMO(mo, 0, false, rows));
                               (pr.unpegged_components || []).forEach((mo: any) => flattenMO(mo, 0, true, rows));
                               // Header progress counts EVERY MO in the run — roots plus nested
                               // and unpegged shared components — not just the root MOs, so the
                               // bar matches the rows the user actually sees below it.
                               const allMoRows = rows.filter((r: any) => r.kind === 'mo');
                               const prTotal = allMoRows.length;
                               const prDone = allMoRows.filter((r: any) => ['COMPLETED', 'DELIVERED'].includes(r.mo.status)).length;
                               const prPct = prTotal ? Math.round((prDone / prTotal) * 100) : 0;
                               const thStyle: React.CSSProperties = {
                                   padding: '3px 8px', fontSize: classic ? '0.66rem' : '0.7rem', fontWeight: 'bold',
                                   color: '#555', textAlign: 'left', borderBottom: classic ? '1px solid #b8c4de' : '1px solid #dbe5f5', whiteSpace: 'nowrap',
                               };
                               const sectBorder = classic ? '1px solid #b8c4de' : '1px solid #dbe5f5';
                               return (
                               <div key={pr.id} style={{ marginBottom: 16 }}>
                                   {/* PR section header bar */}
                                   <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 8px', background: classic ? '#e3ebf8' : '#eef3fb', border: sectBorder, borderBottom: 'none' }}>
                                       {lineageCodeChip(pr.code, () => goToPR(pr.code), 'pr')}
                                       {lineageStatusBadge(pr.status)}
                                       <span style={{ color: '#777', fontSize: '0.72rem' }}>{prDone}/{prTotal} MO done</span>
                                       <div style={{ flex: 1, minWidth: 80, maxWidth: 180, height: 8, background: '#e4e4e4', borderRadius: 4, overflow: 'hidden' }}>
                                           <div style={{ height: '100%', width: `${prPct}%`, background: prPct === 100 ? '#2d7a2d' : '#0058e6' }} />
                                       </div>
                                       <span style={{ fontSize: '0.7rem', fontFamily: CODE_FONT, color: '#555' }}>{prPct}%</span>
                                   </div>
                                   {rows.length === 0 ? (
                                       <div style={{ padding: '8px', color: '#999', fontStyle: 'italic', border: sectBorder }}>No manufacturing orders.</div>
                                   ) : (
                                       <table style={{ width: '100%', borderCollapse: 'collapse', border: sectBorder }}>
                                           <thead>
                                               <tr style={{ background: classic ? '#f0ede4' : '#f7f7f7' }}>
                                                   <th style={thStyle}>Order / Step</th>
                                                   <th style={thStyle}>Item</th>
                                                   <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                                                   <th style={thStyle}>Status</th>
                                                   <th style={thStyle}>Progress</th>
                                               </tr>
                                           </thead>
                                           <tbody>
                                               {rows.map((row: any, ri: number) => renderLineageRow(row, `${pr.id}-${ri}`))}
                                           </tbody>
                                       </table>
                                   )}
                               </div>
                               );
                           })}
                       </div>
           </ModalWrapper>
       )}

       <CodeConfigModal
           isOpen={isConfigOpen}
           onClose={() => setIsConfigOpen(false)}
           type="SO"
           onSave={handleSaveConfig}
           initialConfig={codeConfig}
           attributes={attributes}
       />


       {/* Create / Edit SO Modal */}
       <ModalWrapper
           isOpen={isCreateOpen}
           modeless
           onClose={() => { setIsCreateOpen(false); setEditingSOId(null); resetForm(); }}
           title={<><i className={`bi ${editingSOId ? 'bi-pencil' : 'bi-cart-plus'}`} style={classic ? {marginRight:6} : {marginRight:8}}></i>{editingSOId ? 'Edit Sales Order' : 'Create Sales Order'}</>}
           variant="primary"
           size="lg"
           footer={classic ? (
               <>
                   <button type="button" style={xpBtn()} onClick={() => { setIsCreateOpen(false); setEditingSOId(null); resetForm(); }}>{t('cancel')}</button>
                   <button type="button" style={newSO.lines.length === 0 ? {...xpBtn(), opacity: 0.5} : xpBtn({background:'linear-gradient(to bottom,#316ac5,#1a4a8a)',borderColor:'#1a3a7a #0a2a5a #0a2a5a #1a3a7a',color:'#ffffff',fontWeight:'bold',padding:'2px 16px'})} onClick={handleSubmit as any} disabled={newSO.lines.length === 0} title={newSO.lines.length === 0 ? 'Add at least one item first' : undefined}><i className="bi bi-floppy" style={{marginRight:4}}></i>{editingSOId ? 'Update' : t('save')} Order</button>
               </>
           ) : (
               <>
                   <button type="button" className="btn btn-sm btn-link text-muted" onClick={() => { setIsCreateOpen(false); setEditingSOId(null); resetForm(); }}>{t('cancel')}</button>
                   <button type="button" className="btn btn-sm btn-primary px-4 fw-bold" onClick={handleSubmit as any} disabled={newSO.lines.length === 0} title={newSO.lines.length === 0 ? 'Add at least one item first' : undefined}>{editingSOId ? 'Update' : t('save')} Order</button>
               </>
           )}
       >
           <form onSubmit={handleSubmit} id="create-so-form">
               <FormSection title="① Order Details" classic={classic}>
               <div className="row g-3">
                   <div className="col-md-4">
                       <FieldLabel classic={classic} right={<i className="bi bi-gear-fill" style={{cursor:'pointer',color:classic?'#555':'',fontSize:classic?'11px':''}} onClick={() => setIsConfigOpen(true)} title="Configure Auto-Suggestion"></i>}>Ref No. (PO#)</FieldLabel>
                       <input className="form-control" style={classic ? xpInput() : undefined} placeholder="Auto-generated" value={newSO.po_number} onChange={e => setNewSO({...newSO, po_number: e.target.value})} required />
                   </div>
                   <div className="col-md-4">
                       <FieldLabel classic={classic}>Customer PO Ref</FieldLabel>
                       <input className="form-control" style={classic ? xpInput() : undefined} placeholder="Customer's own PO reference" value={newSO.customer_po_ref} onChange={e => setNewSO({...newSO, customer_po_ref: e.target.value})} />
                   </div>
                   <div className="col-md-4">
                       <FieldLabel classic={classic}>Date</FieldLabel>
                       <input type="date" className="form-control" style={classic ? xpInput({width:'100%',height:'22px'}) : undefined} value={newSO.order_date} onChange={e => setNewSO({...newSO, order_date: e.target.value})} required />
                   </div>
                   <div className="col-md-12">
                       <FieldLabel classic={classic}>Customer</FieldLabel>
                       <SearchableSelect
                           options={customers.map((c: any) => ({ value: c.name, label: c.name, subLabel: c.address }))}
                           value={newSO.customer_name}
                           onChange={(val) => setNewSO({...newSO, customer_name: val})}
                           placeholder="Select Customer…"
                           required
                       />
                   </div>
               </div>
               </FormSection>

               <FormSection title="② Line Items" classic={classic}>
                   {/* Item selector — full width */}
                   <div className="row g-2 mb-2">
                       <div className="col-12">
                           <FieldLabel classic={classic} right={
                               <span
                                   title="Only items in the Finished Goods category can be ordered"
                                   style={{
                                       fontFamily: xpFont, fontSize: classic ? '9px' : '10px',
                                       fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4px',
                                       background: classic ? '#e8f5e9' : '#e8f5e9', border: '1px solid #2e7d32',
                                       color: '#1b4620', padding: '0 5px', borderRadius: classic ? 0 : 3, whiteSpace: 'nowrap',
                                   }}
                               >
                                   Finished Goods only
                               </span>
                           }>Item</FieldLabel>
                           <SearchableSelect
                               options={finishedGoodsItems.map((item: any) => ({ value: item.id, label: item.name, subLabel: item.code }))}
                               value={newLine.item_id}
                               onChange={handleLineItemChange}
                               onSearch={onSearchItems}
                               placeholder="Select Item…"
                           />
                       </div>

                       {/* 2-column qty / dates grid */}
                       <div className="col-12">
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: classic ? 6 : 10 }}>

                               {/* Left: Qty inputs panel */}
                               <div style={{ background: classic ? '#f8f7f2' : 'rgba(0,0,0,0.02)', border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: classic ? '6px 8px' : '10px 12px' }}>

                                   {/* LENGTH GROUP */}
                                   <div style={classic ? { border: '1px solid #a0988c', padding: '4px 8px 8px', marginBottom: 8, position: 'relative' } : { marginBottom: 10 }}>
                                       {classic
                                           ? <span style={{ position: 'absolute', top: -7, left: 8, background: '#f8f7f2', padding: '0 4px', fontSize: '10px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase' as const, letterSpacing: '0.4px', fontFamily: xpFont }}>Length</span>
                                           : <div className="text-muted fw-bold mb-2" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Length</div>
                                       }
                                       <div style={{ paddingTop: classic ? 4 : 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: classic ? 5 : 8 }}>
                                           <div>
                                               <FieldLabel classic={classic}>Yard</FieldLabel>
                                               <input type="number" className="form-control" style={classic ? xpInput({width:'100%'}) : undefined} placeholder="0" value={newLine.qty || ''} onChange={e => handleQtyYardChange(e.target.value)} />
                                           </div>
                                           <div>
                                               <FieldLabel classic={classic}>Meter</FieldLabel>
                                               <input type="number" className="form-control" style={classic ? xpInput({width:'100%'}) : undefined} placeholder="0" value={qtyMeter} onChange={e => handleQtyMeterChange(e.target.value)} />
                                           </div>
                                           <div>
                                               <FieldLabel classic={classic}><span style={{ whiteSpace: 'nowrap' }}>Gross Yd <span style={{ fontWeight: 'normal', fontSize: '10px', color: '#888' }}>(144 yd)</span></span></FieldLabel>
                                               <input type="number" className="form-control" style={classic ? xpInput({width:'100%'}) : undefined} placeholder="0" value={qtyGrossYd} onChange={e => handleQtyGrossYdChange(e.target.value)} />
                                           </div>
                                       </div>
                                   </div>

                                   {/* WEIGHT GROUP */}
                                   <div style={classic ? { border: '1px solid #a0988c', padding: '4px 8px 8px', marginBottom: 8, position: 'relative' } : { marginBottom: 10 }}>
                                       {classic
                                           ? <span style={{ position: 'absolute', top: -7, left: 8, background: '#f8f7f2', padding: '0 4px', fontSize: '10px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase' as const, letterSpacing: '0.4px', fontFamily: xpFont }}>Weight</span>
                                           : <div className="text-muted fw-bold mb-2" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weight</div>
                                       }
                                       <div style={{ paddingTop: classic ? 4 : 0 }}>
                                           <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                                               <div style={{ flex: 1 }}>
                                                   <FieldLabel classic={classic}>Kilogram</FieldLabel>
                                                   <input type="number" className="form-control"
                                                       style={classic ? xpInput({width:'100%'}) : undefined}
                                                       placeholder="0"
                                                       value={newLine.qty_kg}
                                                       onChange={e => handleQtyKgChange(e.target.value)}
                                                   />
                                               </div>
                                               <div style={{ paddingBottom: 1 }}>
                                                   {kgAuto ? (
                                                       <button type="button" onClick={toggleKgAuto} title="Click to enter manually"
                                                           style={classic ? {fontFamily:xpFont,fontSize:'9px',padding:'1px 6px',background:'linear-gradient(to bottom,#4a9ae8,#1a5ec8)',border:'1px solid',borderColor:'#1a3a8a #0a2a6a #0a2a6a #1a3a8a',color:'#fff',cursor:'pointer',borderRadius:0} : undefined}
                                                           className={classic ? '' : 'badge bg-primary border-0'}
                                                       >AUTO</button>
                                                   ) : (
                                                       <button type="button" onClick={toggleKgAuto} title="Click to restore auto calculation"
                                                           style={classic ? {fontFamily:xpFont,fontSize:'9px',padding:'1px 6px',background:'linear-gradient(to bottom,#ffffff,#d4d0c8)',border:'1px solid',borderColor:'#dfdfdf #808080 #808080 #dfdfdf',color:'#000',cursor:'pointer',borderRadius:0} : undefined}
                                                           className={classic ? '' : 'badge bg-secondary border-0'}
                                                       >&larr; Auto</button>
                                                   )}
                                               </div>
                                           </div>
                                           {kgAuto && isAutoCalcSupported(newLine.item_id) && (
                                               <div style={{ fontFamily:xpFont, fontSize:'10px', color:'#666', fontStyle:'italic', marginTop:2 }}>
                                                   {getItemWeightUnit(newLine.item_id) === 'g/y'
                                                       ? `${getItemWeight(newLine.item_id)} g/y ↔ Yd`
                                                       : `${getItemWeight(newLine.item_id)} g/m ↔ m`}
                                               </div>
                                           )}
                                       </div>
                                   </div>

                                   {/* Alt Unit compound input */}
                                   <div>
                                       <FieldLabel classic={classic}>Alt Unit</FieldLabel>
                                       {(() => {
                                           const selectedUom = uoms.find((u: any) => u.name === newLine.uom2);
                                           const factors = selectedUom?.factors || [];
                                           const isSystem = selectedUom?.is_system || false;
                                           const qty2Val = parseFloat(newLine.qty2 as string) || 0;
                                           return classic ? (
                                               <div>
                                                   <div style={{ display: 'flex' }}>
                                                       <input type="number" className="form-control"
                                                           style={xpInput({ flex: 1, borderRight: 'none', minWidth: 0 })}
                                                           placeholder="0" value={newLine.qty2} onChange={e => handleQty2Change(e.target.value)} />
                                                       <select
                                                           style={{ fontFamily:xpFont, fontSize:'11px', border:'1px solid #7f9db9', height:'20px', borderRadius:0, padding:'1px 4px', background:'#ffffff', outline:'none', color:'#000', flexShrink: 0 }}
                                                           value={newLine.uom2} onChange={e => { setNewLine(prev => ({ ...prev, uom2: e.target.value, uom2_factor: null })); }}
                                                       >
                                                           <option value="">Unit</option>
                                                           {uoms.map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                                                       </select>
                                                   </div>
                                                   {factors.length > 0 && isSystem && (
                                                       <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                                                           {factors.map((f: any) => {
                                                               const fVal = parseFloat(f.value);
                                                               const toUnit = (f.to_uom_name || 'yard').toLowerCase();
                                                               const unitLabel = (toUnit === 'm' || toUnit === 'meter') ? 'm' : 'Yd';
                                                               const totalYd = qty2Val > 0
                                                                   ? Math.round((toUnit === 'm' || toUnit === 'meter' ? qty2Val * fVal / 0.9144 : qty2Val * fVal) * 100) / 100
                                                                   : null;
                                                               const active = newLine.uom2_factor === fVal;
                                                               return (
                                                                   <button key={f.id} type="button"
                                                                       style={{ fontFamily:xpFont, fontSize:'10px', padding:'1px 6px', cursor:'pointer', borderRadius:0, border: active ? '1px solid #1a3a8a' : '1px solid #7f9db9', background: active ? 'linear-gradient(to bottom,#4a9ae8,#1a5ec8)' : 'linear-gradient(to bottom,#fff,#e8e4d8)', color: active ? '#fff' : '#000' }}
                                                                       onClick={() => handleUom2FactorChange(String(fVal))}
                                                                   >
                                                                       ×{fVal} {unitLabel}{totalYd !== null ? ` = ${totalYd} Yd` : ''}{f.label ? ` (${f.label})` : ''}
                                                                   </button>
                                                               );
                                                           })}
                                                       </div>
                                                   )}
                                                   {factors.length > 0 && !isSystem && (
                                                       <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                                           <span style={{ fontFamily:xpFont, fontSize:'10px', color:'#804800', whiteSpace:'nowrap' }}>1 {newLine.uom2} =</span>
                                                           <select
                                                               style={{ fontFamily:xpFont, fontSize:'11px', border:'1px solid #7f9db9', height:'20px', borderRadius:0, padding:'1px 4px', background: newLine.uom2_factor ? '#fff8e8' : '#ffffff', outline:'none', color:'#000', flex: 1 }}
                                                               value={newLine.uom2_factor ?? ''}
                                                               onChange={e => handleUom2FactorChange(e.target.value)}
                                                           >
                                                               <option value="">— select factor —</option>
                                                               {factors.map((f: any) => <option key={f.id} value={f.value}>{parseFloat(f.value)} {(f.to_uom_name || 'Yard')}{f.label ? ` (${f.label})` : ''}</option>)}
                                                           </select>
                                                       </div>
                                                   )}
                                               </div>
                                           ) : (
                                               <div>
                                                   <div className="input-group input-group-sm">
                                                       <input type="number" className="form-control" placeholder="0" value={newLine.qty2} onChange={e => handleQty2Change(e.target.value)} />
                                                       <select className="form-select" style={{ maxWidth: 80 }} value={newLine.uom2} onChange={e => setNewLine(prev => ({ ...prev, uom2: e.target.value, uom2_factor: null }))}>
                                                           <option value="">Unit</option>
                                                           {uoms.map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                                                       </select>
                                                   </div>
                                                   {factors.length > 0 && isSystem && (
                                                       <div className="d-flex flex-wrap gap-1 mt-2">
                                                           {factors.map((f: any) => {
                                                               const fVal = parseFloat(f.value);
                                                               const toUnit = (f.to_uom_name || 'yard').toLowerCase();
                                                               const unitLabel = (toUnit === 'm' || toUnit === 'meter') ? 'm' : 'Yd';
                                                               const totalYd = qty2Val > 0
                                                                   ? Math.round((toUnit === 'm' || toUnit === 'meter' ? qty2Val * fVal / 0.9144 : qty2Val * fVal) * 100) / 100
                                                                   : null;
                                                               const active = newLine.uom2_factor === fVal;
                                                               return (
                                                                   <button key={f.id} type="button"
                                                                       className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                                                                       style={{ fontSize: 11 }}
                                                                       onClick={() => handleUom2FactorChange(String(fVal))}
                                                                   >
                                                                       ×{fVal} {unitLabel}{totalYd !== null ? ` = ${totalYd} Yd` : ''}{f.label ? ` (${f.label})` : ''}
                                                                   </button>
                                                               );
                                                           })}
                                                       </div>
                                                   )}
                                                   {factors.length > 0 && !isSystem && (
                                                       <div className="d-flex align-items-center gap-1 mt-1">
                                                           <span className="text-muted small" style={{ whiteSpace:'nowrap' }}>1 {newLine.uom2} =</span>
                                                           <select className="form-select form-select-sm" style={{ background: newLine.uom2_factor ? '#fff8e8' : undefined }}
                                                               value={newLine.uom2_factor ?? ''}
                                                               onChange={e => handleUom2FactorChange(e.target.value)}
                                                           >
                                                               <option value="">— select factor —</option>
                                                               {factors.map((f: any) => <option key={f.id} value={f.value}>{parseFloat(f.value)} {(f.to_uom_name || 'Yard')}{f.label ? ` (${f.label})` : ''}</option>)}
                                                           </select>
                                                       </div>
                                                   )}
                                               </div>
                                           );
                                       })()}
                                   </div>
                               </div>

                               {/* Right: Dates + Stock Notes */}
                               <div style={{ display: 'flex', flexDirection: 'column', gap: classic ? 5 : 8 }}>
                                   <div>
                                       <FieldLabel classic={classic}>Del. Request</FieldLabel>
                                       <input type="date" className="form-control" style={classic ? xpInput({width:'100%',height:'22px'}) : undefined} value={newLine.due_date} onChange={e => setNewLine({...newLine, due_date: e.target.value})} />
                                   </div>
                                   <div>
                                       <FieldLabel classic={classic}>Del. Confirmation</FieldLabel>
                                       <input type="date" className="form-control" style={classic ? xpInput({width:'100%',height:'22px'}) : undefined} value={newLine.internal_confirmation_date} onChange={e => setNewLine({...newLine, internal_confirmation_date: e.target.value})} />
                                   </div>
                                   <div>
                                       <FieldLabel classic={classic}>Stock Notes</FieldLabel>
                                       <input className="form-control" style={classic ? xpInput({width:'100%'}) : undefined} placeholder="e.g. 1 IKAT 60 PCS" value={newLine.ket_stock} onChange={e => setNewLine({...newLine, ket_stock: e.target.value})} />
                                   </div>
                               </div>

                           </div>
                       </div>

                       {/* Variants */}
                       {currentBoundAttrs.length > 0 && (
                           <div className="col-12 mt-1">
                               <div style={{background:'#ffffff',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'4px 6px':'8px'}}>
                                   <div style={classic ? {fontFamily:xpFont,fontSize:'10px',fontWeight:'bold',color:'#444',marginBottom:4} : undefined} className={classic ? '' : 'text-muted fw-bold mb-2 small'}>Variants</div>
                                   <div className="row g-2">
                                       {currentBoundAttrs.map((attr: any) => {
                                           const isCombo = comboAttr && attr.id === comboAttr.id;
                                           if (isCombo) {
                                               // Combo Library is server-searched (thousands of combos) —
                                               // options come from the current search page, keyed on
                                               // attribute_value_id so selection still writes into
                                               // attribute_value_ids like the plain-select attrs below.
                                               const selectedId = newLine.attribute_value_ids.find((vid: string) => (attr.values || []).some((v: any) => v.id === vid)) || '';
                                               const options: { value: string; label: string; subLabel?: string }[] =
                                                   comboResults.map((c: any) => ({ value: c.attribute_value_id, label: c.name, subLabel: c.code }));
                                               // If the current selection isn't in the loaded search page
                                               // (e.g. editing an existing line), fall back to the label
                                               // already cached on the attribute so it still displays.
                                               if (selectedId && !options.some(o => o.value === selectedId)) {
                                                   const selectedAttrValue = (attr.values || []).find((v: any) => v.id === selectedId);
                                                   if (selectedAttrValue) options.unshift({ value: selectedId, label: selectedAttrValue.value });
                                               }
                                               return (
                                               <div key={attr.id} className="col-md-4">
                                                   <SearchableSelect
                                                       options={options}
                                                       value={selectedId}
                                                       onChange={val => handleValueChange(val, attr.id)}
                                                       onSearch={onSearchCombos}
                                                       placeholder={`Any ${attr.name}`}
                                                       size="sm"
                                                   />
                                               </div>
                                               );
                                           }
                                           // Plain (non-combo) variant attrs — Colors included. `GET /attributes`
                                           // returns every attribute with its full `values` list (no pagination),
                                           // so the whole set is in memory: filter client-side, no onSearch.
                                           const opts = [...(attr.values || [])].sort((a: any, b: any) =>
                                               String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: 'base' }));
                                           const options = [
                                               { value: '', label: `Any ${attr.name}` },
                                               ...opts.map((v: any) => ({ value: v.id, label: v.value })),
                                           ];
                                           return (
                                           <div key={attr.id} className="col-md-4">
                                               <SearchableSelect
                                                   options={options}
                                                   value={newLine.attribute_value_ids.find(vid => opts.some((v: any) => v.id === vid)) || ''}
                                                   onChange={val => handleValueChange(val, attr.id)}
                                                   placeholder={`Any ${attr.name}`}
                                                   size="sm"
                                               />
                                           </div>
                                           );
                                       })}
                                   </div>
                               </div>
                           </div>
                       )}

                       {/* Color Library picker — shown for color-type finished goods.
                           Writes color_id on the line; drives the DYEING recipe match. */}
                       {currentVariantType === 'color' && newLine.item_id && (
                           <div className="col-12 mt-1">
                               <div style={{background:'#ffffff',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'4px 6px':'8px'}}>
                                   <div style={classic ? {fontFamily:xpFont,fontSize:'10px',fontWeight:'bold',color:'#444',marginBottom:4} : undefined} className={classic ? '' : 'text-muted fw-bold mb-2 small'}>Color Code</div>
                                   {newLine.color_id ? (
                                       <div style={{display:'flex',alignItems:'center',gap:8}}>
                                           <span style={classic?{fontFamily:xpFont,fontSize:'11px',color:'#000'}:undefined} className={classic?'':'small'}>{newLine.color_label}</span>
                                           <button type="button" onClick={clearColor} style={classic?{fontFamily:xpFont,fontSize:'10px',border:'1px solid #7f9db9',background:'#ece9d8',padding:'1px 6px',cursor:'pointer'}:undefined} className={classic?'':'btn btn-sm btn-outline-secondary py-0'}>Change</button>
                                       </div>
                                   ) : newLine.labdip_variant_code ? (
                                       <div style={{display:'flex',alignItems:'center',gap:8}}>
                                           <span style={classic?{fontFamily:xpFont,fontSize:'11px',color:'#8a6d00'}:{color:'#8a6d00'}} className={classic?'':'small'}>Pending lab dip: {newLine.labdip_label}</span>
                                           <button type="button" onClick={clearLabdip} style={classic?{fontFamily:xpFont,fontSize:'10px',border:'1px solid #7f9db9',background:'#ece9d8',padding:'1px 6px',cursor:'pointer'}:undefined} className={classic?'':'btn btn-sm btn-outline-secondary py-0'}>Change</button>
                                       </div>
                                   ) : (
                                       <div style={{position:'relative'}}>
                                           <input
                                               type="text"
                                               placeholder="Search approved color, or pick a pending lab dip below..."
                                               value={colorSearch}
                                               onChange={e => setColorSearch(e.target.value)}
                                               onFocus={() => setColorFocused(true)}
                                               onBlur={() => setTimeout(() => setColorFocused(false), 150)}
                                               style={classic?{fontFamily:xpFont,fontSize:'11px',border:'1px solid #7f9db9',height:'22px',borderRadius:0,padding:'1px 4px',background:'#ffffff',outline:'none',width:'100%'}:undefined}
                                               className={classic?'':'form-control form-control-sm'}
                                           />
                                           {colorFocused && (colorResults.length > 0 || labdipResults.length > 0) && (
                                               <div style={{position:'absolute',zIndex:20,top:'100%',left:0,right:0,maxHeight:220,overflowY:'auto',background:'#ffffff',border:'1px solid #7f9db9'}}>
                                                   {labdipResults.length > 0 && (
                                                       <>
                                                           <div style={{padding:'2px 6px',fontFamily:classic?xpFont:undefined,fontSize:'10px',fontWeight:'bold',color:'#8a6d00',background:'#fbf4dd',borderBottom:'1px solid #e8dca8'}}>Pending (Lab Dip) — not yet approved</div>
                                                           {labdipResults.map((v: any) => (
                                                               <div
                                                                   key={v.labdip_item_id}
                                                                   onClick={() => selectLabdip(v)}
                                                                   style={{padding:'3px 6px',cursor:'pointer',fontFamily:classic?xpFont:undefined,fontSize:'11px',borderBottom:'1px solid #eee'}}
                                                                   onMouseDown={e => e.preventDefault()}
                                                               >
                                                                   <b>{v.variant_code}</b>{v.request_code ? <span style={{color:'#888'}}> · {v.request_code}</span> : null}<span style={{color:'#8a6d00'}}> · {v.status}</span>
                                                               </div>
                                                           ))}
                                                       </>
                                                   )}
                                                   {colorResults.length > 0 && (
                                                       <>
                                                           {labdipResults.length > 0 && <div style={{padding:'2px 6px',fontFamily:classic?xpFont:undefined,fontSize:'10px',fontWeight:'bold',color:'#444',background:'#f0f0f0',borderBottom:'1px solid #ddd'}}>Approved Colors</div>}
                                                           {colorResults.map((c: any) => (
                                                               <div
                                                                   key={c.id}
                                                                   onClick={() => selectColor(c)}
                                                                   style={{padding:'3px 6px',cursor:'pointer',fontFamily:classic?xpFont:undefined,fontSize:'11px',borderBottom:'1px solid #eee'}}
                                                                   onMouseDown={e => e.preventDefault()}
                                                               >
                                                                   <b>{c.code}</b>{c.name ? ` — ${c.name}` : ''}{c.pantone_ref ? <span style={{color:'#888'}}> · {c.pantone_ref}</span> : null}
                                                               </div>
                                                           ))}
                                                       </>
                                                   )}
                                               </div>
                                           )}
                                       </div>
                                   )}
                               </div>
                           </div>
                       )}

                       {/* No Color Swatch — the customer ordered a shade without sending the
                           physical swatch. Per line (i.e. per color variant), informational. */}
                       {newLine.item_id && (
                           <div className="col-12 mt-1">
                               <div style={{background:'#ffffff',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'4px 6px':'8px'}}>
                                   <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',margin:0}}>
                                       <input
                                           type="checkbox"
                                           checked={!!newLine.no_color_swatch}
                                           onChange={e => setNewLine({...newLine, no_color_swatch: e.target.checked})}
                                           className={classic?'':'form-check-input mt-0'}
                                           style={classic?{margin:0}:undefined}
                                       />
                                       <span style={classic?{fontFamily:xpFont,fontSize:'11px',color:'#000'}:undefined} className={classic?'':'small'}>No Color Swatch</span>
                                       <span style={classic?{fontFamily:xpFont,fontSize:'10px',color:'#888'}:{color:'#888'}} className={classic?'':'small'}>— customer has not supplied a physical swatch yet</span>
                                   </label>
                               </div>
                           </div>
                       )}

                       {/* BOM + Size / Measurement (Combo gates BOM list; other variants are annotations) */}
                       {(() => {
                           const itemBoms = getItemBoms(newLine.item_id, newLine.attribute_value_ids);
                           if (!itemBoms.length) return null;
                           const selectedBom = getSelectedBom(newLine.item_id, newLine.bom_id, newLine.attribute_value_ids);
                           const bomSizes = selectedBom?.sizes || [];
                           return (
                               <>
                                   {itemBoms.length > 1 && (
                                       <div className="col-12 mt-1">
                                           <div style={{background:'#ffffff',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'4px 6px':'8px'}}>
                                               <div style={classic?{fontFamily:xpFont,fontSize:'10px',fontWeight:'bold',color:'#444',marginBottom:4}:undefined} className={classic?'':'text-muted fw-bold mb-2 small'}>BOM</div>
                                               <select
                                                   className="form-select form-select-sm"
                                                   style={classic?{fontFamily:xpFont,fontSize:'11px',border:'1px solid #7f9db9',height:'22px',borderRadius:0,padding:'1px 4px',background:'#ffffff',outline:'none',width:'100%'}:undefined}
                                                   value={newLine.bom_id}
                                                   onChange={e => setNewLine({...newLine, bom_id: e.target.value, bom_size_id: ''})}
                                               >
                                                   <option value="">Select BOM</option>
                                                   {itemBoms.map((b: any) => (
                                                       <option key={b.id} value={b.id}>{b.code}{b.description ? ` — ${b.description}` : ''}</option>
                                                   ))}
                                               </select>
                                           </div>
                                       </div>
                                   )}
                                   {bomSizes.length > 0 && (
                                       <div className="col-12 mt-1">
                                           <div style={{background:'#ffffff',border:classic?'1px solid #b0a898':'1px solid #dee2e6',padding:classic?'4px 6px':'8px'}}>
                                               <div style={classic?{fontFamily:xpFont,fontSize:'10px',fontWeight:'bold',color:'#444',marginBottom:4}:undefined} className={classic?'':'text-muted fw-bold mb-2 small'}>Size / Measurement</div>
                                               <select
                                                   className="form-select form-select-sm"
                                                   style={classic?{fontFamily:xpFont,fontSize:'11px',border:'1px solid #7f9db9',height:'22px',borderRadius:0,padding:'1px 4px',background:'#ffffff',outline:'none',width:'100%'}:undefined}
                                                   value={newLine.bom_size_id}
                                                   onChange={e => setNewLine({...newLine, bom_size_id: e.target.value})}
                                               >
                                                   <option value="">No specific size</option>
                                                   {bomSizes.map((bs: any) => (
                                                       <option key={bs.id} value={bs.id}>{formatBomSizeLabel(bs)}</option>
                                                   ))}
                                               </select>
                                           </div>
                                       </div>
                                   )}
                               </>
                           );
                       })()}
                   </div>

                   {/* Add Line button — full width, bottom of form */}
                   <div style={{ marginTop: classic ? 6 : 10, marginBottom: classic ? 6 : 10 }}>
                       {newLineVariantErr && (
                           <div style={{ fontFamily: classic ? xpFont : undefined, fontSize: classic ? '10px' : '12px', fontWeight: 'bold', color: '#8a6d00', marginBottom: 4 }}>
                               <i className="bi bi-exclamation-triangle me-1"></i>{newLineVariantErr}
                           </div>
                       )}
                       {classic ? (
                           <button type="button"
                               style={addLineDisabled
                                   ? { ...xpBtn(), width: '100%', padding: '3px 0', opacity: 0.5, textAlign: 'center' as const }
                                   : { ...xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' }), width: '100%', padding: '3px 0', textAlign: 'center' as const }}
                               onClick={handleAddLine} disabled={addLineDisabled}
                               title={addLineTitle}
                           >
                               <i className="bi bi-plus-lg" style={{ marginRight: 5 }}></i>Add Line to Order
                           </button>
                       ) : (
                           <button type="button"
                               className={`w-100 btn ${addLineDisabled ? 'btn-outline-secondary' : 'btn-success'}`}
                               style={{ fontWeight: 600 }}
                               onClick={handleAddLine} disabled={addLineDisabled}
                               title={addLineTitle}
                           >
                               <i className="bi bi-plus-lg me-2"></i>Add Line to Order
                           </button>
                       )}
                   </div>

                   {/* Lines list */}
                   <div>
                       {newSO.lines.map((line: any, idx) => (
                           <div key={idx} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:classic?'3px 6px':'8px',background:classic?(idx%2===0?'#ffffff':'#f5f3ee'):'white',border:classic?'1px solid #c0bdb5':'1px solid #dee2e6',marginBottom:2,fontFamily:classic?xpFont:undefined,fontSize:classic?'11px':undefined,flexWrap:'wrap' as const,gap:classic?4:6}}>
                               <div>
                                   <span style={{fontWeight:'bold'}}>{getItemName(line.item_id, line.item_name)}</span>
                                   <CodeChip code={getItemCode(line.item_id, line.item_code)} classic={classic} tier={2} style={{ marginLeft: 8 }} />
                                   {isSample(line.item_id) && <span style={{background:'#fff8dc',border:'1px solid #c8a000',color:'#4a3000',padding:'0 4px',fontSize:'9px',fontFamily:classic?xpFont:'',marginLeft:6}} className={classic?'':'badge bg-warning text-dark ms-2'}>Sample</span>}
                                   {(() => {
                                       const { chips, plainIds } = buildVariantChips(line.attribute_value_ids || [], line.color_label, line.color_hex, !line.color_id ? line.labdip_variant_code : null);
                                       return (
                                           <>
                                               {plainIds.length > 0 && <div style={{color:classic?'#666':'',fontSize:classic?'10px':'',fontStyle:'italic'}} className={classic?'':'small text-muted fst-italic'}>{plainIds.map(getAttributeValueName).join(', ')}</div>}
                                               {chips.length > 0 && renderChipRow(chips)}
                                           </>
                                       );
                                   })()}
                                   {line.bom_size_id && <div style={{color:classic?'#005':'',fontSize:classic?'10px':'',fontWeight:'bold'}} className={classic?'':'small text-primary fw-semibold'}><i className="bi bi-rulers me-1"></i>{getBomSizeLabelById(line.bom_size_id)}</div>}
                                   {line.no_color_swatch && <div style={{color:'#a33',fontSize:classic?'10px':'',fontWeight:'bold'}} className={classic?'':'small fw-semibold'}><i className="bi bi-palette me-1"></i>No Color Swatch</div>}
                               </div>
                               <div style={{display:'flex',alignItems:'center',gap:classic?6:10,flexWrap:'wrap' as const}}>
                                   <div style={{display:'flex',flexDirection:'column',gap:1}}>
                                       <span style={{color:classic?'#999':'',fontSize:'9px'}} className={classic?'':'text-muted'}>Req</span>
                                       <input type="date"
                                           style={classic ? xpInput({width:110, height:'20px'}) : {width:130}}
                                           className={classic?'':'form-control form-control-sm'}
                                           value={line.due_date || ''}
                                           onChange={e => handleLineDateChange(idx, 'due_date', e.target.value)}
                                           title="Delivery Request date"
                                       />
                                   </div>
                                   <div style={{display:'flex',flexDirection:'column',gap:1}}>
                                       <span style={{color:classic?'#999':'',fontSize:'9px'}} className={classic?'':'text-muted'}>Conf</span>
                                       <input type="date"
                                           style={classic ? xpInput({width:110, height:'20px'}) : {width:130}}
                                           className={classic?'':'form-control form-control-sm'}
                                           value={line.internal_confirmation_date || ''}
                                           onChange={e => handleLineDateChange(idx, 'internal_confirmation_date', e.target.value)}
                                           title="Delivery Confirmation date"
                                       />
                                   </div>
                                   <span style={{fontWeight:'bold'}}>×</span>
                                   <input type="number" min="0" step="any"
                                       style={classic ? xpInput({width:70, textAlign:'right'}) : {width:80,textAlign:'right'}}
                                       className={classic?'':'form-control form-control-sm'}
                                       value={line.qty || ''}
                                       onChange={e => handleLineQtyChange(idx, e.target.value)}
                                       title="Quantity ordered (Yd)"
                                   />
                                   <span style={{color:classic?'#777':'',fontSize:classic?'10px':'',fontWeight:'normal'}} className={classic?'':'text-muted small'}>Yd</span>
                                   <label style={{display:'flex',alignItems:'center',gap:3,cursor:'pointer',margin:0}} title="Customer has not supplied a physical color swatch — untick once it arrives">
                                       <input type="checkbox" checked={!!line.no_color_swatch} onChange={() => handleLineSwatchToggle(idx)} className={classic?'':'form-check-input mt-0'} style={classic?{margin:0}:undefined} />
                                       <span style={{color:classic?'#777':'',fontSize:'9px'}} className={classic?'':'text-muted'}>No swatch</span>
                                   </label>
                                   <button type="button" style={classic?{...xpBtn(),border:'1px solid transparent',background:'transparent',padding:'1px 5px'}:undefined} className={classic?'':'btn btn-sm btn-link text-danger p-0'} onClick={() => handleRemoveLine(idx)}>
                                       <i className="bi bi-x-circle" style={{color:classic?'#c00000':''}}></i>
                                   </button>
                               </div>
                           </div>
                       ))}
                       {newSO.lines.length === 0 && <div style={{textAlign:'center',padding:classic?'8px':'8px',fontFamily:classic?xpFont:'',fontSize:classic?'11px':'',color:classic?'#888':'',fontStyle:'italic'}} className={classic?'':'text-center text-muted small fst-italic py-2'}>No items added yet</div>}
                   </div>
               </FormSection>
           </form>
       </ModalWrapper>

       {/* ── Outer shell ── */}
       <ShellWindow classic={classic} fill="page" className="fade-in">
           <ShellTitleBar
               classic={classic}
               icon="bi-receipt-cutoff"
               title={t('sales_orders')}
               subtitle="Manage incoming customer orders"
               right={classic ? (
                   <div style={{ display: 'flex', gap: 4 }}>
                       <button style={xpBtn()} onClick={() => setIsTablePrintOpen(true)}>
                           <i className="bi bi-printer" style={{ marginRight: 4 }}></i>Print Table
                       </button>
                       {canManage && (
                       <button
                           style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' })}
                           onClick={() => setIsCreateOpen(true)}
                       >
                           <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>{t('create')}
                       </button>
                       )}
                   </div>
               ) : (
                   <div className="d-flex gap-2">
                       <button className="btn btn-sm btn-outline-secondary btn-print" onClick={() => setIsTablePrintOpen(true)}>
                           <i className="bi bi-printer me-1"></i>Print Table
                       </button>
                       {canManage && <button className="btn btn-sm btn-primary" onClick={() => setIsCreateOpen(true)}>
                           <i className="bi bi-plus-lg me-2"></i>{t('create')}
                       </button>}
                   </div>
               )}
           />

           {/* ── Secondary toolbar: search + status filters + count ── */}
           <div
               style={classic ? xpToolbar() : undefined}
               className={classic ? '' : 'px-3 py-2 border-bottom d-flex align-items-center gap-2 flex-wrap bg-white'}
           >
               <SearchField classic={classic} value={searchTerm} onChange={setSearchTerm} placeholder="Search PO#…" width={200} grow />
               <SearchField classic={classic} value={customerSearch} onChange={setCustomerSearch} placeholder="Search Customer…" icon="bi-person" width={200} grow />
               {classic && <div style={xpSep}></div>}
               <FilterChipBar classic={classic} options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
               {classic && <div style={xpSep}></div>}
               <ToolbarCount classic={classic}>
                   {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
               </ToolbarCount>
           </div>

           {/* ── Table ── */}
           <div className={classic ? '' : 'card-body p-0'} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
               {/* vertical scroll must live on the same element as overflow-x,
                   otherwise sticky headers bind to the inner wrapper and never stick */}
               <div className="table-responsive" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
                   {/* minWidth is what makes the horizontal scroll actually engage: at
                       width:100% alone the browser squeezes the twelve columns to fit
                       instead of overflowing, and the narrow ones become unreadable. */}
                   <table
                       className={classic ? '' : 'table table-hover align-middle mb-0'}
                       style={classic
                           ? { width: '100%', minWidth: SO_TABLE_MIN_WIDTH, borderCollapse: 'collapse', background: '#fff' }
                           : { minWidth: SO_TABLE_MIN_WIDTH }}
                   >
                       <thead style={classic ? xpTableHeader : undefined} className={classic ? '' : 'table-light'}>
                           <tr>
                               <th style={classic ? { ...xpThCell, width: '130px', cursor: 'pointer' } : { cursor: 'pointer' }} className={classic ? '' : 'ps-3'} onClick={() => toggleSOSort('po')} title="Sort">PO# / Ref<SortMark sort={soSort} colKey="po" /></th>
                               <th style={classic ? { ...xpThCell, width: '180px', cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => toggleSOSort('customer')} title="Sort">Customer<SortMark sort={soSort} colKey="customer" /></th>
                               <th style={classic ? { ...xpThCell, width: '72px', cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => toggleSOSort('date')} title="Sort">Date<SortMark sort={soSort} colKey="date" /></th>
                               <th style={classic ? { ...xpThCell, width: '180px' } : undefined}>Item</th>
                               <th style={classic ? { ...xpThCell, width: '80px' } : undefined}>Size</th>
                               <th style={classic ? { ...xpThCell, width: '140px' } : undefined}>Qty</th>
                               <th style={classic ? { ...xpThCell, width: '80px' } : undefined}>Alt Unit</th>
                               <th style={classic ? { ...xpThCell, width: '110px' } : undefined}>Stock Notes</th>
                               <th style={classic ? { ...xpThCell, width: '88px' } : undefined}>Req / Conf</th>
                               <th style={classic ? { ...xpThCell, width: '92px' } : undefined} title="Made -> packed -> shipped against the ordered qty. READY needs packed cartons in stock.">Fulfilment</th>
                               <th style={classic ? { ...xpThCell, width: '80px', cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => toggleSOSort('status')} title="Sort">Status<SortMark sort={soSort} colKey="status" /></th>
                               <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none', width: '110px' } : undefined} className={classic ? '' : 'text-end pe-3'}>Actions</th>
                           </tr>
                       </thead>
                       <tbody>
                           {pageOrders.flatMap((so: any, rowIndex: number) => {
                               const rowBg = rowIndex % 2 === 0 ? '#ffffff' : (classic ? '#f5f3ee' : '#fafafa');
                               const soLines: any[] = so.lines;
                               const lineCount = Math.max(soLines.length, 1);

                               const soTd = (extra: React.CSSProperties = {}): React.CSSProperties => classic
                                   ? { ...tdBase, background: rowBg, verticalAlign: 'middle', borderBottom: '1px solid #c0bdb5', ...extra }
                                   : { background: rowBg, verticalAlign: 'middle', padding: '6px 10px', borderBottom: '1px solid #dee2e6', ...extra };

                               const lineTd = (isFirst: boolean, isLast: boolean, extra: React.CSSProperties = {}): React.CSSProperties => classic
                                   ? { ...tdBase, background: rowBg, paddingTop: 3, paddingBottom: 3, fontSize: '10px', borderBottom: isLast ? '1px solid #c0bdb5' : 'none', borderTop: isFirst ? 'none' : '1px dashed #d0cdc8', ...extra }
                                   : { background: rowBg, padding: '3px 10px', fontSize: '0.78rem', borderBottom: isLast ? '1px solid #dee2e6' : 'none', borderTop: isFirst ? 'none' : '1px dashed #e4e4e4', ...extra };

                               const soPRs = (productionRuns || []).filter((pr: any) => String(pr.sales_order_id) === String(so.id));

                               const poCellContent = (
                                   <>
                                       <CodeChip code={so.po_number} classic={classic} tone="accent" style={{ fontWeight: 'bold' }} />
                                       {so.customer_po_ref && (
                                           <div style={{ fontFamily:xpFont, fontSize:'10px', color:'#666', marginTop:1 }}>
                                               {so.customer_po_ref}
                                           </div>
                                       )}
                                       {soPRs.length > 0 && (
                                           <div style={{ display:'flex', flexWrap:'wrap' as const, gap:2, marginTop:3 }}>
                                               {soPRs.map((pr: any) => classic ? (
                                                   <span key={pr.id} onClick={() => goToPR(pr.code)} title={`Go to ${pr.code}`}
                                                       style={{ fontFamily:xpFont, fontSize:'9px', padding:'1px 5px', cursor:'pointer', whiteSpace:'nowrap' as const, background:'#e4f5e4', border:'1px solid #90c090', color:'#1a5e1a', fontWeight:'bold' }}>
                                                       <i className="bi bi-check-circle" style={{ marginRight:2 }}></i>{pr.code}
                                                   </span>
                                               ) : (
                                                   <span key={pr.id} onClick={() => goToPR(pr.code)} title={`Go to ${pr.code}`} role="button"
                                                       style={{ fontSize:9, whiteSpace:'nowrap' as const, cursor:'pointer', background:'#d1e7dd', border:'1px solid #a3cfbb', color:'#0a3622', padding:'1px 5px', borderRadius:3, fontWeight:'bold' }}>
                                                       <i className="bi bi-check-circle me-1"></i>{pr.code}
                                                   </span>
                                               ))}
                                           </div>
                                       )}
                                   </>
                               );

                               const statusCellContent = (
                                   <>
                                       <StatusChip status={so.status} tint />
                                       {so.delivered_at && <div className="extra-small text-muted mt-1" style={{ fontSize:'9px' }}>Del: {formatDate(so.delivered_at)}</div>}
                                   </>
                               );

                               const actionsCellContent = (
                                   <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                                       {(so.status === 'PENDING' || soPRs.length > 0) && (
                                           <div style={{ display:'flex', flexWrap:'wrap' as const, gap:2, justifyContent:'flex-end' }}>
                                               {so.status === 'PENDING' && (classic ? (
                                                   <button title="Create Production Run" onClick={() => onGenerateWO(so)}
                                                       style={{ fontFamily:xpFont, fontSize:'9px', padding:'1px 5px', cursor:'pointer', whiteSpace:'nowrap' as const, background:'linear-gradient(to bottom,#5a9ae0,#0058e6)', border:'1px solid', borderColor:'#003080 #001840 #001840 #003080', color:'#fff', fontWeight:'bold' }}>
                                                       <i className="bi bi-collection-play" style={{ marginRight:2 }}></i>PR
                                                   </button>
                                               ) : (
                                                   <button className="btn btn-sm btn-primary py-0 px-2" style={{ fontSize:10, whiteSpace:'nowrap' as const }} title="Create Production Run" onClick={() => onGenerateWO(so)}>
                                                       <i className="bi bi-collection-play me-1"></i>PR
                                                   </button>
                                               ))}
                                               {soPRs.length > 0 && (classic ? (
                                                   <button key="lineage" title="View full production lineage — PR, MO, WO and beams created for this SO" onClick={() => openLineage(so)}
                                                       style={{ fontFamily:xpFont, fontSize:'9px', padding:'1px 5px', cursor:'pointer', whiteSpace:'nowrap' as const, background:'linear-gradient(to bottom,#fff,#d4d0c8)', border:'1px solid', borderColor:'#dfdfdf #808080 #808080 #dfdfdf', color:'#003ea6', fontWeight:'bold' }}>
                                                       <i className="bi bi-diagram-3" style={{ marginRight:2 }}></i>Lineage
                                                   </button>
                                               ) : (
                                                   <button key="lineage" className="btn btn-sm btn-outline-primary py-0 px-2" style={{ fontSize:9, whiteSpace:'nowrap' as const }} title="View full production lineage — PR, MO, WO and beams created for this SO" onClick={() => openLineage(so)}>
                                                       <i className="bi bi-diagram-3 me-1"></i>Lineage
                                                   </button>
                                               ))}
                                           </div>
                                       )}
                                       <div style={classic ? { display:'flex', gap:2, justifyContent:'flex-end', alignItems:'center' } : undefined} className={classic ? '' : 'd-flex justify-content-end align-items-center gap-1'}>
                                       {canManage && (so.status === 'READY' || so.status === 'PARTIAL') && (
                                           classic ? (
                                               <button style={xpBtn({ padding:'1px 5px' })} title="Mark as Sent" onClick={() => onUpdateSOStatus(so.id, 'SENT')}>
                                                   <i className="bi bi-send"></i>
                                               </button>
                                           ) : (
                                               <button className="btn btn-sm btn-light border py-0 px-2" style={{fontSize:12}} title="Mark as Sent" onClick={() => onUpdateSOStatus(so.id, 'SENT')}>
                                                   <i className="bi bi-send"></i>
                                               </button>
                                           )
                                       )}
                                       {canManage && so.status === 'SENT' && (
                                           classic ? (
                                               <button style={xpBtn({ background:'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor:'#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color:'#fff', padding:'1px 5px' })} title="Mark as Delivered" onClick={() => onUpdateSOStatus(so.id, 'DELIVERED')}>
                                                   <i className="bi bi-check2-all"></i>
                                               </button>
                                           ) : (
                                               <button className="btn btn-sm btn-light border py-0 px-2" style={{fontSize:12}} title="Mark as Delivered" onClick={() => onUpdateSOStatus(so.id, 'DELIVERED')}>
                                                   <i className="bi bi-check2-all"></i>
                                               </button>
                                           )
                                       )}
                                       <MenuTriggerButton classic={classic} onClick={(e) => toggleMenu(so.id, e)} />
                                       </div>
                                   </div>
                               );

                               if (soLines.length === 0) {
                                   return [(
                                       <tr key={so.id}>
                                           <td style={soTd()} className={classic ? '' : 'ps-3'}>{poCellContent}</td>
                                           <td style={soTd()}>{so.customer_name}</td>
                                           <td style={soTd({ fontSize:'10px' })} className={classic ? '' : 'small'}>{tzDate(so.order_date)}</td>
                                           <td colSpan={7} style={classic ? { ...tdBase, background:rowBg, borderBottom:'1px solid #c0bdb5', color:'#aaa', fontStyle:'italic', fontSize:'10px' } : { background:rowBg, padding:'6px 10px', borderBottom:'1px solid #dee2e6', color:'#aaa', fontStyle:'italic', fontSize:'0.78rem' }}>No lines</td>
                                           <td style={soTd()}>{statusCellContent}</td>
                                           <td style={soTd({ textAlign:'right' as const, borderRight:'none' })} className={classic ? '' : 'pe-3 text-end'}>{actionsCellContent}</td>
                                       </tr>
                                   )];
                               }

                               return soLines.map((line: any, li: number) => {
                                   const isFirst = li === 0;
                                   const isLast = li === soLines.length - 1;
                                   return (
                                       <tr key={`${so.id}-${li}`}>
                                           {isFirst && (
                                               <>
                                                   <td rowSpan={lineCount} style={soTd()} className={classic ? '' : 'ps-3'}>{poCellContent}</td>
                                                   <td rowSpan={lineCount} style={soTd()}>{so.customer_name}</td>
                                                   <td rowSpan={lineCount} style={soTd({ fontSize:'10px' })} className={classic ? '' : 'small'}>{tzDate(so.order_date)}</td>
                                               </>
                                           )}

                                           {/* Item */}
                                           <td style={lineTd(isFirst, isLast)}>
                                               <div style={{ fontFamily:xpFont, fontSize:'10px', fontWeight:'bold', lineHeight:1.3 }} className={classic ? '' : 'fw-semibold'}>
                                                   {getItemName(line.item_id, line.item_name)}
                                                   {isSample(line.item_id) && <i className="bi bi-star-fill text-warning ms-1" style={{fontSize:'0.6rem'}}></i>}
                                               </div>
                                               {(() => {
                                                   const colorLabel = line.color_code ? `${line.color_code}${line.color_name ? ' — ' + line.color_name : ''}` : null;
                                                   const { chips, plainIds } = buildVariantChips(line.attribute_value_ids || [], colorLabel, line.color_hex, line.labdip_variant_code);
                                                   return (
                                                       <>
                                                           {plainIds.length > 0 && (
                                                               <div style={{ fontFamily:xpFont, fontSize:'9px', color:'#666', fontStyle:'italic' }}>
                                                                   {plainIds.map(getAttributeValueName).join(', ')}
                                                               </div>
                                                           )}
                                                           {chips.length > 0 && renderChipRow(chips)}
                                                       </>
                                                   );
                                               })()}
                                               {line.no_color_swatch && (
                                                   <div
                                                       style={{ fontFamily:xpFont, fontSize:'9px', fontWeight:'bold', color:'#a33' }}
                                                       title="Customer has not supplied a physical color swatch"
                                                   >
                                                       <i className="bi bi-palette me-1"></i>No Color Swatch
                                                   </div>
                                               )}
                                           </td>

                                           {/* Size */}
                                           <td style={lineTd(isFirst, isLast)}>
                                               {line.bom_size_id ? (
                                                   <div style={{ fontFamily:xpFont, fontSize:'10px', fontWeight:'bold', color: classic?'#005':'#0d6efd' }}>
                                                       <i className="bi bi-rulers me-1"></i>{getBomSizeLabelById(line.bom_size_id)}
                                                   </div>
                                               ) : (
                                                   <span style={{ fontFamily:xpFont, fontSize:'9px', color:'#ccc' }}>—</span>
                                               )}
                                           </td>

                                           {/* Qty */}
                                           <td style={lineTd(isFirst, isLast)}>
                                               <div style={{ display:'flex', flexWrap:'nowrap' as const, gap:3, alignItems:'center' }}>
                                                   <span style={{ fontFamily:xpFont, fontSize:'9px', fontWeight:'bold', color: classic?'#003ea6':'#fff', background: classic?'#dce8ff':'#0d6efd', border: classic?'1px solid #9ab0e0':'none', padding:'1px 5px', borderRadius: classic?0:3 }}>{line.qty} Yd</span>
                                                   <span style={{ fontFamily:xpFont, fontSize:'9px', color: classic?'#444':'#555', background: classic?'#efefef':'#f0f0f0', border: classic?'1px solid #c0bdb5':'1px solid #ddd', padding:'1px 5px', borderRadius: classic?0:3 }}>{Math.round(line.qty * 0.9144 * 100) / 100} m</span>
                                                   {line.qty_kg != null && line.qty_kg !== '' && (
                                                       <span style={{ fontFamily:xpFont, fontSize:'9px', color: classic?'#1a5e1a':'#166534', background: classic?'#e4f5e4':'#dcfce7', border: classic?'1px solid #90c090':'1px solid #86efac', padding:'1px 5px', borderRadius: classic?0:3 }}>{line.qty_kg} KG</span>
                                                   )}
                                               </div>
                                           </td>

                                           {/* Alt Unit */}
                                           <td style={lineTd(isFirst, isLast)}>
                                               {line.qty2 != null && line.qty2 !== '' && line.uom2 ? (
                                                   <div style={{ fontFamily:xpFont, fontSize:'10px', color: classic?'#444':'' }}>{line.qty2} {line.uom2}</div>
                                               ) : (
                                                   <span style={{ fontFamily:xpFont, fontSize:'9px', color:'#ccc' }}>—</span>
                                               )}
                                           </td>

                                           {/* Stock Notes */}
                                           <td style={lineTd(isFirst, isLast)}>
                                               {line.ket_stock ? (
                                                   <div style={{ fontFamily:xpFont, fontSize:'9px', color: classic?'#555':'#666', fontStyle:'italic' }}>{line.ket_stock}</div>
                                               ) : (
                                                   <span style={{ fontFamily:xpFont, fontSize:'9px', color:'#ccc' }}>—</span>
                                               )}
                                           </td>

                                           {/* Req / Conf */}
                                           <td style={lineTd(isFirst, isLast)}>
                                               {line.due_date ? (
                                                   // Past its requested date with no cartons ready to ship — the one
                                                   // case where the date itself is the alarm, so it carries the tint.
                                                   <div style={{ fontFamily:xpFont, fontSize:'9px',
                                                       color: isLineLate(line) ? (classic?'#a80000':'#dc2626') : (classic?'#555':''),
                                                       fontWeight: isLineLate(line) ? 'bold' : undefined }}
                                                       title={isLineLate(line) ? 'Past requested date and not ready to ship' : undefined}>
                                                       <span style={{ color:'#999' }}>Req</span> {formatShortDate(line.due_date)}
                                                       {isLineLate(line) && <i className="bi bi-exclamation-triangle-fill" style={{ marginLeft:3 }}></i>}
                                                   </div>
                                               ) : null}
                                               {line.internal_confirmation_date ? (
                                                   <div style={{ fontFamily:xpFont, fontSize:'9px', color: classic?'#555':'' }}>
                                                       <span style={{ color:'#999' }}>Conf</span> {formatShortDate(line.internal_confirmation_date)}
                                                   </div>
                                               ) : null}
                                               {!line.due_date && !line.internal_confirmation_date && (
                                                   <span style={{ fontFamily:xpFont, fontSize:'9px', color:'#ccc' }}>—</span>
                                               )}
                                           </td>

                                           {/* Fulfilment */}
                                           <td style={lineTd(isFirst, isLast)}>{fulfilmentCell(line)}</td>

                                           {isFirst && (
                                               <>
                                                   <td rowSpan={lineCount} style={soTd()}>{statusCellContent}</td>
                                                   <td rowSpan={lineCount} style={soTd({ textAlign:'right' as const, borderRight:'none' })} className={classic ? '' : 'pe-3 text-end'}>{actionsCellContent}</td>
                                               </>
                                           )}
                                       </tr>
                                   );
                               });
                           })}
                           {filteredOrders.length === 0 && (
                               <tr>
                                   <td
                                       colSpan={11}
                                       style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'center', padding: '24px 8px', color: '#888', fontStyle: 'italic' } : undefined}
                                       className={classic ? '' : 'text-center py-5 text-muted'}
                                   >
                                       {dataLoading.salesOrders ? <XPLoading label="Loading sales orders..." /> : (
                                           searchTerm || customerSearch || statusFilter !== 'ALL'
                                               ? 'No orders match the current filter.'
                                               : 'No Sales Orders found. Create one to get started.'
                                       )}
                                   </td>
                               </tr>
                           )}
                       </tbody>
                   </table>
               </div>
           </div>

           {/* Floating "more actions" menu — Edit / Print / Delete */}
           {openMenuId && (() => {
               const menuSo = pageOrders.find((s: any) => s.id === openMenuId);
               if (!menuSo) return null;
               return (
                   <FloatingMenu
                       pos={menuPos}
                       items={[
                           {
                               key: 'edit', icon: 'bi-pencil', label: 'Edit',
                               hidden: !(canManage && (menuSo.status === 'PENDING' || menuSo.status === 'READY')),
                               onClick: () => { closeMenu(); handleEditOpen(menuSo); },
                           },
                           {
                               key: 'print', icon: 'bi-printer', label: 'Print',
                               onClick: () => { closeMenu(); handlePrintSO(menuSo); },
                           },
                           {
                               key: 'delete', icon: 'bi-trash', label: 'Delete', danger: true,
                               hidden: !canManage,
                               onClick: () => { closeMenu(); onDeleteSO(menuSo.id); },
                           },
                       ]}
                   />
               );
           })()}

           <Pager page={clampedSoPage} total={sortedOrders.length} pageSize={SO_PAGE_SIZE} onPageChange={setSoPage} hideWhenEmpty />

           {/* ── Status bar ── */}
           {classic && (
               <div style={{
                   background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)',
                   borderTop: '1px solid #b0a898',
                   padding: '2px 8px',
                   display: 'flex',
                   gap: '12px',
                   fontFamily: xpFont,
                   fontSize: '10px',
                   color: '#333',
               }}>
                   <span>{salesOrders.length} total</span>
                   <span>|</span>
                   <span>{salesOrders.filter((s: any) => s.status === 'PENDING').length} pending</span>
                   <span>|</span>
                   <span>{salesOrders.filter((s: any) => s.status === 'DELIVERED').length} delivered</span>
               </div>
           )}
       </ShellWindow>
    </>
  );
}
