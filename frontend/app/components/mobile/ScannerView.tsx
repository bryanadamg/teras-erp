'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface MobileScannerViewProps {
    manufacturingOrders: any[];
    items: any[];
    boms: any[];
    locations: any[];
    stockBalance: any[];
    workCenters: any[];
    authFetch: (url: string, options?: any) => Promise<Response>;
    onRefresh: () => Promise<void> | void;
    onClose: () => void;
}

interface MaterialRow {
    item_id: string;
    item_name: string;
    item_code: string;
    is_percentage: boolean;
    line_qty: number;
    actual_qty: string;
    is_custom: boolean;
}

const XP_BEIGE = '#ece9d8';
const XP_FONT  = 'Tahoma, "Segoe UI", Arial, sans-serif';

const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: XP_FONT, fontSize: 13, padding: '6px 14px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    color: '#000000', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
    ...extra,
});

const xpInset: React.CSSProperties = {
    border: '2px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080',
    background: '#ffffff', borderRadius: 0,
};

const xpPanel: React.CSSProperties = {
    border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    background: '#f5f4ef', borderRadius: 0, padding: '10px 12px',
};

const xpSectionLabel: React.CSSProperties = {
    fontFamily: XP_FONT, fontSize: 10, fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.5, color: '#555',
    borderBottom: '1px solid #c0bdb5', paddingBottom: 3, marginBottom: 8,
};

const xpStatusBadge = (status: string): React.CSSProperties => {
    const base: React.CSSProperties = {
        fontFamily: XP_FONT, fontSize: 10, fontWeight: 'bold',
        padding: '2px 8px', display: 'inline-block',
    };
    if (status === 'COMPLETED')   return { ...base, background: '#2e7d32', color: '#fff' };
    if (status === 'IN_PROGRESS') return { ...base, background: '#1a4a8a', color: '#fff' };
    if (status === 'CANCELLED')   return { ...base, background: '#666',    color: '#fff' };
    return { ...base, background: '#b8860b', color: '#fff' };
};

