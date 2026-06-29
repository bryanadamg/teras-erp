import React, { useState, useEffect, useMemo, memo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import CodeConfigModal, { CodeConfig, buildCodeWithCounter } from '../shared/CodeConfigModal';
import BulkImportModal from './BulkImportModal';
import HistoryPane from '../shared/HistoryPane';
import ModalWrapper from '../shared/ModalWrapper';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { XPEmptyState, useSortable, SortMark } from '../shared/xpTheme';
import TreeSelect, { buildCategoryTree, buildLocationPickerTree } from '../shared/TreeSelect';

// XP-style category badge colours derived from category name
function getCategoryXPStyle(category: string): { bg: string; border: string; color: string } {
    const l = (category || '').toLowerCase();
    if (l.includes('raw') || l.includes('material'))   return { bg: '#fff3e0', border: '#b36b00', color: '#4a2c00' };
    if (l.includes('finish') || l.includes('good') || l.includes('product')) return { bg: '#e8f5e9', border: '#2e7d32', color: '#1b4620' };
    if (l.includes('access') || l.includes('hardware')) return { bg: '#fce4ec', border: '#b71c1c', color: '#6b0000' };
    if (l.includes('pack'))  return { bg: '#e8eaf6', border: '#3949ab', color: '#1a237e' };
    if (l.includes('semi'))  return { bg: '#fff8e1', border: '#c77800', color: '#4a3000' };
    return { bg: '#e8e8e8', border: '#6a6a6a', color: '#222222' };
}

// Memoized Row Component
const InventoryRow = memo(({ item, rowIndex, isEditing, isSelected, onToggleSelect, onEdit, onDelete, onViewHistory, getAttributeNames, classic }: any) => {
    const rowBg = classic
        ? (isSelected ? '#316ac5' : isEditing ? '#fff8cc' : rowIndex % 2 === 0 ? '#ffffff' : '#f5f3ee')
        : undefined;
    const textColor = classic && isSelected ? '#ffffff' : classic ? '#000000' : undefined;

    const tdBase: React.CSSProperties = classic
        ? { padding: '4px 6px', borderRight: '1px solid #c0bdb5', borderBottom: '1px solid #d0cdc8', verticalAlign: 'middle', color: textColor }
        : {};

    const categoryDisplay = item.category_path?.length ? item.category_path.join(' / ') : (item.category || '');
    const catStyle = classic ? getCategoryXPStyle(categoryDisplay) : null;

    return (
        <tr
            className={classic ? '' : (isEditing ? 'table-primary' : isSelected ? 'table-active' : '')}
            style={classic ? { background: rowBg, borderBottom: '1px solid #c0bdb5' } : undefined}
        >
            <td style={classic ? { ...tdBase, width: '32px', textAlign: 'center' } : undefined} className={classic ? '' : 'ps-3'}>
                <input
                    className="form-check-input"
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(item.id)}
                />
            </td>
            <td style={classic ? { ...tdBase, width: '110px' } : undefined} className={classic ? '' : 'ps-4 fw-medium font-monospace'}>
                {classic ? (
                    <span style={{
                        fontFamily: "'Courier New', monospace",
                        fontSize: '10px',
                        background: isSelected ? 'rgba(255,255,255,0.15)' : '#ffffff',
                        border: '1px solid #888',
                        padding: '1px 5px',
                        color: isSelected ? '#fff' : '#000',
                        whiteSpace: 'nowrap',
                    }}>
                        {item.code}
                    </span>
                ) : item.code}
            </td>
            <td style={classic ? { ...tdBase, fontWeight: 'bold' } : undefined}>
                {item.name}
            </td>
            <td style={tdBase}>
                {categoryDisplay ? (
                    classic ? (
                        <span style={{
                            background: isSelected ? 'rgba(255,255,255,0.2)' : catStyle!.bg,
                            border: `1px solid ${isSelected ? 'rgba(255,255,255,0.5)' : catStyle!.border}`,
                            color: isSelected ? '#fff' : catStyle!.color,
                            padding: '1px 5px',
                            fontSize: '9px',
                            fontFamily: 'Tahoma, Arial, sans-serif',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                        }}>
                            {categoryDisplay}
                        </span>
                    ) : (
                        <span className="badge bg-light text-dark border">{categoryDisplay}</span>
                    )
                ) : null}
            </td>
            <td style={tdBase}>
                {item.source_sample_code ? (
                    classic ? (
                        <a
                            href={`/samples?highlight=${item.source_sample_id}`}
                            style={{ color: isSelected ? '#cce0ff' : '#0047c8', fontSize: '9px', fontFamily: 'Tahoma, Arial, sans-serif', textDecoration: 'underline', cursor: 'pointer' }}
                            onClick={e => e.stopPropagation()}
                        >
                            ↖ {item.source_sample_code}{item.source_color_name ? ` · ${item.source_color_name}` : ''}
                        </a>
                    ) : (
                        <a
                            href={`/samples?highlight=${item.source_sample_id}`}
                            className="text-primary small fw-medium text-decoration-none"
                            onClick={e => e.stopPropagation()}
                        >
                            <i className="bi bi-arrow-up-left"></i> {item.source_sample_code}{item.source_color_name ? ` · ${item.source_color_name}` : ''}
                        </a>
                    )
                ) : (
                    <span style={classic ? { color: isSelected ? '#cce0ff' : '#999', fontSize: '9px' } : undefined} className={classic ? '' : 'text-muted small'}>-</span>
                )}
            </td>
            <td style={tdBase}>
                {classic ? (
                    <span style={{ color: isSelected ? '#e8f0ff' : '#333', fontSize: '9px' }}>
                        {getAttributeNames(item.attribute_ids)}
                    </span>
                ) : (
                    <span className="text-muted small">{getAttributeNames(item.attribute_ids)}</span>
                )}
            </td>
            <td style={tdBase}>
                {item.weight_per_unit != null ? (
                    classic ? (
                        <span style={{ color: isSelected ? '#e8f0ff' : '#333', fontSize: '9px', whiteSpace: 'nowrap' }}>
                            {item.weight_per_unit} {item.weight_unit || ''}
                        </span>
                    ) : (
                        <span className="text-muted small">{item.weight_per_unit} {item.weight_unit || ''}</span>
                    )
                ) : (
                    <span style={classic ? { color: isSelected ? '#cce0ff' : '#999', fontSize: '9px' } : undefined} className={classic ? '' : 'text-muted small'}>-</span>
                )}
            </td>
            <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' } : undefined}>
                <div className={classic ? '' : 'd-flex gap-1'} style={classic ? { display: 'flex', gap: '2px', justifyContent: 'flex-end' } : undefined}>
                    {classic ? (
                        <>
                            <button
                                title="View History"
                                onClick={() => onViewHistory(item.id)}
                                style={{ background: 'none', border: '1px solid transparent', borderRadius: '2px', cursor: 'pointer', padding: '3px 6px', color: isSelected ? '#fff' : '#555', fontSize: '12px' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = isSelected ? 'rgba(255,255,255,0.15)' : '#e8f0f8'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                            >
                                <i className="bi bi-clock-history"></i>
                            </button>
                            <button
                                title="Edit"
                                onClick={() => onEdit(item)}
                                style={{ background: 'none', border: '1px solid transparent', borderRadius: '2px', cursor: 'pointer', padding: '3px 6px', color: isSelected ? '#fff' : '#00309c', fontSize: '12px' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7f9db9'; (e.currentTarget as HTMLButtonElement).style.background = isSelected ? 'rgba(255,255,255,0.15)' : '#e8f0f8'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                            >
                                <i className="bi bi-pencil-square"></i>
                            </button>
                            <button
                                title="Delete"
                                onClick={() => onDelete(item.id)}
                                style={{ background: 'none', border: '1px solid transparent', borderRadius: '2px', cursor: 'pointer', padding: '3px 6px', color: isSelected ? '#ffcccc' : '#aa0000', fontSize: '12px' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#cc8888'; (e.currentTarget as HTMLButtonElement).style.background = isSelected ? 'rgba(255,100,100,0.2)' : '#ffe8e8'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                            >
                                <i className="bi bi-trash"></i>
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn btn-sm btn-link text-info p-0" title="View History" onClick={() => onViewHistory(item.id)}>
                                <i className="bi bi-clock-history"></i>
                            </button>
                            <button className="btn btn-sm btn-link text-primary p-0" onClick={() => onEdit(item)}>
                                <i className="bi bi-pencil-square"></i>
                            </button>
                            <button className="btn btn-sm btn-link text-danger p-0" onClick={() => onDelete(item.id)}>
                                <i className="bi bi-trash"></i>
                            </button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
});

InventoryRow.displayName = 'InventoryRow';

// XP bevel button helper
const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: 'Tahoma, Arial, sans-serif',
    fontSize: '11px',
    padding: '2px 10px',
    cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff, #ece9d8)',
    border: '1px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    color: '#000000',
    height: '22px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap' as const,
    ...extra,
});

export default function InventoryView({
    items,
    attributes,
    uoms,
    onCreateItem,
    onUpdateItem,
    onDeleteItem,
    onDeleteMultipleItems,
    onCreateCategory,
    onDownloadTemplate,
    onImportItems,
    onRefresh,
    forcedCategory,
    currentPage,
    totalItems,
    pageSize,
    onPageChange,
    searchTerm,
    onSearchChange,
}: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { categories, locations, filters: { categoryL1, setCategoryL1, categoryL2, setCategoryL2, categoryL3, setCategoryL3, itemSearch, setItemSearch } } = useData();
  // UI State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { uiStyle: currentStyle } = useTheme();

  // Derived Pagination
  const totalPages = Math.ceil(totalItems / pageSize);
  const startRange = (currentPage - 1) * pageSize + 1;
  const endRange = Math.min(currentPage * pageSize, totalItems);

  // Config State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'ITM',
      suffix: '',
      separator: '-',
      includeItemCode: false,
      includeVariant: false,
      variantAttributeNames: [],
      includeYear: false,
      includeMonth: false
  });

  // Creation State
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '', source_sample_id: '', source_color_id: '', source_sample_code: '', source_color_name: '', attribute_ids: [] as string[], weight_per_unit: '' as string | number, weight_unit: 'g/y', packaging_factor_ids: [] as string[], ends: '' as string | number, lot_tracked: false, min_stock_level: '' as string | number, default_source_location_id: '' as string });
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

  // Beam item creation state
  const [createBeam, setCreateBeam] = useState(false);
  const [beamName, setBeamName] = useState('');
  const [beamUom, setBeamUom] = useState('');
  const [beamEnds, setBeamEnds] = useState('');

  // Editing State
  const [editingItem, setEditingItem] = useState<any>(null);
  const [historyEntityId, setHistoryEntityId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);

  // Tree memos for TreeSelect components
  const catTreeOptions = useMemo(() => buildCategoryTree(categories), [categories]);
  const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locations || []), [locations]);

  // Filter-level category: maps single TreeSelect value back to L1/L2/L3 DataContext state
  const handleCategoryTreeChange = (id: string) => {
    if (!id) { setCategoryL1(''); setCategoryL2(''); setCategoryL3(''); return; }
    const cat = categories.find((c: any) => c.id === id);
    if (!cat) return;
    if (!cat.parent_id) {
      setCategoryL1(id);
    } else {
      const parent = categories.find((c: any) => c.id === cat.parent_id);
      if (!parent?.parent_id) {
        setCategoryL1(cat.parent_id); setCategoryL2(id);
      } else {
        setCategoryL1(parent.parent_id); setCategoryL2(cat.parent_id); setCategoryL3(id);
      }
    }
  };

  // Form-level category state (for create/edit modals)
  const [formCatL1, setFormCatL1] = useState('');
  const [formCatL2, setFormCatL2] = useState('');
  const [formCatL3, setFormCatL3] = useState('');

  const effectiveFormCategoryId: string | null = formCatL3 || formCatL2 || formCatL1 || null;

  // Maps single TreeSelect value back to formCat L1/L2/L3
  const handleFormCategoryChange = (id: string) => {
    if (!id) { setFormCatL1(''); setFormCatL2(''); setFormCatL3(''); return; }
    const cat = categories.find((c: any) => c.id === id);
    if (!cat) return;
    if (!cat.parent_id) {
      setFormCatL1(id); setFormCatL2(''); setFormCatL3('');
    } else {
      const parent = categories.find((c: any) => c.id === cat.parent_id);
      if (!parent?.parent_id) {
        setFormCatL1(cat.parent_id); setFormCatL2(id); setFormCatL3('');
      } else {
        setFormCatL1(parent.parent_id); setFormCatL2(cat.parent_id); setFormCatL3(id);
      }
    }
  };
  const isBeamCategory = !!effectiveFormCategoryId && (categories.find((c: any) => c.id === effectiveFormCategoryId)?.name || '').toLowerCase() === 'beam';

  const isRawMaterialCategory = !!formCatL1 && (categories.find((c: any) => c.id === formCatL1)?.name || '').toLowerCase().includes('raw');

  // Initialize form category state when editing an item
  useEffect(() => {
      if (!editingItem) return;
      const cat = categories.find((c: any) => c.id === editingItem.category_id);
      if (!cat) { setFormCatL1(''); setFormCatL2(''); setFormCatL3(''); return; }
      if (cat.level === 1) {
          setFormCatL1(cat.id); setFormCatL2(''); setFormCatL3('');
      } else if (cat.level === 2) {
          setFormCatL1(cat.parent_id || ''); setFormCatL2(cat.id); setFormCatL3('');
      } else {
          const level2 = categories.find((c: any) => c.id === cat.parent_id);
          setFormCatL1(level2?.parent_id || ''); setFormCatL2(cat.parent_id || ''); setFormCatL3(cat.id);
      }
  }, [editingItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
      const savedConfig = localStorage.getItem('item_code_config');
      if (savedConfig) {
          try {
              setCodeConfig(JSON.parse(savedConfig));
          } catch (e) {
              console.error("Invalid config in localstorage");
          }
      }
  }, []);


  // Sync beam name when item name changes and beam name hasn't been manually edited
  const [beamNameManuallyEdited, setBeamNameManuallyEdited] = useState(false);
  useEffect(() => {
      if (!beamNameManuallyEdited) setBeamName(newItem.name ? `Beam - ${newItem.name}` : '');
  }, [newItem.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
      if (!beamUom) setBeamUom(newItem.uom);
  }, [newItem.uom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill create modal when arriving from SampleRequestView's Create Item button
  useEffect(() => {
      const sourceSampleId = searchParams.get('source_sample_id');
      const sourceColorId = searchParams.get('source_color_id');
      const suggestedCode = searchParams.get('suggested_code');
      const sourceSampleCode = searchParams.get('source_sample_code');
      const sourceColorName = searchParams.get('source_color_name');

      if (sourceSampleId && suggestedCode) {
          const autoCode = suggestItemCode();
          setNewItem(prev => ({
              ...prev,
              code: autoCode,
              name: autoCode,
              source_sample_id: sourceSampleId,
              source_color_id: sourceColorId || '',
              source_sample_code: sourceSampleCode || '',
              source_color_name: sourceColorName || '',
          }));
          setIsCreateOpen(true);
          router.replace('/inventory');
      }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveConfig = (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('item_code_config', JSON.stringify(newConfig));
      const suggested = suggestItemCode(newConfig);
      setNewItem(prev => ({ ...prev, code: suggested, name: nameManuallyEdited ? prev.name : suggested }));
  };

  const suggestItemCode = (config = codeConfig) => {
      let counter = 1;
      let code = buildCodeWithCounter(config, counter);
      while (items.some((i: any) => i.code === code)) {
          counter++;
          code = buildCodeWithCounter(config, counter);
      }
      return code;
  };

  const openCreateModal = () => {
      if (!newItem.code) {
          const suggested = suggestItemCode();
          setNewItem(prev => ({ ...prev, code: suggested, name: nameManuallyEdited ? prev.name : suggested }));
      }
      setIsCreateOpen(true);
  };

  // --- Item Handlers ---

  const handleSubmitItem = async (e: React.FormEvent) => {
      e.preventDefault();
      const payload: any = { ...newItem };
      delete payload.category;
      payload.category_id = effectiveFormCategoryId;
      if (!payload.source_sample_id) delete payload.source_sample_id;
      if (!payload.source_color_id) delete payload.source_color_id;
      delete payload.source_sample_code;
      delete payload.source_color_name;
      if (payload.weight_per_unit === '' || payload.weight_per_unit === null) { delete payload.weight_per_unit; delete payload.weight_unit; }
      if (payload.ends === '' || payload.ends === null) { delete payload.ends; } else { payload.ends = parseInt(payload.ends); }
      if (payload.min_stock_level === '' || payload.min_stock_level === null || payload.min_stock_level === undefined) { delete payload.min_stock_level; } else { payload.min_stock_level = parseFloat(payload.min_stock_level); }
      if (!payload.default_source_location_id) { delete payload.default_source_location_id; }

      const res = await onCreateItem(payload);

      if (res && res.status === 400) {
          let baseCode = newItem.code;
          const baseMatch = baseCode.match(/^(.*)-(\d+)$/);
          if (baseMatch) baseCode = baseMatch[1];

          let counter = 1;
          let suggestedCode = `${baseCode}-${counter}`;

          while (items.some((i: any) => i.code === suggestedCode)) {
              counter++;
              suggestedCode = `${baseCode}-${counter}`;
          }

          showToast(`Item Code "${newItem.code}" already exists. Suggesting: ${suggestedCode}`, 'warning');
          setNewItem({ ...newItem, code: suggestedCode });
      } else if (res && res.ok) {
          if (createBeam && isRawMaterialCategory) {
              const wipCategory = categories.find((c: any) => (c.name || '').toLowerCase().includes('wip') || (c.name || '').toLowerCase().includes('work in progress'));
              const beamCategory = categories.find((c: any) => (c.name || '').toLowerCase() === 'beam');
              const beamPayload: any = {
                  code: `BEAM-${newItem.code}`,
                  name: beamName || `Beam - ${newItem.name}`,
                  uom: beamUom || newItem.uom,
                  category_id: beamCategory?.id || wipCategory?.id || effectiveFormCategoryId,
                  attribute_ids: [],
                  ...(beamEnds ? { ends: parseInt(beamEnds) } : {}),
              };
              const beamRes = await onCreateItem(beamPayload);
              if (beamRes && beamRes.ok) {
                  showToast(`Created "${newItem.code}" and "BEAM-${newItem.code}"`, 'success');
              } else {
                  showToast(`Item created but beam item failed — create BEAM-${newItem.code} manually`, 'warning');
              }
          } else {
              showToast('Item created successfully', 'success');
          }
          setNewItem({ code: '', name: '', uom: '', source_sample_id: '', source_color_id: '', source_sample_code: '', source_color_name: '', attribute_ids: [], weight_per_unit: '', weight_unit: 'g/y', packaging_factor_ids: [], ends: '', lot_tracked: false, min_stock_level: '', default_source_location_id: '' });
          setFormCatL1(''); setFormCatL2(''); setFormCatL3('');
          setNameManuallyEdited(false);
          setCreateBeam(false); setBeamName(''); setBeamUom(''); setBeamEnds('');
          setIsCreateOpen(false);
      } else {
          showToast('Failed to create item. See console.', 'danger');
          console.error("Create Item Failed", res);
      }
  };

  const handleUpdateItemSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingItem) return;

      const payload: any = {
          code: editingItem.code,
          name: editingItem.name,
          uom: editingItem.uom,
          category_id: effectiveFormCategoryId,
          attribute_ids: editingItem.attribute_ids || [],
          packaging_factor_ids: editingItem.packaging_factor_ids || [],
          source_sample_id: editingItem.source_sample_id || null,
          source_color_id: editingItem.source_color_id || null,
          weight_per_unit: editingItem.weight_per_unit || null,
          weight_unit: editingItem.weight_per_unit ? (editingItem.weight_unit || 'gsm') : null,
          lot_tracked: !!editingItem.lot_tracked,
          min_stock_level: (editingItem.min_stock_level === '' || editingItem.min_stock_level === null || editingItem.min_stock_level === undefined) ? null : parseFloat(editingItem.min_stock_level),
          default_source_location_id: editingItem.default_source_location_id || null,
      };

      onUpdateItem(editingItem.id, payload);
      setEditingItem(null);
  };

  const toggleAttribute = (id: string, isEdit: boolean) => {
      if (isEdit) {
          const current = editingItem.attribute_ids || [];
          if (current.includes(id)) {
              setEditingItem({...editingItem, attribute_ids: current.filter((a:string) => a !== id)});
          } else {
              setEditingItem({...editingItem, attribute_ids: [...current, id]});
          }
      } else {
          const current = newItem.attribute_ids;
          if (current.includes(id)) {
              setNewItem({...newItem, attribute_ids: current.filter(a => a !== id)});
          } else {
              setNewItem({...newItem, attribute_ids: [...current, id]});
          }
      }
  };

  const handleAddCategory = () => {
      if (newCategoryName) {
          onCreateCategory(newCategoryName);
          setNewCategoryName('');
          setShowCatInput(false);
      }
  };

  // Derived
  const activeEditingItem = editingItem ? items.find((i: any) => i.id === editingItem.id) : null;

  const filteredItems = useMemo(() => {
      if (!forcedCategory) return items;
      // When forcedCategory is set, filter by category_path or fallback to category string
      return items.filter((i: any) => {
          if (i.category_path?.length) return i.category_path.includes(forcedCategory);
          return i.category === forcedCategory;
      });
  }, [items, forcedCategory]);

  const sortCols = useMemo(() => ({
      code:     (i: any) => i.code,
      name:     (i: any) => i.name,
      category: (i: any) => i.category,
      weight:   (i: any) => i.weight_per_unit ?? null,
  }), []);
  const { sorted: sortedItems, sort, toggle: toggleSort } = useSortable(filteredItems, sortCols);

  const allSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
      });
  };

  const toggleSelectAll = () => {
      if (allSelected) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredItems.map((i: any) => i.id)));
      }
  };

  const handleBulkDelete = async () => {
      if (onDeleteMultipleItems) {
          await onDeleteMultipleItems([...selectedIds]);
          setSelectedIds(new Set());
      }
  };

  useEffect(() => { setSelectedIds(new Set()); }, [currentPage]);

  const getAttributeNames = (ids: string[]) => {
      if (!ids || ids.length === 0) return '-';
      return ids.map(id => attributes.find((a: any) => a.id === id)?.name).filter(Boolean).join(', ');
  };

  const handleEdit = (item: any) => {
      setEditingItem({...item, attribute_ids: item.attribute_ids || [], packaging_factor_ids: (item.packaging_factor_ids || []).map(String)});
  };

  const classic = currentStyle === 'classic';

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

  const xpSelect: React.CSSProperties = {
      fontFamily: 'Tahoma, Arial, sans-serif',
      fontSize: 11,
      border: '1px solid #7f9db9',
      background: '#fff',
      padding: '2px 4px',
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
      position: 'sticky' as const,
      top: 30, // below the 30px classic top bar
      zIndex: 5,
      background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
      borderBottom: '2px solid #808080',
  };

  const xpStatusBar: React.CSSProperties = {
      background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)',
      borderTop: '1px solid #b0a898',
      padding: '2px 8px',
      fontFamily: 'Tahoma, Arial, sans-serif',
      fontSize: '10px',
      color: '#222222',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
  };

  return (
    <div className="row g-4 fade-in">
      <CodeConfigModal
           isOpen={isConfigOpen}
           onClose={() => setIsConfigOpen(false)}
           type="ITEM"
           onSave={handleSaveConfig}
           initialConfig={codeConfig}
           attributes={attributes}
       />

       <BulkImportModal
           isOpen={isImportOpen}
           onClose={() => setIsImportOpen(false)}
           onImport={onImportItems}
           onDownloadTemplate={onDownloadTemplate}
           title="Bulk Import Items"
       />

      {/* Create Modal */}
      <ModalWrapper
          isOpen={isCreateOpen}
          modeless
          onClose={() => { setIsCreateOpen(false); setNameManuallyEdited(false); setFormCatL1(''); setFormCatL2(''); setFormCatL3(''); setCreateBeam(false); setBeamName(''); setBeamUom(''); setBeamNameManuallyEdited(false); }}
          title={<span data-testid="modal-title"><i className="bi bi-box-seam me-2"></i>{t('create')} {forcedCategory ? t('sample_masters') : t('item_inventory')}</span>}
          variant="primary"
          size="md"
          footer={
              <>
                  <button
                      type="button"
                      style={classic ? xpBtn() : undefined}
                      className={classic ? '' : 'btn btn-secondary'}
                      onClick={() => { setIsCreateOpen(false); setNameManuallyEdited(false); setFormCatL1(''); setFormCatL2(''); setFormCatL3(''); setCreateBeam(false); setBeamName(''); setBeamUom(''); setBeamNameManuallyEdited(false); }}
                  >{t('cancel')}</button>
                  <button
                      data-testid="submit-create-item"
                      type="button"
                      style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#ffffff', fontWeight: 'bold' }) : undefined}
                      className={classic ? '' : 'btn btn-primary fw-bold px-4'}
                      onClick={() => (document.getElementById('create-item-form') as HTMLFormElement)?.requestSubmit()}
                  >{createBeam && isRawMaterialCategory ? 'Create 2 Items' : t('create')}</button>
              </>
          }
      >
          <form id="create-item-form" onSubmit={handleSubmitItem} data-testid="create-item-modal">
              <div className="mb-3">
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 } : undefined}
                      className={classic ? '' : 'form-label d-flex justify-content-between align-items-center small text-muted'}
                  >
                      {t('item_code')}
                      <i className="bi bi-gear-fill text-muted" style={{cursor: 'pointer'}} onClick={() => setIsConfigOpen(true)} title="Configure Auto-Suggestion"></i>
                  </label>
                  <input data-testid="item-code-input" style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} placeholder="ITM-001" value={newItem.code} onChange={e => {
                      const code = e.target.value;
                      setNewItem(prev => ({ ...prev, code, name: nameManuallyEdited ? prev.name : code }));
                  }} required />
              </div>
              <div className="mb-3">
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                      className={classic ? '' : 'form-label small text-muted'}
                  >{t('item_name')}</label>
                  <input data-testid="item-name-input" style={classic ? xpInput : undefined} className={classic ? '' : 'form-control'} placeholder="Product Name" value={newItem.name} onChange={e => {
                      setNameManuallyEdited(true);
                      setNewItem(prev => ({ ...prev, name: e.target.value }));
                  }} required />
              </div>
              <div className="mb-3">
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                      className={classic ? '' : 'form-label small text-muted'}
                  >{t('categories')}</label>
                  <TreeSelect
                      options={catTreeOptions}
                      value={effectiveFormCategoryId || ''}
                      onChange={handleFormCategoryChange}
                      allowEmpty
                      emptyLabel="— None —"
                      size="sm"
                      style={{ width: '100%' }}
                  />
              </div>
              <div className="mb-3">
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                      className={classic ? '' : 'form-label small text-muted'}
                  >{t('uom')}</label>
                  <select data-testid="uom-select" style={classic ? { ...xpInput, height: 'auto', padding: '2px 4px', width: '100%' } : undefined} className={classic ? '' : 'form-select'} value={newItem.uom} onChange={e => setNewItem({...newItem, uom: e.target.value, packaging_factor_ids: []})} required>
                      <option value="">Unit...</option>
                      {(uoms || []).map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
              </div>

              {/* Packaging Units */}
              <div className="mb-3">
                {classic ? (
                  <div style={{ border: '1px solid #a0988c', padding: '6px 8px 8px', position: 'relative', marginTop: 2 }}>
                    <span style={{ position: 'absolute', top: -7, left: 8, background: '#ece9d8', padding: '0 4px', fontSize: '10px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase' as const, letterSpacing: '0.4px', fontFamily: 'Tahoma, Arial, sans-serif' }}>
                      Packaging Units
                    </span>
                    <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                      {(() => {
                        const factors = (uoms || []).flatMap((u: any) => (u.factors || []).filter((f: any) => f.to_uom_name === newItem.uom));
                        if (!newItem.uom) return <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>Select a UoM first</span>;
                        if (factors.length === 0) return <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>No packaging units defined for this UoM</span>;
                        return factors.map((f: any) => {
                          const active = newItem.packaging_factor_ids.includes(String(f.id));
                          return (
                            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'center' }}>
                              <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000' }}>{f.from_uom_name}</span>
                              <div>
                                <button type="button"
                                  style={{
                                    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px',
                                    padding: '0 5px', height: '18px', cursor: 'pointer',
                                    borderRadius: 0, border: '1px solid',
                                    borderColor: active ? '#1a3a7a #0a2a5a #0a2a5a #1a3a7a' : '#dfdfdf #808080 #808080 #dfdfdf',
                                    background: active ? 'linear-gradient(to bottom, #316ac5, #1a4a8a)' : 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
                                    color: active ? '#fff' : '#000',
                                  }}
                                  onClick={() => setNewItem(prev => ({
                                    ...prev,
                                    packaging_factor_ids: active
                                      ? prev.packaging_factor_ids.filter((id: string) => id !== String(f.id))
                                      : [...prev.packaging_factor_ids, String(f.id)],
                                  }))}
                                >
                                  &times;{parseFloat(f.value)} {newItem.uom}
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="form-label small text-muted">Packaging Units</label>
                    <div className="border rounded p-2" style={{ background: '#f8f9fa' }}>
                      {(() => {
                        const factors = (uoms || []).flatMap((u: any) => (u.factors || []).filter((f: any) => f.to_uom_name === newItem.uom));
                        if (!newItem.uom) return <small className="text-muted fst-italic">Select a UoM first</small>;
                        if (factors.length === 0) return <small className="text-muted fst-italic">No packaging units defined for this UoM</small>;
                        return (
                          <div className="d-flex flex-column gap-1">
                            {factors.map((f: any) => {
                              const active = newItem.packaging_factor_ids.includes(String(f.id));
                              return (
                                <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'center' }}>
                                  <small className="text-muted">{f.from_uom_name}</small>
                                  <button type="button"
                                    className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    style={{ fontSize: 10, padding: '1px 6px', width: 'fit-content' }}
                                    onClick={() => setNewItem(prev => ({
                                      ...prev,
                                      packaging_factor_ids: active
                                        ? prev.packaging_factor_ids.filter((id: string) => id !== String(f.id))
                                        : [...prev.packaging_factor_ids, String(f.id)],
                                    }))}
                                  >
                                    &times;{parseFloat(f.value)} {newItem.uom}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div className="row g-2 mb-3">
                  <div className="col-5">
                      <label
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                          className={classic ? '' : 'form-label small text-muted'}
                      >Weight / Unit</label>
                      <input
                          style={classic ? xpInput : undefined}
                          className={classic ? '' : 'form-control'}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 280"
                          value={newItem.weight_per_unit}
                          onChange={e => setNewItem({...newItem, weight_per_unit: e.target.value})}
                      />
                  </div>
                  <div className="col-4">
                      <label
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                          className={classic ? '' : 'form-label small text-muted'}
                      >Unit</label>
                      <select
                          style={classic ? { ...xpInput, height: 'auto', padding: '2px 4px', width: '100%' } : undefined}
                          className={classic ? '' : 'form-select'}
                          value={newItem.weight_unit}
                          onChange={e => setNewItem({...newItem, weight_unit: e.target.value})}
                      >
                          <option value="gsm">gsm</option>
                          <option value="g/m²">g/m²</option>
                          <option value="oz/yd²">oz/yd²</option>
                          <option value="g/y">g/y</option>
                      </select>
                  </div>
              </div>

              <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                      style={classic ? { cursor: 'pointer' } : undefined}
                      className={classic ? '' : 'form-check-input'}
                      type="checkbox"
                      id="new-lot-tracked"
                      checked={newItem.lot_tracked}
                      onChange={e => setNewItem({ ...newItem, lot_tracked: e.target.checked })}
                  />
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', cursor: 'pointer', margin: 0 } : { margin: 0 }}
                      className={classic ? '' : 'form-check-label small'}
                      htmlFor="new-lot-tracked"
                  >Lot tracked — every receipt, production output and transfer requires a lot number</label>
              </div>

              <div className="mb-3">
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                      className={classic ? '' : 'form-label small text-muted'}
                  >Reorder point (min stock) — flags low stock when total on-hand drops below this. Blank = default (10).</label>
                  <input
                      type="number" min="0" step="any"
                      style={classic ? { ...xpInput, height: 'auto', padding: '2px 4px', width: '100%' } : undefined}
                      className={classic ? '' : 'form-control'}
                      value={newItem.min_stock_level}
                      onChange={e => setNewItem({ ...newItem, min_stock_level: e.target.value })}
                      placeholder="10"
                  />
              </div>

              <div className="mb-3">
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                      className={classic ? '' : 'form-label small text-muted'}
                  >Default source location — where this item is normally pulled from when staging to production</label>
                  <TreeSelect
                      options={locPickerTreeOptions}
                      value={newItem.default_source_location_id}
                      onChange={id => setNewItem({ ...newItem, default_source_location_id: id })}
                      allowEmpty
                      emptyLabel="— None —"
                      size="sm"
                      style={{ width: '100%' }}
                  />
              </div>

              <div className="mb-3">
                  <label
                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2 } : undefined}
                      className={classic ? '' : 'form-label small text-muted d-block'}
                  >{t('attributes')}</label>
                  <div
                      style={classic ? { display: 'flex', flexWrap: 'wrap' as const, gap: 6, padding: '4px 6px', background: '#f5f4ef', border: '1px solid #b0a898', maxHeight: 120, overflowY: 'auto' as const } : { maxHeight: 120, overflowY: 'auto' as const }}
                      className={classic ? '' : 'd-flex flex-wrap gap-2 p-2 border rounded bg-light'}
                  >
                      {attributes.map((attr: any) => (
                          <div key={attr.id} style={classic ? { display: 'flex', alignItems: 'center', gap: 4 } : undefined} className={classic ? '' : 'form-check'}>
                              <input
                                  style={classic ? { cursor: 'pointer' } : undefined}
                                  className={classic ? '' : 'form-check-input'}
                                  type="checkbox"
                                  id={`new-attr-${attr.id}`}
                                  checked={newItem.attribute_ids.includes(attr.id)}
                                  onChange={() => toggleAttribute(attr.id, false)}
                              />
                              <label
                                  style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', cursor: 'pointer' } : undefined}
                                  className={classic ? '' : 'form-check-label small'}
                                  htmlFor={`new-attr-${attr.id}`}
                              >
                                  {attr.name}
                              </label>
                          </div>
                      ))}
                      {attributes.length === 0 && <small style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#888', fontStyle: 'italic' } : undefined} className={classic ? '' : 'text-muted fst-italic'}>No attributes defined</small>}
                  </div>
              </div>

              {newItem.source_sample_id && (
                  <div className="mb-3">
                      {classic ? (
                          <div style={{ border: '1px solid #7f9db9', background: '#dce4f5', padding: '4px 8px', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#0d2a6e' }}>
                              ↖ Derived from sample: <strong>{newItem.source_sample_code}{newItem.source_color_name ? ` · ${newItem.source_color_name}` : ''}</strong>
                          </div>
                      ) : (
                          <div className="alert alert-info py-2 px-3 mb-0 small">
                              <i className="bi bi-arrow-up-left me-1"></i>
                              Derived from sample: <strong>{newItem.source_sample_code}{newItem.source_color_name ? ` · ${newItem.source_color_name}` : ''}</strong>
                          </div>
                      )}
                  </div>
              )}

              {isRawMaterialCategory && (
                  <div className="mb-0">
                      {classic ? (
                          <div style={{ border: '1px solid #aca899', borderRadius: 3, padding: '10px 8px 8px', background: '#f5f4ee', position: 'relative', marginTop: 4 }}>
                              <span style={{ position: 'absolute', top: -8, left: 8, background: '#f5f4ee', padding: '0 4px', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#444' }}>Also Create Beam Item</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: createBeam ? 8 : 0 }}>
                                  <input
                                      type="checkbox"
                                      id="create-beam-check"
                                      checked={createBeam}
                                      onChange={e => { setCreateBeam(e.target.checked); setBeamNameManuallyEdited(false); }}
                                      style={{ cursor: 'pointer' }}
                                  />
                                  <label htmlFor="create-beam-check" style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000', cursor: 'pointer', margin: 0 }}>
                                      Create beam item <strong>BEAM-{newItem.code || '...'}</strong>
                                  </label>
                              </div>
                              {createBeam && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                                          <div style={{ flex: 1 }}>
                                              <label style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#555', display: 'block', marginBottom: 2 }}>Beam Name</label>
                                              <input
                                                  style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', border: '1px solid #7f9db9', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.15)', padding: '2px 4px', background: '#fff', color: '#000', width: '100%' }}
                                                  value={beamName}
                                                  onChange={e => { setBeamNameManuallyEdited(true); setBeamName(e.target.value); }}
                                                  placeholder={`Beam - ${newItem.name}`}
                                              />
                                          </div>
                                          <div style={{ width: 80 }}>
                                              <label style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#555', display: 'block', marginBottom: 2 }}>UOM</label>
                                              <select
                                                  style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', border: '1px solid #7f9db9', padding: '2px 4px', background: '#fff', color: '#000', width: '100%' }}
                                                  value={beamUom}
                                                  onChange={e => setBeamUom(e.target.value)}
                                              >
                                                  <option value="">-- same --</option>
                                                  {(uoms || []).map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                                              </select>
                                          </div>
                                      </div>
                                      <div style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '9px', color: '#888' }}>
                                          Code: BEAM-{newItem.code || '...'} · Category: Beam (WIP) · BOM defined manually in BOM Designer
                                      </div>
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="border rounded p-2 bg-light">
                              <div className="form-check mb-0">
                                  <input
                                      className="form-check-input"
                                      type="checkbox"
                                      id="create-beam-check"
                                      checked={createBeam}
                                      onChange={e => { setCreateBeam(e.target.checked); setBeamNameManuallyEdited(false); }}
                                  />
                                  <label className="form-check-label small" htmlFor="create-beam-check">
                                      Also create beam item <strong>BEAM-{newItem.code || '...'}</strong>
                                  </label>
                              </div>
                              {createBeam && (
                                  <div className="mt-2 d-flex gap-2 align-items-end">
                                      <div className="flex-grow-1">
                                          <label className="form-label small text-muted mb-1">Beam Name</label>
                                          <input
                                              className="form-control form-control-sm"
                                              value={beamName}
                                              onChange={e => { setBeamNameManuallyEdited(true); setBeamName(e.target.value); }}
                                              placeholder={`Beam - ${newItem.name}`}
                                          />
                                      </div>
                                      <div style={{ width: 90 }}>
                                          <label className="form-label small text-muted mb-1">UOM</label>
                                          <select
                                              className="form-select form-select-sm"
                                              value={beamUom}
                                              onChange={e => setBeamUom(e.target.value)}
                                          >
                                              <option value="">-- same --</option>
                                              {(uoms || []).map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                                          </select>
                                      </div>
                                  </div>
                              )}
                              {createBeam && (
                                  <small className="text-muted d-block mt-1">Code: BEAM-{newItem.code || '...'} · Category: Beam (WIP) · BOM defined manually</small>
                              )}
                          </div>
                      )}
                  </div>
              )}
          </form>
      </ModalWrapper>

      {/* LEFT COLUMN: Items List */}
      <div className={`${activeEditingItem ? 'col-md-8' : 'col-12'} order-2 order-md-1`}>
        {/* ── Outer shell: XP bevel in classic, Bootstrap card in default ── */}
        <div
          style={classic ? xpBevel : undefined}
          className={classic ? '' : 'card h-100 border-0 shadow-sm'}
        >
          {/* ── Title bar ── */}
          {classic ? (
            <div style={xpTitleBar}>
              {/* Left: title + selection info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>
                  <i className="bi bi-box-seam" style={{ marginRight: '6px' }}></i>
                  {forcedCategory ? t('sample_masters') : t('item_inventory')}
                </span>
                {selectedIds.size > 0 && (
                  <span style={{ fontSize: '10px', color: '#cce8ff', fontWeight: 'normal' }}>
                    — {selectedIds.size} selected
                  </span>
                )}
              </div>
              {/* Right: action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {selectedIds.size > 0 && (
                  <>
                    <button
                      style={xpBtn({ background: 'linear-gradient(to bottom, #ff6060, #cc0000)', borderColor: '#800000 #4a0000 #4a0000 #800000', color: '#ffffff' })}
                      onClick={handleBulkDelete}
                    >
                      <i className="bi bi-trash"></i> Delete ({selectedIds.size})
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cce8ff', textDecoration: 'underline', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', padding: 0 }}
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Clear
                    </button>
                    <div style={xpSep}></div>
                  </>
                )}
                <button
                  style={xpBtn()}
                  onClick={() => setIsImportOpen(true)}
                >
                  <i className="bi bi-upload"></i> Import
                </button>
                <button
                  data-testid="create-item-btn"
                  style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' })}
                  onClick={openCreateModal}
                >
                  <i className="bi bi-plus-lg"></i> {t('create')}
                </button>
              </div>
            </div>
          ) : (
            <div className="card-header bg-white">
              <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                      <h5 className="card-title mb-0">{forcedCategory ? t('sample_masters') : t('item_inventory')}</h5>
                      <p className="text-muted small mb-0 mt-1">
                          {forcedCategory ? 'Manage product samples and prototypes' : 'Master list of all products and materials'}
                      </p>
                      {selectedIds.size > 0 && (
                          <div className="d-flex align-items-center gap-2 mt-2">
                              <span className="text-muted small">{selectedIds.size} selected</span>
                              <button className="btn btn-sm btn-danger" onClick={handleBulkDelete}>
                                  <i className="bi bi-trash me-1"></i>Delete Selected
                              </button>
                              <button className="btn btn-sm btn-link text-secondary p-0" onClick={() => setSelectedIds(new Set())}>
                                  Clear
                              </button>
                          </div>
                      )}
                  </div>
                  <div className="d-flex gap-2">
                      <button className="btn btn-light btn-sm border" onClick={() => setIsImportOpen(true)}>
                          <i className="bi bi-upload me-2"></i>Import
                      </button>
                      <button data-testid="create-item-btn" className="btn btn-primary btn-sm" onClick={openCreateModal}>
                          <i className="bi bi-plus-lg me-2"></i>{t('create')}
                      </button>
                  </div>
              </div>
              {/* Filter Bar */}
              <div className="row g-2 align-items-center bg-light p-2 rounded border">
                  <div className="col-md-5">
                      <div className="input-group input-group-sm">
                          <span className="input-group-text bg-white border-end-0"><i className="bi bi-search"></i></span>
                          <input
                              type="text"
                              className="form-control border-start-0"
                              placeholder={`${t('search')}...`}
                              value={searchTerm}
                              onChange={e => onSearchChange(e.target.value)}
                          />
                      </div>
                  </div>
                  {!forcedCategory && (
                  <>
                  <div className="col-md-3">
                      <TreeSelect
                          options={catTreeOptions}
                          value={categoryL3 || categoryL2 || categoryL1}
                          onChange={handleCategoryTreeChange}
                          allowEmpty
                          emptyLabel="All Categories"
                          size="sm"
                      />
                  </div>
                  <div className="col-md-1">
                      <button className="btn btn-sm btn-outline-secondary w-100" onClick={() => { setCategoryL1(''); setCategoryL2(''); setCategoryL3(''); }} disabled={!categoryL1 && !categoryL2 && !categoryL3}>Clear</button>
                  </div>
                  </>
                  )}
              </div>
            </div>
          )}

          {/* ── XP Toolbar (search + filter) ── */}
          {classic && (
            <>
              <div style={xpToolbar}>
                <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', fontWeight: 'bold' }}>
                  <i className="bi bi-search" style={{ marginRight: '4px', fontSize: '10px' }}></i>
                </span>
                <input
                  type="text"
                  style={{ ...xpInput, width: '180px' }}
                  placeholder={`${t('search')} items…`}
                  value={searchTerm}
                  onChange={e => onSearchChange(e.target.value)}
                />
                <div style={{ marginLeft: 'auto', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#555555' }}>
                  {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} on page
                </div>
              </div>
              {/* Category filter row */}
              {!forcedCategory && (
                <div style={{ ...xpToolbar, gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap', fontFamily: 'Tahoma, Arial, sans-serif' }}>Category:</span>
                  <TreeSelect
                    options={catTreeOptions}
                    value={categoryL3 || categoryL2 || categoryL1}
                    onChange={handleCategoryTreeChange}
                    allowEmpty
                    emptyLabel="All"
                    style={{ width: 200 }}
                  />
                  <button style={xpBtn()} onClick={() => { setCategoryL1(''); setCategoryL2(''); setCategoryL3(''); }}>
                    Clear
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Table ── */}
          <div className={classic ? '' : 'card-body p-0'}>
            <div className={classic ? '' : 'table-responsive'}>
              <table
                className={classic ? '' : 'table table-hover align-middle mb-0'}
                style={classic ? {
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontFamily: 'Tahoma, Arial, sans-serif',
                    fontSize: '11px',
                    background: '#ffffff',
                } : undefined}
              >
                <thead>
                  <tr
                    style={classic ? xpTableHeader : undefined}
                    className={classic ? '' : 'table-light'}
                  >
                    <th style={classic ? { ...xpThCell, width: '32px', textAlign: 'center' } : { width: '40px' }} className={classic ? '' : 'ps-3'}>
                        <input
                            className="form-check-input"
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = someSelected; }}
                            onChange={toggleSelectAll}
                        />
                    </th>
                    <th style={classic ? { ...xpThCell, width: '110px', cursor: 'pointer' } : { cursor: 'pointer' }} className={classic ? '' : 'ps-4'} onClick={() => toggleSort('code')} title="Sort">{t('item_code')}<SortMark sort={sort} colKey="code" /></th>
                    <th style={classic ? { ...xpThCell, cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => toggleSort('name')} title="Sort">{t('item_name')}<SortMark sort={sort} colKey="name" /></th>
                    <th style={classic ? { ...xpThCell, width: '110px', cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => toggleSort('category')} title="Sort">{t('categories')}<SortMark sort={sort} colKey="category" /></th>
                    <th style={classic ? { ...xpThCell, width: '90px' } : undefined}>{t('source_sample')}</th>
                    <th style={classic ? xpThCell : undefined}>{t('attributes')}</th>
                    <th style={classic ? { ...xpThCell, width: '90px', cursor: 'pointer' } : { width: '90px', cursor: 'pointer' }} onClick={() => toggleSort('weight')} title="Sort">{t('weight_per_unit')}<SortMark sort={sort} colKey="weight" /></th>
                    <th style={classic ? { ...xpThCell, width: '80px', borderRight: 'none' } : { width: '80px' }}>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item: any, idx: number) => (
                    <InventoryRow
                        key={item.id}
                        item={item}
                        rowIndex={idx}
                        isEditing={editingItem?.id === item.id}
                        isSelected={selectedIds.has(item.id)}
                        onToggleSelect={toggleSelect}
                        onEdit={handleEdit}
                        onDelete={onDeleteItem}
                        onViewHistory={setHistoryEntityId}
                        getAttributeNames={getAttributeNames}
                        classic={classic}
                    />
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        style={classic ? { padding: 0, background: '#ffffff' } : undefined}
                        className={classic ? '' : 'text-center text-muted py-5'}
                      >
                        {classic ? (
                          <XPEmptyState message="No items found" icon="bi-box-seam">
                            <button style={{ ...xpBtn(), marginTop: 10 }} onClick={openCreateModal}>
                              <i className="bi bi-plus-lg" style={{ marginRight: 4 }} />{t('create')}
                            </button>
                          </XPEmptyState>
                        ) : 'No items found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Footer / Pagination ── */}
          {classic ? (
            <div style={xpStatusBar}>
              <span>
                {selectedIds.size > 0
                  ? `${selectedIds.size} of ${totalItems} item${totalItems !== 1 ? 's' : ''} selected`
                  : `${totalItems} item${totalItems !== 1 ? 's' : ''} total`}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  style={xpBtn({ opacity: currentPage <= 1 ? 0.5 : 1, cursor: currentPage <= 1 ? 'default' : 'pointer' })}
                  onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  ◀ Prev
                </button>
                <span style={{
                    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px',
                    background: '#dce4f5', border: '1px solid #7f9db9',
                    padding: '1px 10px', color: '#000000', fontWeight: 'bold',
                }}>
                  Page {currentPage} of {totalPages || 1}
                </span>
                <button
                  style={xpBtn({ opacity: currentPage >= totalPages ? 0.5 : 1, cursor: currentPage >= totalPages ? 'default' : 'pointer' })}
                  onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Next ▶
                </button>
              </div>
              <span>Showing {startRange}–{endRange} of {totalItems}</span>
            </div>
          ) : (
            <div className="card-footer bg-white border-top py-2 px-4 d-flex justify-content-between align-items-center">
              <div className="small text-muted font-monospace">
                  Showing {startRange}-{endRange} of {totalItems} items
              </div>
              <div className="btn-group">
                  <button
                    className={`btn btn-sm btn-light border ${currentPage <= 1 ? 'disabled opacity-50' : ''}`}
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  >
                      <i className="bi bi-chevron-left me-1"></i>Previous
                  </button>
                  <div className="btn btn-sm btn-white border-top border-bottom px-3 fw-bold">
                      Page {currentPage} of {totalPages || 1}
                  </div>
                  <button
                    className={`btn btn-sm btn-light border ${currentPage >= totalPages ? 'disabled opacity-50' : ''}`}
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                  >
                      Next<i className="bi bi-chevron-right ms-1"></i>
                  </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Edit Form */}
      {activeEditingItem && (
      <div className="col-md-4 order-1 order-md-2">
        <div
          style={classic
            ? { ...xpBevel, position: 'sticky', top: '24px', zIndex: 100 }
            : { top: '24px', zIndex: 100 }}
          className={classic ? '' : 'card sticky-top border-0 shadow-lg border-primary border-opacity-50'}
        >
          {/* Edit panel title bar */}
          {classic ? (
            <div style={xpTitleBar}>
              <span><i className="bi bi-pencil-square" style={{ marginRight: '6px' }}></i>{t('edit')} Item</span>
            </div>
          ) : (
            <div className="card-header bg-primary text-white">
               <h5 className="card-title mb-0">
                   <span><i className="bi bi-pencil-square me-2"></i>{t('edit')}</span>
               </h5>
            </div>
          )}
          <div
            className={classic ? '' : 'card-body'}
            style={classic ? { background: '#f0efe8', padding: '10px' } : undefined}
          >
                <form onSubmit={handleUpdateItemSubmit} className="mb-4">
                    <div className="mb-3">
                        <label
                          className={classic ? '' : 'form-label small text-muted'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                        >
                          {t('item_code')}
                        </label>
                        <input
                          className={classic ? '' : 'form-control'}
                          style={classic ? { ...xpInput, width: '100%', boxSizing: 'border-box' } : undefined}
                          value={editingItem.code}
                          onChange={e => setEditingItem({...editingItem, code: e.target.value})}
                          required
                        />
                    </div>
                    <div className="mb-3">
                        <label
                          className={classic ? '' : 'form-label small text-muted'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                        >
                          {t('item_name')}
                        </label>
                        <input
                          className={classic ? '' : 'form-control'}
                          style={classic ? { ...xpInput, width: '100%', boxSizing: 'border-box' } : undefined}
                          value={editingItem.name}
                          onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                          required
                        />
                    </div>
                    <div className="mb-3">
                        <label
                          className={classic ? '' : 'form-label small text-muted'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                        >
                          {t('categories')}
                        </label>
                        <TreeSelect
                            options={catTreeOptions}
                            value={effectiveFormCategoryId || ''}
                            onChange={handleFormCategoryChange}
                            allowEmpty
                            emptyLabel="— None —"
                            size="sm"
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div className="mb-3">
                        <label
                          className={classic ? '' : 'form-label small text-muted'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                        >
                          {t('uom')}
                        </label>
                        <select
                          className={classic ? '' : 'form-select'}
                          style={classic ? { ...xpSelect, width: '100%', boxSizing: 'border-box', height: '22px' } : undefined}
                          value={editingItem.uom}
                          onChange={e => setEditingItem({...editingItem, uom: e.target.value, packaging_factor_ids: []})}
                          required
                        >
                            <option value="">Unit...</option>
                            {(uoms || []).map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                        </select>
                    </div>

                    {/* Packaging Units */}
                    <div className="mb-3">
                      {classic ? (
                        <div style={{ border: '1px solid #a0988c', padding: '6px 8px 8px', position: 'relative', marginTop: 2 }}>
                          <span style={{ position: 'absolute', top: -7, left: 8, background: '#ece9d8', padding: '0 4px', fontSize: '10px', fontWeight: 'bold', color: '#444', textTransform: 'uppercase' as const, letterSpacing: '0.4px', fontFamily: 'Tahoma, Arial, sans-serif' }}>
                            Packaging Units
                          </span>
                          <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                            {(() => {
                              const factors = (uoms || []).flatMap((u: any) => (u.factors || []).filter((f: any) => f.to_uom_name === editingItem.uom));
                              if (!editingItem.uom) return <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>Select a UoM first</span>;
                              if (factors.length === 0) return <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>No packaging units defined for this UoM</span>;
                              return factors.map((f: any) => {
                                const active = (editingItem.packaging_factor_ids || []).includes(String(f.id));
                                return (
                                  <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'center' }}>
                                    <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#000' }}>{f.from_uom_name}</span>
                                    <div>
                                      <button type="button"
                                        style={{
                                          fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px',
                                          padding: '0 5px', height: '18px', cursor: 'pointer',
                                          borderRadius: 0, border: '1px solid',
                                          borderColor: active ? '#1a3a7a #0a2a5a #0a2a5a #1a3a7a' : '#dfdfdf #808080 #808080 #dfdfdf',
                                          background: active ? 'linear-gradient(to bottom, #316ac5, #1a4a8a)' : 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
                                          color: active ? '#fff' : '#000',
                                        }}
                                        onClick={() => setEditingItem((prev: any) => ({
                                          ...prev,
                                          packaging_factor_ids: active
                                            ? (prev.packaging_factor_ids || []).filter((id: string) => id !== String(f.id))
                                            : [...(prev.packaging_factor_ids || []), String(f.id)],
                                        }))}
                                      >
                                        &times;{parseFloat(f.value)} {editingItem.uom}
                                      </button>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="form-label small text-muted">Packaging Units</label>
                          <div className="border rounded p-2" style={{ background: '#f8f9fa' }}>
                            {(() => {
                              const factors = (uoms || []).flatMap((u: any) => (u.factors || []).filter((f: any) => f.to_uom_name === editingItem.uom));
                              if (!editingItem.uom) return <small className="text-muted fst-italic">Select a UoM first</small>;
                              if (factors.length === 0) return <small className="text-muted fst-italic">No packaging units defined for this UoM</small>;
                              return (
                                <div className="d-flex flex-column gap-1">
                                  {factors.map((f: any) => {
                                    const active = (editingItem.packaging_factor_ids || []).includes(String(f.id));
                                    return (
                                      <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'center' }}>
                                        <small className="text-muted">{f.from_uom_name}</small>
                                        <button type="button"
                                          className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                                          style={{ fontSize: 10, padding: '1px 6px', width: 'fit-content' }}
                                          onClick={() => setEditingItem((prev: any) => ({
                                            ...prev,
                                            packaging_factor_ids: active
                                              ? (prev.packaging_factor_ids || []).filter((id: string) => id !== String(f.id))
                                              : [...(prev.packaging_factor_ids || []), String(f.id)],
                                          }))}
                                        >
                                          &times;{parseFloat(f.value)} {editingItem.uom}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="row g-2 mb-3">
                        <div className="col-6">
                            <label
                              className={classic ? '' : 'form-label small text-muted'}
                              style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                            >Weight / Unit</label>
                            <input
                              className={classic ? '' : 'form-control'}
                              style={classic ? { ...xpInput, width: '100%', boxSizing: 'border-box' } : undefined}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 280"
                              value={editingItem.weight_per_unit || ''}
                              onChange={e => setEditingItem({...editingItem, weight_per_unit: e.target.value})}
                            />
                        </div>
                        <div className="col-6">
                            <label
                              className={classic ? '' : 'form-label small text-muted'}
                              style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                            >Weight Unit</label>
                            <select
                              className={classic ? '' : 'form-select'}
                              style={classic ? { ...xpSelect, width: '100%', boxSizing: 'border-box', height: '22px' } : undefined}
                              value={editingItem.weight_unit || 'gsm'}
                              onChange={e => setEditingItem({...editingItem, weight_unit: e.target.value})}
                            >
                                <option value="gsm">gsm</option>
                                <option value="g/m²">g/m²</option>
                                <option value="oz/yd²">oz/yd²</option>
                                <option value="g/y">g/y</option>
                            </select>
                        </div>
                    </div>

                    <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          className={classic ? '' : 'form-check-input'}
                          style={classic ? { cursor: 'pointer' } : undefined}
                          type="checkbox"
                          id="edit-lot-tracked"
                          checked={!!editingItem.lot_tracked}
                          onChange={e => setEditingItem({ ...editingItem, lot_tracked: e.target.checked })}
                        />
                        <label
                          className={classic ? '' : 'form-check-label small'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', cursor: 'pointer', margin: 0 } : { margin: 0 }}
                          htmlFor="edit-lot-tracked"
                        >Lot tracked — every receipt, production output and transfer requires a lot number</label>
                    </div>

                    <div className="mb-3">
                        <label
                          className={classic ? '' : 'form-label small text-muted'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                        >Reorder point (min stock) — blank = default (10)</label>
                        <input
                          type="number" min="0" step="any"
                          className={classic ? '' : 'form-control'}
                          style={classic ? { ...xpSelect, width: '100%', boxSizing: 'border-box', height: '22px' } : undefined}
                          value={editingItem.min_stock_level ?? ''}
                          onChange={e => setEditingItem({ ...editingItem, min_stock_level: e.target.value })}
                          placeholder="10"
                        />
                    </div>

                    <div className="mb-3">
                        <label
                          className={classic ? '' : 'form-label small text-muted'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                        >Default source location — where this item is normally pulled from when staging to production</label>
                        <TreeSelect
                          options={locPickerTreeOptions}
                          value={editingItem.default_source_location_id ?? ''}
                          onChange={id => setEditingItem({ ...editingItem, default_source_location_id: id || null })}
                          allowEmpty
                          emptyLabel="— None —"
                          size="sm"
                          style={{ width: '100%' }}
                        />
                    </div>

                    <div className="mb-3">
                        <label
                          className={classic ? '' : 'form-label small text-muted d-block'}
                          style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#333333', display: 'block', marginBottom: '2px' } : undefined}
                        >
                          {t('attributes')}
                        </label>
                        <div
                          className={classic ? '' : 'd-flex flex-wrap gap-2 p-2 border rounded bg-light'}
                          style={classic ? {
                              display: 'flex', flexWrap: 'wrap' as const, gap: '4px',
                              padding: '4px', border: '1px solid #7f9db9',
                              background: '#ffffff', maxHeight: '100px', overflowY: 'auto' as const,
                          } : undefined}
                        >
                            {attributes.map((attr: any) => (
                                <div key={attr.id} className="form-check">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id={`edit-attr-${attr.id}`}
                                        checked={editingItem.attribute_ids?.includes(attr.id)}
                                        onChange={() => toggleAttribute(attr.id, true)}
                                    />
                                    <label
                                      className={classic ? '' : 'form-check-label small'}
                                      style={classic ? { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '10px', color: '#000000' } : undefined}
                                      htmlFor={`edit-attr-${attr.id}`}
                                    >
                                        {attr.name}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                        {classic ? (
                          <>
                            <button
                              type="button"
                              style={xpBtn()}
                              onClick={() => setEditingItem(null)}
                            >
                              {t('cancel')}
                            </button>
                            <button
                              type="submit"
                              style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold', padding: '2px 16px' })}
                            >
                              {t('save')}
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn btn-sm btn-light text-muted" onClick={() => setEditingItem(null)}>{t('cancel')}</button>
                            <button type="submit" className="btn btn-primary btn-sm px-3">{t('save')}</button>
                          </>
                        )}
                    </div>
                </form>
          </div>
        </div>
      </div>
      )}

      {historyEntityId && (
          <HistoryPane
              entityType="Item"
              entityId={historyEntityId}
              onClose={() => setHistoryEntityId(null)}
          />
      )}
    </div>
  );
}
