import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useTheme } from '../../context/ThemeContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import { useData } from '../../context/DataContext';
import { useUser } from '../../context/UserContext';
import CodeConfigModal, { CodeConfig, buildCodeWithCounter } from '../shared/CodeConfigModal';
import SearchableSelect from '../shared/SearchableSelect';
import HistoryPane from '../shared/HistoryPane';
import ModalWrapper from '../shared/ModalWrapper';
const SamplePrintModal = dynamic(() => import('./SamplePrintModal'), { ssr: false });
import { StatusChip, StatusCountPill, TableSkeleton, useTableSkeletonMetrics, FormSection, useFloatingMenu, FloatingMenu, MenuTriggerButton, XPActionButton, familyColor, expandedRowFrame, CodeChip, xpFont } from '../shared/xpTheme';
import { ShellWindow, ShellTitleBar, xpToolbar, SearchField, FilterChipBar, ToolbarCount } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import RequestDetailPanel, { getStatusStripe } from '../shared/RequestDetailPanel';
import { STATIC_BASE, API_BASE } from '../shared/apiBase';
import { SAMPLE_PAGE_SIZE } from '../../context/DataContext';
import { lvThead } from '../shared/listViewTheme';

// Request classification, chosen at create time. Values are the `Sample Category`
// system attribute (system_role='sample_category') — New Sample / Re Sample / Yardage
// are only the seeded defaults; users add their own on the Attributes page. The
// request stores the value id plus a text snapshot, so this map is nothing but an
// alias for the enum keys the column held before the attribute existed.
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
    NEW_SAMPLE: 'New Sample',
    RE_SAMPLE: 'Re Sample',
    YARDAGE: 'Yardage',
};
const DEFAULT_CATEGORY_LABEL = 'New Sample';
const categoryLabel = (v?: string) =>
    (v ? (LEGACY_CATEGORY_LABELS[v] ?? v) : DEFAULT_CATEGORY_LABEL);

