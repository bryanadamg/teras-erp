import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ManufacturingSearchBar from './ManufacturingSearchBar';
import Pager from '../shared/Pager';
import { useToast } from '../shared/Toast';
import { useData } from '../../context/DataContext';
import { statusChipStyle, useFloatingMenu, MenuTriggerButton, FloatingMenu, XPActionButton, SunkenPanel, SunkenPanelBody, ProgressBar } from '../shared/xpTheme';
const PRMaterialPullSheetModal = dynamic(() => import('./PRMaterialPullSheetModal'), { ssr: false });

export default function ProductionRunsTab({
    productionRuns,
    prPage,
    prTotal,
    setPrPage,
    pageSize,
    prSearch,
    setPrSearch,
    onDeleteProductionRun,
    currentStyle,
    canManage,
    companyProfile,
    helpers,
}: any) {
    const { showToast } = useToast();
    const router = useRouter();
    const { authFetch } = useData();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;
    const { getLocationName, getAttributeValueName, formatDate, getStatusBadge } = helpers;

    const [expandedPRs, setExpandedPRs] = useState<Record<string, boolean>>({});
    const [prMaterialReqs, setPrMaterialReqs] = useState<Record<string, any[]>>({});
    const [prMaterialReqsLoading, setPrMaterialReqsLoading] = useState<Record<string, boolean>>({});
    const [printPreviewPR, setPrintPreviewPR] = useState<any>(null);
    const { openId: openPrMenuId, pos: prMenuPos, toggle: togglePrMenu, close: closePrMenu } = useFloatingMenu();

    const classic = currentStyle === 'classic';
    const filteredProductionRuns = productionRuns || [];

    const fetchPRMaterialRequirements = async (prId: string) => {
        setPrMaterialReqsLoading(prev => ({ ...prev, [prId]: true }));
        try {
            const res = await authFetch(`${API_BASE}/production-runs/${prId}/material-requirements`);
            if (res.ok) {
                const data = await res.json();
                setPrMaterialReqs(prev => ({ ...prev, [prId]: data }));
            }
        } finally {
            setPrMaterialReqsLoading(prev => ({ ...prev, [prId]: false }));
        }
    };

    const togglePR = (prId: string) => {
        setExpandedPRs(prev => {
            const expanding = !prev[prId];
            if (expanding) fetchPRMaterialRequirements(prId);
            return { ...prev, [prId]: expanding };
        });
    };

    // Eager-fetch material requirements for every visible PR row (not just the
    // expanded one) so the Materials-status column has data to show up front.
    useEffect(() => {
        (productionRuns || []).forEach((pr: any) => {
            if (!prMaterialReqs[pr.id] && !prMaterialReqsLoading[pr.id]) {
                fetchPRMaterialRequirements(pr.id);
            }
        });
    }, [productionRuns]);

    const handlePrintPR = (pr: any) => {
        if (!prMaterialReqs[pr.id] && !prMaterialReqsLoading[pr.id]) fetchPRMaterialRequirements(pr.id);
        setPrintPreviewPR(pr);
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {printPreviewPR && (
                <PRMaterialPullSheetModal
                    pr={printPreviewPR}
                    reqs={prMaterialReqs[printPreviewPR.id] || []}
                    isLoading={!!prMaterialReqsLoading[printPreviewPR.id]}
                    currentStyle={currentStyle}
                    companyProfile={companyProfile}
                    getLocationName={getLocationName}
                    getAttributeValueName={getAttributeValueName}
                    formatDate={formatDate}
                    onClose={() => setPrintPreviewPR(null)}
                />
            )}

            {((productionRuns && productionRuns.length > 0) || prSearch) && (
                <ManufacturingSearchBar
                    value={prSearch}
                    onChange={setPrSearch}
                    placeholder="Search by code, style, or BOM..."
                    total={prTotal}
                    classic={classic}
                />
            )}
            {productionRuns && productionRuns.length > 0 ? (
                <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    <table style={{
                        width: '100%', borderCollapse: 'collapse',
                        fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined,
                        fontSize: classic ? '11px' : undefined,
                        background: classic ? '#fff' : undefined,
                    }} className={classic ? '' : 'table table-hover align-middle mb-0'}>
                        <thead>
                            <tr style={{
                                background: classic ? 'linear-gradient(to bottom,#fff 0%,#d4d0c8 100%)' : undefined,
                                fontSize: classic ? '10px' : '9pt',
                            }} className={classic ? '' : 'table-light'}>
                                {['', 'Code', 'BOM / Style', 'MOs', 'Progress', 'Status', 'Materials', 'Due Date', 'Actions'].map((h, i) => (
                                    <th key={h || `col-${i}`} style={{
                                        border: classic ? '1px solid #808080' : undefined,
                                        padding: classic ? '3px 8px' : undefined,
                                        color: '#000', fontWeight: 'bold', whiteSpace: 'nowrap',
                                        textAlign: h === 'Actions' ? 'right' : 'left',
                                        width: h === '' ? '22px' : undefined,
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProductionRuns.map((pr: any, rowIdx: number) => {
                                const mos = pr.manufacturing_orders || [];
                                const done = mos.filter((m: any) => m.status === 'COMPLETED').length;
                                const total = mos.length;
                                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                const rowBg = classic
                                    ? (rowIdx % 2 === 0 ? '#fff' : '#f5f3ee')
                                    : undefined;
                                const tdStyle: React.CSSProperties = classic ? {
                                    border: '1px solid #c0bdb5', padding: '4px 8px', color: '#000', verticalAlign: 'middle',
                                } : {};
                                const isExpanded = !!expandedPRs[pr.id];
                                const reqs: any[] = prMaterialReqs[pr.id] || [];
                                const isLoading = !!prMaterialReqsLoading[pr.id];
                                const hasShortfall = reqs.some((r: any) => r.shortfall > 0);
                                const shortfallCount = reqs.filter((r: any) => r.shortfall > 0).length;
                                const sufficientCount = reqs.length - shortfallCount;
                                return (
                                    <React.Fragment key={pr.id}>
                                    <tr style={{ background: rowBg, cursor: 'pointer' }} onClick={() => togglePR(pr.id)} title="Material Requirements">
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <i
                                                className={`bi ${isExpanded ? 'bi-chevron-down' : 'bi-chevron-right'}`}
                                                style={{ color: hasShortfall && isExpanded ? '#c00000' : '#555' }}
                                            ></i>
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>
                                            <div>{pr.code}</div>
                                            {pr.sales_order_id && (
                                                <div style={{ marginTop: 3 }}>
                                                    <span style={classic ? {
                                                        fontSize: '8px', background: '#dce8ff', border: '1px solid #9ab0e0',
                                                        color: '#003ea6', padding: '0 5px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', fontFamily: 'Tahoma, Arial, sans-serif',
                                                    } : {
                                                        fontSize: '0.65rem', background: '#cfe2ff', border: '1px solid #9ec5fe',
                                                        color: '#0a58ca', padding: '1px 6px', borderRadius: 3, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center',
                                                    }} title="Originating Sales Order">
                                                        <i className="bi bi-receipt me-1" style={{ fontSize: classic ? '7px' : undefined }}></i>SO: {pr.sales_order_code || '—'}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: 'bold', fontSize: classic ? '11px' : undefined }}>
                                                {pr.bom_entries?.length > 0
                                                    ? pr.bom_entries.map((e: any) => e.bom?.item_name || e.bom?.item_code || e.bom?.code).filter(Boolean).join(' / ')
                                                    : (pr.bom?.item_name || pr.bom?.item_code || pr.bom?.code || pr.bom_id)}
                                            </div>
                                            {(pr.bom_entries?.length > 0
                                                ? pr.bom_entries.map((e: any) => e.bom?.code).filter(Boolean).join(' / ')
                                                : pr.bom?.code
                                            ) && (
                                                <div style={{ fontSize: 9, color: '#666', fontFamily: 'monospace' }}>
                                                    {pr.bom_entries?.length > 0
                                                        ? pr.bom_entries.map((e: any) => e.bom?.code).filter(Boolean).join(' / ')
                                                        : pr.bom?.code}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>{total}</td>
                                        <td style={{ ...tdStyle, minWidth: 120 }}>
                                            <ProgressBar pct={pct} tone={pct === 100 ? 'green' : 'blue'} label="outside" />
                                            <div style={{ fontSize: 9, color: '#666' }}>{done}/{total} done</div>
                                        </td>
                                        <td style={tdStyle}>
                                            {classic ? (
                                                <span style={statusChipStyle(pr.status)}>{(pr.status || 'PENDING').replace('_', ' ')}</span>
                                            ) : (
                                                <span className={`badge ${getStatusBadge(pr.status)} extra-small`}>{pr.status}</span>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }} title={isLoading ? 'Loading material requirements...' : reqs.length === 0 ? 'No components' : `${shortfallCount} short / ${sufficientCount} sufficient`}>
                                            {isLoading ? (
                                                <span style={{ fontSize: 10, color: '#999' }}>…</span>
                                            ) : reqs.length === 0 ? (
                                                <span style={{ fontSize: 10, color: '#999' }}>—</span>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 'bold', minWidth: 18, color: shortfallCount > 0 ? '#c00000' : '#ccc', opacity: shortfallCount > 0 ? 1 : 0.5 }}>
                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: shortfallCount > 0 ? '#c00000' : '#ccc', display: 'inline-block' }} />
                                                        {shortfallCount}
                                                    </span>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 'bold', minWidth: 18, color: sufficientCount > 0 ? '#2d7a2d' : '#ccc', opacity: sufficientCount > 0 ? 1 : 0.5 }}>
                                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sufficientCount > 0 ? '#2d7a2d' : '#ccc', display: 'inline-block' }} />
                                                        {sufficientCount}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, fontSize: 10 }}>{formatDate(pr.target_end_date)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                                                <XPActionButton
                                                    classic={classic}
                                                    tone="primary"
                                                    icon="bi-printer"
                                                    title="Print Material Pull Sheet"
                                                    onClick={() => handlePrintPR(pr)}
                                                />
                                                <MenuTriggerButton classic={classic} onClick={(e) => togglePrMenu(pr.id, e)} />
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={9} className="p-0 border-0">
                                            <SunkenPanel classic={classic}>
                                            <SunkenPanelBody classic={classic}>
                                                {isLoading ? (
                                                    <span style={{ fontSize: 11, color: '#666', fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined }}>
                                                        Loading material requirements...
                                                    </span>
                                                ) : reqs.length === 0 ? (
                                                    <span style={{ fontSize: 11, color: '#999', fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined }}>
                                                        No component requirements found for this Production Run.
                                                    </span>
                                                ) : (
                                                    <div>
                                                        {(() => {
                                                            const rootMos = mos.filter((mo: any) => !mo.is_shared_component);
                                                            if (rootMos.length === 0) return null;
                                                            return (
                                                                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: classic ? 9 : 10, color: '#555', fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined, marginRight: 2, whiteSpace: 'nowrap' }}>
                                                                        Linked MOs:
                                                                    </span>
                                                                    {rootMos.map((mo: any) => (
                                                                            <button
                                                                                key={mo.id}
                                                                                onClick={() => router.push(`/manufacturing-orders?mo=${encodeURIComponent(mo.code)}`)}
                                                                                title={`View ${mo.code} in Manufacturing Orders (${mo.status})`}
                                                                                style={classic ? {
                                                                                    fontSize: 9, fontFamily: 'Tahoma, Arial, sans-serif',
                                                                                    padding: '1px 6px', cursor: 'pointer',
                                                                                    background: 'linear-gradient(to bottom,#4da6ff,#0058e6)',
                                                                                    border: '1px solid', borderColor: '#dfdfdf #003080 #003080 #dfdfdf',
                                                                                    color: '#fff', fontWeight: 'bold',
                                                                                } : {
                                                                                    fontSize: 11, fontFamily: 'monospace',
                                                                                    padding: '2px 7px', cursor: 'pointer',
                                                                                    background: '#0d6efd', border: '1px solid #0a58ca',
                                                                                    color: '#fff', fontWeight: 'bold', borderRadius: 3,
                                                                                }}
                                                                            >
                                                                                {mo.code}
                                                                            </button>
                                                                        ))}
                                                                </div>
                                                            );
                                                        })()}
                                                        <div style={{ fontSize: classic ? 10 : 11, fontWeight: 'bold', marginBottom: 4, fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined, color: '#333' }}>
                                                            Consolidated Material Requirements — {reqs.length} component{reqs.length !== 1 ? 's' : ''}
                                                            {hasShortfall && <span style={{ marginLeft: 8, color: '#c00000', fontWeight: 'bold' }}>SHORTFALL DETECTED</span>}
                                                        </div>
                                                        <table style={{
                                                            width: '100%', borderCollapse: 'collapse', fontSize: classic ? 10 : 12,
                                                            fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined,
                                                        }}>
                                                            <thead>
                                                                <tr style={{ background: classic ? '#d4d0c8' : '#e9ecef' }}>
                                                                    {['Item Code', 'Item Name', 'UOM', 'Total Required', 'Available', 'Shortfall', 'Contributing MOs'].map(h => (
                                                                        <th key={h} style={{ padding: '2px 6px', textAlign: h === 'Total Required' || h === 'Available' || h === 'Shortfall' ? 'right' : 'left', border: classic ? '1px solid #808080' : '1px solid #dee2e6', fontWeight: 'bold' }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {reqs.map((req: any, ri: number) => {
                                                                    const short = req.shortfall > 0;
                                                                    const rowColor = classic
                                                                        ? (short ? '#fff0f0' : ri % 2 === 0 ? '#fff' : '#ece7dc')
                                                                        : (short ? '#fff5f5' : ri % 2 === 0 ? '#fff' : '#eef1f4');
                                                                    const cellStyle: React.CSSProperties = {
                                                                        padding: '2px 6px', border: classic ? '1px solid #c0bdb5' : '1px solid #dee2e6',
                                                                        background: rowColor, verticalAlign: 'middle',
                                                                    };
                                                                    const moSummary = (req.mo_contributions || []).map((c: any) => `${c.mo_code} (${parseFloat(c.required_qty).toFixed(2)})`).join(', ');
                                                                    return (
                                                                        <tr key={ri}>
                                                                            <td style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{req.item_code}</td>
                                                                            <td style={cellStyle}>{req.item_name}</td>
                                                                            <td style={cellStyle}>{req.uom}</td>
                                                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace' }}>{parseFloat(req.total_required).toFixed(2)}</td>
                                                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', color: short ? '#c00000' : '#2d7a2d', fontWeight: short ? 'bold' : undefined }}>
                                                                                {parseFloat(req.qty_available).toFixed(2)}
                                                                            </td>
                                                                            <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'monospace', color: short ? '#c00000' : '#2d7a2d', fontWeight: short ? 'bold' : undefined }}>
                                                                                {short ? `-${parseFloat(req.shortfall).toFixed(2)}` : 'OK'}
                                                                            </td>
                                                                            <td style={{ ...cellStyle, fontSize: classic ? 9 : 11, color: '#555' }}>{moSummary}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </SunkenPanelBody>
                                            </SunkenPanel>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{
                    padding: '32px', textAlign: 'center',
                    fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined,
                    fontSize: classic ? '11px' : undefined,
                    color: '#888',
                }}>
                    <i className="bi bi-collection-play" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.4 }}></i>
                    {prSearch
                        ? <>No Production Runs match "<strong>{prSearch}</strong>".</>
                        : <>No Production Runs yet. Click <strong>New Production Run</strong> to get started.</>}
                </div>
            )}
            <Pager page={prPage} total={prTotal} pageSize={pageSize} onPageChange={setPrPage} hideWhenEmpty />
            {/* Floating "more actions" menu — Delete */}
            {openPrMenuId && (() => {
                const menuPR = (productionRuns || []).find((p: any) => p.id === openPrMenuId);
                if (!menuPR) return null;
                return (
                    <FloatingMenu
                        pos={prMenuPos}
                        items={[
                            { key: 'delete', icon: 'bi-trash', label: 'Delete', danger: true, hidden: !canManage, onClick: () => { closePrMenu(); onDeleteProductionRun(menuPR.id); } },
                        ]}
                    />
                );
            })()}
        </div>
    );
}
