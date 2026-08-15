import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import CalendarView from '../shared/CalendarView';
import ManufacturingSearchBar from './ManufacturingSearchBar';
import Pager from '../shared/Pager';
import ModalWrapper from '../shared/ModalWrapper';
import { useToast } from '../shared/Toast';
import { useData } from '../../context/DataContext';
import type { PrintSettings } from './MOPrintModal';
import { STATUS_COLORS, statusChipStyle, useFloatingMenu, MenuTriggerButton, FloatingMenu, XPActionButton, ExpandedRowPanel, ExpandedRowPanelBody, ProgressBar, CodeChip, CODE_FONT, xpFont, TableSkeleton, useTableSkeletonMetrics } from '../shared/xpTheme';
const MOPrintModal = dynamic(() => import('./MOPrintModal'), { ssr: false });
import WorkOrderPanel, { PrintChip } from './WorkOrderPanel';
import { resolveMoBom } from '../shared/moHelpers';
import { useTimezone } from '../../context/TimezoneContext';
const WOCompletionModal = dynamic(() => import('./WOCompletionModal'), { ssr: false });

export default function ManufacturingOrdersTab({
    items,
    boms,
    locations,
    attributes,
    manufacturingOrders,
    productionRuns,
    workCenters,
    onUpdateStatus,
    onDeleteMO,
    onCreateWO,
    onUpdateWO,
    onUpdateWOStatus,
    onDeleteWO,
    currentPage,
    totalItems,
    pageSize,
    onPageChange,
    moCodeFilter,
    setMoCodeFilter,
    viewMode,
    setViewMode,
    currentStyle,
    canManage,
    companyProfile,
    helpers,
}: any) {
    const { showToast } = useToast();
    const { authFetch, fetchData, loading: dataLoading } = useData();
    const { formatCustom: tzFmt } = useTimezone();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
    const {
        getItemName, getItemCode, getItemUom, getItemEnds, uomBadgeStyle,
        getBOMCode, getLocationName, getWCName, getAttributeValueName, getBomSizeLabel,
        getStatusBadge, formatDate, formatDateTime, getDueDateWarning,
        calculateRequiredQty, getStockAcrossLocations, getBeamBatchCount,
    } = helpers;

    const classic = currentStyle === 'classic';

    // Keep a ref so scanner callbacks always access the latest manufacturingOrders without stale closure issues
    const workOrdersRef = useRef<any[]>(manufacturingOrders);
    useEffect(() => { workOrdersRef.current = manufacturingOrders; }, [manufacturingOrders]);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [printPreviewWO, setPrintPreviewWO] = useState<any>(null);
    const [printHideChildren, setPrintHideChildren] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const { openId: openMoMenuId, pos: moMenuPos, toggle: toggleMoMenu, close: closeMoMenu } = useFloatingMenu();
    const [expandedDetailTabs, setExpandedDetailTabs] = useState<Record<string, 'bom' | 'steps'>>({});
    const [selectedTreeNodes, setSelectedTreeNodes] = useState<Record<string, string>>({});
    const [scanningWOId, setScanningWOId] = useState<string | null>(null);
    const [completionMO, setCompletionMO] = useState<any>(null);
    const [completionWO, setCompletionWO] = useState<any>(null);
    const [editAttrsModal, setEditAttrsModal] = useState<{ mo: any; selected: string[] } | null>(null);
    // Set/confirm an approved Color on a root MO ordered against a pending lab dip.
    const [editColorModal, setEditColorModal] = useState<{ mo: any } | null>(null);
    const [colorModalSearch, setColorModalSearch] = useState('');
    const [colorModalResults, setColorModalResults] = useState<any[]>([]);
    const [colorModalLabdips, setColorModalLabdips] = useState<any[]>([]);
    const [putawayModal, setPutawayModal] = useState<{ mo: any; bins: any[]; suggested: string | null; reason: string | null; selected: string; loading: boolean; error: string | null } | null>(null);
    const [toleranceModal, setToleranceModal] = useState<{ mo: any; pct: string; unlimited: boolean } | null>(null);

    const defaultPrintSettings: PrintSettings = {
        showBOMTable: true,
        showTimeline: true,
        showChildMOs: false,
        showSignatureLine: true,
        showTechnicalFields: true,
        showFillFields: true,
        showSamplePhoto: true,
        headerCompanyName: '',
        headerDepartment: '',
        headerApprovedBy: '',
        headerReference: '',
    };
    const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultPrintSettings);

    useEffect(() => {
        const savedPrintSettings = localStorage.getItem('mo_print_settings');
        if (savedPrintSettings) {
            try { setPrintSettings(JSON.parse(savedPrintSettings)); } catch (e) {}
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('mo_print_settings', JSON.stringify(printSettings));
    }, [printSettings]);

    // Auto-expand the matching MO when arriving via a code deep-link
    useEffect(() => {
        if (!moCodeFilter || manufacturingOrders.length === 0) return;
        const match = manufacturingOrders.find((wo: any) =>
            wo.code.toLowerCase().includes(moCodeFilter.toLowerCase())
        );
        if (match) setExpandedRows(prev => ({ ...prev, [match.id]: true }));
    }, [moCodeFilter, manufacturingOrders]);

    const findNodeById = (node: any, id: string): any => {
        if (node.id === id) return node;
        for (const child of (node.child_mos || [])) {
            const found = findNodeById(child, id);
            if (found) return found;
        }
        return null;
    };

    const findNodeByCodeInTree = (node: any, code: string): any => {
        if (node.code === code) return node;
        for (const child of (node.child_mos || [])) {
            const found = findNodeByCodeInTree(child, code);
            if (found) return found;
        }
        return null;
    };

    const findNodeByCode = (code: string): any => {
        for (const wo of workOrdersRef.current) {
            const found = findNodeByCodeInTree(wo, code);
            if (found) return found;
        }
        // Also search shared component MOs from production runs
        for (const pr of productionRuns) {
            for (const mo of (pr.manufacturing_orders || [])) {
                if (mo.is_shared_component && mo.code === code) return mo;
            }
        }
        return null;
    };

    const flattenTree = (node: any, level = 0, moMap: Record<string, any> = {}, isShared = false): Array<{wo: any; level: number; isShared: boolean}> => {
        const result: Array<{wo: any; level: number; isShared: boolean}> = [{wo: node, level, isShared}];
        for (const child of (node.child_mos || [])) {
            result.push(...flattenTree(child, level + 1, moMap, false));
        }
        // Include shared component MOs linked via mo_dependencies
        for (const reqId of (node.required_mo_ids || [])) {
            const reqMO = moMap[reqId];
            if (reqMO) {
                result.push(...flattenTree(reqMO, level + 1, moMap, true));
            }
        }
        return result;
    };

    const handlePrintWO = (wo: any, hideChildren = false) => {
        setPrintHideChildren(hideChildren);
        setPrintPreviewWO(wo);
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // From the calendar: jump to the MO's list row, expand it, and scroll it into view.
    const openMOFromCalendar = (id: string) => {
        setViewMode('list');
        setExpandedRows(prev => ({ ...prev, [id]: true }));
        setTimeout(() => {
            document.getElementById(`mo-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    };

    const handleUpdateMOAttributes = async (moId: string, attributeValueIds: string[]) => {
        try {
            const res = await authFetch(`${API_BASE}/manufacturing-orders/${moId}/attributes`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attribute_value_ids: attributeValueIds }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Failed to update attributes', 'error');
                return;
            }
            setEditAttrsModal(null);
            showToast('Attributes updated', 'success');
            fetchData();
        } catch {
            showToast('Failed to update attributes', 'error');
        }
    };

    const handleSetMOColor = async (moId: string, colorId: string | null) => {
        try {
            const res = await authFetch(`${API_BASE}/manufacturing-orders/${moId}/color`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color_id: colorId }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Failed to set color', 'error');
                return;
            }
            setEditColorModal(null);
            setColorModalSearch('');
            setColorModalResults([]);
            showToast('Color set on order', 'success');
            fetchData();
        } catch {
            showToast('Failed to set color', 'error');
        }
    };

    // Color modal: server-side Color Library search + the item's pending lab dips
    // (shown for reference, so the planner can see approval progress).
    useEffect(() => {
        if (!editColorModal) { setColorModalResults([]); return; }
        const q = colorModalSearch.trim();
        const h = setTimeout(async () => {
            try {
                const res = await authFetch(`${API_BASE}/colors?search=${encodeURIComponent(q)}&size=20`);
                if (res.ok) {
                    const data = await res.json();
                    setColorModalResults(Array.isArray(data) ? data : (data.items || []));
                }
            } catch { /* transient */ }
        }, 300);
        return () => clearTimeout(h);
    }, [colorModalSearch, editColorModal]);

    useEffect(() => {
        if (!editColorModal?.mo?.item_id) { setColorModalLabdips([]); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await authFetch(`${API_BASE}/lab-dips/pending-variants?item_id=${encodeURIComponent(editColorModal.mo.item_id)}`);
                if (res.ok && !cancelled) setColorModalLabdips(await res.json());
            } catch { /* transient */ }
        })();
        return () => { cancelled = true; };
    }, [editColorModal]);

    // Putaway bin: planning decides where the output will be stored before
    // production finishes — the suggestion endpoint proposes, planner saves.
    const openPutawayModal = async (mo: any) => {
        setPutawayModal({ mo, bins: [], suggested: null, reason: null, selected: mo.planned_putaway_location_id || '', loading: true, error: null });
        try {
            const res = await authFetch(`${API_BASE}/manufacturing-orders/${mo.id}/putaway-suggestion`);
            // A failed request used to fall through as an empty bins list, so a 403 or
            // a server error read as "this MO has no bins" — two very different fixes.
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = err.detail || `Request failed (HTTP ${res.status})`;
                setPutawayModal(prev => prev && prev.mo.id === mo.id ? { ...prev, loading: false, error: msg } : prev);
                return;
            }
            const data = await res.json();
            setPutawayModal(prev => prev && prev.mo.id === mo.id ? {
                ...prev,
                loading: false,
                error: null,
                bins: data?.bins || [],
                suggested: data?.suggested_location_id || null,
                reason: data?.reason || null,
                selected: prev.selected || data?.suggested_location_id || '',
            } : prev);
        } catch {
            setPutawayModal(prev => prev && prev.mo.id === mo.id
                ? { ...prev, loading: false, error: 'Could not reach the server.' }
                : prev);
        }
    };

    const handleSavePutaway = async (moId: string, locationId: string) => {
        try {
            const res = await authFetch(`${API_BASE}/manufacturing-orders/${moId}/putaway`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location_id: locationId || null }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Failed to set putaway bin', 'error');
                return;
            }
            setPutawayModal(null);
            showToast(locationId ? 'Putaway bin saved' : 'Putaway bin cleared', 'success');
            fetchData();
        } catch {
            showToast('Failed to set putaway bin', 'error');
        }
    };

    const handleSaveTolerance = async () => {
        if (!toleranceModal) return;
        const pct = parseFloat(toleranceModal.pct);
        if (!toleranceModal.unlimited && (isNaN(pct) || pct < 0)) {
            showToast('Enter a tolerance of 0 or more', 'error');
            return;
        }
        try {
            const res = await authFetch(`${API_BASE}/manufacturing-orders/${toleranceModal.mo.id}/tolerance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    overdelivery_tolerance_pct: toleranceModal.unlimited ? null : pct,
                    allow_unlimited_overdelivery: toleranceModal.unlimited,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Failed to set tolerance', 'error');
                return;
            }
            setToleranceModal(null);
            showToast('Overdelivery tolerance saved', 'success');
            fetchData();
        } catch {
            showToast('Failed to set tolerance', 'error');
        }
    };

    const filteredWorkOrders = manufacturingOrders.filter((wo: any) => {
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

    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skel = useTableSkeletonMetrics('manufacturing-orders', listBodyRef, filteredWorkOrders.length > 0);

    // --- Inline QR Scanner Widget ---
    const InlineScanWidget = ({ rootWoId, onClose }: { rootWoId: string; onClose: () => void }) => {
        const scannerRef2 = useRef<any>(null);
        const readerId = `reader-${rootWoId}`;

        useEffect(() => {
            let cancelled = false;
            const timer = setTimeout(() => {
                if (!document.getElementById(readerId)) return;
                // html5-qrcode is only needed while this widget is mounted — load it
                // on demand instead of paying its parse cost on every MO page visit.
                import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
                    if (cancelled || !document.getElementById(readerId)) return;
                    const scanner = new Html5QrcodeScanner(readerId, { fps: 10, qrbox: { width: 180, height: 180 } }, false);
                    scannerRef2.current = scanner;
                    scanner.render((code: string) => {
                        const found = findNodeByCode(code);
                        if (found) {
                            scanner.clear().catch(() => {});
                            onClose();
                            if (found.status === 'PENDING') {
                                onUpdateStatus(found.id, 'IN_PROGRESS');
                            } else if (found.status === 'IN_PROGRESS') {
                                setCompletionMO(found);
                            } else {
                                showToast(`MO "${code}" is already ${found.status}`, 'warning');
                            }
                        } else {
                            showToast(`MO "${code}" not found`, 'danger');
                        }
                    }, () => {});
                });
            }, 100);
            return () => {
                cancelled = true;
                clearTimeout(timer);
                scannerRef2.current?.clear().catch(() => {});
            };
        }, [readerId]);

        return (
            <div style={{ width: '100%' }}>
                {/* ui-scale-exempt: html5-qrcode measures its own viewfinder — keep it 1:1. */}
                <div id={readerId} className="ui-scale-exempt" style={{ width: '100%' }}></div>
                <button className="btn btn-sm btn-outline-secondary w-100 mt-1 extra-small" onClick={onClose}>
                    <i className="bi bi-x me-1"></i>Cancel Scan
                </button>
            </div>
        );
    };

    // --- Work Order Expanded Panel (Tree + Detail) ---
    // NOTE: invoked as a plain function call (renderWOExpandedPanel({...})), NOT as <JSX/>.
    // Defined inside the parent body, so as a JSX element it would get a fresh component
    // identity every parent render and React would remount its whole subtree — wiping
    // WorkOrderPanel's local add-WO form state (the "add row flashes and disappears" bug).
    // Calling it as a function inlines the output and keeps child state stable.
    const renderWOExpandedPanel = ({ wo, detailTab, setDetailTab }: { wo: any; detailTab: 'bom' | 'steps'; setDetailTab: (t: 'bom' | 'steps') => void }) => {
        const selectedNodeId = selectedTreeNodes[wo.id] ?? wo.id;

        // Build a map of all MOs in the same PR so required component MOs appear in the tree
        const moMap: Record<string, any> = {};
        if (wo.production_run_id) {
            const pr = productionRuns.find((p: any) => p.id === wo.production_run_id);
            if (pr) {
                for (const mo of (pr.manufacturing_orders || [])) {
                    moMap[mo.id] = mo;
                }
            }
        }

        const treeNodes = flattenTree(wo, 0, moMap);

        // findNodeById must also search moMap for shared component MOs
        const findNodeInTree = (id: string): any => {
            const inTree = findNodeById(wo, id);
            if (inTree) return inTree;
            return moMap[id] ?? null;
        };

        const selectedNode = findNodeInTree(selectedNodeId) ?? wo;
        const bom = boms.find((b: any) => b.id === selectedNode.bom_id);
        const isScanActive = scanningWOId === wo.id;
        // Fixed body height for both tabs → no jittery resize when switching BOM/WO.
        // Inner sections scroll instead of flexing the panel taller.
        const PANEL_BODY_H = 360;

        // Compute per-parent-MO breakdown for shared component MOs (⇒ nodes)
        const parentMOBreakdown: Array<{ mo: any; qty: number }> = [];
        if (selectedNode.id !== wo.id && Object.keys(moMap).length > 0) {
            for (const mo of Object.values(moMap) as any[]) {
                if ((mo.required_mo_ids || []).includes(selectedNode.id)) {
                    const parentBOM = boms.find((b: any) => b.id === mo.bom_id);
                    const parentLine = parentBOM?.lines?.find((l: any) => l.item_id === selectedNode.item_id);
                    if (parentLine) {
                        parentMOBreakdown.push({
                            mo,
                            qty: calculateRequiredQty(mo.qty, parentLine, parentBOM),
                        });
                    }
                }
            }
        }
        const showBreakdown = parentMOBreakdown.length > 0;

        const selectNode = (nodeId: string) => {
            setSelectedTreeNodes(prev => ({ ...prev, [wo.id]: nodeId }));
            if (scanningWOId === wo.id) setScanningWOId(null);
        };

        // No gutter: the tab strip and the two-pane body carry their own edges and run
        // full-bleed to the panel's rules. Left padding still reserves the rail's width
        // so it doesn't paint over the first tab.
        return (
            <ExpandedRowPanel classic={classic} style={{ marginBottom: 6, padding: classic ? '0 0 0 4px' : '0 0 0 3px' }}>
            {/* ── TABS ── */}
            <div style={{
                display: 'flex',
                borderBottom: classic ? '2px solid #808080' : '1px solid #dee2e6',
                background: classic ? '#ece9d8' : '#f1f3f5',
                padding: '0 8px',
            }}>
                <button
                    onClick={() => setDetailTab('bom')}
                    style={{
                        fontFamily: xpFont, fontSize: 11,
                        padding: '5px 12px', marginRight: 2, marginBottom: detailTab === 'bom' ? -2 : -1,
                        border: classic ? '1px solid #808080' : '1px solid #dee2e6',
                        borderBottom: detailTab === 'bom' ? (classic ? '2px solid #ece9d8' : '2px solid #fff') : '1px solid transparent',
                        background: detailTab === 'bom' ? (classic ? '#ece9d8' : '#fff') : 'transparent',
                        cursor: 'pointer', fontWeight: detailTab === 'bom' ? 'bold' : 'normal',
                        color: detailTab === 'bom' ? (classic ? '#000080' : '#0d6efd') : '#555',
                        position: 'relative' as const,
                    }}
                >
                    <i className="bi bi-boxes me-1" />BOM &amp; Stock
                </button>
                <button
                    onClick={() => setDetailTab('steps')}
                    style={{
                        fontFamily: xpFont, fontSize: 11,
                        padding: '5px 12px', marginRight: 2, marginBottom: detailTab === 'steps' ? -2 : -1,
                        border: classic ? '1px solid #808080' : '1px solid #dee2e6',
                        borderBottom: detailTab === 'steps' ? (classic ? '2px solid #ece9d8' : '2px solid #fff') : '1px solid transparent',
                        background: detailTab === 'steps' ? (classic ? '#ece9d8' : '#fff') : 'transparent',
                        cursor: 'pointer', fontWeight: detailTab === 'steps' ? 'bold' : 'normal',
                        color: detailTab === 'steps' ? (classic ? '#000080' : '#0d6efd') : '#555',
                        position: 'relative' as const,
                    }}
                >
                    <i className="bi bi-list-ol me-1" />Work Order ({(selectedNode.work_orders || []).length})
                </button>
            </div>

            {detailTab === 'bom' && (
            <ExpandedRowPanelBody classic={classic} style={{ display: 'flex', height: PANEL_BODY_H, padding: 0, border: classic ? '1px solid #808080' : undefined }}>

                {/* ── LEFT: MO Tree ── */}
                <div style={{
                    width: '270px', minWidth: '270px',
                    borderRight: classic ? '2px solid #808080' : '1px solid #dee2e6',
                    background: '#fff',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{
                        background: classic ? 'linear-gradient(to right,#0058e6,#08a5ff)' : '#343a40',
                        color: '#fff', fontWeight: 'bold', fontSize: '11px',
                        padding: '5px 8px', letterSpacing: '0.3px'
                    }}>
                        <i className="bi bi-diagram-3-fill me-2"></i>MO Tree
                    </div>
                    <div style={{ padding: '4px', overflowY: 'auto', flex: 1 }}>
                        {treeNodes.map(({ wo: node, level, isShared }: { wo: any; level: number; isShared: boolean }) => {
                            const isActive = node.id === selectedNodeId;
                            const statusColor = STATUS_COLORS[node.status] || '#6c757d';
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
                                        border: isActive ? (classic ? '1px solid #003080' : 'none') : (isShared ? '1px dashed #999' : '1px solid transparent'),
                                        marginBottom: '1px',
                                        userSelect: 'none'
                                    }}
                                >
                                    <span style={{ fontSize: '10px', color: isActive ? '#cce0ff' : '#888', minWidth: '10px', marginTop: '1px' }}>
                                        {level === 0 ? '●' : (isShared ? '⇒' : '└')}
                                    </span>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        {/* Tree label, not a table cell — stays unboxed (a chip per node would
                                            fight the selection fill), but shares CODE_FONT with every other code. */}
                                        <div title={node.code} style={{ fontFamily: CODE_FONT, fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {node.code}
                                        </div>
                                        <div title={node.item_name} style={{ fontSize: '10px', color: isActive ? '#e0ecff' : '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {node.item_name}
                                        </div>
                                        {node.item_ends != null && (
                                            <div title="Warp ends (utas) · qty to manufacture" style={{ fontSize: '9px', fontWeight: 700, whiteSpace: 'nowrap', color: isActive ? '#cfe3ff' : '#1a6e2e' }}>
                                                {node.item_ends} ends · {node.qty} {getItemUom(node.item_id)}
                                            </div>
                                        )}
                                        {((node.attribute_value_ids || []).length > 0 || node.bom_size_id) && (
                                            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                                                {(node.attribute_value_ids || []).map((id: string) => (
                                                    <span key={id} style={{ fontSize: '8px', padding: '0 4px', background: isActive ? 'rgba(219,234,254,0.25)' : '#dbeafe', color: isActive ? '#bfdbfe' : '#1d4ed8', borderRadius: 2, fontWeight: 700, lineHeight: '14px' }}>
                                                        {getAttributeValueName(id)}
                                                    </span>
                                                ))}
                                                {(node.bom_size_id || node.bom_size_snapshot) && (() => {
                                                    const label = getBomSizeLabel(node.bom_id, node.bom_size_id, node.bom_size_snapshot);
                                                    return label ? (
                                                        <span style={{ fontSize: '8px', padding: '0 4px', background: isActive ? 'rgba(220,252,231,0.25)' : '#dcfce7', color: isActive ? '#bbf7d0' : '#15803d', borderRadius: 2, fontWeight: 700, lineHeight: '14px' }}>
                                                            <i className="bi bi-rulers me-1" style={{ fontSize: '7px' }}></i>{label}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </div>
                                        )}
                                        {(node.qty_rejected_total ?? 0) > 0 && (() => {
                                            // Scrap on the tree row so a bad order is visible without
                                            // opening it; yield is against produced, not target.
                                            const rej = node.qty_rejected_total ?? 0;
                                            const prod = (node.qty_completed_total ?? 0) + rej;
                                            const yp = prod > 0 ? (node.qty_completed_total ?? 0) / prod * 100 : 0;
                                            return (
                                                <div
                                                    title={`${rej.toFixed(2)} rejected of ${prod.toFixed(2)} produced — yield ${yp.toFixed(1)}%`}
                                                    style={{ fontSize: '8px', marginTop: 2, fontWeight: 700, whiteSpace: 'nowrap', color: isActive ? '#ffd0d0' : '#a01010' }}
                                                >
                                                    <i className="bi bi-x-octagon-fill me-1" style={{ fontSize: '7px' }}></i>
                                                    REJ {rej.toFixed(2)} · YIELD {yp.toFixed(1)}%
                                                </div>
                                            );
                                        })()}
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
                        <CodeChip code={selectedNode.code} classic={classic} style={{ fontSize: 12, fontWeight: 'bold' }} />
                        <span style={{ fontSize: '12px', color: '#000' }}>{selectedNode.item_name}</span>
                        {(selectedNode.attribute_value_ids || []).map((id: string) => (
                            <span key={id} style={{ fontSize: '9px', padding: '1px 6px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 2, fontWeight: 700 }}>
                                {getAttributeValueName(id)}
                            </span>
                        ))}
                        {canManage && selectedNode.status === 'PENDING' && (
                            <button
                                title="Edit attributes"
                                onClick={() => setEditAttrsModal({ mo: selectedNode, selected: [...(selectedNode.attribute_value_ids || [])] })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#6b7280', fontSize: '11px' }}
                            >
                                <i className="bi bi-pencil"></i>
                            </button>
                        )}
                        {/* Color / pending-lab-dip status for color-type orders */}
                        {selectedNode.color_code && (
                            <span title="Approved color" style={{ fontSize: '9px', padding: '1px 6px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 2, fontWeight: 700 }}>
                                <i className="bi bi-palette me-1"></i>{selectedNode.color_code}{selectedNode.color_name && selectedNode.color_name !== selectedNode.color_code ? ` — ${selectedNode.color_name}` : ''}
                            </span>
                        )}
                        {!selectedNode.color_id && selectedNode.labdip_variant_code && (
                            <span title="Color still in lab dip — dyeing is blocked until approved or a color is set" style={{ fontSize: '9px', padding: '1px 6px', background: '#fbf4dd', color: '#8a6d00', border: '1px solid #e8dca8', borderRadius: 2, fontWeight: 700 }}>
                                <i className="bi bi-eyedropper me-1"></i>Lab dip: {selectedNode.labdip_variant_code}
                            </span>
                        )}
                        {canManage && (selectedNode.color_id || selectedNode.labdip_variant_code) && selectedNode.status !== 'COMPLETED' && selectedNode.status !== 'CANCELLED' && (
                            <button
                                title="Set / confirm color"
                                onClick={() => { setColorModalSearch(''); setColorModalResults([]); setEditColorModal({ mo: selectedNode }); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#6b7280', fontSize: '11px' }}
                            >
                                <i className="bi bi-pencil"></i>
                            </button>
                        )}
                        {(selectedNode.bom_size_id || selectedNode.bom_size_snapshot) && (() => {
                            const label = getBomSizeLabel(selectedNode.bom_id, selectedNode.bom_size_id, selectedNode.bom_size_snapshot);
                            return label ? (
                                <span style={{ fontSize: '9px', padding: '1px 6px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 2, fontWeight: 700 }}>
                                    <i className="bi bi-rulers me-1"></i>{label}
                                </span>
                            ) : null;
                        })()}
                        <span
                            title="Planned putaway bin — where the output will be stored"
                            style={{ fontSize: '9px', padding: '1px 6px', background: selectedNode.planned_putaway_location_name ? '#e8f5e9' : '#f3f4f6', color: selectedNode.planned_putaway_location_name ? '#1b5e20' : '#6b7280', border: `1px solid ${selectedNode.planned_putaway_location_name ? '#a5d6a7' : '#d1d5db'}`, borderRadius: 2, fontWeight: 700 }}
                        >
                            <i className="bi bi-box-arrow-in-down me-1"></i>
                            {selectedNode.planned_putaway_location_name || 'No putaway bin'}
                        </span>
                        {canManage && selectedNode.status !== 'COMPLETED' && selectedNode.status !== 'CANCELLED' && (
                            <button
                                title="Set putaway bin"
                                onClick={() => openPutawayModal(selectedNode)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#6b7280', fontSize: '11px' }}
                            >
                                <i className="bi bi-pencil"></i>
                            </button>
                        )}
                        {bom && <span style={{ fontSize: '10px', color: '#444' }}>BOM: <CodeChip code={bom.code} classic={classic} tier={2} /></span>}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                            {canManage && selectedNode.status === 'PENDING' && (
                                <button className="btn btn-sm btn-primary py-0 px-2" style={{ fontSize: '0.72rem' }} onClick={() => onUpdateStatus(selectedNode.id, 'IN_PROGRESS')}>
                                    <i className="bi bi-play-fill me-1"></i>Start
                                </button>
                            )}
                            {/* Delivered = qty met but still open. Closing is the explicit
                                act that stops further logging (industry: SAP TECO). */}
                            {canManage && selectedNode.status === 'DELIVERED' && (
                                <button className="btn btn-sm btn-success py-0 px-2" style={{ fontSize: '0.72rem' }} onClick={() => onUpdateStatus(selectedNode.id, 'COMPLETED')}>
                                    <i className="bi bi-lock-fill me-1"></i>Close Order
                                </button>
                            )}
                            {canManage && selectedNode.status === 'COMPLETED' && (
                                <button className="btn btn-sm btn-outline-secondary py-0 px-2" style={{ fontSize: '0.72rem' }} onClick={() => onUpdateStatus(selectedNode.id, 'IN_PROGRESS')}>
                                    <i className="bi bi-unlock me-1"></i>Reopen
                                </button>
                            )}
                            <button
                                title="Print this MO"
                                className={classic ? '' : 'btn btn-sm btn-outline-secondary py-0 px-2'}
                                style={classic ? { fontFamily: xpFont, fontSize: '10px', padding: '1px 8px', background: 'linear-gradient(to bottom,#f0efe6,#dddbd0)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer', color: '#000' } : { fontSize: '0.72rem' }}
                                onClick={() => handlePrintWO(selectedNode, true)}
                            >
                                <i className="bi bi-printer me-1"></i>Print
                            </button>
                        </div>
                    </div>

                    {/* Production Progress — prominent, full width under MO code */}
                    {(selectedNode.status === 'IN_PROGRESS' || selectedNode.status === 'DELIVERED' || selectedNode.status === 'COMPLETED' || (selectedNode.qty_completed_total ?? 0) > 0 || (selectedNode.work_orders || []).some((w: any) => w.status !== 'COMPLETED')) && (() => {
                        const done = selectedNode.qty_completed_total ?? 0;
                        const total = selectedNode.qty ?? 0;
                        const remaining = Math.max(0, total - done);
                        // Effectivity: scrap is output that was produced and thrown away, so
                        // yield is measured against everything the floor made, not the target.
                        const rejected = selectedNode.qty_rejected_total ?? 0;
                        const produced = done + rejected;
                        const yieldPct = produced > 0 ? (done / produced) * 100 : null;
                        // Output overdelivery allowance: the order qty is a target, not a
                        // ceiling. Null pct on legacy rows = the 10% system default.
                        const tolPct = selectedNode.overdelivery_tolerance_pct ?? 10;
                        const unlimited = !!selectedNode.allow_unlimited_overdelivery;
                        const maxLoggable = unlimited ? null : total * (1 + tolPct / 100);
                        const over = Math.max(0, done - total);
                        // Projected output from WOs that are set up but not yet completed
                        const plannedRaw = (selectedNode.work_orders || [])
                            .filter((w: any) => w.status !== 'COMPLETED')
                            .reduce((s: number, w: any) => s + Math.max(0, (w.qty ?? 0) - (w.qty_completed_total ?? 0)), 0);
                        const planned = Math.min(plannedRaw, remaining);   // cap so Done + Planned ≤ total
                        const left = Math.max(0, remaining - planned);     // qty not yet covered by any WO
                        const donePct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
                        const plannedPct = total > 0 ? Math.min(100 - donePct, (planned / total) * 100) : 0;
                        return (
                            <div style={{
                                background: classic ? '#eef2f7' : '#f8fafc',
                                borderBottom: classic ? '1px solid #808080' : '1px solid #dee2e6',
                                padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                                    Production Progress
                                </span>
                                <ProgressBar
                                    pct={donePct}
                                    tone={donePct >= 100 ? 'green' : 'blue'}
                                    hatched
                                    height={15}
                                    secondaryPct={plannedPct}
                                    secondaryTone="gray"
                                    label="inside"
                                />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}>Done: <strong style={{ color: '#000' }}>{done.toFixed(2)}</strong></span>
                                {rejected > 0 && (
                                    <span
                                        title={`${rejected.toFixed(2)} of the ${produced.toFixed(2)} produced was QC-rejected. Yield = good / produced.`}
                                        style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}
                                    >
                                        Reject: <strong style={{ color: '#c00' }}>{rejected.toFixed(2)}</strong>
                                    </span>
                                )}
                                {rejected > 0 && yieldPct != null && (
                                    <span
                                        title={`Yield = ${done.toFixed(2)} good / ${produced.toFixed(2)} produced`}
                                        style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}
                                    >
                                        Yield: <strong style={{ color: yieldPct >= 98 ? '#1a6e1a' : yieldPct >= 95 ? '#8a6d00' : '#c00' }}>{yieldPct.toFixed(1)}%</strong>
                                    </span>
                                )}
                                <span style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}>Planned: <strong style={{ color: '#1565c0' }}>{planned.toFixed(2)}</strong></span>
                                <span style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}>Left: <strong style={{ color: left <= 0 ? '#1a6e1a' : '#c00' }}>{left.toFixed(2)}</strong></span>
                                {over > 0 && (
                                    <span style={{ fontSize: '10px', color: '#555', whiteSpace: 'nowrap' }}>Over: <strong style={{ color: '#8a6d00' }}>+{over.toFixed(2)}</strong></span>
                                )}
                                <span
                                    title={unlimited
                                        ? 'No output ceiling on this order — log as much as the floor produces.'
                                        : `Logging is allowed up to ${maxLoggable!.toFixed(2)} (${total.toFixed(2)} + ${Number(tolPct).toFixed(0)}%). Raise the tolerance to log more.`}
                                    style={{ fontSize: '9px', padding: '1px 6px', whiteSpace: 'nowrap', border: '1px solid #d1d5db', background: '#f3f4f6', color: '#555', borderRadius: 2, fontWeight: 700 }}
                                >
                                    <i className="bi bi-arrow-bar-up me-1"></i>
                                    {unlimited ? 'Max: unlimited' : `Max: ${maxLoggable!.toFixed(2)}`}
                                </span>
                                {canManage && selectedNode.status !== 'CANCELLED' && (
                                    <button
                                        title="Set overdelivery tolerance for this order"
                                        onClick={() => setToleranceModal({
                                            mo: selectedNode,
                                            pct: String(tolPct),
                                            unlimited,
                                        })}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: '#6b7280', fontSize: '11px' }}
                                    >
                                        <i className="bi bi-pencil"></i>
                                    </button>
                                )}
                              </div>
                            </div>
                        );
                    })()}

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
                                        {['Component', 'Variant', 'Required', ...(showBreakdown ? ['Breakdown'] : []), 'In Stock', 'Available At'].map(h => (
                                            <th key={h} style={{ border: classic ? '1px solid #808080' : '1px solid #dee2e6', padding: '3px 6px', textAlign: h === 'Required' || h === 'In Stock' ? 'right' : 'left', color: '#000', fontSize: '10px' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {bom.lines.map((line: any, i: number) => {
                                        const req = calculateRequiredQty(selectedNode.qty, line, bom);
                                        const { total, isEnough, locs } = getStockAcrossLocations(line.item_id, line.attribute_value_ids || [], req);
                                        const hasSubBOM = boms.some((b: any) => b.item_id === line.item_id && b.active !== false);
                                        const attrLabel = (line.attribute_value_ids || []).map(getAttributeValueName).filter(Boolean).join(', ');
                                        const rowBg = i % 2 === 0 ? '#fff' : (classic ? '#f5f3ee' : '#f8f9fa');
                                        const stockLevel = isEnough ? 'ok' : total > 0 ? 'low' : 'out';
                                        const dotStyle: Record<string, { dot: string; border: string }> = {
                                            ok:  { dot: '#00aa00', border: '#005500' },
                                            low: { dot: '#ccaa00', border: '#886600' },
                                            out: { dot: '#cc0000', border: '#660000' },
                                        };
                                        const dc = dotStyle[stockLevel];
                                        return (
                                            <tr key={line.id} style={{ background: rowBg }}>
                                                <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', color: '#000' }}>
                                                    <div style={{ fontWeight: 500 }}>{line.item_name || getItemName(line.item_id)}</div>
                                                    <CodeChip code={line.item_code || getItemCode(line.item_id)} classic={classic} tier={2} style={{ display: 'block' }} />
                                                    {hasSubBOM && <span style={{ fontSize: '8px', background: '#fff3cd', border: '1px solid #b8860b', color: '#6b4e00', padding: '0 4px', fontWeight: 'bold' }}>SUB-BOM</span>}
                                                </td>
                                                <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', color: '#333', fontSize: '10px' }}>{attrLabel || '—'}</td>
                                                <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                                        {(line.percentage || 0) > 0 && (
                                                            <span title={`${line.percentage}% of MO qty`} style={{ background: '#b46a00', color: '#fff', fontSize: 8, padding: '0 3px', fontWeight: 'bold' }}>{line.percentage}%</span>
                                                        )}
                                                        <span style={{ fontFamily: CODE_FONT, color: '#000', fontWeight: 'bold' }}>{req.toFixed(2)}</span>
                                                        {getItemUom(line.item_id) && (
                                                            <span style={uomBadgeStyle}>{getItemUom(line.item_id)}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                {showBreakdown && (
                                                    <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', verticalAlign: 'top' }}>
                                                        {parentMOBreakdown.map(({ mo, qty: parentContrib }) => {
                                                            const proportion = selectedNode.qty > 0 ? parentContrib / selectedNode.qty : 0;
                                                            const componentShare = req * proportion;
                                                            return (
                                                                <div key={mo.id} style={{ fontSize: '10px', display: 'flex', gap: 6, whiteSpace: 'nowrap', justifyContent: 'space-between' }}>
                                                                    <span style={{ fontFamily: CODE_FONT, color: '#666' }}>{mo.code}:</span>
                                                                    <span style={{ fontFamily: CODE_FONT, fontWeight: 'bold', color: '#000' }}>{componentShare.toFixed(2)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </td>
                                                )}
                                                <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                                        <span style={{ fontFamily: CODE_FONT, color: isEnough ? '#004400' : total > 0 ? '#664400' : '#880000', fontWeight: 'bold' }}>{total.toFixed(2)}</span>
                                                        <span style={{ display: 'inline-block', width: 8, height: 8, background: dc.dot, border: `1px solid ${dc.border}`, flexShrink: 0 }} />
                                                        {stockLevel === 'low' && <span style={{ fontSize: 8, background: '#886600', color: '#fff', padding: '0 3px', fontWeight: 'bold' }}>Low</span>}
                                                        {stockLevel === 'out' && <span style={{ fontSize: 8, background: '#880000', color: '#fff', padding: '0 3px', fontWeight: 'bold' }}>Out</span>}
                                                        {getItemUom(line.item_id) && <span style={uomBadgeStyle}>{getItemUom(line.item_id)}</span>}
                                                    </div>
                                                </td>
                                                <td style={{ border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '3px 6px' }}>
                                                    {locs.length === 0 ? (
                                                        <span style={{ color: '#bbb', fontSize: 9 }}>—</span>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                                            {locs.map(l => (
                                                                <span key={l.locId} style={{ background: '#e8f0fe', color: '#1a56c4', border: '1px solid #b0c8f8', fontSize: 8, padding: '0 4px', whiteSpace: 'nowrap' }}>
                                                                    {l.code} <span style={{ fontFamily: CODE_FONT, fontWeight: 'bold' }}>{l.qty.toFixed(1)}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ padding: '16px', color: '#555', fontSize: '11px', textAlign: 'center' }}>No BOM lines to display for this manufacturing order.</div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Meta + QR ── */}
                <div style={{
                    width: '170px', minWidth: '170px',
                    borderLeft: classic ? '2px solid #808080' : '1px solid #dee2e6',
                    background: classic ? '#fafaf7' : '#fff',
                    display: 'flex', flexDirection: 'column', overflowY: 'auto'
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

                    {/* Machine Group */}
                    {(bom?.work_center_id || bom?.work_center_name) && (
                    <div style={{ borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', marginBottom: '4px' }}>
                            <i className="bi bi-gear me-1"></i>Machine Group
                        </div>
                        <div style={{ fontSize: '10px', color: '#000', fontWeight: 'bold' }}>
                            {bom.work_center_name || getWCName(bom.work_center_id)}
                        </div>
                    </div>
                    )}

                    {/* Output */}
                    <div style={{ borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', marginBottom: '4px' }}>Output</div>
                        <div style={{ fontSize: '10px', color: '#000', fontWeight: 'bold' }}>{getLocationName(selectedNode.location_id)}</div>
                        <div style={{ fontSize: '10px', color: '#444' }}>Qty: <strong style={{ color: '#000' }}>{selectedNode.qty}</strong>{getItemUom(selectedNode.item_id) && <span style={{ ...uomBadgeStyle, marginLeft: 4 }}>{getItemUom(selectedNode.item_id)}</span>}{selectedNode.item_ends != null && <span style={{ marginLeft: 8, color: '#1a6e2e', fontWeight: 'bold' }}>Ends: {selectedNode.item_ends}</span>}</div>
                    </div>

                    {/* Beams in Stock */}
                    {(() => {
                        const beamLines: { item_id: string; item_name: string; ends: number }[] = [];
                        // MO output is a beam
                        if (selectedNode.item_ends != null) {
                            beamLines.push({ item_id: selectedNode.item_id, item_name: selectedNode.item_name, ends: selectedNode.item_ends });
                        }
                        // BOM component lines that are beams
                        if (bom) {
                            for (const line of (bom.lines || [])) {
                                const ends = getItemEnds(line.item_id);
                                if (ends != null && !beamLines.some(b => b.item_id === line.item_id)) {
                                    beamLines.push({ item_id: line.item_id, item_name: line.item_name || getItemName(line.item_id), ends });
                                }
                            }
                        }
                        if (beamLines.length === 0) return null;
                        return (
                            <div style={{ borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '6px 8px' }}>
                                <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', marginBottom: '4px' }}>
                                    Beams in Stock
                                </div>
                                {beamLines.map(b => {
                                    const { total } = getStockAcrossLocations(b.item_id, [], 0);
                                    const bc = getBeamBatchCount(b.item_id);
                                    return (
                                        <div key={b.item_id} style={{ marginBottom: '4px' }}>
                                            <div style={{ fontSize: '9px', color: '#444', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.item_name}>{b.item_name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                <span style={{ fontFamily: CODE_FONT, fontSize: '10px', fontWeight: 'bold', color: total > 0 ? '#004400' : '#880000' }}>{total.toFixed(2)}</span>
                                                {getItemUom(b.item_id) && <span style={uomBadgeStyle}>{getItemUom(b.item_id)}</span>}
                                                <span style={{ fontSize: 9, background: '#e8d8ff', border: '1px solid #c4a8ee', color: '#440099', padding: '0 4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{bc} beam{bc !== 1 ? 's' : ''}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                    {/* Batch Trace */}
                    <div style={{ borderBottom: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6', padding: '6px 8px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.5px', marginBottom: '4px' }}>
                            <i className="bi bi-upc-scan me-1"></i>Lots
                        </div>
                        {(() => {
                            const trace: any[] = selectedNode.batch_trace || [];
                            if (trace.length === 0) {
                                return <div style={{ fontSize: '9px', color: '#999', fontStyle: 'italic' }}>No batch recorded</div>;
                            }
                            const outputBatch = trace[0]?.output_batch_number;
                            return (
                                <>
                                    {outputBatch && (
                                        <div style={{ fontSize: '10px', marginBottom: '4px' }}>
                                            <span style={{ color: '#555', fontSize: '9px' }}>Output: </span>
                                            <span style={{ fontFamily: CODE_FONT, fontWeight: 'bold', color: '#1a6e1a', fontSize: '10px', background: '#f0fdf4', border: '1px solid #86efac', padding: '0 4px', borderRadius: 2 }}>
                                                {outputBatch}
                                            </span>
                                        </div>
                                    )}
                                    <div style={{ fontSize: '9px', color: '#555', marginBottom: '2px' }}>Input batches:</div>
                                    {trace.map((c: any, i: number) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', fontSize: '9px' }}>
                                            <span style={{ fontFamily: CODE_FONT, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #93c5fd', padding: '0 3px', borderRadius: 2, fontSize: '9px' }}>
                                                {c.input_batch_number}
                                            </span>
                                            <span style={{ color: '#666', fontSize: '9px' }}>{Number(c.qty_consumed).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </>
                            );
                        })()}
                    </div>

                </div>
            </ExpandedRowPanelBody>
            )}

            {detailTab === 'steps' && (
                <div style={{
                    padding: '8px 12px', height: PANEL_BODY_H, overflowY: 'auto', boxSizing: 'border-box',
                    background: '#fff', border: classic ? '1px solid #808080' : undefined,
                }}>
                    <WorkOrderPanel
                        manufacturingOrderId={selectedNode.id}
                        workOrders={selectedNode.work_orders || []}
                        workCenters={workCenters || []}
                        locations={locations || []}
                        onAdd={onCreateWO}
                        onUpdate={onUpdateWO}
                        onUpdateStatus={onUpdateWOStatus}
                        onDelete={onDeleteWO}
                        onLogWO={(wo) => { setCompletionWO(wo); setCompletionMO(resolveMoBom(selectedNode, boms)); }}
                        parentMO={selectedNode}
                        bom={bom}
                    />
                </div>
            )}
        </ExpandedRowPanel>
        );
    };

    return (
        <>
            {printPreviewWO && (
              <MOPrintModal
                  wo={printPreviewWO}
                  onClose={() => setPrintPreviewWO(null)}
                  printSettings={printSettings}
                  onPrintSettingsChange={setPrintSettings}
                  currentStyle={currentStyle}
                  companyProfile={companyProfile}
                  boms={boms}
                  getItemName={getItemName}
                  getItemCode={getItemCode}
                  getLocationName={getLocationName}
                  getAttributeValueName={getAttributeValueName}
                  formatDate={formatDate}
                  hideChildMOs={printHideChildren}
                  onPrint={() => {
                      authFetch(`${API_BASE}/manufacturing-orders/${printPreviewWO.id}/mark-printed`, { method: 'POST' }).catch(() => {});
                  }}
              />
          )}

            {viewMode === 'calendar' ? (
                <div className="p-3"><CalendarView workOrders={manufacturingOrders} items={items} onMOClick={openMOFromCalendar} endField="target_end_date" startField="target_start_date" showHolidays filterable showLoad /></div>
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <ManufacturingSearchBar
                        value={moCodeFilter}
                        onChange={setMoCodeFilter}
                        placeholder="Search by MO code, product, or BOM..."
                        total={totalItems}
                        classic={classic}
                    />
                    <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    <table style={{
                        width: '100%',
                        tableLayout: 'fixed',
                        borderCollapse: 'collapse',
                        fontFamily: classic ? xpFont : undefined,
                        fontSize: classic ? '11px' : undefined,
                        background: classic ? '#fff' : undefined,
                    }} className={classic ? '' : 'table table-hover align-middle mb-0'}>
                        <colgroup>
                            <col style={{ width: '195px' }} />
                            <col />
                            <col style={{ width: '150px' }} />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '120px' }} />
                            <col style={{ width: '120px' }} />
                            <col style={{ width: '120px' }} />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '78px' }} />
                        </colgroup>
                        <thead>
                            <tr style={{
                                background: classic
                                    ? 'linear-gradient(to bottom,#fff 0%,#d4d0c8 100%)'
                                    : undefined,
                                fontSize: classic ? '10px' : '9pt',
                            }} className={classic ? '' : 'table-light'}>
                                {[
                                    { label: 'MO Code',           align: 'left',   cls: 'ps-3' },
                                    { label: 'Product',           align: 'left',   cls: '' },
                                    { label: 'BOM',               align: 'left',   cls: '' },
                                    { label: 'Qty',               align: 'center', cls: '' },
                                    { label: 'Target Timeline',   align: 'left',   cls: '' },
                                    { label: 'Actual',            align: 'left',   cls: '' },
                                    { label: 'Progress',          align: 'left',   cls: '' },
                                    { label: 'Status',            align: 'left',   cls: '' },
                                    { label: 'Actions',           align: 'right',  cls: 'pe-3 no-print' },
                                ].map(({ label, align, cls }) => (
                                    <th key={label} className={cls} style={{
                                        border: classic ? '1px solid #808080' : undefined,
                                        padding: classic ? '3px 8px' : undefined,
                                        textAlign: align as any,
                                        color: '#000',
                                        fontWeight: 'bold',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                    }}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody ref={listBodyRef}>
                            {filteredWorkOrders.length === 0 && (dataLoading.manufacturingOrders ? (
                                <TableSkeleton rows={8} cols={skel.cols ?? 9} classic={classic} rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                            ) : (
                                <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: classic ? 11 : undefined }}>
                                    {moCodeFilter
                                        ? <>No Manufacturing Orders match "<strong>{moCodeFilter}</strong>".</>
                                        : 'No Manufacturing Orders yet.'}
                                </td></tr>
                            ))}
                            {filteredWorkOrders.map((wo: any, rowIdx: number) => {
                                const warning = getDueDateWarning(wo);
                                const isExpanded = expandedRows[wo.id];
                                const isHighlighted = !!moCodeFilter && wo.code.toLowerCase().includes(moCodeFilter.toLowerCase());
                                const rowBg = classic
                                    ? (isHighlighted ? '#fff8c4' : isExpanded ? '#d6e4f7' : rowIdx % 2 === 0 ? '#fff' : '#f5f3ee')
                                    : (isHighlighted ? '#fffde7' : undefined);
                                const tdStyle: React.CSSProperties = classic ? {
                                    border: '1px solid #c0bdb5',
                                    padding: '4px 8px',
                                    color: '#000',
                                    verticalAlign: 'middle',
                                    height: 46,
                                } : { height: 46, verticalAlign: 'middle' };

                                const isBlocked = wo.status === 'PENDING' && manufacturingOrders.some(
                                    (other: any) => other.manufacturing_order_id === wo.manufacturing_order_id
                                                 && other.sequence < wo.sequence
                                                 && other.status !== 'COMPLETED'
                                                 && other.id !== wo.id
                                );

                                // XP-style status chip
                                const statusChip = (status: string) => {
                                    if (!classic) {
                                        if (isBlocked) return <span className="badge bg-secondary extra-small" title="Earlier routing steps must complete first">BLOCKED</span>;
                                        return <span className={`badge ${getStatusBadge(status)} extra-small`}>{status}</span>;
                                    }
                                    if (isBlocked) return <span style={statusChipStyle('PENDING', { background: '#888', borderColor: '#555', color: '#fff' })} title="Earlier routing steps must complete first">BLOCKED</span>;
                                    return <span style={statusChipStyle(status)}>{(status || 'PENDING').replace('_', ' ')}</span>;
                                };

                                // XP-style action button
                                const xpBtn = (label: string, colorScheme: 'primary'|'success'|'danger'|'default', onClick: () => void, title?: string, iconCls?: string) => {
                                    if (!classic) return null; // rendered separately below
                                    const schemes: Record<string, React.CSSProperties> = {
                                        primary: { background: 'linear-gradient(to bottom,#5a9ae0,#0058e6)', borderColor: '#003080 #001840 #001840 #003080', color: '#fff' },
                                        success: { background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff' },
                                        danger:  { background: 'linear-gradient(to bottom,#fff,#d4d0c8)', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#c00000' },
                                        default: { background: 'linear-gradient(to bottom,#fff,#d4d0c8)', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000' },
                                    };
                                    return (
                                        <button key={label || title} onClick={onClick} title={title} style={{
                                            fontFamily: xpFont, fontSize: '10px',
                                            padding: '2px 7px', cursor: 'pointer', border: '1px solid',
                                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            ...schemes[colorScheme],
                                        }}>
                                            {iconCls && <i className={label ? `${iconCls} me-1` : iconCls}></i>}{label}
                                        </button>
                                    );
                                };

                                return (
                                    <>
                                    <tr key={wo.id} id={`mo-row-${wo.id}`} style={{ background: rowBg, cursor: 'default' }}
                                        className={!classic && isExpanded ? 'table-primary bg-opacity-10' : ''}>

                                        {/* MO Code */}
                                        <td style={{ ...tdStyle, paddingLeft: classic ? '10px' : undefined }}
                                            className={!classic ? 'ps-4' : ''}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                                                <CodeChip code={wo.code} classic={classic} style={{ fontWeight: 'bold', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} />
                                                <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                                    <PrintChip variant={wo.card_printed_at ? 'green' : 'gray'} label="Card"
                                                        title={wo.card_printed_at ? `SPK Produksi printed ${tzFmt(wo.card_printed_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }, 'id-ID')}` : 'SPK Produksi not printed yet'} />
                                                </span>
                                            </div>
                                        </td>

                                        {/* Product — name (line 1) + variant chips (line 2); click to expand */}
                                        <td style={{ ...tdStyle, cursor: 'pointer' }} onClick={() => toggleRow(wo.id)}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} style={{ color: '#555', fontSize: '10px', marginTop: 2, flexShrink: 0 }}></i>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 'bold', color: '#000', fontSize: classic ? '11px' : '9pt', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {wo.item_name || getItemName(wo.item_id)}
                                                    </div>
                                                    {((wo.attribute_value_ids || []).length > 0 || wo.bom_size_id) && (
                                                        <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap', overflow: 'hidden', marginTop: 2 }}>
                                                            {(wo.attribute_value_ids || []).map((id: string) => (
                                                                <span key={id} style={{ fontSize: '9px', padding: '1px 5px', background: classic ? '#dce8ff' : '#dbeafe', color: classic ? '#003ea6' : '#1d4ed8', border: `1px solid ${classic ? '#9ab0e0' : '#93c5fd'}`, borderRadius: classic ? 0 : 3, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                                    {getAttributeValueName(id)}
                                                                </span>
                                                            ))}
                                                            {wo.bom_size_id && (() => {
                                                                const label = getBomSizeLabel(wo.bom_id, wo.bom_size_id);
                                                                return label ? (
                                                                    <span style={{ fontSize: '9px', padding: '1px 5px', background: classic ? '#e4f5e4' : '#dcfce7', color: classic ? '#1a5e1a' : '#15803d', border: `1px solid ${classic ? '#90c090' : '#86efac'}`, borderRadius: classic ? 0 : 3, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                                        <i className="bi bi-rulers me-1" style={{ fontSize: '7px' }}></i>{label}
                                                                    </span>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* BOM — code + originating SO + nested marker */}
                                        <td style={{ ...tdStyle, overflow: 'hidden' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: '9px', color: '#555', minWidth: 0, maxWidth: '100%' }}>
                                                <CodeChip code={getBOMCode(wo.bom_id)} classic={classic} tier={2} style={{ display: 'block', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                                                {wo.sales_order_id && (
                                                    <span style={classic ? {
                                                        fontSize: '8px', background: '#dce8ff', border: '1px solid #9ab0e0',
                                                        color: '#003ea6', padding: '0 5px', fontWeight: 'bold', whiteSpace: 'nowrap',
                                                    } : {
                                                        fontSize: '0.65rem', background: '#cfe2ff', border: '1px solid #9ec5fe',
                                                        color: '#0a58ca', padding: '1px 6px', borderRadius: 3, fontWeight: 'bold', whiteSpace: 'nowrap',
                                                    }} title="Originating Sales Order">
                                                        <i className="bi bi-receipt me-1" style={{ fontSize: classic ? '7px' : undefined }}></i>SO: {wo.sales_order_code || '—'}
                                                    </span>
                                                )}
                                                {wo.child_mos && wo.child_mos.length > 0 && (
                                                    classic
                                                        ? <span style={{ fontSize: '8px', background: '#fff3cd', border: '1px solid #b8860b', color: '#6b4e00', padding: '0 4px', fontWeight: 'bold' }}>NESTED x{wo.child_mos.length}</span>
                                                        : <span className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25" style={{fontSize: '0.65rem'}}>NESTED ({wo.child_mos.length})</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Qty */}
                                        <td style={{ ...tdStyle, fontWeight: 'bold', color: '#000', fontFamily: CODE_FONT }}
                                            className={!classic ? 'fw-bold' : ''}>
                                            {(() => {
                                                const qtyStr = typeof wo.qty === 'number' ? wo.qty.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(wo.qty);
                                                const [intPart, decPart] = qtyStr.split('.');
                                                return (
                                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                        <span style={{ minWidth: '48px', textAlign: 'right' }}>{intPart}</span>
                                                        <span style={{ width: '7px', textAlign: 'left' }}>{decPart ? '.' : ''}</span>
                                                        <span style={{ minWidth: '20px', textAlign: 'left' }}>{decPart || ''}</span>
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* Target Timeline */}
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: classic ? '10px' : undefined, display: 'flex', flexDirection: 'column', gap: '1px' }}
                                                 className={!classic ? 'extra-small' : ''}>
                                                <span style={{ color: '#000' }}>S: {formatDate(wo.target_start_date)}</span>
                                                <span style={{ color: warning ? '#c00000' : '#000', fontWeight: warning ? 'bold' : undefined }}>
                                                    E: {formatDate(wo.target_end_date)}
                                                    {warning && <i className={`bi ${warning.icon} ms-1`} style={{ fontSize: '9px' }}></i>}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Actual — start / end only (2 lines) */}
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: classic ? '10px' : undefined, display: 'flex', flexDirection: 'column', gap: '1px' }}
                                                 className={!classic ? 'extra-small text-muted' : ''}>
                                                <span style={{ color: '#555' }}>S: {formatDateTime(wo.actual_start_date)}</span>
                                                <span style={{ color: '#555' }}>E: {formatDateTime(wo.actual_end_date)}</span>
                                            </div>
                                        </td>

                                        {/* Progress — bar + completed / target (2 lines) */}
                                        <td style={tdStyle}>
                                            {(wo.qty_completed_total != null && wo.qty_completed_total > 0) ? (() => {
                                                const pct = Math.min(100, Math.round((wo.qty_completed_total / wo.qty) * 100));
                                                // Step-level scrap: the MO says how much was lost, this says where.
                                                const rej = wo.qty_rejected_total ?? 0;
                                                const prod = wo.qty_completed_total + rej;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <ProgressBar pct={pct} tone={pct >= 100 ? 'green' : 'blue'} height={8} />
                                                        <span style={{ fontSize: '9px', color: '#555' }}>{parseFloat(wo.qty_completed_total).toFixed(2)} / {wo.qty} ({pct}%)</span>
                                                        {rej > 0 && (
                                                            <span
                                                                title={`${rej.toFixed(2)} rejected on this step of ${prod.toFixed(2)} produced — yield ${(wo.qty_completed_total / prod * 100).toFixed(1)}%`}
                                                                style={{ fontSize: '9px', fontWeight: 700, color: '#a01010' }}
                                                            >
                                                                <i className="bi bi-x-octagon-fill me-1" style={{ fontSize: '8px' }}></i>
                                                                rej {rej.toFixed(2)} ({(wo.qty_completed_total / prod * 100).toFixed(1)}% yield)
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })() : (
                                                <span style={{ color: '#999', fontSize: '10px' }}>-</span>
                                            )}
                                        </td>

                                        {/* Status */}
                                        <td style={tdStyle}>{statusChip(wo.status)}</td>

                                        {/* Actions — icon Start + [...] menu (Print / Delete) */}
                                        <td style={{ ...tdStyle, textAlign: 'right' }} className="no-print" onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                                                {canManage && wo.status === 'PENDING' && !isBlocked && (
                                                    classic
                                                        ? <span style={{ width: '26px', display: 'inline-flex' }}>{xpBtn('', 'primary', () => onUpdateStatus(wo.id, 'IN_PROGRESS'), 'Start production', 'bi bi-play-fill')}</span>
                                                        : <button className="btn btn-sm btn-primary py-0 px-2" title="Start production" onClick={() => onUpdateStatus(wo.id, 'IN_PROGRESS')}><i className="bi bi-play-fill" /></button>
                                                )}
                                                <MenuTriggerButton classic={classic} onClick={(e) => toggleMoMenu(wo.id, e)} />
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr key={`${wo.id}-detail`}>
                                            <td colSpan={9} className="p-0 border-0">
                                                {renderWOExpandedPanel({
                                                    wo,
                                                    detailTab: expandedDetailTabs[wo.id] || 'bom',
                                                    setDetailTab: (t) => setExpandedDetailTabs(prev => ({ ...prev, [wo.id]: t })),
                                                })}
                                            </td>
                                        </tr>
                                    )}
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                    {/* Floating "more actions" menu — Print / Delete */}
                    {openMoMenuId && (() => {
                        const menuMO = filteredWorkOrders.find((m: any) => m.id === openMoMenuId);
                        if (!menuMO) return null;
                        return (
                            <FloatingMenu
                                pos={moMenuPos}
                                items={[
                                    { key: 'print', icon: 'bi-printer', label: 'Print', onClick: () => { closeMoMenu(); handlePrintWO(menuMO); } },
                                    { key: 'delete', icon: 'bi-trash', label: 'Delete', danger: true, hidden: !canManage, onClick: () => { closeMoMenu(); onDeleteMO(menuMO.id); } },
                                ]}
                            />
                        );
                    })()}
                    <Pager page={currentPage} total={totalItems} pageSize={pageSize} onPageChange={onPageChange} hideWhenEmpty />
                </div>
            )}

            {completionMO && (
                <WOCompletionModal
                    mo={completionMO}
                    workOrder={completionWO ?? undefined}
                    onClose={() => { setCompletionMO(null); setCompletionWO(null); }}
                    onSaved={(updated) => {
                        setCompletionMO(null);
                        setCompletionWO(null);
                        fetchData('work-orders');
                    }}
                />
            )}

            {editAttrsModal && (() => {
                const xpBtn = (onClick: () => void, label: string, primary: boolean) => (
                    <button
                        onClick={onClick}
                        style={{
                            fontFamily: xpFont, fontSize: 11,
                            padding: '2px 14px', cursor: 'pointer', borderRadius: 0,
                            background: primary
                                ? 'linear-gradient(to bottom, #b0e8b0, #70c870)'
                                : 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                            border: '1px solid',
                            borderColor: primary
                                ? '#d0f0d0 #0a3e0a #0a3e0a #1a5e1a'
                                : '#dfdfdf #808080 #808080 #dfdfdf',
                            fontWeight: primary ? 'bold' : 'normal',
                            color: primary ? '#004000' : '#000',
                            minWidth: 70,
                        }}
                    >{label}</button>
                );
                const isClassic = classic;
                return (
                    <ModalWrapper
                        isOpen
                        modeless
                        onClose={() => setEditAttrsModal(null)}
                        title={<><i className="bi bi-tags me-1"></i>Edit Attributes — <span style={{ fontFamily: CODE_FONT }}>{editAttrsModal.mo.code}</span></>}
                        size="md"
                        level={2}
                        footer={isClassic ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                                {xpBtn(() => setEditAttrsModal(null), 'Cancel', false)}
                                {xpBtn(() => handleUpdateMOAttributes(editAttrsModal.mo.id, editAttrsModal.selected), 'Save', true)}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => setEditAttrsModal(null)}>Cancel</button>
                                <button className="btn btn-sm btn-primary" onClick={() => handleUpdateMOAttributes(editAttrsModal.mo.id, editAttrsModal.selected)}>Save</button>
                            </div>
                        )}
                    >
                        {/* Attribute rows: label + dropdown */}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                {(attributes || []).map((attr: any) => {
                                    const currentVal = (attr.values || []).find((v: any) => editAttrsModal.selected.includes(v.id));
                                    return (
                                        <tr key={attr.id}>
                                            <td style={{
                                                padding: isClassic ? '3px 8px 3px 0' : '4px 10px 4px 0',
                                                fontFamily: isClassic ? xpFont : undefined,
                                                fontSize: isClassic ? 11 : 12,
                                                fontWeight: isClassic ? 'normal' : 500,
                                                color: '#333',
                                                whiteSpace: 'nowrap',
                                                width: 1,
                                            }}>{attr.name}</td>
                                            <td style={{ padding: isClassic ? '3px 0' : '4px 0' }}>
                                                <select
                                                    value={currentVal?.id ?? ''}
                                                    onChange={e => {
                                                        const newValId = e.target.value;
                                                        setEditAttrsModal(prev => {
                                                            if (!prev) return prev;
                                                            const attrValueIds = (attr.values || []).map((v: any) => v.id);
                                                            const without = prev.selected.filter((id: string) => !attrValueIds.includes(id));
                                                            return { ...prev, selected: newValId ? [...without, newValId] : without };
                                                        });
                                                    }}
                                                    style={isClassic ? {
                                                        fontFamily: xpFont, fontSize: 11,
                                                        border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                                                        background: '#fff', height: 20, padding: '0 2px',
                                                        outline: 'none', width: '100%', borderRadius: 0,
                                                    } : { fontSize: 12, width: '100%' }}
                                                    className={isClassic ? undefined : 'form-select form-select-sm'}
                                                >
                                                    <option value="">— none —</option>
                                                    {(attr.values || []).map((val: any) => (
                                                        <option key={val.id} value={val.id}>{val.value}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </ModalWrapper>
                );
            })()}

            {editColorModal && (() => {
                const isClassic = classic;
                const mo = editColorModal.mo;
                const xpBtn = (onClick: () => void, label: string, primary: boolean) => (
                    <button
                        onClick={onClick}
                        style={{
                            fontFamily: xpFont, fontSize: 11,
                            padding: '2px 14px', cursor: 'pointer', borderRadius: 0,
                            background: primary ? 'linear-gradient(to bottom, #b0e8b0, #70c870)' : 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                            border: '1px solid',
                            borderColor: primary ? '#d0f0d0 #0a3e0a #0a3e0a #1a5e1a' : '#dfdfdf #808080 #808080 #dfdfdf',
                            fontWeight: primary ? 'bold' : 'normal', color: primary ? '#004000' : '#000', minWidth: 70,
                        }}
                    >{label}</button>
                );
                return (
                    <ModalWrapper
                        isOpen
                        modeless
                        onClose={() => setEditColorModal(null)}
                        title={<><i className="bi bi-palette me-1"></i>Set Color — <span style={{ fontFamily: CODE_FONT }}>{mo.code}</span></>}
                        size="md"
                        level={2}
                        footer={isClassic ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                                {mo.color_id && xpBtn(() => handleSetMOColor(mo.id, null), 'Clear', false)}
                                {xpBtn(() => setEditColorModal(null), 'Close', false)}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                {mo.color_id && <button className="btn btn-sm btn-outline-danger" onClick={() => handleSetMOColor(mo.id, null)}>Clear</button>}
                                <button className="btn btn-sm btn-secondary" onClick={() => setEditColorModal(null)}>Close</button>
                            </div>
                        )}
                    >
                        <div style={{ fontFamily: isClassic ? xpFont : undefined, fontSize: isClassic ? 11 : 13 }}>
                            {mo.color_code && (
                                <div style={{ marginBottom: 8 }}>Current color: <b>{mo.color_code}</b>{mo.color_name && mo.color_name !== mo.color_code ? ` — ${mo.color_name}` : ''}</div>
                            )}
                            {mo.labdip_variant_code && (
                                <div style={{ marginBottom: 8, padding: '4px 8px', background: '#fbf4dd', border: '1px solid #e8dca8', color: '#8a6d00' }}>
                                    Ordered against lab dip <b>{mo.labdip_variant_code}</b>. It backfills the color automatically on approval — set one here only to override.
                                </div>
                            )}
                            {colorModalLabdips.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontWeight: 'bold', color: '#8a6d00', marginBottom: 2 }}>Lab dips in progress for this item</div>
                                    {colorModalLabdips.map((v: any) => (
                                        <div key={v.labdip_item_id} style={{ fontSize: isClassic ? 10 : 12, color: '#555' }}>{v.variant_code} · {v.request_code || 'lab dip'} · {v.status}</div>
                                    ))}
                                </div>
                            )}
                            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Pick an approved color</div>
                            <input
                                type="text"
                                placeholder="Search color code / name / Pantone..."
                                value={colorModalSearch}
                                onChange={e => setColorModalSearch(e.target.value)}
                                style={isClassic ? { fontFamily: xpFont, fontSize: 11, border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080', background: '#fff', height: 22, padding: '0 4px', outline: 'none', width: '100%', borderRadius: 0 } : { fontSize: 12, width: '100%' }}
                                className={isClassic ? undefined : 'form-control form-control-sm'}
                            />
                            <div style={{ maxHeight: 200, overflowY: 'auto', border: colorModalResults.length ? '1px solid #ccc' : 'none', marginTop: 4 }}>
                                {colorModalResults.map((c: any) => (
                                    <div
                                        key={c.id}
                                        onClick={() => handleSetMOColor(mo.id, c.id)}
                                        style={{ padding: '3px 6px', cursor: 'pointer', fontSize: isClassic ? 11 : 12, borderBottom: '1px solid #eee' }}
                                    >
                                        <b>{c.code}</b>{c.name ? ` — ${c.name}` : ''}{c.pantone_ref ? <span style={{ color: '#888' }}> · {c.pantone_ref}</span> : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </ModalWrapper>
                );
            })()}

            {putawayModal && (() => {
                const xpBtn = (onClick: () => void, label: string, primary: boolean) => (
                    <button
                        onClick={onClick}
                        style={{
                            fontFamily: xpFont, fontSize: 11,
                            padding: '2px 14px', cursor: 'pointer', borderRadius: 0,
                            background: primary
                                ? 'linear-gradient(to bottom, #b0e8b0, #70c870)'
                                : 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                            border: '1px solid',
                            borderColor: primary
                                ? '#d0f0d0 #0a3e0a #0a3e0a #1a5e1a'
                                : '#dfdfdf #808080 #808080 #dfdfdf',
                            fontWeight: primary ? 'bold' : 'normal',
                            color: primary ? '#004000' : '#000',
                            minWidth: 70,
                        }}
                    >{label}</button>
                );
                const isClassic = classic;
                const pm = putawayModal;
                const reasonText = pm.reason === 'same_item' ? 'bin already holds this item'
                    : pm.reason === 'empty_bin' ? 'first empty bin'
                    : pm.reason === 'configured' ? 'currently assigned bin'
                    : pm.reason === 'item_default' ? "item's default putaway bin"
                    : pm.reason === 'first_bin' ? 'first bin by code'
                    : pm.reason === 'all_locations' ? 'no output area configured for this order — every bin is listed'
                    : null;
                const selStyle = isClassic ? {
                    fontFamily: xpFont, fontSize: 11,
                    border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                    background: '#fff', height: 20, padding: '0 2px',
                    outline: 'none', width: '100%', borderRadius: 0,
                } as React.CSSProperties : { fontSize: 12, width: '100%' } as React.CSSProperties;
                return (
                    <ModalWrapper
                        isOpen
                        modeless
                        onClose={() => setPutawayModal(null)}
                        title={<><i className="bi bi-box-arrow-in-down me-1"></i>Putaway Bin — <span style={{ fontFamily: CODE_FONT }}>{pm.mo.code}</span></>}
                        size="md"
                        level={2}
                        footer={isClassic ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                                {xpBtn(() => setPutawayModal(null), 'Cancel', false)}
                                {xpBtn(() => handleSavePutaway(pm.mo.id, pm.selected), 'Save', true)}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => setPutawayModal(null)}>Cancel</button>
                                <button className="btn btn-sm btn-primary" onClick={() => handleSavePutaway(pm.mo.id, pm.selected)}>Save</button>
                            </div>
                        )}
                    >
                        <div style={{ fontFamily: isClassic ? xpFont : undefined, fontSize: isClassic ? 11 : 12, color: '#333', marginBottom: 8 }}>
                            Where this output will be stored when produced. Operators see this on the work order — they do not choose it.
                        </div>
                        {pm.loading ? (
                            <div style={{ fontSize: 11, color: '#888' }}>Loading bins...</div>
                        ) : pm.error ? (
                            <div style={{ fontSize: 11, color: '#c00' }}>
                                Could not load bins: {pm.error}
                            </div>
                        ) : pm.bins.length === 0 ? (
                            <div style={{ fontSize: 11, color: '#888' }}>
                                No locations exist yet — create them on the Locations page.
                            </div>
                        ) : (
                            <>
                                <select
                                    value={pm.selected}
                                    onChange={e => setPutawayModal(prev => prev ? { ...prev, selected: e.target.value } : prev)}
                                    style={selStyle}
                                    className={isClassic ? undefined : 'form-select form-select-sm'}
                                >
                                    <option value="">— none (fall back to WO output location) —</option>
                                    {pm.bins.map((b: any) => (
                                        <option key={b.id} value={b.id}>
                                            {b.full_path}
                                            {b.item_on_hand > 0 ? ` — ${Number(b.item_on_hand).toFixed(2)} same item` : b.total_on_hand <= 0 ? ' — empty' : ''}
                                            {b.id === pm.suggested ? ' (suggested)' : ''}
                                        </option>
                                    ))}
                                </select>
                                {reasonText && (
                                    <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                                        Suggestion: {reasonText}.
                                    </div>
                                )}
                            </>
                        )}
                    </ModalWrapper>
                );
            })()}

            {toleranceModal && (() => {
                const isClassic = classic;
                const tm = toleranceModal;
                const xpBtn = (onClick: () => void, label: string, primary: boolean) => (
                    <button
                        onClick={onClick}
                        style={{
                            fontFamily: xpFont, fontSize: 11,
                            padding: '2px 14px', cursor: 'pointer', borderRadius: 0,
                            background: primary
                                ? 'linear-gradient(to bottom, #b0e8b0, #70c870)'
                                : 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
                            border: '1px solid',
                            borderColor: primary
                                ? '#d0f0d0 #0a3e0a #0a3e0a #1a5e1a'
                                : '#dfdfdf #808080 #808080 #dfdfdf',
                            fontWeight: primary ? 'bold' : 'normal',
                            color: primary ? '#004000' : '#000',
                            minWidth: 70,
                        }}
                    >{label}</button>
                );
                const inpStyle = isClassic ? {
                    fontFamily: xpFont, fontSize: 11,
                    border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                    background: '#fff', height: 20, padding: '0 4px',
                    outline: 'none', width: 90, borderRadius: 0,
                } as React.CSSProperties : { fontSize: 12, width: 110 } as React.CSSProperties;
                const pctNum = parseFloat(tm.pct);
                const preview = tm.unlimited || isNaN(pctNum)
                    ? null
                    : (Number(tm.mo.qty || 0) * (1 + pctNum / 100));
                return (
                    <ModalWrapper
                        isOpen
                        modeless
                        onClose={() => setToleranceModal(null)}
                        title={<><i className="bi bi-arrow-bar-up me-1"></i>Overdelivery Tolerance — <span style={{ fontFamily: CODE_FONT }}>{tm.mo.code}</span></>}
                        size="md"
                        level={2}
                        footer={isClassic ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                                {xpBtn(() => setToleranceModal(null), 'Cancel', false)}
                                {xpBtn(handleSaveTolerance, 'Save', true)}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => setToleranceModal(null)}>Cancel</button>
                                <button className="btn btn-sm btn-primary" onClick={handleSaveTolerance}>Save</button>
                            </div>
                        )}
                    >
                        <div style={{ fontFamily: isClassic ? xpFont : undefined, fontSize: isClassic ? 11 : 12, color: '#333', marginBottom: 10 }}>
                            How far past the order quantity the floor may log. Set this on the order
                            when a run is deliberately over-issued (spare beams against bad yarn) —
                            editing the BOM instead would loosen every future order of this article.
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <label style={{ fontSize: isClassic ? 11 : 12, color: '#333', minWidth: 90 }}>Tolerance</label>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                disabled={tm.unlimited}
                                value={tm.pct}
                                onChange={e => setToleranceModal(prev => prev ? { ...prev, pct: e.target.value } : prev)}
                                style={{ ...inpStyle, opacity: tm.unlimited ? 0.5 : 1 }}
                                className={isClassic ? undefined : 'form-control form-control-sm'}
                            />
                            <span style={{ fontSize: isClassic ? 11 : 12, color: '#555' }}>%</span>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: isClassic ? 11 : 12, color: '#333' }}>
                            <input
                                type="checkbox"
                                checked={tm.unlimited}
                                onChange={e => setToleranceModal(prev => prev ? { ...prev, unlimited: e.target.checked } : prev)}
                            />
                            No limit (default for warp beams — kg per beam varies with the yarn)
                        </label>
                        <div style={{ fontSize: 10, color: '#666', marginTop: 10 }}>
                            Order qty {Number(tm.mo.qty || 0).toFixed(2)} —{' '}
                            {preview == null ? 'no ceiling: log as much as the floor produces.' : `logging allowed up to ${preview.toFixed(2)}.`}
                        </div>
                    </ModalWrapper>
                );
            })()}
        </>
    );
}