export default function SampleRequestView({ samples, customers, onCreateSample, onEditSample, onUpdateStatus, onUpdateColorStatus, onDeleteSample, onMarkRead, onMarkUnread, onMarkAllRead }: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { formatDate: tzDate } = useTimezone();
  const { hasPermission, hasAnyPermission } = useUser();
  const canManage = hasAnyPermission('sample_request.create', 'sample_request.edit', 'sample_request.delete');

  const handleApproveColor = (sampleId: string, colorId: string, colorName: string) => {
      setApproveTarget({ sampleId, colorId, colorName });
      setApproveNotes('');
      setApproveImage(null);
  };
  const { companyProfile, attributes, loading: dataLoading, authFetch, samplesMeta, loadSamples } = useData();

  // Combos are fetched via server-side typeahead (see comboResults below) rather than
  // the combo variant attribute's values — the library is too large to ship inline.
  const colorOptions = useMemo(() => {
    const attr = (attributes as any[]).find((a: any) => a.system_role === 'color');
    return (attr?.values ?? []).map((v: any) => ({ value: v.value, label: v.value }));
  }, [attributes]);
  const colorsAttrName = useMemo(() => {
    return (attributes as any[]).find((a: any) => a.system_role === 'color')?.name ?? null;
  }, [attributes]);
  const comboAttrName = useMemo(() => {
    return (attributes as any[]).find((a: any) => a.system_role === 'combo')?.name ?? null;
  }, [attributes]);
  const materialOptions = useMemo(() => {
    const attr = (attributes as any[]).find((a: any) => a.system_role === 'material');
    return (attr?.values ?? []).map((v: any) => ({ value: v.value, label: v.value }));
  }, [attributes]);
  // Request categories — attribute values, so the dropdown grows with whatever the
  // user curates on the Attributes page (id is what gets stored and filtered on).
  const categoryOptions = useMemo(() => {
    const attr = (attributes as any[]).find((a: any) => a.system_role === 'sample_category');
    return (attr?.values ?? []).map((v: any) => ({ id: String(v.id), label: v.value as string }));
  }, [attributes]);
  const categoryIdByLabel = (label?: string) => {
    if (!label) return '';
    const wanted = (LEGACY_CATEGORY_LABELS[label] ?? label).toLowerCase();
    return categoryOptions.find((c: any) => c.label.toLowerCase() === wanted)?.id ?? '';
  };
  const defaultCategory = () => {
    const preferred = categoryOptions.find((c: any) => c.label === DEFAULT_CATEGORY_LABEL);
    const pick = preferred ?? categoryOptions[0];
    return { category_value_id: pick?.id ?? '', category: pick?.label ?? '' };
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSample, setEditingSample] = useState<any>(null);
  const [printSample, setPrintSample] = useState<any>(null);
  const { openId: openDropdownId, pos: dropdownPos, toggle: toggleDropdown, close: closeDropdown } = useFloatingMenu(180);
  // Row "⋯" overflow menu (Edit / Print / Log) — separate from the status-update menu above
  const { openId: rowMenuId, pos: rowMenuPos, toggle: toggleRowMenu, close: closeRowMenu } = useFloatingMenu(170);
  const [historyEntityId, setHistoryEntityId] = useState<string | null>(null);
  // searchTerm is the live input echo; searchQuery is the debounced value that
  // actually hits the backend (the list is server-filtered — see loadSamples).
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  // Created-date range (inclusive both ends), applied server-side like every other filter here.
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [samplePage, setSamplePage] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [completionImageFile, setCompletionImageFile] = useState<File | null>(null);
  const [completionImagePreviewUrl, setCompletionImagePreviewUrl] = useState<string | null>(null);
  const [designPdfFile, setDesignPdfFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<{ url: string; type: 'image' | 'pdf' | 'excel'; filename: string } | null>(null);

  const getDesignFileType = (url: string): 'pdf' | 'image' | 'excel' => {
      const ext = url.split('.').pop()?.toLowerCase() || '';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
      if (['xlsx', 'xls'].includes(ext)) return 'excel';
      return 'pdf';
  };
  // Approval / rejection proof photo on a color row — one per side, opens the same
  // preview modal the request-level attachments use.
  const statusPhotoThumb = (url?: string | null, label = 'Photo') => {
      if (!url) return null;
      const full = `${STATIC_BASE}${url}`;
      return (
          <img src={full} alt={label} title={`${label} — click to preview`}
              onClick={() => setFilePreview({ url: full, type: 'image', filename: url.split('/').pop() || 'photo' })}
              style={{ maxHeight: 40, maxWidth: 64, border: '1px solid #b0a898', cursor: 'pointer', display: 'block', margin: '0 auto' }} />
      );
  };
  const toggleExpand = (id: string) =>
      setExpandedIds(prev => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
      });
  const [pendingColorName, setPendingColorName] = useState('');
  const [pendingColorIsRepeat, setPendingColorIsRepeat] = useState(false);
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  // ── Reject confirmation (reason + notes) ────────────────────────────────
  const REJECT_REASONS = [
      'Color mismatch',
      'Shade too dark',
      'Shade too light',
      'Quality defect',
      'Wrong material',
      'Measurement out of spec',
      'Hand-feel / texture',
      'Customer changed requirement',
      'Other',
  ];
  const [rejectTarget, setRejectTarget] = useState<{ sampleId: string; colorId: string; colorName: string } | null>(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectImage, setRejectImage] = useState<File | null>(null);

  const openRejectModal = (sampleId: string, colorId: string, colorName: string) => {
      setRejectTarget({ sampleId, colorId, colorName });
      setRejectReason(REJECT_REASONS[0]);
      setRejectNotes('');
      setRejectImage(null);
  };
  const confirmReject = () => {
      if (!rejectTarget) return;
      onUpdateColorStatus(rejectTarget.sampleId, rejectTarget.colorId, 'REJECTED', rejectReason, rejectNotes, rejectImage);
      setRejectTarget(null);
  };

  // ── Approve confirmation (note + photo, mirrors the reject side) ─────────
  const [approveTarget, setApproveTarget] = useState<{ sampleId: string; colorId: string; colorName: string } | null>(null);
  const [approveNotes, setApproveNotes] = useState('');
  const [approveImage, setApproveImage] = useState<File | null>(null);
  const confirmApprove = () => {
      if (!approveTarget) return;
      onUpdateColorStatus(approveTarget.sampleId, approveTarget.colorId, 'APPROVED', undefined, approveNotes, approveImage);
      setApproveTarget(null);
  };

  // Existing codes sharing a prefix. The list is server-paginated, so "is this
  // code taken?" can no longer be answered from the rows currently on screen —
  // it's a narrow indexed prefix query instead.
  const fetchCodesWithPrefix = async (prefix: string): Promise<Set<string>> => {
      try {
          const res = await authFetch(`${API_BASE}/samples/codes?prefix=${encodeURIComponent(prefix)}`);
          if (!res.ok) return new Set();
          return new Set<string>(await res.json());
      } catch { return new Set(); }
  };

  // Build a revision-indexed code from a parent: ROOT-R1, ROOT-R2, …
  // Strips an existing -R<n> suffix so revisions chain off the original root,
  // and bumps to one past the highest revision already in the system.
  const buildRevisionCode = async (parentCode: string): Promise<string> => {
      const m = (parentCode || '').match(/^(.*)-R(\d+)$/);
      const root = m ? m[1] : (parentCode || '');
      const existing = await fetchCodesWithPrefix(`${root}-R`);
      let maxRev = 0;
      existing.forEach((c: string) => {
          const rm = c.match(/^(.*)-R(\d+)$/);
          if (rm && rm[1] === root) maxRev = Math.max(maxRev, parseInt(rm[2], 10));
      });
      let next = maxRev + 1;
      let code = `${root}-R${next}`;
      while (existing.has(code)) { next++; code = `${root}-R${next}`; }
      return code;
  };

  // Clone a rejected color into a brand-new sample request (carry over all specs)
  const createNewFromRejected = async (sample: any, color: any) => {
      setEditingSample(null);
      const revCode = await buildRevisionCode(sample.code);
      const revNum = revCode.match(/-R(\d+)$/)?.[1] ?? '1';
      setNewSample({
          code: revCode,
          request_date: today,
          customer_id: sample.customer_id || '',
          project: sample.project || '',
          customer_article_code: sample.customer_article_code || '',
          internal_article_code: sample.internal_article_code || '',
          width: sample.width || '',
          // Cloning a rejected color into a fresh request is a re-sample by definition
          // (falls back to the request's own category if that value was renamed away).
          category_value_id: categoryIdByLabel('Re Sample') || categoryIdByLabel(sample.category),
          category: categoryIdByLabel('Re Sample') ? 'Re Sample' : categoryLabel(sample.category),
          variant_type: (sample.variant_type || 'color') as 'color' | 'combo',
          colors: [{ name: color.name, is_repeat: true }],
          main_material: sample.main_material || '',
          middle_material: sample.middle_material || '',
          bottom_material: sample.bottom_material || '',
          weft: sample.weft || '',
          warp: sample.warp || '',
          original_weight: sample.original_weight != null ? String(sample.original_weight) : '',
          original_weight_unit: sample.original_weight_unit || 'g/y',
          production_weight: sample.production_weight != null ? String(sample.production_weight) : '',
          production_weight_unit: sample.production_weight_unit || 'g/y',
          additional_info: sample.additional_info || '',
          quantity: sample.quantity || '',
          sample_size: sample.sample_size || '',
          estimated_completion_date: '',
          completion_description: '',
          notes: `Revision #${revNum} of ${sample.code} — color "${color.name}"` + (color.rejection_reason ? ` (rejected: ${color.rejection_reason})` : ''),
      });
      setPendingColorName('');
      setPendingColorIsRepeat(false);
      setCompletionImageFile(null);
      setDesignPdfFile(null);
      setIsCreateOpen(true);
  };

  useEffect(() => {
      if (!completionImageFile) { setCompletionImagePreviewUrl(null); return; }
      const url = URL.createObjectURL(completionImageFile);
      setCompletionImagePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
  }, [completionImageFile]);

  // Auto-expand and scroll to highlighted sample from ?highlight= param
  const highlightId = searchParams?.get('highlight');
  useEffect(() => {
      if (!highlightId || !samples?.length) return;
      setExpandedIds(prev => { const next = new Set(prev); next.add(highlightId); return next; });
      setTimeout(() => {
          highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
  }, [highlightId, samples?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Section chrome now comes from the shared <FormSection> (xpTheme).
  const xpLbl: React.CSSProperties = {
      fontFamily: xpFont,
      fontSize: '11px',
      color: '#000',
      display: 'block',
      marginBottom: 2,
  };

  // ── XP shared inline styles ──────────────────────────────────────────────
  const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
      fontFamily: xpFont,
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
      fontFamily: xpFont,
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
  };

  const tdBase: React.CSSProperties = {
      padding: '4px 6px',
      borderRight: '1px solid #c0bdb5',
      borderBottom: '1px solid #d0cdc8',
      verticalAlign: 'middle' as const,
      fontFamily: xpFont,
      fontSize: '11px',
  };

  const today = new Date().toISOString().split('T')[0];
  const emptyForm = () => ({
      code: '',
      request_date: today,
      customer_id: '',
      project: '',
      customer_article_code: '',
      internal_article_code: '',
      width: '',
      category_value_id: '',
      category: '',
      variant_type: 'color' as 'color' | 'combo',
      colors: [] as { id?: string; name: string; is_repeat: boolean }[],
      main_material: '',
      middle_material: '',
      bottom_material: '',
      weft: '',
      warp: '',
      original_weight: '',
      original_weight_unit: 'g/y',
      production_weight: '',
      production_weight_unit: 'g/y',
      additional_info: '',
      quantity: '',
      sample_size: '',
      estimated_completion_date: '',
      completion_description: '',
      notes: '',
  });
  const [newSample, setNewSample] = useState(emptyForm());

  // The id is what the request stores; the label rides along as the snapshot the
  // backend re-resolves anyway, so the list can render without a second lookup.
  const pickCategory = (valueId: string) => {
      const opt = categoryOptions.find((c: any) => c.id === valueId);
      setNewSample(prev => ({ ...prev, category_value_id: valueId, category: opt?.label ?? '' }));
  };
  // /attributes may land after the create modal opens — preselect the default then.
  useEffect(() => {
      if (!isCreateOpen || editingSample || newSample.category_value_id) return;
      const d = defaultCategory();
      if (d.category_value_id) setNewSample(prev => (prev.category_value_id ? prev : { ...prev, ...d }));
  }, [isCreateOpen, editingSample, categoryOptions, newSample.category_value_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Server-side combo typeahead. The Combo Library can hold thousands of values —
  // too many to ship to every client via /attributes — so the combo picker queries
  // /combos on each keystroke instead of filtering an in-memory list. This guarantees
  // a typed combo resolves regardless of library size. (status=active excludes
  // archived server-side; colors stay client-side, being a bounded variant attr.)
  const [comboQuery, setComboQuery] = useState('');
  const [comboResults, setComboResults] = useState<{ value: string; label: string; subLabel?: string }[]>([]);
  useEffect(() => {
      if (!isCreateOpen || newSample.variant_type !== 'combo') return;
      let cancelled = false;
      const handle = setTimeout(async () => {
          try {
              const params = new URLSearchParams({ status: 'active', size: '50' });
              const q = comboQuery.trim();
              if (q) params.set('search', q);
              const res = await authFetch(`${API_BASE}/combos?${params.toString()}`);
              if (!res.ok || cancelled) return;
              const d = await res.json();
              if (cancelled) return;
              setComboResults((d.items ?? []).map((c: any) => ({
                  value: c.name, label: c.name, subLabel: c.code,
              })));
          } catch { /* silent */ }
      }, 300);
      return () => { cancelled = true; clearTimeout(handle); };
  }, [comboQuery, isCreateOpen, newSample.variant_type, authFetch]);

  const removeColorRow = (idx: number) =>
      setNewSample(prev => ({ ...prev, colors: prev.colors.filter((_, i) => i !== idx) }));

  const addPendingColor = () => {
      const name = pendingColorName.trim();
      if (!name) return;
      if (newSample.colors.some(c => c.name.toLowerCase() === name.toLowerCase())) {
          showToast(`"${name}" has already been added to this sample`, 'warning');
          return;
      }
      setNewSample(prev => ({ ...prev, colors: [...prev.colors, { name, is_repeat: pendingColorIsRepeat }] }));
      setPendingColorName('');
  };

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [codeConfig, setCodeConfig] = useState<CodeConfig>({
      prefix: 'SMP',
      suffix: '',
      separator: '-',
      includeItemCode: false,
      includeVariant: false,
      variantAttributeNames: [],
      includeYear: true,
      includeMonth: true
  });

  useEffect(() => {
      const savedConfig = localStorage.getItem('sample_code_config');
      if (savedConfig) {
          try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
      }
  }, []);

  const handleSaveConfig = async (newConfig: CodeConfig) => {
      setCodeConfig(newConfig);
      localStorage.setItem('sample_code_config', JSON.stringify(newConfig));
      const code = await suggestSampleCode(newConfig);
      setNewSample(prev => ({ ...prev, code }));
  };

  // Everything before the counter segment is fixed for a given config — take it
  // from where two consecutive candidates diverge, and only those codes need
  // checking for the next free counter.
  const codePrefixOf = (config: CodeConfig) => {
      const a = buildCodeWithCounter(config, 1);
      const b = buildCodeWithCounter(config, 2);
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      return a.slice(0, i);
  };

  const suggestSampleCode = async (config = codeConfig) => {
      const existing = await fetchCodesWithPrefix(codePrefixOf(config));
      let counter = 1;
      let code = buildCodeWithCounter(config, counter);
      while (existing.has(code)) {
          counter++;
          code = buildCodeWithCounter(config, counter);
      }
      return code;
  };

  const openCreateModal = async () => {
      setEditingSample(null);
      setIsCreateOpen(true);
      if (!newSample.code) {
          const code = await suggestSampleCode();
          setNewSample(prev => (prev.code ? prev : { ...prev, code }));
      }
  };

  const openEditModal = (sample: any) => {
      setEditingSample(sample);
      setNewSample({
          code: sample.code,
          request_date: sample.request_date || today,
          customer_id: sample.customer_id || '',
          project: sample.project || '',
          customer_article_code: sample.customer_article_code || '',
          internal_article_code: sample.internal_article_code || '',
          width: sample.width || '',
          // Rows created before the attribute existed carry only the text snapshot —
          // match it back to a value so editing doesn't blank the field.
          category_value_id: sample.category_value_id ? String(sample.category_value_id) : categoryIdByLabel(sample.category),
          category: categoryLabel(sample.category),
          variant_type: (sample.variant_type || 'color') as 'color' | 'combo',
          colors: (sample.colors || []).map((c: any) => ({ id: c.id, name: c.name, is_repeat: c.is_repeat })),
          main_material: sample.main_material || '',
          middle_material: sample.middle_material || '',
          bottom_material: sample.bottom_material || '',
          weft: sample.weft || '',
          warp: sample.warp || '',
          original_weight: sample.original_weight != null ? String(sample.original_weight) : '',
          original_weight_unit: sample.original_weight_unit || 'g/y',
          production_weight: sample.production_weight != null ? String(sample.production_weight) : '',
          production_weight_unit: sample.production_weight_unit || 'g/y',
          additional_info: sample.additional_info || '',
          quantity: sample.quantity || '',
          sample_size: sample.sample_size || '',
          estimated_completion_date: sample.estimated_completion_date || '',
          completion_description: sample.completion_description || '',
          notes: sample.notes || '',
      });
      setPendingColorName('');
      setPendingColorIsRepeat(false);
      setCompletionImageFile(null);
      setDesignPdfFile(null);
      setIsCreateOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const payload = {
          ...newSample,
          customer_id: newSample.customer_id || null,
          // '' would fail UUID validation; the backend falls back to the text snapshot
          category_value_id: newSample.category_value_id || null,
          original_weight: newSample.original_weight !== '' ? parseFloat(newSample.original_weight) : null,
          original_weight_unit: newSample.original_weight !== '' ? newSample.original_weight_unit : null,
          production_weight: newSample.production_weight !== '' ? parseFloat(newSample.production_weight) : null,
          production_weight_unit: newSample.production_weight !== '' ? newSample.production_weight_unit : null,
          estimated_completion_date: newSample.estimated_completion_date || null,
          colors: newSample.colors.filter(c => c.name.trim() !== ''),
      };
      if (editingSample) {
          onEditSample(editingSample.id, payload);
      } else {
          onCreateSample(payload, completionImageFile || undefined, designPdfFile || undefined);
      }
      setNewSample(emptyForm());
      setPendingColorName('');
      setPendingColorIsRepeat(false);
      setCompletionImageFile(null);
      setDesignPdfFile(null);
      setEditingSample(null);
      setIsCreateOpen(false);
  };


  // ── Color panel status-button styles (segmented control) ─────────────────────
  const cbBase: React.CSSProperties = {
      fontFamily: xpFont,
      fontSize: '10px',
      padding: '1px 7px',
      cursor: 'pointer',
      borderRadius: 0,
      whiteSpace: 'nowrap' as const,
      border: '1px solid',
  };
  const cbInprod = (active: boolean): React.CSSProperties => ({
      ...cbBase,
      background: active ? 'linear-gradient(to bottom, #ffe082, #c77800)' : 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
      borderColor: active ? '#a06000 #603000 #603000 #a06000' : '#d0cfc8 #a0a09a #a0a09a #d0cfc8',
      color: active ? '#3e2000' : '#666',
      fontWeight: active ? 'bold' : 'normal',
      borderRight: 'none',
  });
  const cbSend = (active: boolean): React.CSSProperties => ({
      ...cbBase,
      background: active ? 'linear-gradient(to bottom, #5a8fd8, #2a5faa)' : 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
      borderColor: active ? '#1a3a7a #0a1a4a #0a1a4a #1a3a7a' : '#d0cfc8 #a0a09a #a0a09a #d0cfc8',
      color: active ? '#fff' : '#666',
      fontWeight: active ? 'bold' : 'normal',
      borderRight: 'none',
  });
  const cbApprove = (active: boolean): React.CSSProperties => ({
      ...cbBase,
      background: active ? 'linear-gradient(to bottom, #4cae4c, #2d7a2d)' : 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
      borderColor: active ? '#1b5e20 #0a3e0a #0a3e0a #1b5e20' : '#d0cfc8 #a0a09a #a0a09a #d0cfc8',
      color: active ? '#fff' : '#666',
      fontWeight: active ? 'bold' : 'normal',
      borderRight: 'none',
  });
  const cbReject = (active: boolean): React.CSSProperties => ({
      ...cbBase,
      background: active ? 'linear-gradient(to bottom, #d32f2f, #8b0000)' : 'linear-gradient(to bottom, #f5f5f5, #e0dfd8)',
      borderColor: active ? '#7f0000 #4a0000 #4a0000 #7f0000' : '#d0cfc8 #a0a09a #a0a09a #d0cfc8',
      color: active ? '#fff' : '#666',
      fontWeight: active ? 'bold' : 'normal',
  });

  const createItemFromColor = (sample: any, color: any) => {
      const suggestedCode = encodeURIComponent(`${sample.code}-${color.name}`);
      router.push(
          `/inventory?source_sample_id=${sample.id}&source_color_id=${color.id}` +
          `&suggested_code=${suggestedCode}` +
          `&source_sample_code=${encodeURIComponent(sample.code)}` +
          `&source_color_name=${encodeURIComponent(color.name)}`
      );
  };

  const getCustomerName = (id: string) => (customers || []).find((c: any) => c.id === id)?.name || '—';

  const STATUS_FILTERS = ['ALL', 'IN_PRODUCTION', 'SENT', 'APPROVED', 'REJECTED'];
  // IN_PRODUCTION is abbreviated so the chip row still fits one toolbar line.
  const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map(s => ({ value: s, label: s === 'IN_PRODUCTION' ? 'IN PROD' : s }));

  // `samples` IS the current page — search, status/category, date range and
  // paging are all resolved by the backend. Nothing is filtered client-side:
  // the table can hold tens of thousands of requests and is never loaded whole.
  const pageSamples = samples;

  // Skeleton sizing: measure one real row so the placeholders shown on the next
  // load are exactly as tall as the rows that replace them.
  const listBodyRef = useRef<HTMLTableSectionElement>(null);
  const skel = useTableSkeletonMetrics('sample-requests', listBodyRef, pageSamples.length > 0);
  const totalSamples = samplesMeta.total;
  const unreadCount = samplesMeta.unread;
  // Footer tallies run at COLOR grain, not request grain — a request is a bag of colors
  // each approved/rejected on its own, so "12 approved" at request level hides the real
  // progress. Computed server-side over the whole filtered set, not just this page.
  const colorStats = useMemo(() => ({
      total: 0, PENDING: 0, IN_PRODUCTION: 0, SENT: 0, APPROVED: 0, REJECTED: 0,
      ...(samplesMeta.colorStats || {}),
  }) as Record<string, number>, [samplesMeta.colorStats]);

  const hasActiveFilter = !!searchTerm || statusFilter !== 'ALL' || categoryFilter !== 'ALL' || !!createdFrom || !!createdTo;
  const clearFilters = () => {
      setSearchTerm('');
      setSearchQuery('');
      setStatusFilter('ALL');
      setCategoryFilter('ALL');
      setCreatedFrom('');
      setCreatedTo('');
  };

  // Debounce the search box: the input echoes instantly, the fetch fires after
  // the pause (same shape as DataContext's item search).
  useEffect(() => {
      const id = setTimeout(() => setSearchQuery(searchTerm), 350);
      return () => clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => { setSamplePage(1); }, [searchQuery, statusFilter, categoryFilter, createdFrom, createdTo]);

  // A ?highlight=<id> deep link must stay reachable even once paginated — the
  // server resolves which page holds that row under the active filters and
  // returns it, so we follow its `page` back into local state (once).
  const focusConsumedRef = useRef(false);
  useEffect(() => {
      const focusId = highlightId && !focusConsumedRef.current ? highlightId : undefined;
      if (focusId) focusConsumedRef.current = true;
      loadSamples({
          page: samplePage,
          search: searchQuery,
          status: statusFilter,
          categoryValueId: categoryFilter,
          createdFrom,
          createdTo,
          focusId,
      });
  }, [samplePage, searchQuery, statusFilter, categoryFilter, createdFrom, createdTo, highlightId, loadSamples]);

  useEffect(() => {
      if (samplesMeta.page && samplesMeta.page !== samplePage) setSamplePage(samplesMeta.page);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samplesMeta.page]);

  const clampedSamplePage = samplePage;

  return (
    <>
       <CodeConfigModal
           isOpen={isConfigOpen}
           onClose={() => setIsConfigOpen(false)}
           type="SAMPLE"
           onSave={handleSaveConfig}
           initialConfig={codeConfig}
           attributes={[]}
       />

       {/* Approve Color Modal */}
       <ModalWrapper
           isOpen={!!approveTarget}
           modeless
           onClose={() => setApproveTarget(null)}
           title={<><i className="bi bi-check-circle me-2"></i>Approve Color{approveTarget ? ` — ${approveTarget.colorName}` : ''}</>}
           variant="success"
           size="md"
           footer={
               <>
                   <button type="button"
                       style={classic ? xpBtn() : undefined}
                       className={classic ? '' : 'btn btn-sm btn-link text-muted'}
                       onClick={() => setApproveTarget(null)}>{t('cancel')}</button>
                   <button type="button"
                       style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #2e7d32, #1b5e20)', borderColor: '#155016 #0d3810 #0d3810 #155016', color: '#fff', fontWeight: 'bold' }) : undefined}
                       className={classic ? '' : 'btn btn-sm btn-success px-4 fw-bold'}
                       onClick={confirmApprove}>Approve</button>
               </>
           }
       >
           <div style={{ fontSize: 12 }}>
               <p className="text-muted small mb-3">
                   Approve {approveTarget ? <strong>&quot;{approveTarget.colorName}&quot;</strong> : 'this color'}? Status will be locked and cannot be changed after approval.
               </p>
               <div className="mb-3">
                   <label className="form-label small fw-bold">Notes <span className="fw-normal text-muted">(optional)</span></label>
                   <textarea className="form-control form-control-sm" rows={3} value={approveNotes}
                       onChange={e => setApproveNotes(e.target.value)}
                       placeholder="Sign-off detail for this approval…" />
               </div>
               <div>
                   <label className="form-label small fw-bold">Photo <span className="fw-normal text-muted">(optional)</span></label>
                   <input type="file" accept="image/*" className="form-control form-control-sm"
                       onChange={e => setApproveImage(e.target.files?.[0] || null)} />
                   {approveImage && <div className="small text-muted mt-1">{approveImage.name}</div>}
               </div>
           </div>
       </ModalWrapper>

       {/* Reject Color Modal — reason + optional notes */}
       <ModalWrapper
           isOpen={!!rejectTarget}
           modeless
           onClose={() => setRejectTarget(null)}
           title={<><i className="bi bi-x-octagon me-2"></i>Reject Color{rejectTarget ? ` — ${rejectTarget.colorName}` : ''}</>}
           variant="danger"
           size="md"
           footer={
               <>
                   <button type="button"
                       style={classic ? xpBtn() : undefined}
                       className={classic ? '' : 'btn btn-sm btn-link text-muted'}
                       onClick={() => setRejectTarget(null)}>{t('cancel')}</button>
                   <button type="button"
                       style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #d32f2f, #8b0000)', borderColor: '#7f0000 #4a0000 #4a0000 #7f0000', color: '#fff', fontWeight: 'bold' }) : undefined}
                       className={classic ? '' : 'btn btn-sm btn-danger px-4 fw-bold'}
                       onClick={confirmReject}>Reject Color</button>
               </>
           }
       >
           <div style={{ fontSize: 12 }}>
               <p className="text-muted small mb-3">
                   Rejecting rests this color and logs the rejection. It can be reopened for another attempt; every round is kept in the sample report. Pick a reason below.
               </p>
               <div className="mb-3">
                   <label className="form-label small fw-bold">Rejection Reason <span className="text-danger">*</span></label>
                   <select className="form-select form-select-sm" value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
                       {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                   </select>
               </div>
               <div className="mb-3">
                   <label className="form-label small fw-bold">Notes <span className="fw-normal text-muted">(optional)</span></label>
                   <textarea className="form-control form-control-sm" rows={3} value={rejectNotes}
                       onChange={e => setRejectNotes(e.target.value)}
                       placeholder="Extra detail for this rejection…" />
               </div>
               <div>
                   <label className="form-label small fw-bold">Photo <span className="fw-normal text-muted">(optional)</span></label>
                   <input type="file" accept="image/*" className="form-control form-control-sm"
                       onChange={e => setRejectImage(e.target.files?.[0] || null)} />
                   {rejectImage && <div className="small text-muted mt-1">{rejectImage.name}</div>}
               </div>
           </div>
       </ModalWrapper>

       {/* Create / Edit Modal */}
       <ModalWrapper
           isOpen={isCreateOpen}
           modeless
           onClose={() => { setIsCreateOpen(false); setEditingSample(null); }}
           title={editingSample
               ? <><i className="bi bi-pencil me-2"></i>Edit Sample Request — {editingSample.code}</>
               : <><i className="bi bi-eyedropper me-2"></i>New Sample Request</>
           }
           variant="primary"
           size="lg"
           footer={
               <>
                   <button
                       type="button"
                       style={classic ? xpBtn() : undefined}
                       className={classic ? '' : 'btn btn-sm btn-link text-muted'}
                       onClick={() => { setIsCreateOpen(false); setEditingSample(null); }}
                   >{t('cancel')}</button>
                   <button
                       type="button"
                       style={classic ? xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#ffffff', fontWeight: 'bold' }) : undefined}
                       className={classic ? '' : 'btn btn-sm btn-primary px-4 fw-bold'}
                       onClick={handleSubmit as any}
                   >{editingSample ? 'Save Changes' : 'Create Request'}</button>
               </>
           }
       >
           <form onSubmit={handleSubmit} id="create-sample-form">

               {/* ══ ① Identity ══ */}
               <FormSection title="① Identity" classic={classic}>
               {classic ? (
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                               <div>
                                   <label style={{ ...xpLbl, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                       <span>Request Code <span style={{ fontWeight: 'normal', color: '#a00' }}>*</span></span>
                                       {!editingSample && <i className="bi bi-gear-fill" style={{ cursor: 'pointer', color: '#555', fontSize: 10 }} onClick={() => setIsConfigOpen(true)} title="Configure Auto-Suggestion" />}
                                   </label>
                                   <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const, ...(editingSample ? { background: '#f0f0f0', color: '#666' } : {}) }}
                                          value={newSample.code} onChange={e => !editingSample && setNewSample({ ...newSample, code: e.target.value })}
                                          placeholder="Auto-generated" required readOnly={!!editingSample} />
                               </div>
                               <div>
                                   <label style={xpLbl}>Request Date <span style={{ fontWeight: 'normal', color: '#a00' }}>*</span></label>
                                   <input type="date" style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }}
                                          value={newSample.request_date} onChange={e => setNewSample({ ...newSample, request_date: e.target.value })} required />
                               </div>
                               <div style={{ gridColumn: '1 / -1' }}>
                                   <label style={xpLbl}>Category <span style={{ fontWeight: 'normal', color: '#a00' }}>*</span></label>
                                   <select style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const, height: 20 }}
                                           value={newSample.category_value_id}
                                           onChange={e => pickCategory(e.target.value)} required>
                                       <option value="">Select Category…</option>
                                       {categoryOptions.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                   </select>
                               </div>
                               <div style={{ gridColumn: '1 / -1' }}>
                                   <label style={xpLbl}>Customer <span style={{ fontWeight: 'normal', color: '#888' }}>(Optional)</span></label>
                                   <SearchableSelect
                                       options={[{ value: '', label: 'No Customer (Internal/Prototype)' }, ...(customers || []).map((c: any) => ({ value: c.id, label: c.name }))]}
                                       value={newSample.customer_id}
                                       onChange={(val: string) => setNewSample({ ...newSample, customer_id: val })}
                                       placeholder="Select Customer (Optional)…"
                                   />
                               </div>
                               <div>
                                   <label style={xpLbl}>Project</label>
                                   <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }}
                                          value={newSample.project} onChange={e => setNewSample({ ...newSample, project: e.target.value })}
                                          placeholder="e.g. Spring 2026" />
                               </div>
                               <div>
                                   <label style={xpLbl}>Customer Article Code</label>
                                   <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }}
                                          value={newSample.customer_article_code} onChange={e => setNewSample({ ...newSample, customer_article_code: e.target.value })}
                                          placeholder="Customer's ref code" />
                               </div>
                               <div style={{ gridColumn: '1 / -1' }}>
                                   <label style={xpLbl}>Internal Article Code</label>
                                   <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }}
                                          value={newSample.internal_article_code} onChange={e => setNewSample({ ...newSample, internal_article_code: e.target.value })}
                                          placeholder="Bola Intan ref code" />
                               </div>
                           </div>
               ) : (
                           <div className="row g-2">
                               <div className="col-md-6">
                                   <label className="form-label d-flex justify-content-between align-items-center small text-muted">
                                       Request Code {!editingSample && <i className="bi bi-gear-fill text-muted" style={{ cursor: 'pointer' }} onClick={() => setIsConfigOpen(true)} title="Configure Auto-Suggestion" />}
                                   </label>
                                   <input className="form-control form-control-sm" value={newSample.code} onChange={e => !editingSample && setNewSample({ ...newSample, code: e.target.value })} placeholder="Auto-generated" required readOnly={!!editingSample} />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Request Date</label>
                                   <input type="date" className="form-control form-control-sm" value={newSample.request_date} onChange={e => setNewSample({ ...newSample, request_date: e.target.value })} required />
                               </div>
                               <div className="col-12">
                                   <label className="form-label small text-muted">Category</label>
                                   <select className="form-select form-select-sm"
                                           value={newSample.category_value_id}
                                           onChange={e => pickCategory(e.target.value)} required>
                                       <option value="">Select Category…</option>
                                       {categoryOptions.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                   </select>
                               </div>
                               <div className="col-12">
                                   <label className="form-label small text-muted">Customer <span className="fw-normal">(Optional)</span></label>
                                   <SearchableSelect
                                       options={[{ value: '', label: 'No Customer (Internal/Prototype)' }, ...(customers || []).map((c: any) => ({ value: c.id, label: c.name }))]}
                                       value={newSample.customer_id}
                                       onChange={(val: string) => setNewSample({ ...newSample, customer_id: val })}
                                       placeholder="Select Customer (Optional)…"
                                   />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Project</label>
                                   <input className="form-control form-control-sm" value={newSample.project} onChange={e => setNewSample({ ...newSample, project: e.target.value })} placeholder="e.g. Spring 2026" />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Customer Article Code</label>
                                   <input className="form-control form-control-sm" value={newSample.customer_article_code} onChange={e => setNewSample({ ...newSample, customer_article_code: e.target.value })} placeholder="Customer's ref code" />
                               </div>
                               <div className="col-12">
                                   <label className="form-label small text-muted">Internal Article Code</label>
                                   <input className="form-control form-control-sm" value={newSample.internal_article_code} onChange={e => setNewSample({ ...newSample, internal_article_code: e.target.value })} placeholder="Bola Intan ref code" />
                               </div>
                           </div>
               )}
               </FormSection>

               {/* ══ ② Colors & Specs ══ */}
               {(() => {
                   const isColor = newSample.variant_type === 'color';
                   const addedNames = new Set(newSample.colors.map(c => c.name.toLowerCase()));
                   // Colors filter client-side (bounded); combos come pre-filtered from the
                   // server typeahead so the list works regardless of library size.
                   const activeOptions = (isColor ? colorOptions : comboResults).filter(o => !addedNames.has(o.value.toLowerCase()));
                   const activeOnSearch = isColor ? undefined : setComboQuery;
                   const activeAttrName = isColor ? colorsAttrName : comboAttrName;
                   const switchTab = (tab: 'color' | 'combo') => {
                       if (tab === newSample.variant_type) return;
                       setNewSample(prev => ({ ...prev, variant_type: tab, colors: [] }));
                       setPendingColorName('');
                       setPendingColorIsRepeat(false);
                   };
                   return (
                       <FormSection title="② Colors & Specs" classic={classic}>
                       {classic ? (
                           <>
                               <div style={{ marginBottom: 10 }}>
                                   <label style={xpLbl}>Width</label>
                                   <input style={{ ...xpInput, width: 130 }}
                                          value={newSample.width} onChange={e => setNewSample({ ...newSample, width: e.target.value })}
                                          placeholder="e.g. 8 mm" />
                               </div>
                               {/* Tab bar */}
                               <div style={{ display: 'flex', borderBottom: '2px solid #c0bdb5', marginBottom: 8, gap: 2 }}>
                                   {(['color', 'combo'] as const).map(tab => {
                                       const label = tab === 'color' ? (colorsAttrName || 'Colors') : (comboAttrName || 'Combo');
                                       const active = newSample.variant_type === tab;
                                       return (
                                           <button
                                               key={tab}
                                               type="button"
                                               onClick={() => switchTab(tab)}
                                               style={{
                                                   fontFamily: xpFont, fontSize: 11,
                                                   padding: '2px 12px', cursor: 'pointer',
                                                   border: '1px solid', borderBottom: active ? '2px solid #fff' : '1px solid #c0bdb5',
                                                   marginBottom: active ? -2 : 0,
                                                   borderColor: active ? '#808080 #c0bdb5 transparent #808080' : '#d0cfc8',
                                                   background: active ? '#ffffff' : 'linear-gradient(to bottom, #f5f3ee, #e0dfd8)',
                                                   color: active ? '#000' : '#555', fontWeight: active ? 'bold' : 'normal',
                                               }}
                                           >{label}</button>
                                       );
                                   })}
                                   {activeAttrName && (
                                       <span style={{ fontFamily: xpFont, fontSize: 9, color: '#555', background: '#e8eef8', border: '1px solid #aabbd8', padding: '0 5px', marginLeft: 'auto', alignSelf: 'center' }}>
                                           attr: {activeAttrName}
                                       </span>
                                   )}
                               </div>
                               {/* Added variants */}
                               <div style={{
                                   background: '#f5f9ff', border: '1px solid #b0c8e8', minHeight: 40,
                                   padding: '6px 8px', marginBottom: 6,
                                   display: 'flex', flexWrap: 'wrap' as const, alignContent: 'flex-start' as const,
                               }}>
                                   {newSample.colors.length === 0
                                       ? <span style={{ fontFamily: xpFont, fontSize: 11, color: '#999', fontStyle: 'italic' }}>No variants added yet…</span>
                                       : newSample.colors.map((c, idx) => (
                                           <span key={idx} style={{
                                               display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px',
                                               marginRight: 4, marginBottom: 4,
                                               background: c.is_repeat ? '#dce8f8' : '#e8f4e8',
                                               border: `1px solid ${c.is_repeat ? '#7ab0d8' : '#7aba7a'}`,
                                               fontFamily: xpFont, fontSize: 11,
                                           }}>
                                               <span style={{ fontSize: 9, fontWeight: 'bold', color: c.is_repeat ? '#0047c8' : '#228b22', textTransform: 'uppercase' as const }}>
                                                   {c.is_repeat ? 'RPT' : 'NEW'}
                                               </span>
                                               {c.name}
                                               <span onClick={() => removeColorRow(idx)} style={{ cursor: 'pointer', color: '#a00', marginLeft: 2, fontWeight: 'bold', fontSize: 12, lineHeight: 1 }} title="Remove">×</span>
                                           </span>
                                       ))
                                   }
                               </div>
                               {/* Add row */}
                               <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                   <div style={{ flex: 1 }}>
                                       <SearchableSelect
                                           options={activeOptions}
                                           value={pendingColorName}
                                           onChange={setPendingColorName}
                                           onSearch={activeOnSearch}
                                           placeholder={`Select ${isColor ? 'color' : 'combo'}…`}
                                           size="sm"
                                       />
                                   </div>
                                   <button
                                       type="button"
                                       style={pendingColorIsRepeat
                                           ? xpBtn({ background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', color: '#fff', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', minWidth: 52 })
                                           : xpBtn({ minWidth: 52 })}
                                       onClick={() => setPendingColorIsRepeat(!pendingColorIsRepeat)}
                                       title="Toggle New / Repeat">
                                       {pendingColorIsRepeat ? 'Repeat' : 'New'}
                                   </button>
                                   <button type="button" style={xpBtn()} onClick={addPendingColor}>
                                       <i className="bi bi-plus-lg" /> Add
                                   </button>
                               </div>
                           </>
                       ) : (
                           <>
                               <div className="mb-2">
                                   <label className="form-label small text-muted">Width</label>
                                   <input className="form-control form-control-sm" style={{ maxWidth: 160 }} value={newSample.width} onChange={e => setNewSample({ ...newSample, width: e.target.value })} placeholder="e.g. 8 mm" />
                               </div>
                               {/* Tab bar */}
                               <ul className="nav nav-tabs mb-2" style={{ fontSize: 11 }}>
                                   {(['color', 'combo'] as const).map(tab => {
                                       const label = tab === 'color' ? (colorsAttrName || 'Colors') : (comboAttrName || 'Combo');
                                       return (
                                           <li key={tab} className="nav-item">
                                               <button
                                                   type="button"
                                                   className={`nav-link py-1 px-3 ${newSample.variant_type === tab ? 'active' : ''}`}
                                                   style={{ fontSize: 11 }}
                                                   onClick={() => switchTab(tab)}
                                               >{label}</button>
                                           </li>
                                       );
                                   })}
                                   {activeAttrName && (
                                       <li className="nav-item ms-auto d-flex align-items-center">
                                           <span className="badge bg-secondary bg-opacity-10 text-secondary border" style={{ fontSize: 9, fontWeight: 'normal' }}>attr: {activeAttrName}</span>
                                       </li>
                                   )}
                               </ul>
                               {/* Added variants */}
                               <div className="p-2 mb-2 d-flex flex-wrap" style={{ background: '#f0f5ff', border: '1px solid #c8d8f0', minHeight: 40 }}>
                                   {newSample.colors.length === 0
                                       ? <span className="text-muted fst-italic small">No variants added yet…</span>
                                       : newSample.colors.map((c, idx) => (
                                           <span key={idx} className={`badge me-1 mb-1 d-inline-flex align-items-center gap-1 ${c.is_repeat ? 'bg-primary' : 'bg-success'}`} style={{ fontSize: 11, fontWeight: 'normal' }}>
                                               <small className="fw-bold">{c.is_repeat ? 'RPT' : 'NEW'}</small>
                                               {c.name}
                                               <span onClick={() => removeColorRow(idx)} style={{ cursor: 'pointer', marginLeft: 2 }} title="Remove">×</span>
                                           </span>
                                       ))
                                   }
                               </div>
                               {/* Add row */}
                               <div className="d-flex gap-2 align-items-center">
                                   <div className="flex-grow-1">
                                       <SearchableSelect
                                           options={activeOptions}
                                           value={pendingColorName}
                                           onChange={setPendingColorName}
                                           onSearch={activeOnSearch}
                                           placeholder={`Select ${isColor ? 'color' : 'combo'}…`}
                                           size="sm"
                                       />
                                   </div>
                                   <button type="button" className={`btn btn-sm ${pendingColorIsRepeat ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ minWidth: 60 }} onClick={() => setPendingColorIsRepeat(!pendingColorIsRepeat)}>
                                       {pendingColorIsRepeat ? 'Repeat' : 'New'}
                                   </button>
                                   <button type="button" className="btn btn-sm btn-outline-secondary" onClick={addPendingColor}>
                                       <i className="bi bi-plus-lg me-1" />Add
                                   </button>
                               </div>
                           </>
                       )}
                       </FormSection>
                   );
               })()}

               {/* ══ ③ Materials ══ */}
               <FormSection title="③ Materials" classic={classic}>
               {classic ? (
                           <>
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 12px', marginBottom: 8 }}>
                               {[
                                   { key: 'main_material', label: 'Main Material' },
                                   { key: 'middle_material', label: 'Middle Material' },
                                   { key: 'bottom_material', label: 'Bottom Material' },
                               ].map(({ key, label }) => (
                                   <div key={key}>
                                       <label style={xpLbl}>{label}</label>
                                       <SearchableSelect
                                           options={materialOptions}
                                           value={(newSample as any)[key]}
                                           onChange={(val: string) => setNewSample({ ...newSample, [key]: val })}
                                           placeholder="Select material…"
                                           size="sm"
                                       />
                                   </div>
                               ))}
                           </div>
                           <hr style={{ border: 'none', borderTop: '1px solid #d0cdc8', margin: '4px 0 8px' }} />
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                               <div>
                                   <label style={xpLbl}>Weft</label>
                                   <SearchableSelect
                                       options={materialOptions}
                                       value={newSample.weft}
                                       onChange={(val: string) => setNewSample({ ...newSample, weft: val })}
                                       placeholder="Select material…"
                                       size="sm"
                                   />
                               </div>
                               <div>
                                   <label style={xpLbl}>Warp</label>
                                   <SearchableSelect
                                       options={materialOptions}
                                       value={newSample.warp}
                                       onChange={(val: string) => setNewSample({ ...newSample, warp: val })}
                                       placeholder="Select material…"
                                       size="sm"
                                   />
                               </div>
                               <div>
                                   <label style={xpLbl}>Original Weight</label>
                                   <div style={{ display: 'flex', gap: 2 }}>
                                       <input type="number" step="0.01" style={{ ...xpInput, flex: 1, minWidth: 0 }}
                                              value={newSample.original_weight} onChange={e => setNewSample({ ...newSample, original_weight: e.target.value })}
                                              placeholder="0.00" />
                                       <select style={{ ...xpInput, width: 68, padding: '0 2px' }}
                                               value={newSample.original_weight_unit} onChange={e => setNewSample({ ...newSample, original_weight_unit: e.target.value })}>
                                           <option value="g/y">g/y</option>
                                           <option value="gsm">gsm</option>
                                           <option value="g/m²">g/m²</option>
                                           <option value="oz/yd²">oz/yd²</option>
                                       </select>
                                   </div>
                               </div>
                               <div>
                                   <label style={xpLbl}>Production Weight</label>
                                   <div style={{ display: 'flex', gap: 2 }}>
                                       <input type="number" step="0.01" style={{ ...xpInput, flex: 1, minWidth: 0 }}
                                              value={newSample.production_weight} onChange={e => setNewSample({ ...newSample, production_weight: e.target.value })}
                                              placeholder="0.00" />
                                       <select style={{ ...xpInput, width: 68, padding: '0 2px' }}
                                               value={newSample.production_weight_unit} onChange={e => setNewSample({ ...newSample, production_weight_unit: e.target.value })}>
                                           <option value="g/y">g/y</option>
                                           <option value="gsm">gsm</option>
                                           <option value="g/m²">g/m²</option>
                                           <option value="oz/yd²">oz/yd²</option>
                                       </select>
                                   </div>
                               </div>
                               <div style={{ gridColumn: '1 / -1' }}>
                                   <label style={xpLbl}>Additional Information</label>
                                   <textarea style={{ ...xpInput, height: 'auto', padding: '4px 6px', width: '100%', resize: 'vertical' as const, boxSizing: 'border-box' as const }}
                                             rows={2} value={newSample.additional_info} onChange={e => setNewSample({ ...newSample, additional_info: e.target.value })}
                                             placeholder="e.g. PRINTING ROTARY" />
                               </div>
                           </div>
                           </>
               ) : (
                           <>
                           <div className="row g-2 mb-2">
                               {[
                                   { key: 'main_material', label: 'Main Material' },
                                   { key: 'middle_material', label: 'Middle Material' },
                                   { key: 'bottom_material', label: 'Bottom Material' },
                               ].map(({ key, label }) => (
                                   <div key={key} className="col-md-4">
                                       <label className="form-label small text-muted">{label}</label>
                                       <SearchableSelect
                                           options={materialOptions}
                                           value={(newSample as any)[key]}
                                           onChange={(val: string) => setNewSample({ ...newSample, [key]: val })}
                                           placeholder="Select material…"
                                           size="sm"
                                       />
                                   </div>
                               ))}
                           </div>
                           <hr className="my-2" />
                           <div className="row g-2">
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Weft</label>
                                   <SearchableSelect
                                       options={materialOptions}
                                       value={newSample.weft}
                                       onChange={(val: string) => setNewSample({ ...newSample, weft: val })}
                                       placeholder="Select material…"
                                       size="sm"
                                   />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Warp</label>
                                   <SearchableSelect
                                       options={materialOptions}
                                       value={newSample.warp}
                                       onChange={(val: string) => setNewSample({ ...newSample, warp: val })}
                                       placeholder="Select material…"
                                       size="sm"
                                   />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Original Weight</label>
                                   <div className="input-group input-group-sm">
                                       <input type="number" step="0.01" className="form-control" value={newSample.original_weight} onChange={e => setNewSample({ ...newSample, original_weight: e.target.value })} placeholder="0.00" />
                                       <select className="form-select" style={{ maxWidth: 80 }} value={newSample.original_weight_unit} onChange={e => setNewSample({ ...newSample, original_weight_unit: e.target.value })}>
                                           <option value="g/y">g/y</option>
                                           <option value="gsm">gsm</option>
                                           <option value="g/m²">g/m²</option>
                                           <option value="oz/yd²">oz/yd²</option>
                                       </select>
                                   </div>
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Production Weight</label>
                                   <div className="input-group input-group-sm">
                                       <input type="number" step="0.01" className="form-control" value={newSample.production_weight} onChange={e => setNewSample({ ...newSample, production_weight: e.target.value })} placeholder="0.00" />
                                       <select className="form-select" style={{ maxWidth: 80 }} value={newSample.production_weight_unit} onChange={e => setNewSample({ ...newSample, production_weight_unit: e.target.value })}>
                                           <option value="g/y">g/y</option>
                                           <option value="gsm">gsm</option>
                                           <option value="g/m²">g/m²</option>
                                           <option value="oz/yd²">oz/yd²</option>
                                       </select>
                                   </div>
                               </div>
                               <div className="col-12">
                                   <label className="form-label small text-muted">Additional Information</label>
                                   <textarea className="form-control form-control-sm" rows={2} value={newSample.additional_info} onChange={e => setNewSample({ ...newSample, additional_info: e.target.value })} placeholder="e.g. PRINTING ROTARY" />
                               </div>
                           </div>
                           </>
               )}
               </FormSection>

               {/* ══ ④ Logistics ══ */}
               <FormSection title="④ Logistics" classic={classic}>
               {classic ? (
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                               <div>
                                   <label style={xpLbl}>Sample Quantity</label>
                                   <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }}
                                          value={newSample.quantity} onChange={e => setNewSample({ ...newSample, quantity: e.target.value })}
                                          placeholder="e.g. 1 METER" />
                               </div>
                               <div>
                                   <label style={xpLbl}>Per-Sample Size</label>
                                   <input style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }}
                                          value={newSample.sample_size} onChange={e => setNewSample({ ...newSample, sample_size: e.target.value })}
                                          placeholder="Dimensions" />
                               </div>
                               <div>
                                   <label style={xpLbl}>Est. Completion Date</label>
                                   <input type="date" style={{ ...xpInput, width: '100%', boxSizing: 'border-box' as const }}
                                          value={newSample.estimated_completion_date} onChange={e => setNewSample({ ...newSample, estimated_completion_date: e.target.value })} />
                               </div>
                               <div style={{ gridColumn: '1 / -1' }}>
                                   <label style={xpLbl}>Completion Notes</label>
                                   <textarea style={{ ...xpInput, height: 'auto', padding: '4px 6px', width: '100%', resize: 'vertical' as const, boxSizing: 'border-box' as const }}
                                             rows={2} value={newSample.completion_description} onChange={e => setNewSample({ ...newSample, completion_description: e.target.value })}
                                             placeholder="Priority instructions, special notes…" />
                               </div>
                               {/* Sample Photo */}
                               <div>
                                   <label style={xpLbl}>Sample Photo</label>
                                   <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                       <input type="file" accept="image/*" id="xp-completion-image" style={{ display: 'none' }}
                                              onChange={e => setCompletionImageFile(e.target.files?.[0] || null)} />
                                       <button type="button" style={xpBtn({ padding: '1px 8px' })}
                                               onClick={() => (document.getElementById('xp-completion-image') as HTMLInputElement)?.click()}>
                                           Browse…
                                       </button>
                                       <span style={{ fontFamily: xpFont, fontSize: 10, color: '#444' }}>
                                           {completionImageFile ? completionImageFile.name : 'No file chosen'}
                                       </span>
                                   </div>
                                   {completionImagePreviewUrl && (
                                       <img src={completionImagePreviewUrl}
                                            style={{ marginTop: 4, maxHeight: 72, maxWidth: '100%', border: '1px solid #b0a898', display: 'block' }}
                                            alt="Preview" />
                                   )}
                               </div>
                               {/* Design File */}
                               <div>
                                   <label style={xpLbl}>Design</label>
                                   <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                       <input type="file" accept="application/pdf,image/*,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" id="xp-design-pdf" style={{ display: 'none' }}
                                              onChange={e => setDesignPdfFile(e.target.files?.[0] || null)} />
                                       <button type="button" style={xpBtn({ padding: '1px 8px' })}
                                               onClick={() => (document.getElementById('xp-design-pdf') as HTMLInputElement)?.click()}>
                                           Browse…
                                       </button>
                                       <span style={{ fontFamily: xpFont, fontSize: 10, color: '#444' }}>
                                           {designPdfFile ? designPdfFile.name : 'No file chosen'}
                                       </span>
                                   </div>
                               </div>
                           </div>
               ) : (
                           <div className="row g-2">
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Sample Quantity</label>
                                   <input className="form-control form-control-sm" value={newSample.quantity} onChange={e => setNewSample({ ...newSample, quantity: e.target.value })} placeholder="e.g. 1 METER" />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Per-Sample Size</label>
                                   <input className="form-control form-control-sm" value={newSample.sample_size} onChange={e => setNewSample({ ...newSample, sample_size: e.target.value })} placeholder="Dimensions" />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Est. Completion Date</label>
                                   <input type="date" className="form-control form-control-sm" value={newSample.estimated_completion_date} onChange={e => setNewSample({ ...newSample, estimated_completion_date: e.target.value })} />
                               </div>
                               <div className="col-12">
                                   <label className="form-label small text-muted">Completion Notes</label>
                                   <textarea className="form-control form-control-sm" rows={2} value={newSample.completion_description} onChange={e => setNewSample({ ...newSample, completion_description: e.target.value })} placeholder="Priority instructions, special notes…" />
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Sample Photo</label>
                                   <input type="file" accept="image/*" className="form-control form-control-sm"
                                          onChange={e => setCompletionImageFile(e.target.files?.[0] || null)} />
                                   {completionImagePreviewUrl && (
                                       <img src={completionImagePreviewUrl}
                                            className="mt-1 border" style={{ maxHeight: 60, maxWidth: '100%', display: 'block' }}
                                            alt="Preview" />
                                   )}
                               </div>
                               <div className="col-md-6">
                                   <label className="form-label small text-muted">Design</label>
                                   <input type="file" accept="application/pdf,image/*,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="form-control form-control-sm"
                                          onChange={e => setDesignPdfFile(e.target.files?.[0] || null)} />
                                   {designPdfFile && (
                                       <div className="small text-muted mt-1">{designPdfFile.name}</div>
                                   )}
                               </div>
                           </div>
               )}
               </FormSection>
           </form>
       </ModalWrapper>

       {/* Floating Action Dropdown — shared FloatingMenu (was a hand-rolled bootstrap
           dropdown-menu duplicating useFloatingMenu/FloatingMenu's own positioning +
           outside-click logic) */}
       {openDropdownId && (
           <FloatingMenu
               pos={dropdownPos}
               minWidth={180}
               items={[
                   { key: 'in-production', label: 'Mark In Production', icon: 'bi-gear', onClick: () => { onUpdateStatus(openDropdownId, 'IN_PRODUCTION'); closeDropdown(); } },
                   { key: 'sent', label: 'Mark Sent to Client', icon: 'bi-send', onClick: () => { onUpdateStatus(openDropdownId, 'SENT'); closeDropdown(); } },
                   { key: 'approved', label: 'Client Approved', icon: 'bi-check-lg', onClick: () => { onUpdateStatus(openDropdownId, 'APPROVED'); closeDropdown(); } },
                   { key: 'rejected', label: 'Client Rejected', icon: 'bi-x-lg', danger: true, onClick: () => { onUpdateStatus(openDropdownId, 'REJECTED'); closeDropdown(); } },
                   { key: 'delete', label: 'Delete Request', icon: 'bi-trash', danger: true, hidden: !onDeleteSample, onClick: () => { onDeleteSample?.(openDropdownId); closeDropdown(); } },
               ]}
           />
       )}

       {/* Row "⋯" overflow menu — Edit / Print / Event Log */}
       {rowMenuId && (() => {
           const s = samples.find((x: any) => String(x.id) === String(rowMenuId));
           if (!s) return null;
           return (
               <FloatingMenu
                   pos={rowMenuPos}
                   minWidth={170}
                   items={[
                       { key: 'edit', label: 'Edit Request', icon: 'bi-pencil', hidden: !canManage, onClick: () => { closeRowMenu(); openEditModal(s); } },
                       { key: 'print', label: 'Print SPK Sample', icon: 'bi-printer', onClick: () => { closeRowMenu(); setPrintSample(s); } },
                       { key: 'log', label: 'View Event Log', icon: 'bi-clock-history', onClick: () => { closeRowMenu(); setHistoryEntityId(s.id); } },
                   ]}
               />
           );
       })()}

       {/* ── Outer shell ── */}
       <ShellWindow classic={classic} fill="page" className="fade-in">
           <ShellTitleBar
               classic={classic}
               icon="bi-eyedropper"
               title={t('sample_requests')}
               subtitle="Track prototype and sample approval workflow"
               right={canManage && (classic ? (
                   <button
                       style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold' })}
                       onClick={openCreateModal}
                   >
                       <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>{t('create')}
                   </button>
               ) : (
                   <button className="btn btn-sm btn-primary" onClick={openCreateModal}>
                       <i className="bi bi-plus-lg me-2"></i>{t('create')}
                   </button>
               ))}
           />

           {/* ── Secondary toolbar: search + status filters + count ── */}
           {classic ? (
               <div style={xpToolbar()}>
                   <SearchField classic value={searchTerm} onChange={setSearchTerm} placeholder="Search code, article, project…" width={200} />
                   <div style={xpSep}></div>
                   <FilterChipBar classic options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
                   <div style={xpSep}></div>
                   <select
                       style={{ ...xpInput, width: 120 }}
                       value={categoryFilter}
                       onChange={e => setCategoryFilter(e.target.value)}
                       title="Filter by category"
                   >
                       <option value="ALL">All Categories</option>
                       {categoryOptions.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                   </select>
                   <div style={xpSep}></div>
                   <span style={{ fontFamily: xpFont, fontSize: '11px', color: '#333' }}>Created</span>
                   <input
                       type="date"
                       style={{ ...xpInput, width: 118 }}
                       value={createdFrom}
                       onChange={e => setCreatedFrom(e.target.value)}
                       title="Created from"
                   />
                   <span style={{ fontFamily: xpFont, fontSize: '11px', color: '#333' }}>–</span>
                   <input
                       type="date"
                       style={{ ...xpInput, width: 118 }}
                       value={createdTo}
                       onChange={e => setCreatedTo(e.target.value)}
                       title="Created to"
                   />
                   {hasActiveFilter && (
                       <button style={xpBtn()} onClick={clearFilters} title="Clear all filters">Clear</button>
                   )}
                   <div style={xpSep}></div>
                   <button
                       onClick={onMarkAllRead}
                       style={xpBtn({ display: 'inline-flex', alignItems: 'center', gap: 4 })}
                       title="Mark all sample requests as read"
                   >
                       <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12l2.5 2.5L16 9"/></svg>
                       Mark All as Read
                   </button>
                   <ToolbarCount classic right>
                       {totalSamples} item{totalSamples !== 1 ? 's' : ''}
                       {unreadCount > 0 && (
                           <> · <span style={{ color: '#1c5bc8', fontWeight: 'bold' }}>{unreadCount} unread</span></>
                       )}
                   </ToolbarCount>
               </div>
           ) : (
               <div className="px-3 py-2 border-bottom d-flex align-items-center gap-2 flex-wrap bg-white">
                   <SearchField classic={false} value={searchTerm} onChange={setSearchTerm} placeholder="Search code, article, project…" width={240} grow />
                   <FilterChipBar classic={false} options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
                   <select
                       className="form-select form-select-sm"
                       style={{ fontSize: 11, width: 'auto' }}
                       value={categoryFilter}
                       onChange={e => setCategoryFilter(e.target.value)}
                       title="Filter by category"
                   >
                       <option value="ALL">All Categories</option>
                       {categoryOptions.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                   </select>
                   <div className="d-flex align-items-center gap-1">
                       <span className="small text-muted">Created</span>
                       <input
                           type="date"
                           className="form-control form-control-sm"
                           style={{ fontSize: 11, width: 'auto' }}
                           value={createdFrom}
                           onChange={e => setCreatedFrom(e.target.value)}
                           title="Created from"
                       />
                       <span className="small text-muted">–</span>
                       <input
                           type="date"
                           className="form-control form-control-sm"
                           style={{ fontSize: 11, width: 'auto' }}
                           value={createdTo}
                           onChange={e => setCreatedTo(e.target.value)}
                           title="Created to"
                       />
                   </div>
                   {hasActiveFilter && (
                       <button
                           className="btn btn-sm btn-light border"
                           style={{ fontSize: 11 }}
                           onClick={clearFilters}
                           title="Clear all filters"
                       >Clear</button>
                   )}
                   <button
                       className="btn btn-sm btn-outline-primary ms-auto"
                       style={{ fontSize: 11 }}
                       onClick={onMarkAllRead}
                       title="Mark all sample requests as read"
                   >
                       <i className="bi bi-check-circle me-1"></i>Mark All as Read
                   </button>
                   <span className="small text-muted">
                       {totalSamples} item{totalSamples !== 1 ? 's' : ''}
                       {unreadCount > 0 && (
                           <> · <span className="fw-bold" style={{ color: '#0d6efd' }}>{unreadCount} unread</span></>
                       )}
                   </span>
               </div>
           )}

           {/* ── Table ── */}
           <div
               className={classic ? '' : 'card-body p-0'}
               // scrollbarGutter: reserve the vertical scrollbar's space always, so expanding a
               // row (which toggles the scrollbar) can't reflow the table's auto-width columns.
               style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable' }}
           >
               <div className="table-responsive">
                   <table
                       className={classic ? '' : 'table table-hover align-middle mb-0'}
                       style={classic ? { width: '100%', borderCollapse: 'collapse', background: '#fff' } : undefined}
                   >
                       <thead style={classic ? xpTableHeader : undefined} className={classic ? '' : 'table-light'}>
                           <tr>
                               <th style={classic ? { ...xpThCell, width: '130px' } : undefined} className={classic ? '' : 'ps-4'}>Request Code</th>
                               <th style={classic ? { ...xpThCell, width: '90px' } : undefined}>Category</th>
                               <th style={classic ? { ...xpThCell, width: '110px' } : undefined}>Customer</th>
                               <th style={classic ? xpThCell : undefined}>Article / Project</th>
                               <th style={classic ? xpThCell : undefined}>Specs</th>
                               <th style={classic ? { ...xpThCell, width: '100px' } : undefined}>Status</th>
                               <th style={classic ? { ...xpThCell, width: '90px' } : undefined}>Colors</th>
                               <th style={classic ? { ...xpThCell, textAlign: 'right' as const, borderRight: 'none', width: '80px' } : undefined} className={classic ? '' : 'text-end pe-4'}>Actions</th>
                           </tr>
                       </thead>
                       <tbody ref={listBodyRef}>
                           {pageSamples.map((s: any, rowIndex: number) => (
                               <React.Fragment key={s.id}>
                               <tr
                                   key={`${s.id}-row`}
                                   ref={s.id === highlightId ? highlightRef : undefined}
                                   onClick={() => toggleExpand(s.id)}
                                   style={classic
                                       ? { background: s.id === highlightId ? '#fff8cc' : s.is_unread ? '#dde8fb' : rowIndex % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5', cursor: 'pointer', outline: s.id === highlightId ? '2px solid #f0a000' : undefined }
                                       : { cursor: 'pointer', background: s.id === highlightId ? '#fff8e1' : s.is_unread ? '#f0f7ff' : undefined, outline: s.id === highlightId ? '2px solid #f0a000' : undefined }}
                               >
                                   <td style={classic ? tdBase : undefined} className={classic ? '' : 'ps-4'}>
                                       <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                           {classic ? (
                                               <button
                                                   onClick={e => { e.stopPropagation(); toggleExpand(s.id); }}
                                                   style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: xpFont, fontSize: 10, color: '#333' }}
                                               >
                                                   {expandedIds.has(s.id) ? '▼' : '▶'}
                                               </button>
                                           ) : (
                                               <button
                                                   className="btn btn-link p-0 text-muted"
                                                   style={{ fontSize: 10, lineHeight: 1 }}
                                                   onClick={e => { e.stopPropagation(); toggleExpand(s.id); }}
                                               >
                                                   <i className={`bi bi-chevron-${expandedIds.has(s.id) ? 'down' : 'right'}`}></i>
                                               </button>
                                           )}
                                           <div>
                                               {/* Unread rows keep their extra weight — that is a state
                                                   marker on top of the tier-1 code, not a second style. */}
                                               <CodeChip
                                                   code={s.code}
                                                   classic={classic}
                                                   tone="accent"
                                                   style={s.is_unread ? { fontWeight: 900 } : undefined}
                                               />
                                               <div style={classic ? { fontSize: '9px', color: '#555' } : undefined} className={classic ? '' : 'small text-muted'}>
                                                   {tzDate(s.created_at)}
                                               </div>
                                           </div>
                                       </div>
                                   </td>
                                   <td style={classic ? tdBase : undefined}>
                                       <span style={classic ? { fontFamily: xpFont, fontSize: '10px' } : undefined}
                                             className={classic ? '' : 'small'}>
                                           {categoryLabel(s.category)}
                                       </span>
                                   </td>
                                   <td style={classic ? tdBase : undefined}>
                                       {s.customer_id ? (
                                           <span style={classic ? { fontFamily: xpFont, fontSize: '11px' } : undefined}
                                                 className={classic ? '' : 'fw-medium'}>
                                               {getCustomerName(s.customer_id)}
                                           </span>
                                       ) : (
                                           <span style={classic ? { fontSize: '9px', color: '#555', fontStyle: 'italic', fontFamily: xpFont } : undefined} className={classic ? '' : 'text-muted small fst-italic'}>
                                               Internal
                                           </span>
                                       )}
                                   </td>
                                   {/* Article / Project */}
                                   <td style={classic ? tdBase : undefined}>
                                       {s.customer_article_code && (
                                           <div style={classic ? { fontWeight: 'bold', fontSize: '11px' } : undefined} className={classic ? '' : 'fw-medium'}>
                                               {s.customer_article_code}
                                           </div>
                                       )}
                                       {s.project && (
                                           <div style={classic ? { fontSize: '9px', color: '#555' } : undefined} className={classic ? '' : 'small text-muted'}>
                                               {s.project}
                                           </div>
                                       )}
                                       {!s.customer_article_code && !s.project && (
                                           <span style={classic ? { fontSize: '9px', color: '#888', fontStyle: 'italic', fontFamily: xpFont } : undefined}
                                                 className={classic ? '' : 'text-muted small fst-italic'}>—</span>
                                       )}
                                   </td>
                                   {/* Specs */}
                                   <td style={classic ? tdBase : undefined}>
                                       {s.width && (
                                           <div style={classic ? { fontSize: '10px', fontFamily: xpFont } : undefined}
                                                className={classic ? '' : 'small'}>
                                               <i className="bi bi-rulers me-1 opacity-50"></i>{s.width}
                                           </div>
                                       )}
                                       <div style={classic ? { display: 'flex', gap: 2, flexWrap: 'wrap' as const, marginTop: 2 } : undefined}
                                            className={classic ? '' : 'small text-muted d-flex gap-1 flex-wrap mt-1'}>
                                           {s.colors && s.colors.map((c: any, i: number) => (
                                               classic ? (
                                                   <span key={i} style={{ background: c.is_repeat ? '#e8e8ff' : '#e8f5e8', border: `1px solid ${c.is_repeat ? '#8888cc' : '#88aa88'}`, color: c.is_repeat ? '#333' : '#1a3a1a', padding: '0 4px', fontSize: '9px', fontFamily: xpFont }}>
                                                       {c.name}{c.is_repeat ? ' (R)' : ''}
                                                   </span>
                                               ) : (
                                                   <span key={i} className={`badge ${c.is_repeat ? 'bg-primary bg-opacity-10 text-primary' : 'bg-success bg-opacity-10 text-success'} border`}>
                                                       {c.name}{c.is_repeat ? ' ↺' : ''}
                                                   </span>
                                               )
                                           ))}
                                       </div>
                                   </td>
                                   {/* Status — request-level only */}
                                   <td style={classic ? tdBase : undefined}>
                                       <StatusChip status={s.status} tint />
                                   </td>
                                   {/* Colors — status count badges */}
                                   <td style={classic ? tdBase : undefined}>
                                       {s.colors && s.colors.length > 0 ? (() => {
                                           const counts: Record<string, number> = { APPROVED: 0, SENT: 0, IN_PRODUCTION: 0, REJECTED: 0, PENDING: 0 };
                                           s.colors.forEach((c: any) => { const st = c.status || 'PENDING'; counts[st] = (counts[st] || 0) + 1; });
                                           const META = [
                                               { key: 'APPROVED',      label: 'approved' },
                                               { key: 'SENT',          label: 'sent' },
                                               { key: 'IN_PRODUCTION', label: 'in production' },
                                               { key: 'REJECTED',      label: 'rejected' },
                                               { key: 'PENDING',       label: 'pending' },
                                           ];
                                           const shown = META.filter(m => counts[m.key] > 0);
                                           return (
                                               <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                                                   {shown.map(m => (
                                                       <StatusChip key={m.key} status={m.key} label={String(counts[m.key])} tint
                                                           style={{ minWidth: 14, textAlign: 'center' as const }} title={`${counts[m.key]} ${m.label}`} />
                                                   ))}
                                               </div>
                                           );
                                       })() : (
                                           <span style={classic ? { fontSize: '9px', color: '#888', fontStyle: 'italic', fontFamily: xpFont } : undefined}
                                                 className={classic ? '' : 'text-muted small fst-italic'}>—</span>
                                       )}
                                   </td>
                                   {/* Actions — Update icon button + "⋯" overflow (Edit / Print / Log) */}
                                   <td style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'right' as const } : undefined} className={classic ? '' : 'pe-4 text-end'}>
                                       <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                           {canManage && (
                                               <XPActionButton
                                                   classic={classic}
                                                   tone="primary"
                                                   icon="bi-arrow-repeat"
                                                   title="Update Status"
                                                   className="xp-menu-trigger"
                                                   onClick={(e) => { closeRowMenu(); toggleDropdown(s.id, e); }}
                                               />
                                           )}
                                           <MenuTriggerButton classic={classic} onClick={(e) => { closeDropdown(); toggleRowMenu(s.id, e); }} />
                                           {/* Read/unread dot */}
                                           <span
                                               title={s.is_unread ? 'Unread — click to mark as read' : 'Read — click to mark as unread'}
                                               onClick={(e) => { e.stopPropagation(); s.is_unread ? onMarkRead(s.id) : onMarkUnread(s.id); }}
                                               style={classic ? {
                                                   display: 'inline-block',
                                                   width: 10,
                                                   height: 10,
                                                   borderRadius: '50%',
                                                   cursor: 'pointer',
                                                   flexShrink: 0,
                                                   ...(s.is_unread ? {
                                                       background: '#1c5bc8',
                                                       border: '1px solid #0a3a9a',
                                                       boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 0 1px rgba(10,58,154,0.3)',
                                                   } : {
                                                       background: '#ece9d8',
                                                       border: '1px solid #7f9db9',
                                                       boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.6)',
                                                   })
                                               } : {
                                                   display: 'inline-block',
                                                   width: 10,
                                                   height: 10,
                                                   borderRadius: '50%',
                                                   cursor: 'pointer',
                                                   flexShrink: 0,
                                                   ...(s.is_unread ? {
                                                       background: '#0d6efd',
                                                       boxShadow: '0 0 0 2px rgba(13,110,253,0.25)',
                                                   } : {
                                                       background: 'white',
                                                       border: '2px solid #0d6efd',
                                                   })
                                               }}
                                           />
                                       </div>
                                   </td>
                               </tr>
                               {expandedIds.has(s.id) && (() => {
                                   const colors = s.colors || [];
                                   const columns = [
                                       { header: 'Color Name', width: 104 },
                                       { header: 'Type', width: 56 },
                                       { header: 'Status', width: 100 },
                                       { header: 'Update Status', align: 'center' as const },
                                       // Proof photo of whichever side the variant landed on (approval or rejection).
                                       { header: 'Photo', width: 72, align: 'center' as const },
                                       { header: 'Item', width: 116, align: 'center' as const },
                                   ];
                                   const rows = colors.map((c: any) => {
                                       const status = c.status || 'PENDING';
                                       const isInProd = status === 'IN_PRODUCTION';
                                       const isApproved = status === 'APPROVED';
                                       const isRejected = status === 'REJECTED';
                                       const isSent = status === 'SENT';
                                       const stripe = getStatusStripe(status);
                                       return {
                                           key: c.id,
                                           stripeColor: stripe.borderLeftColor,
                                           background: classic ? stripe.background : undefined,
                                           cells: [
                                               <span style={{ fontWeight: classic ? 'bold' : 500, color: '#111' }}>{c.name}</span>,
                                               classic ? (
                                                   <span style={{ background: c.is_repeat ? '#dce4f5' : '#d4edda', border: `1px solid ${c.is_repeat ? '#6878c8' : '#5aaa68'}`, color: c.is_repeat ? '#0d2a6e' : '#0c3a1a', padding: '0 4px', fontSize: 9, fontFamily: xpFont, fontWeight: 'bold' }}>{c.is_repeat ? 'Repeat' : 'New'}</span>
                                               ) : (
                                                   <span className={`badge ${c.is_repeat ? 'bg-primary bg-opacity-10 text-primary' : 'bg-success bg-opacity-10 text-success'} border`} style={{ fontSize: 10 }}>{c.is_repeat ? 'Repeat' : 'New'}</span>
                                               ),
                                               <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                   <StatusChip status={status} tint style={classic ? undefined : { fontSize: 10 }} />
                                                   {/* Attempt tallies — a rejected variant can be reopened and rejected again,
                                                       so these are counts of logged transitions, not the current status. */}
                                                   {(c.process_count > 1 || c.reject_count > 0) && (
                                                       <span
                                                           title={`${c.process_count || 0} process run(s), ${c.reject_count || 0} rejection(s), ${c.approve_count || 0} approval(s)`}
                                                           style={{ fontSize: 9, fontFamily: classic ? xpFont : undefined, color: '#555', whiteSpace: 'nowrap' }}
                                                       >
                                                           {c.process_count > 1 && <span>run {c.process_count}&#215;</span>}
                                                           {c.process_count > 1 && c.reject_count > 0 && ' · '}
                                                           {c.reject_count > 0 && <span style={{ color: familyColor('red'), fontWeight: 'bold' }}>rej {c.reject_count}&#215;</span>}
                                                       </span>
                                                   )}
                                               </span>,
                                               isApproved ? (
                                                   <div style={{ textAlign: 'center' as const }}>
                                                       {classic
                                                           ? <div style={{ fontSize: 10, color: '#1b5e20', fontWeight: 'bold', fontFamily: xpFont }}>Approved</div>
                                                           : <span className="badge bg-success" style={{ fontSize: 10 }}>Approved</span>}
                                                       {c.approval_notes && <div className={classic ? '' : 'text-muted fst-italic'} style={classic ? { fontSize: 9, color: '#555', fontFamily: xpFont, fontStyle: 'italic', marginTop: 1 } : { fontSize: 9 }}>{c.approval_notes}</div>}
                                                   </div>
                                               ) : isRejected ? (
                                                   <div style={{ textAlign: 'center' as const }}>
                                                       <div className={classic ? '' : 'fw-bold text-danger'} style={classic ? { fontSize: 10, color: '#a01a1a', fontWeight: 'bold', fontFamily: xpFont } : { fontSize: 10 }}>Rejected{c.rejection_reason ? `: ${c.rejection_reason}` : ''}</div>
                                                       {c.rejection_notes && <div className={classic ? '' : 'text-muted fst-italic'} style={classic ? { fontSize: 9, color: '#555', fontFamily: xpFont, fontStyle: 'italic', marginTop: 1 } : { fontSize: 9 }}>{c.rejection_notes}</div>}
                                                       {/* Rejected rests but is reopenable — remaking the variant is a new attempt,
                                                           which is what the sample report counts. Only exit is back to In Production. */}
                                                       {canManage && (
                                                           classic
                                                               ? <button type="button" style={cbInprod(false)} onClick={() => onUpdateColorStatus(s.id, c.id, 'IN_PRODUCTION')} title="Reopen for another attempt (logs a new process run)">&#8635; Reopen</button>
                                                               : <button type="button" className="btn btn-sm btn-outline-warning mt-1" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => onUpdateColorStatus(s.id, c.id, 'IN_PRODUCTION')} title="Reopen for another attempt (logs a new process run)">&#8635; Reopen</button>
                                                       )}
                                                   </div>
                                               ) : canManage ? (
                                                   classic ? (
                                                       <div style={{ display: 'inline-flex' }}>
                                                           <button type="button" style={cbInprod(isInProd)} onClick={() => onUpdateColorStatus(s.id, c.id, isInProd ? 'PENDING' : 'IN_PRODUCTION')} title={isInProd ? 'Reset to Pending' : 'Set In Production'}>&#9881; In Prod</button>
                                                           <button type="button" style={cbSend(isSent)} onClick={() => onUpdateColorStatus(s.id, c.id, isSent ? 'PENDING' : 'SENT')} title={isSent ? 'Reset to Pending' : 'Mark Sent to Customer'}>&#187; Sent</button>
                                                           <button type="button" style={cbApprove(false)} onClick={() => handleApproveColor(s.id, c.id, c.name)} title="Approve">&#10003; Approve</button>
                                                           <button type="button" style={cbReject(false)} onClick={() => openRejectModal(s.id, c.id, c.name)} title="Reject">&#10007; Reject</button>
                                                       </div>
                                                   ) : (
                                                       <div className="btn-group btn-group-sm" role="group">
                                                           <button type="button" className={`btn ${isInProd ? 'btn-warning' : 'btn-outline-warning'}`} style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => onUpdateColorStatus(s.id, c.id, isInProd ? 'PENDING' : 'IN_PRODUCTION')}>&#9881; In Prod</button>
                                                           <button type="button" className={`btn ${isSent ? 'btn-info' : 'btn-outline-info'}`} style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => onUpdateColorStatus(s.id, c.id, isSent ? 'PENDING' : 'SENT')}>&#187; Sent</button>
                                                           <button type="button" className="btn btn-outline-success" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => handleApproveColor(s.id, c.id, c.name)}>&#10003; Approve</button>
                                                           <button type="button" className="btn btn-outline-danger" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => openRejectModal(s.id, c.id, c.name)}>&#10007; Reject</button>
                                                       </div>
                                                   )
                                               ) : null,
                                               // Photo column — only one side can be current, so this is whichever
                                               // status the variant is resting on. Earlier rounds' photos stay on
                                               // their event rows.
                                               statusPhotoThumb(
                                                   isApproved ? c.approval_image_url : isRejected ? c.rejection_image_url : null,
                                                   isApproved ? 'Approval photo' : 'Rejection photo',
                                               ) || <span style={{ fontSize: 10, color: '#888', fontFamily: classic ? xpFont : undefined }}>—</span>,
                                               isApproved ? (
                                                   c.item_id ? (
                                                       classic
                                                           ? <span style={{ fontSize: 10, color: '#1b5e20', fontWeight: 'bold', fontFamily: xpFont }}>Item: {c.item_code}</span>
                                                           : <span className="badge bg-success bg-opacity-10 text-success border" style={{ fontSize: 10 }}>Item: {c.item_code}</span>
                                                   ) : canManage ? (
                                                       classic
                                                           ? <button style={xpBtn({ background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontSize: 10, padding: '1px 6px' })} onClick={() => createItemFromColor(s, c)} title="Create Item from this approved color">+ Item</button>
                                                           : <button className="btn btn-sm btn-success" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => createItemFromColor(s, c)}>+ Item</button>
                                                   ) : null
                                               ) : isRejected ? (
                                                   canManage ? (
                                                       classic
                                                           ? <button style={xpBtn({ background: 'linear-gradient(to bottom, #5a8fd8, #2a5faa)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#fff', fontSize: 10, padding: '1px 6px' })} onClick={() => createNewFromRejected(s, c)} title="Create a new sample request based on this rejected color">+ New Sample</button>
                                                           : <button className="btn btn-sm btn-primary" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => createNewFromRejected(s, c)} title="Create a new sample request based on this rejected color">+ New Sample</button>
                                                   ) : null
                                               ) : null,
                                           ],
                                       };
                                   });

                                   const sections: any[] = [
                                       { title: '① Identity & Specs', fields: [
                                           { label: 'Category', value: categoryLabel(s.category) },
                                           { label: 'Customer', value: s.customer_id ? getCustomerName(s.customer_id) : <em style={{ color: '#555' }}>Internal</em> },
                                           { label: 'Project', value: s.project || '—' },
                                           { label: 'Customer Art.', value: s.customer_article_code || '—' },
                                           { label: 'Internal Art.', value: s.internal_article_code || '—' },
                                           { label: 'Width', value: s.width || '—' },
                                           { label: 'Request Date', value: s.request_date ? new Date(s.request_date).toLocaleDateString() : '—' },
                                       ]},
                                       { title: '② Materials & Weight', fields: [
                                           { label: 'Main Mat.', value: s.main_material || '—' },
                                           { label: 'Middle Mat.', value: s.middle_material || '—' },
                                           { label: 'Bottom Mat.', value: s.bottom_material || '—' },
                                           { label: 'Weft', value: s.weft || '—' },
                                           { label: 'Warp', value: s.warp || '—' },
                                           { label: 'Orig. Weight', value: s.original_weight ? `${s.original_weight} ${s.original_weight_unit || ''}`.trim() : '—' },
                                           { label: 'Prod. Weight', value: s.production_weight ? `${s.production_weight} ${s.production_weight_unit || ''}`.trim() : '—' },
                                           ...(s.additional_info ? [{ label: 'Additional', value: s.additional_info, full: true }] : []),
                                       ]},
                                       { title: '③ Logistics', fields: [
                                           { label: 'Quantity', value: s.quantity || '—' },
                                           { label: 'Sample Size', value: s.sample_size || '—' },
                                           { label: 'Est. Complete', value: s.estimated_completion_date ? new Date(s.estimated_completion_date).toLocaleDateString() : '—' },
                                           ...(s.completion_description ? [{ label: 'Completion', value: s.completion_description, full: true }] : []),
                                           ...(s.notes ? [{ label: 'Notes', value: s.notes, full: true }] : []),
                                       ]},
                                   ];

                                   if (s.completion_image_url || s.design_pdf_url) {
                                       const attach: any[] = [];
                                       if (s.completion_image_url) {
                                           attach.push({ label: 'Photo', full: true, value: (
                                               <img src={`${STATIC_BASE}${s.completion_image_url}`} alt="Completion" onClick={() => setFilePreview({ url: `${STATIC_BASE}${s.completion_image_url}`, type: 'image', filename: s.completion_image_url.split('/').pop() || 'sample_photo' })} style={{ maxHeight: 80, maxWidth: 180, border: '1px solid #b0a898', cursor: 'pointer', display: 'block' }} title="Click to preview" />
                                           ) });
                                       }
                                       if (s.design_pdf_url) {
                                           const designType = getDesignFileType(s.design_pdf_url);
                                           const designUrl = `${STATIC_BASE}${s.design_pdf_url}`;
                                           const designFilename = s.design_pdf_url.split('/').pop() || 'design';
                                           attach.push({ label: 'Design', full: true, value: (
                                               designType === 'image'
                                                   ? <img src={designUrl} alt="Design" onClick={() => setFilePreview({ url: designUrl, type: 'image', filename: designFilename })} style={{ maxHeight: 80, maxWidth: 180, border: '1px solid #b0a898', cursor: 'pointer', display: 'block' }} title="Click to preview" />
                                                   : designType === 'excel'
                                                       ? <button onClick={() => window.open(designUrl, '_blank')} style={{ fontFamily: xpFont, fontSize: 11, color: '#0047c8', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{designFilename}</button>
                                                       : <button onClick={() => setFilePreview({ url: designUrl, type: 'pdf', filename: designFilename })} style={{ fontFamily: xpFont, fontSize: 11, color: '#0047c8', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View / Download</button>
                                           ) });
                                       }
                                       sections.push({ title: '④ Attachments', fields: attach });
                                   }

                                   return (
                                       <tr key={`${s.id}-detail`}>
                                           {/* position:relative + fixed height, with the panel absolutely positioned
                                               inside, keeps this colSpan cell out of the table's auto width calc — so
                                               expanding a row can't reflow the auto-width columns (e.g. Specs badges). */}
                                           {/* Rail + edge rules go on the cell, not a wrapper: the panel inside is
                                               absolutely positioned, so it can't carry the frame itself. */}
                                           <td colSpan={8} style={{
                                               padding: 0, position: 'relative', height: 300,
                                               background: '#fff',
                                               ...expandedRowFrame(classic),
                                           }}>
                                               {/* left offset clears the rail — an absolutely positioned child paints
                                                   above the cell's inset shadow and would otherwise cover it */}
                                               <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: classic ? 4 : 3 }}>
                                                   <RequestDetailPanel
                                                       classic={classic}
                                                       leftTitle={<><i className="bi bi-palette" style={{ marginRight: 2 }} />Colors — {colors.length} total · {colors.filter((c: any) => c.status === 'APPROVED').length} approved</>}
                                                       leftWidth="56%"
                                                       columns={columns}
                                                       rows={rows}
                                                       emptyText="No colors defined."
                                                       sections={sections}
                                                       height={300}
                                                   />
                                               </div>
                                           </td>
                                       </tr>
                                   );
                               })()}
                               </React.Fragment>
                           ))}
                           {pageSamples.length === 0 && (dataLoading.samples ? (
                               <TableSkeleton rows={8} cols={skel.cols ?? 8} classic={classic} tdStyle={tdBase} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                           ) : (
                               <tr>
                                   <td
                                       colSpan={8}
                                       style={classic ? { ...tdBase, borderRight: 'none', textAlign: 'center', padding: '24px 8px', color: '#555', fontStyle: 'italic' } : undefined}
                                       className={classic ? '' : 'text-center py-5 text-muted'}
                                   >
                                       {hasActiveFilter
                                           ? 'No requests match the current filter.'
                                           : 'No sample requests found. Create one to get started.'}
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           </div>

           <Pager page={clampedSamplePage} total={totalSamples} pageSize={SAMPLE_PAGE_SIZE} onPageChange={setSamplePage} hideWhenEmpty />

           {/* ── Status bar ── */}
           {classic && (
               <div style={{
                   background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)',
                   borderTop: '1px solid #b0a898',
                   padding: '3px 8px',
                   display: 'flex',
                   alignItems: 'center',
                   gap: '5px',
                   flexWrap: 'wrap' as const,
                   fontFamily: xpFont,
                   fontSize: '10px',
                   color: '#333',
               }}>
                   <span style={{ alignSelf: 'center' }}>
                       {totalSamples} request{totalSamples !== 1 ? 's' : ''} · {colorStats.total} color{colorStats.total !== 1 ? 's' : ''}
                   </span>
                   <span style={{ ...xpSep, height: 15, alignSelf: 'center' }} />
                   <StatusCountPill classic status="PENDING" count={colorStats.PENDING} title="Colors not yet started" />
                   <StatusCountPill classic status="IN_PRODUCTION" count={colorStats.IN_PRODUCTION} title="Colors in production" />
                   <StatusCountPill classic status="SENT" count={colorStats.SENT} title="Colors sent to customer" />
                   <StatusCountPill classic status="APPROVED" count={colorStats.APPROVED} title="Colors approved" />
                   <StatusCountPill classic status="REJECTED" count={colorStats.REJECTED} title="Colors rejected" />
                   {hasActiveFilter && <span style={{ marginLeft: 'auto', fontStyle: 'italic', alignSelf: 'center' }}>filtered</span>}
               </div>
           )}
       </ShellWindow>

       {printSample && (
           <SamplePrintModal
               sample={printSample}
               onClose={() => setPrintSample(null)}
               currentStyle={currentStyle}
               companyProfile={companyProfile}
               getCustomerName={getCustomerName}
           />
       )}

       {historyEntityId && (
           <HistoryPane
               entityType="SampleRequest"
               entityId={historyEntityId}
               onClose={() => setHistoryEntityId(null)}
           />
       )}

       {filePreview && (
           <ModalWrapper
               isOpen={true}
               modeless
               onClose={() => setFilePreview(null)}
               title={filePreview.type === 'image' ? `Photo: ${filePreview.filename}` : filePreview.type === 'pdf' ? `PDF: ${filePreview.filename}` : filePreview.filename}
               size="xl"
               variant={filePreview.type === 'image' ? 'primary' : 'info'}
               level={2}
               footer={
                   <>
                       <span style={classic
                           ? { flex: 1, fontFamily: xpFont, fontSize: 10, color: '#555', textAlign: 'left' as const }
                           : { flex: 1, fontSize: 12, color: '#666' }
                       }>
                           {filePreview.filename}
                       </span>
                       <button
                           onClick={() => window.open(filePreview.url, '_blank')}
                           style={classic ? xpBtn() : undefined}
                           className={classic ? '' : 'btn btn-sm btn-outline-secondary'}
                       >
                           ↗ Open Full View
                       </button>
                       {classic && (
                           <button onClick={() => setFilePreview(null)} style={xpBtn()}>
                               Close
                           </button>
                       )}
                   </>
               }
           >
               {filePreview.type === 'image' ? (
                   <div style={{
                       margin: classic ? '-12px -14px' : '-24px',
                       background: '#1e1e1e',
                       display: 'flex', alignItems: 'center', justifyContent: 'center',
                       minHeight: 320,
                   }}>
                       <img
                           src={filePreview.url}
                           alt="Preview"
                           style={{ maxWidth: '100%', maxHeight: '68vh', display: 'block', objectFit: 'contain' }}
                       />
                   </div>
               ) : (
                   <div style={{ margin: classic ? '-12px -14px' : '-24px' }}>
                       <iframe
                           src={filePreview.url}
                           style={{ width: '100%', height: '70vh', border: 'none', display: 'block' }}
                           title="PDF Preview"
                       />
                   </div>
               )}
           </ModalWrapper>
       )}
    </>
  );
}
