import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { createPortal } from 'react-dom';
import BOMDesigner from './BOMDesigner';
import BOMPrintModal from './BOMPrintModal';
import ProductionRunModal from '../manufacturing/ProductionRunModal';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import { useData } from '../../context/DataContext';

const xpTh: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #fff, #d4d0c8)',
    border: '1px solid #808080',
    padding: '3px 7px',
    fontWeight: 'bold',
    fontSize: 10,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    color: '#000',
    fontFamily: 'Tahoma, Arial, sans-serif',
};

const xpTd: React.CSSProperties = {
    border: '1px solid #d4d0c8',
    padding: '3px 7px',
    verticalAlign: 'middle',
    fontFamily: 'Tahoma, Arial, sans-serif',
    fontSize: 11,
    color: '#000',
};

const xpFooterTd: React.CSSProperties = {
    ...xpTd,
    background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)',
    borderTop: '1px solid #808080',
    fontSize: 10,
    color: '#444',
};

const xpSectionHdr: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #fff, #d6d3ce)',
    border: '1px solid #808080',
    padding: '2px 7px',
    fontWeight: 'bold',
    fontSize: 10,
    color: '#000',
    marginBottom: 3,
    fontFamily: 'Tahoma, Arial, sans-serif',
};

export default function BOMView({
    items, boms, locations, attributes, sizes, workCenters, operations, partners,
    onCreateBOM, onUpdateBOM, onDeleteBOM, onDeleteMultipleBOMs, onCreateItem, onSearchItem,
    onUploadBOMPhoto, onUploadBOMDesign, onFetchBOMTree,
    companyProfile,
    initialCreateState, onClearInitialState,
    onCreateProductionRun, productionRuns,
    // Pagination props (managed by bom/page.tsx)
    bomPage = 1, bomTotal = 0, bomPageSize = 50,
    bomSearch = '', onBomSearch,
    setBomPage,
    showRootOnly = true, setShowRootOnly,
    bomLoading = false,
}: any) {
    const { showToast } = useToast();
    const { t } = useLanguage();
    const { itemIndex } = useData();
    const { uiStyle: currentStyle } = useTheme();
    const classic = currentStyle === 'classic';

    const [isDesignerOpen, setIsDesignerOpen] = useState(false);
    const [editingBOM, setEditingBOM] = useState<any>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [printBOM, setPrintBOM] = useState<any>(null);
    const [startPRBom, setStartPRBom] = useState<any>(null);
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    // Cache of fetched BOM trees: rootBomId -> { bomId: bomObj } flat map
    const [bomTreeCache, setBomTreeCache] = useState<Record<string, Record<string, any>>>({});

    // Inline detail panel state
    const [expandedBOMRows, setExpandedBOMRows] = useState<Record<string, boolean>>({});
    const [selectedBOMNodes, setSelectedBOMNodes] = useState<Record<string, string>>({});

    // Flatten a BOMTreeResponse (recursive lines[].sub_bom) into a flat id->bom map
    const flattenBOMTree = (bom: any, acc: Record<string, any> = {}): Record<string, any> => {
        if (!bom || acc[bom.id]) return acc;
        acc[bom.id] = bom;
        for (const line of bom.lines || []) {
            if (line.sub_bom) flattenBOMTree(line.sub_bom, acc);
        }
        return acc;
    };

    const toggleBOMRow = (bomId: string, _bomItemId: string) => {
        setExpandedBOMRows(prev => {
            const opening = !prev[bomId];
            if (opening) {
                setSelectedBOMNodes(p => ({ ...p, [bomId]: bomId }));
                // Fetch and cache the full tree so sub-BOMs are available even across pages
                if (!bomTreeCache[bomId] && onFetchBOMTree) {
                    onFetchBOMTree(bomId).then((tree: any) => {
                        if (tree) setBomTreeCache(c => ({ ...c, [bomId]: flattenBOMTree(tree) }));
                    });
                }
            }
            return { ...prev, [bomId]: opening };
        });
    };

    const selectDetailNode = (bomId: string, subBomId: string) => {
        setSelectedBOMNodes(prev => ({ ...prev, [bomId]: subBomId }));
    };

    // Combined lookup: current page boms + all cached tree boms (cache wins for sub-BOMs)
    const allBomsById = useMemo<Record<string, any>>(() => {
        const map: Record<string, any> = {};
        for (const b of boms) map[b.id] = b;
        for (const subMap of Object.values(bomTreeCache)) {
            for (const [id, b] of Object.entries(subMap)) {
                if (!map[id]) map[id] = b;
            }
        }
        return map;
    }, [boms, bomTreeCache]);

    // Attribute-aware sub-BOM lookup: searches current page + all cached trees
    const findSubBOM = (line: any, excludeIds: Set<string> = new Set()): any | undefined => {
        const candidates = Object.values(allBomsById).filter((b: any) => b.item_id === line.item_id && !excludeIds.has(b.id));
        if (candidates.length === 0) return undefined;
        const lineAttrs = [...(line.attribute_value_ids || [])].sort();
        const exact = candidates.find((b: any) => {
            const bAttrs = [...(b.attribute_value_ids || [])].sort();
            return bAttrs.length === lineAttrs.length && bAttrs.every((id: string, idx: number) => id === lineAttrs[idx]);
        });
        if (exact) return exact;
        return candidates.find((b: any) => (b.attribute_value_ids || []).length === 0);
    };

    // Lookup helpers
    const getItemName = (id: string, provided?: string) => provided || items.find((i: any) => i.id === id)?.name || itemIndex?.[String(id)]?.name || id;
    const getItemCode = (id: string, provided?: string) => provided || items.find((i: any) => i.id === id)?.code || itemIndex?.[String(id)]?.code || id;
    const getItemUom = (id: string) => items.find((i: any) => i.id === id)?.uom || '';
    // Beam items carry a warp-ends count; for a beam BOM the qty IS the ends (set on BOM creation).
    const getItemEnds = (id: string): number | null => { const e = items.find((i: any) => i.id === id)?.ends; return e != null ? e : null; };
    const uomBadge: React.CSSProperties = { background: '#dde8f5', border: '1px solid #7f9db9', color: '#336', fontSize: 9, padding: '0 4px', whiteSpace: 'nowrap', fontWeight: 'normal' };
    const getWcName = (id: string | null) => id ? (workCenters.find((w: any) => w.id === id)?.name || id) : '—';
    const getAttrValues = (ids: string[]) => {
        if (!ids?.length) return '—';
        const names = ids.map((valId: string) => {
            for (const attr of attributes) {
                const val = attr.values?.find((v: any) => v.id === valId);
                if (val) return val.value;
            }
            return null;
        }).filter(Boolean);
        return names.length ? names.join(', ') : '—';
    };
    const getAttributeValueName = (valId: string) => {
        if (!valId || !attributes) return '-';
        for (const attr of attributes) {
            const val = attr.values.find((v: any) => v.id === valId);
            if (val) return val.value;
        }
        return valId;
    };

    // Server already filters by search + root_only; boms is the current page result
    const allSelected = boms.length > 0 && boms.every((b: any) => selectedIds.has(b.id));
    const someSelected = boms.some((b: any) => selectedIds.has(b.id)) && !allSelected;

    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds(prev => { const n = new Set(prev); boms.forEach((b: any) => n.delete(b.id)); return n; });
        } else {
            setSelectedIds(prev => { const n = new Set(prev); boms.forEach((b: any) => n.add(b.id)); return n; });
        }
    };

    const handleBulkDelete = async () => {
        if (onDeleteMultipleBOMs) { await onDeleteMultipleBOMs([...selectedIds]); setSelectedIds(new Set()); }
    };

    const initialItemCode = initialCreateState ? (items.find((i: any) => i.id === initialCreateState.item_id)?.code || '') : '';
    const initialAttributeIds = initialCreateState ? (initialCreateState.attribute_value_ids || '').split(',').filter(Boolean) : [];

    useEffect(() => {
        if (initialCreateState && items.length > 0) {
            if (items.find((i: any) => i.id === initialCreateState.item_id)) setIsDesignerOpen(true);
        }
    }, [initialCreateState, items]);

    const handleCloseDesigner = () => { setIsDesignerOpen(false); setEditingBOM(null); if (onClearInitialState) onClearInitialState(); };

    const handleEditBOM = async (bom: any) => {
        if (onFetchBOMTree) {
            setEditLoading(true);
            try {
                const tree = await onFetchBOMTree(bom.id);
                setEditingBOM(tree);
                setIsDesignerOpen(true);
            } finally {
                setEditLoading(false);
            }
        } else {
            setEditingBOM(bom);
            setIsDesignerOpen(true);
        }
    };

    const handleCreateBOMWrapper = async (bomData: any) => {
        const cleaned = {
            ...bomData,
            customer_id: bomData.customer_id || null,
            work_center_id: bomData.work_center_id || null,
            size_mode: bomData.sizeMode || 'sized',
            sizes: (bomData.sizes || []).map((s: any) => ({
                size_id: s.size_id || null,
                label: s.label || null,
                target_measurement: s.target_measurement,
                measurement_min: s.measurement_min,
                measurement_max: s.measurement_max,
            })),
            operations: (bomData.operations || []).map(({ _key, ...op }: any) => op),
        };

        const isEdit = !!bomData.bomId;
        const res = isEdit
            ? await onUpdateBOM(bomData.bomId, cleaned)
            : await onCreateBOM(cleaned);

        if (res?.status === 400) {
            const err = await res.json();
            showToast(`Error saving BOM ${bomData.code}: ${err.detail || 'Invalid data'}`, 'warning');
            throw new Error(err.detail || 'Invalid');
        } else if (res?.status === 404) {
            const err = await res.json();
            showToast(`Failed to save BOM ${bomData.code}: ${err.detail}`, 'danger');
            throw new Error(err.detail || 'Not found');
        } else if (res?.ok) {
            const saved = await res.json();
            showToast(`BOM ${bomData.code} ${isEdit ? 'updated' : 'saved'}`, 'success');
            return saved.id;
        } else {
            try { const err = await res.json(); showToast(`Failed to save BOM ${bomData.code}: ${err.detail}`, 'danger'); } catch (_) { showToast(`Failed to save BOM ${bomData.code}`, 'danger'); }
            throw new Error('Failed');
        }
    };

    // Materials column preview tree (existing)
    const toggleNode = (nodeId: string) => setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));

    const renderBOMTree = (bomLines: any[], parentId: string, level = 0) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {bomLines.map((line: any) => {
                const subBOM = findSubBOM(line);
                const isExpandable = !!subBOM;
                const nodeKey = `${parentId}-${line.id}`;
                const isExpanded = expandedNodes[nodeKey];
                return (
                    <div key={line.id} style={{ fontSize: '11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {isExpandable ? (
                                <i className={`bi bi-caret-${isExpanded ? 'down' : 'right'}-fill`}
                                    style={{ cursor: 'pointer', fontSize: '0.7rem', width: '12px', marginRight: '4px', color: classic ? '#0058e6' : undefined, flexShrink: 0 }}
                                    onClick={() => toggleNode(nodeKey)} />
                            ) : (
                                <span style={{ width: '12px', display: 'inline-block', marginRight: '4px', flexShrink: 0 }} />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingBottom: '2px', borderBottom: classic ? '1px solid #e0ddd4' : '1px solid #f0f0f0', width: '100%', overflow: 'hidden' }}>
                                <span className="text-truncate me-1" style={{ fontFamily: "'Courier New', monospace", fontSize: '9px', color: '#555' }}>{getItemCode(line.item_id, line.item_code)}</span>
                                <span className="text-truncate" style={{ color: '#000' }}>{getItemName(line.item_id, line.item_name)}</span>
                                <div className="text-truncate flex-grow-1" style={{ fontSize: '0.7rem', color: '#555', fontStyle: 'italic' }}>
                                    {(line.attribute_value_ids || []).map(getAttributeValueName).join(', ')}
                                </div>
                                {line.source_location_id && (
                                    <span className="badge bg-light text-dark border ms-2 flex-shrink-0" style={{ fontSize: '0.6rem' }}>
                                        <i className="bi bi-geo-alt" />
                                    </span>
                                )}
                                <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    {(line.percentage || 0) > 0 ? (
                                        <span style={{ background: '#b46a00', color: '#fff', fontSize: 8, padding: '0 3px', fontWeight: 'bold' }}>{line.percentage}%</span>
                                    ) : (line.qty || 0) > 0 ? (
                                        <span style={{ fontFamily: "'Courier New', monospace", fontSize: 9, fontWeight: 'bold', color: '#000' }}>{Number(line.qty)}</span>
                                    ) : null}
                                    {getItemUom(line.item_id) && (
                                        <span style={uomBadge}>{getItemUom(line.item_id)}</span>
                                    )}
                                    {isExpandable && (
                                        <span style={{ background: '#fff3cd', border: '1px solid #b8860b', color: '#6b4e00', fontSize: '8px', padding: '0 3px', fontWeight: 'bold' }}>Sub</span>
                                    )}
                                </span>
                            </div>
                        </div>
                        {isExpandable && isExpanded && subBOM.lines && (
                            <div style={{ borderLeft: '2px solid #b0aaa0', marginLeft: '14px', paddingLeft: '6px', marginTop: '4px' }}>
                                {renderBOMTree(subBOM.lines, nodeKey, level + 1)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    // ── Detail panel ──────────────────────────────────────────────────────────

    const countTreeNodes = (b: any, visited = new Set<string>()): number => {
        if (visited.has(b.id)) return 0;
        visited.add(b.id);
        let count = 1;
        for (const line of b.lines || []) {
            const sub = findSubBOM(line, visited);
            count += sub ? countTreeNodes(sub, new Set(visited)) : 1;
        }
        return count;
    };

    const findParentName = (b: any, targetBomId: string, visited = new Set<string>()): string => {
        if (visited.has(b.id)) return '';
        visited.add(b.id);
        for (const line of b.lines || []) {
            const sub = findSubBOM(line, visited);
            if (sub?.id === targetBomId) return b.item_name || b.item_code || '';
            if (sub) { const r = findParentName(sub, targetBomId, new Set(visited)); if (r) return r; }
        }
        return '';
    };

    const buildTreeNodes = (b: any, level: number, visited: Set<string>, rootBomId: string, selectedBomId: string): React.ReactNode[] => {
        if (visited.has(b.id)) return [];
        const seen = new Set(visited);
        seen.add(b.id);
        const nodes: React.ReactNode[] = [];

        for (const line of b.lines || []) {
            const sub = findSubBOM(line, seen);
            const isSelectable = !!sub;
            const isSelected = isSelectable && !!sub && selectedBomId === sub.id;
            const indentPx = 5 + level * 14;

            nodes.push(
                <div key={line.id}
                    onClick={isSelectable && sub ? () => selectDetailNode(rootBomId, sub.id) : undefined}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: `3px 5px 3px ${indentPx}px`,
                        cursor: isSelectable ? 'pointer' : 'default',
                        background: isSelected ? '#316ac5' : 'transparent',
                        color: isSelected ? '#fff' : '#000',
                        borderBottom: '1px solid #e8e4d8',
                        fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11,
                        userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (!isSelected && isSelectable) (e.currentTarget as HTMLElement).style.background = '#d0e4f8'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                    <i className={`bi ${isSelectable ? 'bi-layers' : 'bi-box'}`} style={{ fontSize: 11, flexShrink: 0, color: isSelected ? 'inherit' : (isSelectable ? '#316ac5' : '#6b4e00') }} />
                    <span title={line.item_name || line.item_code} style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {line.item_name || line.item_code}
                    </span>
                    {isSelectable && (
                        <span style={{
                            background: isSelected ? 'rgba(255,255,255,0.25)' : '#fff3cd',
                            border: `1px solid ${isSelected ? 'rgba(255,255,255,0.5)' : '#b8860b'}`,
                            color: isSelected ? '#fff' : '#6b4e00',
                            fontSize: 8, padding: '0 3px', fontWeight: 'bold', flexShrink: 0,
                        }}>Sub</span>
                    )}
                </div>
            );

            if (sub) nodes.push(...buildTreeNodes(sub, level + 1, seen, rootBomId, selectedBomId));
        }
        return nodes;
    };

    const renderDetailPanel = (bom: any) => {
        const bomId = bom.id;
        const selectedBomId = selectedBOMNodes[bomId] ?? bom.id;
        const isRootSelected = selectedBomId === bom.id;
        const displayBOM = isRootSelected ? bom : (allBomsById[selectedBomId] || bom);

        const lines: any[] = displayBOM.lines || [];
        const ops: any[] = [...(displayBOM.operations || [])].sort((a: any, b: any) => a.sequence - b.sequence);
        const totalMinutes = ops.reduce((sum: number, op: any) => sum + (op.time_minutes || 0), 0);
        const totalPct = lines.reduce((sum: number, l: any) => sum + (l.percentage || 0), 0);
        const hasPct = lines.some((l: any) => (l.percentage || 0) > 0);
        // Beam BOM: each component line's qty holds that yarn's warp-ends count (independent of % / kg).
        const beamBom = getItemEnds(displayBOM.item_id) != null || (displayBOM.work_center_name || '').toUpperCase().includes('BEAM');
        const totalLineEnds = lines.reduce((sum: number, l: any) => sum + (Number(l.qty) || 0), 0);
        const nodeCount = countTreeNodes(bom);
        const parentName = isRootSelected ? '' : findParentName(bom, selectedBomId);
        const subBOMCount = lines.filter((l: any) => !!findSubBOM(l)).length;

        return (
            <tr key={`${bom.id}-detail`}>
                <td colSpan={6} style={{ padding: 0, borderTop: 'none' }}>
                    <div style={{ display: 'flex', height: 420, background: '#ece9d8', borderTop: '2px solid #0058e6', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11 }}>

                        {/* LEFT: Tree */}
                        <div style={{ width: 320, flexShrink: 0, borderRight: '2px solid #aca899', display: 'flex', flexDirection: 'column', background: '#ddd9c8' }}>
                            <div style={{ background: 'linear-gradient(to bottom, #4a78c8, #2a54a8)', color: '#fff', fontSize: 11, fontWeight: 'bold', padding: '3px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span><i className="bi bi-diagram-3-fill" style={{ marginRight: 4 }} />BOM Structure</span>
                                <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 9, padding: '0 5px', borderRadius: 2 }}>{nodeCount} nodes</span>
                            </div>
                            <div style={{ border: '2px inset #aaa', background: 'white', flex: 1, margin: 4, overflowY: 'auto', padding: 0 }}>
                                {/* Root node */}
                                <div
                                    onClick={() => selectDetailNode(bomId, bom.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '3px 5px',
                                        cursor: 'pointer',
                                        background: isRootSelected ? '#316ac5' : 'transparent',
                                        color: isRootSelected ? '#fff' : '#000',
                                        borderBottom: '1px solid #e8e4d8',
                                        userSelect: 'none',
                                        fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11,
                                    }}
                                    onMouseEnter={e => { if (!isRootSelected) (e.currentTarget as HTMLElement).style.background = '#d0e4f8'; }}
                                    onMouseLeave={e => { if (!isRootSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                    <i className="bi bi-box-seam" style={{ fontSize: 13, flexShrink: 0 }} />
                                    <span title={bom.item_name || bom.item_code} style={{ flex: 1, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {bom.item_name || bom.item_code}
                                    </span>
                                    <span style={{ background: isRootSelected ? 'rgba(255,255,255,0.25)' : '#2d7a2d', color: '#fff', fontSize: 8, padding: '0 3px', fontWeight: 'bold', flexShrink: 0, border: isRootSelected ? '1px solid rgba(255,255,255,0.4)' : 'none' }}>ROOT</span>
                                </div>
                                {buildTreeNodes(bom, 1, new Set(), bomId, selectedBomId)}
                            </div>
                        </div>

                        {/* CENTER: Components + Routing */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {/* Node header strip */}
                            <div style={{ background: 'linear-gradient(to bottom, #e8e4d8, #dddad0)', borderBottom: '1px solid #aca899', padding: '4px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <i className={`bi ${isRootSelected ? 'bi-box-seam' : 'bi-layers'}`} style={{ fontSize: 16, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: 12, color: '#000080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {displayBOM.item_name || displayBOM.item_code}
                                    </div>
                                    <div style={{ fontSize: 9, color: '#555', fontFamily: "'Courier New', monospace" }}>
                                        {displayBOM.item_code} · BOM: {displayBOM.code}
                                    </div>
                                </div>
                                {!isRootSelected && parentName && (
                                    <span style={{ fontSize: 9, color: '#333', background: '#f0efe6', border: '1px solid #c0bdb5', padding: '1px 6px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                        Sub-assembly of: {parentName}
                                    </span>
                                )}
                            </div>

                            {/* Scrollable body */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>

                                {/* Components */}
                                <div>
                                    <div style={xpSectionHdr}><i className="bi bi-gear-fill" style={{ marginRight: 4 }} />Components</div>
                                    {lines.length === 0 ? (
                                        <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic', padding: '4px 6px' }}>No components defined.</div>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11 }}>
                                            <thead>
                                                <tr>
                                                    <th style={xpTh}>Item</th>
                                                    <th style={{ ...xpTh, textAlign: 'right' }}>Required</th>
                                                    {beamBom && <th style={{ ...xpTh, textAlign: 'right' }}>Ends</th>}
                                                    <th style={xpTh}>Attributes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lines.map((line: any, i: number) => {
                                                    const isSubBOM = !!findSubBOM(line);
                                                    return (
                                                        <tr key={line.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f3ee' }}>
                                                            <td style={xpTd}>
                                                                <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, background: '#f0f0f0', border: '1px solid #d0d0d0', padding: '0 3px', color: '#0000cc' }}>
                                                                    {line.item_code}
                                                                </span>
                                                                <span style={{ marginLeft: 5, color: '#000' }}>{line.item_name}</span>
                                                                {isSubBOM && (
                                                                    <span style={{ marginLeft: 5, background: '#e6eeff', border: '1px solid #0058e6', color: '#003080', fontSize: 9, padding: '0 3px', fontWeight: 'bold' }}>Sub</span>
                                                                )}
                                                            </td>
                                                            <td style={{ ...xpTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                {(line.percentage || 0) > 0 ? (
                                                                    <span style={{ background: '#b46a00', color: '#fff', fontSize: 9, padding: '1px 5px', fontWeight: 'bold' }}>{line.percentage}%</span>
                                                                ) : (line.qty || 0) > 0 ? (
                                                                    <span style={{ fontFamily: "'Courier New', monospace", fontWeight: 'bold' }}>{Number(line.qty)}</span>
                                                                ) : <span style={{ color: '#888' }}>—</span>}
                                                                {getItemUom(line.item_id) && (
                                                                    <span style={{ ...uomBadge, marginLeft: 4 }}>{getItemUom(line.item_id)}</span>
                                                                )}
                                                            </td>
                                                            {beamBom && (
                                                                <td style={{ ...xpTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                    {(Number(line.qty) || 0) > 0
                                                                        ? <span style={{ background: '#e6f4ea', border: '1px solid #4caf50', color: '#1a6e2e', fontWeight: 'bold', fontSize: 10, padding: '0 5px' }}>{Math.round(Number(line.qty))} ends</span>
                                                                        : <span style={{ color: '#888' }}>—</span>}
                                                                </td>
                                                            )}
                                                            <td style={{ ...xpTd, fontSize: 10, color: '#444' }}>{getAttrValues(line.attribute_value_ids || [])}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan={beamBom ? 4 : 3} style={{ ...xpFooterTd, textAlign: 'right' }}>
                                                        {lines.length} component{lines.length !== 1 ? 's' : ''}
                                                        {hasPct && (
                                                            <> · Total %: <span style={{ fontWeight: 'bold', color: Math.abs(totalPct - 100) < 0.01 ? '#004400' : '#880000' }}>{totalPct.toFixed(1)}%</span></>
                                                        )}
                                                        {beamBom && totalLineEnds > 0 && (
                                                            <> · Total yarn ends: <span style={{ fontWeight: 'bold', color: '#1a6e2e' }}>{Math.round(totalLineEnds)}</span></>
                                                        )}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}
                                </div>


                            </div>
                        </div>

                        {/* RIGHT: BOM info card */}
                        {(() => {
                            const hasMesin = [displayBOM.mesin_lebar, displayBOM.mesin_panjang_tulisan, displayBOM.mesin_panjang_tarikan, displayBOM.mesin_panjang_tarikan_bandul_1kg, displayBOM.mesin_panjang_tarikan_bandul_9kg].some(v => v != null);
                            const hasCelup = [displayBOM.celup_lebar, displayBOM.celup_panjang_tulisan, displayBOM.celup_panjang_tarikan, displayBOM.celup_panjang_tarikan_bandul_1kg, displayBOM.celup_panjang_tarikan_bandul_9kg].some(v => v != null);
                            const hasMeasurements = hasMesin || hasCelup;
                            const hasTeknis = displayBOM.kerapatan_picks != null || displayBOM.sisir_no != null || displayBOM.pemakaian_obat || displayBOM.pembuatan_sample_oleh;
                            const lbl: React.CSSProperties = { fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 1 };
                            const val: React.CSSProperties = { fontSize: 11, color: '#000', fontWeight: 'bold', wordBreak: 'break-word' };
                            const sep: React.CSSProperties = { borderTop: '1px solid #c0bdb5', marginTop: 4, paddingTop: 6 };
                            const secHdr: React.CSSProperties = { fontSize: 9, fontWeight: 'bold', color: '#000080', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 };
                            const mRow = (label: string, mesinVal: any, celupVal: any, unit: string) => (
                                <tr key={label}>
                                    <td style={{ padding: '1px 4px 1px 0', fontSize: 10, color: '#444', whiteSpace: 'nowrap' }}>{label}</td>
                                    <td style={{ padding: '1px 4px', textAlign: 'right', fontWeight: 'bold', fontSize: 10, color: mesinVal != null ? '#000' : '#bbb', background: '#f8f7f2', border: '1px solid #e0ddd4' }}>{mesinVal != null ? mesinVal : '—'}</td>
                                    <td style={{ padding: '1px 4px', textAlign: 'right', fontWeight: 'bold', fontSize: 10, color: celupVal != null ? '#000' : '#bbb', background: '#f8f7f2', border: '1px solid #e0ddd4', borderLeft: 'none' }}>{celupVal != null ? celupVal : '—'}</td>
                                    <td style={{ padding: '1px 0 1px 3px', fontSize: 9, color: '#777' }}>{unit}</td>
                                </tr>
                            );
                            return (
                                <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid #aca899', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', background: '#f5f4ee' }}>

                                    {/* Header */}
                                    <div style={{ fontSize: 10, fontWeight: 'bold', color: '#000080', borderBottom: '1px solid #c0bdb5', paddingBottom: 3, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span><i className="bi bi-clipboard" style={{ marginRight: 4 }} />BOM Details</span>
                                        <button
                                            onClick={() => setPrintBOM(displayBOM)}
                                            title="Print BOM"
                                            style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 10, padding: '1px 6px', background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer', color: '#000' }}
                                        >
                                            <i className="bi bi-printer" style={{ marginRight: 3 }} />Print
                                        </button>
                                    </div>

                                    {/* Identity */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', marginBottom: 6 }}>
                                        <div style={{ gridColumn: '1/-1' }}>
                                            <div style={lbl}>BOM Code</div>
                                            <div style={{ fontFamily: "'Courier New', monospace", color: '#0000cc', fontSize: 10 }}>{displayBOM.code}</div>
                                        </div>
                                        <div style={{ gridColumn: '1/-1' }}>
                                            <div style={lbl}>Item</div>
                                            <div style={{ ...val, fontSize: 11 }}>{displayBOM.item_name || displayBOM.item_code}</div>
                                            <div style={{ fontFamily: "'Courier New', monospace", color: '#666', fontSize: 9 }}>{displayBOM.item_code}</div>
                                        </div>
                                        {(displayBOM.attribute_value_ids || []).length > 0 && (
                                            <div style={{ gridColumn: '1/-1' }}>
                                                <div style={lbl}>Variant</div>
                                                <div style={{ fontSize: 10, color: '#333' }}>{getAttrValues(displayBOM.attribute_value_ids)}</div>
                                            </div>
                                        )}
                                        {displayBOM.customer_name && (
                                            <div style={{ gridColumn: '1/-1' }}>
                                                <div style={lbl}>Customer</div>
                                                <div style={{ fontSize: 11, color: '#000' }}>{displayBOM.customer_name}</div>
                                            </div>
                                        )}
                                        {displayBOM.work_center_name && (
                                            <div style={{ gridColumn: '1/-1' }}>
                                                <div style={lbl}>Machine</div>
                                                <div style={{ fontSize: 11, color: '#000' }}>{displayBOM.work_center_name}</div>
                                            </div>
                                        )}
                                        <div>
                                            <div style={lbl}>{getItemEnds(displayBOM.item_id) != null ? 'Warp Ends (Utas)' : 'Batch Output'}</div>
                                            {getItemEnds(displayBOM.item_id) != null ? (
                                                <div><span style={{ display: 'inline-block', background: '#e6f4ea', border: '1px solid #4caf50', color: '#1a6e2e', fontWeight: 'bold', fontSize: 11, padding: '1px 8px', borderRadius: 2 }}>{Math.round(Number(displayBOM.qty))} ends</span></div>
                                            ) : (
                                                <div style={val}>{Number(displayBOM.qty).toFixed(2)} <span style={{ fontWeight: 'normal', color: '#555', fontSize: 9 }}>pcs</span></div>
                                            )}
                                        </div>
                                        <div>
                                            <div style={lbl}>Tolerance</div>
                                            <div style={val}>±{Number(displayBOM.tolerance_percentage || 0).toFixed(2)}%</div>
                                        </div>
                                        <div>
                                            <div style={lbl}>Status</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 'bold', color: displayBOM.active ? '#004400' : '#880000' }}>
                                                <span style={{ display: 'inline-block', width: 8, height: 8, background: displayBOM.active ? '#00aa00' : '#cc0000', border: `1px solid ${displayBOM.active ? '#005500' : '#660000'}`, flexShrink: 0 }} />
                                                {displayBOM.active ? 'Active' : 'Inactive'}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={lbl}>Components</div>
                                            <div style={val}>{lines.length} <span style={{ fontWeight: 'normal', fontSize: 9, color: '#555' }}>mat{lines.length !== 1 ? 's' : ''}</span></div>
                                        </div>
                                    </div>

                                    {/* Detail Teknis */}
                                    {hasTeknis && (
                                        <div style={sep}>
                                            <div style={secHdr}>Detail Teknis</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline' }}>
                                                {displayBOM.kerapatan_picks != null && (<>
                                                    <span style={lbl}>Kerapatan</span>
                                                    <span style={{ fontSize: 11 }}>{displayBOM.kerapatan_picks} {displayBOM.kerapatan_unit || '/cm'}</span>
                                                </>)}
                                                {displayBOM.sisir_no != null && (<>
                                                    <span style={lbl}>Sisir No.</span>
                                                    <span style={{ fontSize: 11 }}>{displayBOM.sisir_no}</span>
                                                </>)}
                                                {displayBOM.pemakaian_obat && (<>
                                                    <span style={lbl}>Obat Setting</span>
                                                    <span style={{ fontSize: 10, wordBreak: 'break-word' }}>{displayBOM.pemakaian_obat}</span>
                                                </>)}
                                                {displayBOM.pembuatan_sample_oleh && (<>
                                                    <span style={lbl}>Sample oleh</span>
                                                    <span style={{ fontSize: 10, wordBreak: 'break-word' }}>{displayBOM.pembuatan_sample_oleh}</span>
                                                </>)}
                                                {displayBOM.berat_bahan_mateng != null && (<>
                                                    <span style={lbl}>B. Mateng</span>
                                                    <span style={{ fontSize: 11 }}>{displayBOM.berat_bahan_mateng} <span style={{ fontSize: 9, color: '#666' }}>gr/yd</span></span>
                                                </>)}
                                                {displayBOM.berat_bahan_mentah_pelesan != null && (<>
                                                    <span style={lbl}>B. Mentah</span>
                                                    <span style={{ fontSize: 11 }}>{displayBOM.berat_bahan_mentah_pelesan} <span style={{ fontSize: 9, color: '#666' }}>gr/yd</span></span>
                                                </>)}
                                            </div>
                                        </div>
                                    )}

                                    {/* Measurements */}
                                    {hasMeasurements && (
                                        <div style={sep}>
                                            <div style={secHdr}>Measurements</div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ fontSize: 9, color: '#555', fontWeight: 'normal', textAlign: 'left', paddingBottom: 2 }}></th>
                                                        <th style={{ fontSize: 9, color: '#555', fontWeight: 'bold', textAlign: 'center', paddingBottom: 2, paddingRight: 4 }}>Mesin</th>
                                                        <th style={{ fontSize: 9, color: '#555', fontWeight: 'bold', textAlign: 'center', paddingBottom: 2 }}>Celup</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {mRow('Lebar', displayBOM.mesin_lebar, displayBOM.celup_lebar, 'mm')}
                                                    {mRow('P. Tulisan', displayBOM.mesin_panjang_tulisan, displayBOM.celup_panjang_tulisan, 'cm')}
                                                    {mRow('P. Tarikan', displayBOM.mesin_panjang_tarikan, displayBOM.celup_panjang_tarikan, 'cm')}
                                                    {mRow('Bandul 1kg', displayBOM.mesin_panjang_tarikan_bandul_1kg, displayBOM.celup_panjang_tarikan_bandul_1kg, 'cm')}
                                                    {mRow('Bandul 9kg', displayBOM.mesin_panjang_tarikan_bandul_9kg, displayBOM.celup_panjang_tarikan_bandul_9kg, 'cm')}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Size Measurements */}
                                    {(displayBOM.sizes || []).length > 0 && (
                                        <div style={sep}>
                                            <div style={secHdr}>Size Measurements</div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ fontSize: 9, color: '#555', fontWeight: 'bold', textAlign: 'left', paddingBottom: 2 }}>{displayBOM.size_mode === 'free' ? 'Label' : 'Size'}</th>
                                                        <th style={{ fontSize: 9, color: '#555', fontWeight: 'normal', textAlign: 'right', paddingBottom: 2 }}>Target</th>
                                                        <th style={{ fontSize: 9, color: '#555', fontWeight: 'normal', textAlign: 'right', paddingBottom: 2 }}>Min</th>
                                                        <th style={{ fontSize: 9, color: '#555', fontWeight: 'normal', textAlign: 'right', paddingBottom: 2 }}>Max</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(displayBOM.sizes || []).map((s: any, i: number) => (
                                                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f5f3ee' }}>
                                                            <td style={{ padding: '1px 4px 1px 0', fontWeight: 'bold', fontSize: 10 }}>{s.size_name || s.label || `Row ${i + 1}`}</td>
                                                            <td style={{ padding: '1px 4px', textAlign: 'right', fontSize: 10, background: '#f8f7f2', border: '1px solid #e0ddd4' }}>{s.target_measurement != null ? s.target_measurement : '—'}</td>
                                                            <td style={{ padding: '1px 4px', textAlign: 'right', fontSize: 10, background: '#f8f7f2', border: '1px solid #e0ddd4', borderLeft: 'none' }}>{s.measurement_min != null ? s.measurement_min : '—'}</td>
                                                            <td style={{ padding: '1px 4px', textAlign: 'right', fontSize: 10, background: '#f8f7f2', border: '1px solid #e0ddd4', borderLeft: 'none' }}>{s.measurement_max != null ? s.measurement_max : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Design file */}
                                    {displayBOM.design_file_url && (
                                        <div style={sep}>
                                            <div style={secHdr}>Design / Susunan Rumusan</div>
                                            {/\.(jpg|jpeg|png|gif|webp)$/i.test(displayBOM.design_file_url) ? (
                                                <a href={`${(process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000').replace(/\/api$/, '')}${displayBOM.design_file_url}`} target="_blank" rel="noreferrer">
                                                    <img
                                                        src={`${(process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000').replace(/\/api$/, '')}${displayBOM.design_file_url}`}
                                                        alt="Design"
                                                        style={{ maxWidth: '100%', maxHeight: 80, border: '1px solid #c0bdb5', display: 'block', objectFit: 'cover', cursor: 'pointer' }}
                                                    />
                                                </a>
                                            ) : (
                                                <a
                                                    href={`${(process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000').replace(/\/api$/, '')}${displayBOM.design_file_url}`}
                                                    target="_blank" rel="noreferrer"
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#0000cc', textDecoration: 'underline' }}
                                                >
                                                    <i className="bi bi-file-earmark-pdf" style={{ color: '#c00', fontSize: 12 }} />
                                                    Open design file
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div style={{ marginTop: 6 }}>
                                        <button
                                            onClick={() => setStartPRBom(displayBOM)}
                                            style={{
                                                fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 10,
                                                padding: '2px 8px', width: '100%',
                                                background: 'linear-gradient(to bottom, #b4d0f8, #7aacf0)',
                                                border: '1px solid', borderColor: '#c8e0ff #003080 #003080 #c8e0ff',
                                                cursor: 'pointer', fontWeight: 'bold', color: '#00007a',
                                            }}
                                        >
                                            Start Production Run
                                        </button>
                                    </div>

                                </div>
                            );
                        })()}

                    </div>
                </td>
            </tr>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
        <div className="row g-4 fade-in">
            {/* BOM Designer Modal */}
            {isDesignerOpen && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: 'min(1200px, 96vw)', height: 'min(860px, 94vh)', background: '#ece9d8', border: '2px solid #0a246a', boxShadow: '4px 4px 20px rgba(0,0,0,0.6), inset 0 0 0 1px #a6caf0', fontFamily: 'Tahoma, "Segoe UI", sans-serif', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ background: 'linear-gradient(to right, #0a246a, #a6caf0, #0a246a)', padding: '3px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, userSelect: 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <i className="bi bi-collection-fill" style={{ fontSize: 14 }} />
                                <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 12, fontFamily: 'Tahoma, "Segoe UI", sans-serif', textShadow: '1px 1px 2px rgba(0,0,0,0.6)' }}>{editingBOM ? `Edit BOM: ${editingBOM.code}` : 'BOM Designer (Recursive)'}</span>
                            </div>
                            <button onClick={() => setIsDesignerOpen(false)} style={{ width: 21, height: 21, padding: 0, background: 'linear-gradient(to bottom, #e06060, #b03030)', border: '1px solid #800', borderRadius: 2, cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <BOMDesigner
                                rootItemCode={editingBOM ? editingBOM.item_code : (initialItemCode || '')}
                                initialAttributeValueIds={editingBOM ? (editingBOM.attribute_value_ids || []) : initialAttributeIds}
                                initialBOMData={editingBOM || null}
                                items={items} locations={locations || []} attributes={attributes}
                                sizes={sizes || []}
                                partners={partners || []}
                                workCenters={workCenters} operations={operations} existingBOMs={boms}
                                onSave={handleCreateBOMWrapper} onCreateItem={onCreateItem}
                                onUploadPhoto={onUploadBOMPhoto}
                                onUploadDesign={onUploadBOMDesign}
                                onCancel={handleCloseDesigner} onSearchItem={onSearchItem}
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* BOM List */}
            <div className="col-12">
                <div
                    style={classic ? { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0 } : undefined}
                    className={classic ? '' : 'card h-100 shadow-sm border-0'}
                >
                    {/* Toolbar */}
                    {classic ? (
                        <div style={{ background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '12px', fontWeight: 'bold', padding: '4px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)', borderBottom: '1px solid #003080', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span><i className="bi bi-diagram-3-fill" style={{ marginRight: '6px' }} />{t('active_boms')}</span>
                                <input type="text" value={bomSearch} onChange={e => onBomSearch?.(e.target.value)} placeholder="Search BOMs..."
                                    style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', border: '1px solid #808080', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.15)', padding: '2px 6px', background: '#fff', color: '#000', outline: 'none' }} />
                                <div style={{ display: 'flex', border: '1px solid #808080', overflow: 'hidden', flexShrink: 0 }}>
                                    <button
                                        onClick={() => setShowRootOnly?.(true)}
                                        style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '1px 8px', cursor: 'pointer', border: 'none', background: showRootOnly ? 'linear-gradient(to bottom, #316ac5, #1a4a9a)' : 'linear-gradient(to bottom, #fff, #d4d0c8)', color: showRootOnly ? '#fff' : '#000', fontWeight: showRootOnly ? 'bold' : 'normal' }}
                                    >Root BOMs</button>
                                    <button
                                        onClick={() => setShowRootOnly?.(false)}
                                        style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '1px 8px', cursor: 'pointer', border: 'none', borderLeft: '1px solid #808080', background: !showRootOnly ? 'linear-gradient(to bottom, #316ac5, #1a4a9a)' : 'linear-gradient(to bottom, #fff, #d4d0c8)', color: !showRootOnly ? '#fff' : '#000', fontWeight: !showRootOnly ? 'bold' : 'normal' }}
                                    >All BOMs</button>
                                </div>
                                {selectedIds.size > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', color: '#fff' }}>{selectedIds.size} selected</span>
                                        <button style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom, #fff, #d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000' }} onClick={handleBulkDelete}>
                                            <i className="bi bi-trash" style={{ marginRight: '4px' }} />Delete Selected
                                        </button>
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', textDecoration: 'underline', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: 0 }} onClick={() => setSelectedIds(new Set())}>Clear</button>
                                    </div>
                                )}
                            </div>
                            <button data-testid="create-bom-btn" style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '2px 10px', cursor: 'pointer', fontWeight: 'bold', background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff' }} onClick={() => setIsDesignerOpen(true)}>
                                <i className="bi bi-plus-lg" style={{ marginRight: '4px' }} />{t('create_recipe')}
                            </button>
                        </div>
                    ) : (
                        <div className="card-header bg-white d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center gap-2">
                                <h5 className="card-title mb-0"><i className="bi bi-diagram-3-fill me-2" />{t('active_boms')}</h5>
                                <input type="text" className="form-control form-control-sm" style={{ width: '180px' }} value={bomSearch} onChange={e => onBomSearch?.(e.target.value)} placeholder="Search BOMs..." />
                                <div className="btn-group btn-group-sm">
                                    <button className={`btn ${showRootOnly ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setShowRootOnly?.(true)}>Root BOMs</button>
                                    <button className={`btn ${!showRootOnly ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setShowRootOnly?.(false)}>All BOMs</button>
                                </div>
                                {selectedIds.size > 0 && (
                                    <div className="d-flex align-items-center gap-2">
                                        <span className="text-muted small">{selectedIds.size} selected</span>
                                        <button className="btn btn-sm btn-danger" onClick={handleBulkDelete}><i className="bi bi-trash me-1" />Delete Selected</button>
                                        <button className="btn btn-sm btn-link text-secondary p-0" onClick={() => setSelectedIds(new Set())}>Clear</button>
                                    </div>
                                )}
                            </div>
                            <button data-testid="create-bom-btn" className="btn btn-sm btn-primary" onClick={() => setIsDesignerOpen(true)}>
                                <i className="bi bi-plus-lg me-2" />{t('create_recipe')}
                            </button>
                        </div>
                    )}

                    {/* Table body */}
                    <div className={classic ? '' : 'card-body p-0'} style={{ maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
                        <div className={classic ? '' : 'table-responsive'}>
                            <table
                                className={classic ? '' : 'table table-hover align-middle mb-0'}
                                style={classic ? { width: '100%', borderCollapse: 'collapse', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', background: '#fff' } : undefined}
                            >
                                <thead>
                                    <tr style={classic ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080', fontSize: '10px', fontWeight: 'bold', color: '#000', letterSpacing: '0.2px' } : undefined} className={classic ? '' : 'table-light'}>
                                        <th style={classic ? { width: '40px', padding: '4px 6px', borderRight: '1px solid #b0aaa0' } : { width: '40px' }} className={classic ? '' : 'ps-3'}>
                                            <input className="form-check-input" type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }} onChange={toggleSelectAll} />
                                        </th>
                                        <th style={classic ? { padding: '4px 6px', borderRight: '1px solid #b0aaa0' } : undefined} className={classic ? '' : 'ps-2'}>{t('item_code')}</th>
                                        <th style={classic ? { padding: '4px 6px', borderRight: '1px solid #b0aaa0' } : undefined}>{t('finished_good')}</th>
                                        <th style={classic ? { padding: '4px 6px', borderRight: '1px solid #b0aaa0' } : undefined}>Machine</th>
                                        <th style={classic ? { padding: '4px 6px', borderRight: '1px solid #b0aaa0' } : undefined}>Summary</th>
                                        <th style={classic ? { width: '50px', padding: '4px 6px' } : { width: '50px' }} />
                                    </tr>
                                </thead>

                                <tbody>
                                    {boms.length === 0 && bomSearch.trim() ? (
                                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '16px', color: '#555', fontSize: '11px' }}>No BOMs match your search.</td></tr>
                                    ) : boms.length === 0 ? (
                                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '16px', color: '#555', fontSize: '11px' }}>
                                            {bomLoading ? 'Loading...' : 'No BOMs yet. Click Create Recipe to get started.'}
                                        </td></tr>
                                    ) : (
                                        boms.map((bom: any, index: number) => {
                                            const isExpanded = expandedBOMRows[bom.id];
                                            const rowBg = classic
                                                ? (selectedIds.has(bom.id) ? '#d8e4f8' : isExpanded ? '#eef2fc' : index % 2 === 0 ? '#ffffff' : '#f5f3ee')
                                                : undefined;

                                            return (
                                                <>
                                                <tr
                                                    key={bom.id}
                                                    className={classic ? '' : (selectedIds.has(bom.id) ? 'table-active' : '')}
                                                    style={classic ? { background: rowBg, borderBottom: isExpanded ? 'none' : '1px solid #c0bdb5' } : undefined}
                                                >
                                                    <td style={classic ? { padding: '5px 6px', borderRight: '1px solid #c0bdb5', verticalAlign: 'top' } : undefined} className={classic ? '' : 'ps-3 align-top'}>
                                                        <input className="form-check-input" type="checkbox" checked={selectedIds.has(bom.id)} onChange={() => toggleSelect(bom.id)} />
                                                    </td>
                                                    {/* BOM Code — click to expand */}
                                                    <td
                                                        onClick={() => toggleBOMRow(bom.id, bom.item_id)}
                                                        style={classic ? { padding: '5px 6px', borderRight: '1px solid #c0bdb5', verticalAlign: 'top', cursor: 'pointer' } : { cursor: 'pointer' }}
                                                        className={classic ? '' : 'ps-2 align-top'}
                                                        title="Click to expand BOM details"
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} style={{ fontSize: '10px', color: '#0058e6', flexShrink: 0 }} />
                                                            <span style={classic ? { fontFamily: "'Courier New', monospace", fontSize: '10px', background: '#fff', border: '1px solid #888', padding: '1px 5px', color: '#000', whiteSpace: 'nowrap' } : undefined} className={classic ? '' : 'badge bg-light text-dark border font-monospace'}>
                                                                {bom.code}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {/* Finished Good — also clickable */}
                                                    <td
                                                        onClick={() => toggleBOMRow(bom.id, bom.item_id)}
                                                        style={classic ? { padding: '5px 6px', borderRight: '1px solid #c0bdb5', verticalAlign: 'top', cursor: 'pointer' } : { cursor: 'pointer' }}
                                                        className={classic ? '' : 'align-top'}
                                                    >
                                                        <div style={{ fontWeight: 'bold', color: '#000', fontSize: 11, fontFamily: 'Tahoma, Arial, sans-serif' }}>
                                                            {getItemName(bom.item_id, bom.item_name)}
                                                        </div>
                                                        <div style={{ marginTop: 2 }}>
                                                            <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, background: '#fff', border: '1px solid #aaa', padding: '0 4px', color: '#000055', whiteSpace: 'nowrap' }}>
                                                                {getItemCode(bom.item_id, bom.item_code)}
                                                            </span>
                                                        </div>
                                                        {(bom.attribute_value_ids || []).length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                                                                {(bom.attribute_value_ids || []).map((valId: string) => (
                                                                    <span key={valId} style={{ background: '#e8e4d8', border: '1px solid #b0aaa0', color: '#333', fontSize: 10, padding: '1px 5px', fontFamily: 'Tahoma, Arial, sans-serif', whiteSpace: 'nowrap' }}>
                                                                        {getAttributeValueName(valId)}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={classic ? { padding: '5px 6px', borderRight: '1px solid #c0bdb5', verticalAlign: 'top', fontSize: '10px', color: '#333' } : undefined} className={classic ? '' : 'align-top'}>
                                                        {bom.work_center_name ? (
                                                            <span style={{ color: '#333' }}>{bom.work_center_name}</span>
                                                        ) : (
                                                            <span style={{ color: '#888' }} className={classic ? '' : 'text-muted small'}>-</span>
                                                        )}
                                                    </td>
                                                    <td style={classic ? { padding: '5px 8px', borderRight: '1px solid #c0bdb5', verticalAlign: 'middle' } : undefined} className={classic ? '' : 'align-middle'}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontFamily: 'Tahoma, Arial, sans-serif' }}>
                                                            <span title="Components" style={{ background: '#e6eeff', border: '1px solid #0058e6', color: '#003080', fontSize: 10, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                                                <i className="bi bi-gear-fill" style={{ marginRight: 3 }} />{bom.lines?.length ?? 0} mat{bom.lines?.length !== 1 ? 's' : ''}
                                                            </span>
                                                            {(() => { const opCount = bom.operation_count ?? bom.operations?.length ?? 0; return (
                                                            <span title="Operations" style={{ background: '#e8f5e8', border: '1px solid #2d7a2d', color: '#1a4d1a', fontSize: 10, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                                                <i className="bi bi-wrench" style={{ marginRight: 3 }} />{opCount} op{opCount !== 1 ? 's' : ''}
                                                            </span>
                                                            ); })()}
                                                            {getItemEnds(bom.item_id) != null ? (
                                                                <span title="Warp ends (utas)" style={{ background: '#e6f4ea', border: '1px solid #4caf50', color: '#1a6e2e', fontWeight: 'bold', fontSize: 10, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                                                    <i className="bi bi-bezier2" style={{ marginRight: 3 }} />{Math.round(Number(bom.qty ?? 1))} ends
                                                                </span>
                                                            ) : (
                                                                <span title="Batch output" style={{ background: '#f5f3ee', border: '1px solid #b0aaa0', color: '#333', fontSize: 10, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                                                    <i className="bi bi-box-seam" style={{ marginRight: 3 }} />{Number(bom.qty ?? 1).toFixed(2)}
                                                                </span>
                                                            )}
                                                            <span title={bom.active ? 'Active' : 'Inactive'} style={{ display: 'inline-block', width: 8, height: 8, background: bom.active ? '#00aa00' : '#cc0000', border: `1px solid ${bom.active ? '#005500' : '#660000'}`, flexShrink: 0 }} />
                                                        </div>
                                                    </td>
                                                    <td style={classic ? { padding: '5px 6px', textAlign: 'right', verticalAlign: 'top' } : undefined} className={classic ? '' : 'pe-4 text-end align-top'}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                                                            <button
                                                                title="Edit BOM"
                                                                style={classic ? { background: 'none', border: 'none', cursor: 'pointer', color: '#00508a', padding: '0 2px' } : undefined}
                                                                className={classic ? '' : 'btn btn-sm btn-link text-primary'}
                                                                onClick={() => handleEditBOM(bom)}
                                                                disabled={editLoading}
                                                            >
                                                                <i className={editLoading ? 'bi bi-hourglass-split' : 'bi bi-pencil'} />
                                                            </button>
                                                            <button
                                                                style={classic ? { background: 'none', border: 'none', cursor: 'pointer', color: '#a00', padding: '0 2px' } : undefined}
                                                                className={classic ? '' : 'btn btn-sm btn-link text-danger'}
                                                                onClick={() => onDeleteBOM(bom.id)}
                                                            >
                                                                <i className="bi bi-trash" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && renderDetailPanel(bom)}
                                                </>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Pager footer */}
                        {bomTotal > 0 && (() => {
                            const pages = Math.max(1, Math.ceil(bomTotal / bomPageSize));
                            const from = (bomPage - 1) * bomPageSize + 1;
                            const to = Math.min(bomPage * bomPageSize, bomTotal);
                            const btn = (label: React.ReactNode, target: number, disabled: boolean) => (
                                <button
                                    disabled={disabled}
                                    onClick={() => setBomPage?.(target)}
                                    style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '1px 10px', background: disabled ? '#dcdacc' : 'linear-gradient(to bottom,#f0efe6,#dddbd0)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: disabled ? '#999' : '#000', cursor: disabled ? 'default' : 'pointer' }}
                                >{label}</button>
                            );
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderTop: '1px solid #808080', background: '#ece9d8', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11 }}>
                                    {btn(<><i className="bi bi-chevron-left me-1" />Prev</>, bomPage - 1, bomPage <= 1)}
                                    <span style={{ color: '#444' }}>{from}-{to} of {bomTotal} &nbsp;·&nbsp; Page {bomPage} / {pages}</span>
                                    {btn(<>Next<i className="bi bi-chevron-right ms-1" /></>, bomPage + 1, bomPage >= pages)}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        </div>

        {printBOM && (
            <BOMPrintModal
                bom={printBOM}
                companyProfile={companyProfile}
                getAttributeValueName={getAttributeValueName}
                onClose={() => setPrintBOM(null)}
            />
        )}
        {startPRBom && locations && (
            <ProductionRunModal
                boms={boms || []}
                items={items || []}
                attributes={attributes || []}
                locations={locations}
                onSave={onCreateProductionRun}
                onClose={() => setStartPRBom(null)}
                initialBomId={startPRBom?.id}
                productionRuns={productionRuns || []}
            />
        )}
        </>
    );
}