const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default function MobileScannerView({
    manufacturingOrders, items, boms, locations, stockBalance,
    workCenters, authFetch, onRefresh, onClose,
}: MobileScannerViewProps) {
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    // MO scan state
    const [scannedMOId, setScannedMOId]     = useState<string | null>(null);
    const [updatingRunId, setUpdatingRunId] = useState<string | null>(null);
    const [addingRun, setAddingRun]         = useState(false);
    const [runWcId, setRunWcId]             = useState('');
    const [runQty, setRunQty]               = useState('');
    const [submittingRun, setSubmittingRun] = useState(false);

    // WO scan state
    const [scannedWOId, setScannedWOId]     = useState<string | null>(null);
    const [logQty, setLogQty]               = useState('');
    const [logOperator, setLogOperator]     = useState('');
    const [logNotes, setLogNotes]           = useState('');
    const [logMaterialRows, setLogMaterialRows] = useState<MaterialRow[]>([]);
    const [submittingLog, setSubmittingLog] = useState(false);
    const [logSuccess, setLogSuccess]       = useState('');
    const [logError, setLogError]           = useState('');

    // Shared state
    const [error, setError]       = useState<string | null>(null);
    const [manualCode, setManualCode] = useState('');
    const scannerRef  = useRef<Html5QrcodeScanner | null>(null);
    const terminalId  = useRef(Math.random().toString(36).substr(2, 6).toUpperCase());

    // Derived
    const allWOs = manufacturingOrders.flatMap((mo: any) =>
        (mo.work_orders || []).map((wo: any) => ({ ...wo, _mo: mo }))
    );
    const scannedMO = scannedMOId
        ? (manufacturingOrders.find((mo: any) => mo.id === scannedMOId) || null)
        : null;
    const scannedWO = scannedWOId
        ? (allWOs.find((wo: any) => wo.id === scannedWOId) || null)
        : null;
    const scannedWOParentMO = scannedWO?._mo || null;

    const getItemName     = (id: string) => items.find((i: any) => i.id === id)?.name || id;
    const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;

    // MO helpers
    const getRuns        = (mo: any) => (mo.work_orders || []).filter((wo: any) => wo.qty != null);
    const getRunQtySum   = (mo: any) => getRuns(mo).reduce((s: number, wo: any) => s + parseFloat(wo.qty || 0), 0);
    const getToleranceMax = (mo: any) => {
        const bom = mo.bom || boms.find((b: any) => b.id === mo.bom_id);
        return mo.qty * (1 + parseFloat(bom?.tolerance_percentage || 0) / 100);
    };
    const getRemaining   = (mo: any) => Math.max(0, mo.qty - getRunQtySum(mo));

    const validateMaterials = (mo: any) => {
        const bom = mo.bom || boms.find((b: any) => b.id === mo.bom_id);
        if (!bom) return { ok: true, missing: [] as any[] };
        const missing: any[] = [];
        for (const line of (bom.lines || [])) {
            let required = mo.qty * parseFloat(line.qty);
            if (parseFloat(line.percentage) > 0) required = (mo.qty * parseFloat(line.percentage)) / 100;
            const tol = parseFloat(bom.tolerance_percentage || 0);
            if (tol > 0) required *= (1 + tol / 100);
            const checkLocId = line.source_location_id || mo.source_location_id || mo.location_id;
            const targetIds = line.attribute_value_ids || [];
            const matching = stockBalance.filter((s: any) =>
                s.item_id === line.item_id && s.location_id === checkLocId &&
                (s.attribute_value_ids || []).length === targetIds.length &&
                (s.attribute_value_ids || []).every((id: string) => targetIds.includes(id))
            );
            const available = matching.reduce((sum: number, e: any) => sum + parseFloat(e.qty), 0);
            if (available < required) missing.push({ name: getItemName(line.item_id), location: getLocationName(checkLocId) });
        }
        return { ok: missing.length === 0, missing };
    };

    // Scanner lifecycle — restart when no target selected
    useEffect(() => {
        if (scannedMOId || scannedWOId) return;

        const timer = setTimeout(() => {
            if (!document.getElementById('mobile-reader')) return;
            const scanner = new Html5QrcodeScanner('mobile-reader', { fps: 10, qrbox: { width: 220, height: 220 } }, false);
            scannerRef.current = scanner;
            scanner.render(
                (decodedText: string) => {
                    if (isUUID(decodedText)) {
                        const found = allWOs.find((wo: any) => wo.id === decodedText);
                        if (found) {
                            setScannedWOId(found.id);
                            setScannedMOId(null);
                            setError(null);
                            scanner.clear().catch(() => {});
                        } else {
                            setError(`WO "${decodedText.slice(0, 8)}..." not found in active orders.`);
                        }
                    } else {
                        const found = manufacturingOrders.find((mo: any) => mo.code === decodedText);
                        if (found) {
                            setScannedMOId(found.id);
                            setScannedWOId(null);
                            setError(null);
                            scanner.clear().catch(() => {});
                        } else {
                            setError(`MO "${decodedText}" not found.`);
                        }
                    }
                },
                () => {}
            );
        }, 100);

        return () => {
            clearTimeout(timer);
            scannerRef.current?.clear().catch(() => {});
        };
    }, [manufacturingOrders, scannedMOId, scannedWOId]);

    // Build material rows when WO is scanned
    useEffect(() => {
        if (!scannedWO || !scannedWOParentMO) return;
        const bomLines: any[] = scannedWOParentMO.bom?.lines || [];
        setLogMaterialRows(bomLines.map((line: any) => ({
            item_id: line.item_id,
            item_name: line.item_name || '',
            item_code: line.item_code || '',
            is_percentage: !!line.is_percentage,
            line_qty: parseFloat(line.qty) ?? 0,
            actual_qty: '',
            is_custom: false,
        })));
        setLogQty('');
        setLogOperator('');
        setLogNotes('');
        setLogSuccess('');
        setLogError('');
    }, [scannedWOId]);

    // Recalculate material actuals when logQty changes
    useEffect(() => {
        const qty = parseFloat(logQty);
        if (!qty || qty <= 0) return;
        setLogMaterialRows(prev => prev.map(row => {
            if (row.is_custom) return row;
            const planned = row.is_percentage
                ? (qty * row.line_qty) / 100
                : qty * row.line_qty;
            return { ...row, actual_qty: planned.toFixed(4) };
        }));
    }, [logQty]);

    const handleReset = () => {
        setScannedMOId(null);
        setScannedWOId(null);
        setError(null);
        setManualCode('');
        setAddingRun(false);
        setLogSuccess('');
        setLogError('');
    };

    const handleManualLookup = () => {
        const code = manualCode.trim().toUpperCase();
        const found = manufacturingOrders.find((mo: any) => mo.code === code);
        if (found) { setScannedMOId(found.id); setScannedWOId(null); setError(null); setManualCode(''); }
        else setError(`MO "${manualCode}" not found.`);
    };

    // MO handlers
    const handleRunStatus = async (runId: string, status: string) => {
        setUpdatingRunId(runId);
        try {
            const res = await authFetch(`${API_BASE}/work-orders/${runId}/status?status=${status}`, { method: 'PUT' });
            if (res.ok) await onRefresh();
        } finally {
            setUpdatingRunId(null);
        }
    };

    const handleOpenAddRun = () => {
        if (!scannedMO) return;
        setRunQty(getRemaining(scannedMO).toFixed(2));
        setRunWcId('');
        setAddingRun(true);
    };

    const handleAddRun = async () => {
        if (!scannedMO) return;
        const qty = parseFloat(runQty);
        if (!qty || qty <= 0) return;
        setSubmittingRun(true);
        try {
            const runs = getRuns(scannedMO);
            const res = await authFetch(`${API_BASE}/work-orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    manufacturing_order_id: scannedMO.id,
                    name: `Run ${runs.length + 1}`,
                    sequence: runs.length + 1,
                    work_center_id: runWcId || null,
                    qty,
                }),
            });
            if (res.ok) {
                await onRefresh();
                setAddingRun(false);
                setRunWcId('');
                setRunQty('');
            }
        } finally {
            setSubmittingRun(false);
        }
    };

    // WO log handler
    const handleLogWO = async () => {
        setLogError('');
        setLogSuccess('');
        const qty = parseFloat(logQty);
        if (!qty || qty <= 0) { setLogError('Enter a positive quantity'); return; }
        if (!scannedWO || !scannedWOParentMO) return;

        setSubmittingLog(true);
        try {
            const actualItems = logMaterialRows
                .filter(row => parseFloat(row.actual_qty) > 0)
                .map(row => ({ item_id: row.item_id, qty_used: parseFloat(row.actual_qty) }));

            const res = await authFetch(`${API_BASE}/manufacturing-orders/${scannedWOParentMO.id}/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qty_completed: qty,
                    operator_name: logOperator || null,
                    notes: logNotes || null,
                    work_order_id: scannedWO.id,
                    actual_items: actualItems,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to log');
            }
            const updated = await res.json();
            const newTotal = (updated.qty_completed_total ?? 0).toFixed(2);
            setLogSuccess(`Logged ${qty} — MO total: ${newTotal} / ${scannedWOParentMO.qty}`);
            setLogQty('');
            setLogNotes('');
            setLogMaterialRows(prev => prev.map(r => ({ ...r, actual_qty: '', is_custom: false })));
            await onRefresh();
        } catch (err: any) {
            setLogError(err.message);
        } finally {
            setSubmittingLog(false);
        }
    };

    // MO derived values
    const runs        = scannedMO ? getRuns(scannedMO) : [];
    const runQtySum   = scannedMO ? getRunQtySum(scannedMO) : 0;
    const remaining   = scannedMO ? getRemaining(scannedMO) : 0;
    const maxQty      = scannedMO ? getToleranceMax(scannedMO) : 0;
    const wouldExceed = addingRun && scannedMO && (runQtySum + (parseFloat(runQty) || 0)) > maxQty;
    const materialCheck = scannedMO ? validateMaterials(scannedMO) : null;
    const moTarget    = scannedMO?.qty || 0;
    const moCompleted = scannedMO?.qty_completed_total || 0;
    const moPct       = moTarget > 0 ? Math.min(100, Math.round((moCompleted / moTarget) * 100)) : 0;

    // WO derived values
    const woTarget  = scannedWO?.qty ?? 0;
    const woDone    = scannedWO?.qty_completed_total ?? 0;
    const woPct     = woTarget > 0 ? Math.min(100, Math.round((woDone / woTarget) * 100)) : 0;

    return (
        <div style={{ background: XP_BEIGE, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Terminal header */}
            <div style={{ fontFamily: XP_FONT, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: '#555', borderBottom: '1px solid #c0bdb5', paddingBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="bi bi-qr-code-scan" style={{ color: '#1a4a8a' }} />
                Operator Scan Terminal
                <span style={{ marginLeft: 'auto', fontWeight: 'normal', fontSize: 10, color: '#888' }}>ID: {terminalId.current}</span>
            </div>

            {/* ── WO Log View ── */}
            {scannedWO && scannedWOParentMO ? (
                <>
                    {/* WO identity panel */}
                    <div style={{ ...xpPanel, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontFamily: XP_FONT, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#666', marginBottom: 2 }}>
                                Work Order Step
                            </div>
                            <div style={{ fontFamily: XP_FONT, fontSize: 16, fontWeight: 'bold', color: '#000080', lineHeight: 1.2 }}>
                                {scannedWO.name}
                            </div>
                            <div style={{ fontFamily: XP_FONT, fontSize: 11, color: '#555', marginTop: 2 }}>
                                {scannedWOParentMO.code} — {scannedWOParentMO.item_name || ''}
                                {scannedWO.work_center_name && <span style={{ marginLeft: 6 }}>| {scannedWO.work_center_name}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                <span style={xpStatusBadge(scannedWO.status)}>{scannedWO.status === 'IN_PROGRESS' ? 'IN PROGRESS' : scannedWO.status}</span>
                                {woTarget > 0 && <span style={{ fontFamily: XP_FONT, fontSize: 11, color: '#555' }}>Target: {woTarget}</span>}
                            </div>
                            {woTarget > 0 && (
                                <div style={{ marginTop: 6 }}>
                                    <div style={{ border: '1px solid #7f9db9', height: 12, background: '#fff', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%', width: `${woPct}%`,
                                            background: woPct >= 100
                                                ? 'repeating-linear-gradient(45deg, #2e7d32, #2e7d32 4px, #4caf50 4px, #4caf50 8px)'
                                                : 'repeating-linear-gradient(45deg, #000080, #000080 4px, #1565c0 4px, #1565c0 8px)',
                                            transition: 'width 0.2s',
                                        }} />
                                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 'bold', color: woPct > 50 ? '#fff' : '#000080', textShadow: woPct > 50 ? '0 0 3px rgba(0,0,0,0.8)' : 'none' }}>
                                            {woDone.toFixed(2)} / {woTarget} ({woPct}%)
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button style={xpBtn({ flexShrink: 0, padding: '6px 12px' })} type="button" onClick={handleReset}>
                            <i className="bi bi-arrow-repeat"></i> Reset
                        </button>
                    </div>

                    {/* Feedback */}
                    {logSuccess && (
                        <div style={{ background: '#e8f5e9', border: '1px solid #2e7d32', borderLeft: '4px solid #2e7d32', padding: '8px 10px', fontFamily: XP_FONT, fontSize: 12, color: '#1b5e20' }}>
                            <i className="bi bi-check-circle-fill" style={{ marginRight: 5 }}></i>{logSuccess}
                        </div>
                    )}
                    {logError && (
                        <div style={{ background: '#fce8e8', border: '1px solid #cc0000', borderLeft: '4px solid #cc0000', padding: '8px 10px', fontFamily: XP_FONT, fontSize: 12, color: '#6b0000' }}>
                            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 5 }}></i>{logError}
                        </div>
                    )}

                    {/* Log form */}
                    <div style={xpPanel}>
                        <div style={xpSectionLabel}>Log Hasil Produksi</div>

                        {/* Qty input */}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontFamily: XP_FONT, fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>
                                Qty Aktual Diproduksi
                            </div>
                            <input
                                type="number"
                                inputMode="decimal"
                                min="0.0001"
                                step="any"
                                autoFocus
                                value={logQty}
                                onChange={e => setLogQty(e.target.value)}
                                placeholder="Masukkan qty aktual..."
                                style={{
                                    width: '100%', fontSize: 20, padding: '8px 10px',
                                    border: '2px solid #7f9db9', boxSizing: 'border-box',
                                    fontFamily: XP_FONT,
                                }}
                            />
                        </div>

                        {/* Operator + Notes */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontFamily: XP_FONT, fontSize: 10, marginBottom: 3 }}>Operator</div>
                                <input
                                    type="text"
                                    value={logOperator}
                                    onChange={e => setLogOperator(e.target.value)}
                                    placeholder="Nama (opsional)"
                                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #7f9db9', boxSizing: 'border-box', fontFamily: XP_FONT }}
                                />
                            </div>
                            <div style={{ flex: 2 }}>
                                <div style={{ fontFamily: XP_FONT, fontSize: 10, marginBottom: 3 }}>Catatan</div>
                                <input
                                    type="text"
                                    value={logNotes}
                                    onChange={e => setLogNotes(e.target.value)}
                                    placeholder="Batch, shift, keterangan..."
                                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #7f9db9', boxSizing: 'border-box', fontFamily: XP_FONT }}
                                />
                            </div>
                        </div>

                        {/* Material consumption */}
                        {logMaterialRows.length > 0 && (
                            <>
                                <div style={{ fontFamily: XP_FONT, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: '#555', borderBottom: '1px solid #c0bdb5', paddingBottom: 3, marginBottom: 6 }}>
                                    Material Terpakai
                                </div>
                                <div style={{ fontSize: 10, color: '#888', marginBottom: 8, fontFamily: XP_FONT }}>
                                    Qty planned otomatis dari BOM%. Edit jika ada perbedaan aktual.
                                </div>
                                {logMaterialRows.map((row, idx) => {
                                    const qty = parseFloat(logQty) || 0;
                                    const planned = qty > 0
                                        ? (row.is_percentage ? (qty * row.line_qty) / 100 : qty * row.line_qty)
                                        : null;
                                    const actual = parseFloat(row.actual_qty) || 0;
                                    const variance = planned != null && row.actual_qty ? actual - planned : null;

                                    return (
                                        <div key={row.item_id} style={{ borderBottom: idx < logMaterialRows.length - 1 ? '1px solid #e4e1d8' : 'none', paddingBottom: 8, marginBottom: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                                                <span style={{ fontFamily: XP_FONT, fontSize: 12, fontWeight: 500 }}>
                                                    {row.item_code && <span style={{ color: '#888', marginRight: 4, fontSize: 10 }}>{row.item_code}</span>}
                                                    {row.item_name || row.item_id}
                                                </span>
                                                {planned != null && (
                                                    <span style={{ fontFamily: XP_FONT, fontSize: 10, color: '#555' }}>Planned: {planned.toFixed(3)}</span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min="0"
                                                    step="any"
                                                    value={row.actual_qty}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setLogMaterialRows(prev => prev.map((r, i) =>
                                                            i === idx ? { ...r, actual_qty: val, is_custom: true } : r
                                                        ));
                                                    }}
                                                    placeholder="0"
                                                    style={{ flex: 1, fontSize: 14, padding: '6px 8px', border: '1px solid #7f9db9', boxSizing: 'border-box', fontFamily: XP_FONT }}
                                                />
                                                {variance != null && (
                                                    <span style={{ fontFamily: XP_FONT, fontSize: 11, color: variance > 0.001 ? '#900' : variance < -0.001 ? '#007000' : '#888', minWidth: 52, textAlign: 'right' }}>
                                                        {variance > 0 ? '+' : ''}{variance.toFixed(3)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}

                        {/* Submit */}
                        <button
                            onClick={handleLogWO}
                            disabled={submittingLog}
                            style={xpBtn({
                                width: '100%', justifyContent: 'center', fontSize: 14,
                                padding: '12px 14px', fontWeight: 'bold',
                                background: submittingLog ? '#aaa' : 'linear-gradient(to bottom, #5ec85e, #2d7a2d)',
                                borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a',
                                color: '#fff', opacity: submittingLog ? 0.6 : 1,
                                cursor: submittingLog ? 'not-allowed' : 'pointer',
                            })}
                        >
                            {submittingLog ? 'Menyimpan...' : 'Simpan Log'}
                        </button>
                    </div>
                </>

            ) : scannedMO ? (
                <>
                    {/* ── MO View ── */}
                    <div style={{ ...xpPanel, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontFamily: XP_FONT, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#666', marginBottom: 2 }}>
                                Manufacturing Order
                            </div>
                            <div style={{ fontFamily: "'Courier New', monospace", fontSize: 22, fontWeight: 'bold', color: '#0058e6', lineHeight: 1.1 }}>
                                {scannedMO.code}
                            </div>
                            <div style={{ marginTop: 4, fontFamily: XP_FONT, fontSize: 12, color: '#333' }}>
                                {scannedMO.item_name || getItemName(scannedMO.item_id)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                <span style={xpStatusBadge(scannedMO.status)}>{scannedMO.status === 'IN_PROGRESS' ? 'IN PROGRESS' : scannedMO.status}</span>
                                <span style={{ fontFamily: XP_FONT, fontSize: 11, color: '#555' }}>Target: {parseFloat(scannedMO.qty)}</span>
                            </div>
                            {moTarget > 0 && (
                                <div style={{ marginTop: 6 }}>
                                    <div style={{ border: '1px solid #7f9db9', height: 12, background: '#fff', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%', width: `${moPct}%`,
                                            background: moPct >= 100
                                                ? 'repeating-linear-gradient(45deg, #2e7d32, #2e7d32 4px, #4caf50 4px, #4caf50 8px)'
                                                : 'repeating-linear-gradient(45deg, #000080, #000080 4px, #1565c0 4px, #1565c0 8px)',
                                            transition: 'width 0.2s',
                                        }} />
                                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 'bold', color: moPct > 50 ? '#fff' : '#000080', textShadow: moPct > 50 ? '0 0 3px rgba(0,0,0,0.8)' : 'none' }}>
                                            {moCompleted.toFixed(2)} / {moTarget} ({moPct}%)
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button style={xpBtn({ flexShrink: 0, padding: '6px 12px' })} type="button" onClick={handleReset}>
                            <i className="bi bi-arrow-repeat"></i> Reset
                        </button>
                    </div>

                    {materialCheck && (
                        <div style={{
                            border: '1px solid', padding: '8px 10px', fontFamily: XP_FONT,
                            borderColor: materialCheck.ok ? '#2e7d32' : '#cc0000',
                            borderLeft: `4px solid ${materialCheck.ok ? '#2e7d32' : '#cc0000'}`,
                            background: materialCheck.ok ? '#e8f5e9' : '#fce8e8',
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 'bold', color: materialCheck.ok ? '#1b5e20' : '#6b0000', marginBottom: materialCheck.ok ? 0 : 4 }}>
                                {materialCheck.ok
                                    ? <><i className="bi bi-check-circle-fill" style={{ marginRight: 5 }}></i>All materials available</>
                                    : <><i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 5 }}></i>Missing materials</>
                                }
                            </div>
                            {!materialCheck.ok && materialCheck.missing.map((m: any, i: number) => (
                                <div key={i} style={{ fontSize: 11, color: '#6b0000', marginTop: 2 }}>• {m.name} at {m.location}</div>
                            ))}
                        </div>
                    )}

                    {error && (
                        <div style={{ background: '#fce8e8', border: '1px solid #cc0000', borderLeft: '4px solid #cc0000', padding: '8px 10px', fontFamily: XP_FONT, fontSize: 12, color: '#6b0000' }}>
                            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 5 }}></i>{error}
                        </div>
                    )}

                    <div style={xpPanel}>
                        <div style={xpSectionLabel}>
                            Runs
                            <span style={{ marginLeft: 6, fontWeight: 'normal', textTransform: 'none', letterSpacing: 0 }}>
                                — Target: {parseFloat(scannedMO.qty)} | Assigned: {runQtySum.toFixed(2)} | Remaining: {remaining.toFixed(2)}
                            </span>
                        </div>

                        {runs.length === 0 ? (
                            <div style={{ fontFamily: XP_FONT, fontSize: 11, color: '#888', textAlign: 'center', padding: '6px 0 10px' }}>
                                No runs assigned yet.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                                {runs.map((run: any) => (
                                    <div key={run.id} style={{ border: '1px solid #c0bdb5', background: '#f5f4ef', padding: '7px 10px', borderLeft: `3px solid ${run.status === 'COMPLETED' ? '#2e7d32' : run.status === 'IN_PROGRESS' ? '#1a4a8a' : '#b8860b'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                                            <div>
                                                <div style={{ fontFamily: XP_FONT, fontSize: 12, fontWeight: 'bold', color: '#333' }}>
                                                    {run.name}
                                                    {run.work_center_name && (
                                                        <span style={{ fontWeight: 'normal', color: '#666', marginLeft: 5 }}>@ {run.work_center_name}</span>
                                                    )}
                                                </div>
                                                <div style={{ fontFamily: XP_FONT, fontSize: 11, color: '#555' }}>Qty: {parseFloat(run.qty)}</div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                                                <span style={xpStatusBadge(run.status)}>{run.status === 'IN_PROGRESS' ? 'IN PROGRESS' : run.status}</span>
                                                {run.status === 'PENDING' && (
                                                    <button
                                                        disabled={updatingRunId === run.id}
                                                        onClick={() => handleRunStatus(run.id, 'IN_PROGRESS')}
                                                        style={xpBtn({ fontSize: 11, padding: '4px 10px', background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)', borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a', color: '#fff', fontWeight: 'bold', opacity: updatingRunId === run.id ? 0.6 : 1 })}
                                                    >
                                                        <i className="bi bi-play-fill"></i>
                                                        {updatingRunId === run.id ? 'Starting...' : 'START'}
                                                    </button>
                                                )}
                                                {run.status === 'IN_PROGRESS' && (
                                                    <button
                                                        disabled={updatingRunId === run.id}
                                                        onClick={() => handleRunStatus(run.id, 'COMPLETED')}
                                                        style={xpBtn({ fontSize: 11, padding: '4px 10px', background: 'linear-gradient(to bottom, #5ec85e, #2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: updatingRunId === run.id ? 0.6 : 1 })}
                                                    >
                                                        <i className="bi bi-check-lg"></i>
                                                        {updatingRunId === run.id ? 'Finishing...' : 'DONE'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!addingRun ? (
                            <button onClick={handleOpenAddRun} style={xpBtn({ fontSize: 12, padding: '8px 14px', width: '100%', justifyContent: 'center' })}>
                                + Add Run
                            </button>
                        ) : (
                            <div style={{ border: '1px solid #aca899', padding: '10px', background: '#f5f4ee', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ fontFamily: XP_FONT, fontSize: 10, fontWeight: 'bold', color: '#000080', textTransform: 'uppercase' }}>New Run</div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontFamily: XP_FONT, fontSize: 10, marginBottom: 3 }}>Work Center</div>
                                        <select
                                            value={runWcId}
                                            onChange={e => setRunWcId(e.target.value)}
                                            style={{ width: '100%', fontFamily: XP_FONT, fontSize: 13, border: '1px solid #7f9db9', padding: '6px 8px', background: '#fff' }}
                                        >
                                            <option value="">— any —</option>
                                            {workCenters.map((wc: any) => (
                                                <option key={wc.id} value={wc.id}>{wc.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontFamily: XP_FONT, fontSize: 10, marginBottom: 3 }}>Qty</div>
                                        <input
                                            type="number"
                                            value={runQty}
                                            onChange={e => setRunQty(e.target.value)}
                                            min="0.0001"
                                            step="any"
                                            autoFocus
                                            style={{ width: '100%', fontFamily: XP_FONT, fontSize: 14, border: '1px solid #7f9db9', padding: '6px 8px' }}
                                        />
                                    </div>
                                </div>
                                {wouldExceed && (
                                    <div style={{ fontFamily: XP_FONT, fontSize: 11, color: '#8a3c00', background: '#fff3cd', border: '1px solid #b8860b', padding: '5px 8px' }}>
                                        Exceeds target + tolerance ({maxQty.toFixed(2)}). Override allowed.
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setAddingRun(false)} style={xpBtn({ fontSize: 12, padding: '6px 12px' })}>Cancel</button>
                                    <button
                                        disabled={submittingRun || !runQty || parseFloat(runQty) <= 0}
                                        onClick={handleAddRun}
                                        style={xpBtn({
                                            fontSize: 12, padding: '6px 14px', fontWeight: 'bold',
                                            background: 'linear-gradient(to bottom, #316ac5, #1a4a8a)',
                                            borderColor: '#1a3a7a #0a1a4a #0a1a4a #1a3a7a',
                                            color: '#fff',
                                            opacity: (submittingRun || !runQty || parseFloat(runQty) <= 0) ? 0.6 : 1,
                                        })}
                                    >
                                        {submittingRun ? 'Saving...' : 'Add Run'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>

            ) : (
                <>
                    {/* ── Scanner idle view ── */}
                    <div style={{ ...xpInset, overflow: 'hidden' }}>
                        <div id="mobile-reader" style={{ width: '100%' }} />
                    </div>

                    <div style={{ textAlign: 'center', fontFamily: XP_FONT, fontSize: 12, color: '#333' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Ready to Scan</div>
                        <div style={{ fontSize: 11, color: '#666' }}>Point camera at a Work Order or Manufacturing Order QR code</div>
                    </div>

                    {error && (
                        <div style={{ background: '#fce8e8', border: '1px solid #cc0000', borderLeft: '4px solid #cc0000', padding: '8px 10px', fontFamily: XP_FONT, fontSize: 12, color: '#6b0000' }}>
                            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 5 }}></i>{error}
                        </div>
                    )}

                    <div style={{ ...xpPanel, marginTop: 4 }}>
                        <div style={xpSectionLabel}>Or enter MO code manually</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input
                                type="text"
                                value={manualCode}
                                onChange={e => setManualCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
                                placeholder="e.g. MO-2024-0042"
                                style={{
                                    ...xpInset, flex: 1, padding: '8px 10px',
                                    fontFamily: XP_FONT, fontSize: 14,
                                    outline: 'none', minHeight: 40,
                                }}
                            />
                            <button onClick={handleManualLookup} style={xpBtn({ padding: '8px 14px', fontSize: 14, fontWeight: 'bold', minHeight: 40, minWidth: 48 })}>
                                →
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
