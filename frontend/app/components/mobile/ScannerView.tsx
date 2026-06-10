'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { STATUS_COLORS } from '../../lib/xpTheme';

interface MobileScannerViewProps {
    manufacturingOrders: any[];
    workCenters: any[];
    items: any[];
    authFetch: (url: string, options?: any) => Promise<Response>;
    onRefresh: () => Promise<void> | void;
    onClose: () => void;
}

interface MaterialRow {
    item_id: string;
    item_name: string;
    item_code: string;
    planned_pct: number;
    actual_qty: string;
    is_custom: boolean;
    is_substitute: boolean;
    orig_item_id: string;
    orig_item_name: string;
    orig_item_code: string;
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

const xpInput: React.CSSProperties = {
    fontFamily: XP_FONT, fontSize: 13, padding: '6px 8px',
    border: '1px solid #7f9db9', boxSizing: 'border-box',
    borderRadius: 0, background: '#fff', width: '100%',
};

const xpStatusBadge = (status: string): React.CSSProperties => {
    const base: React.CSSProperties = {
        fontFamily: XP_FONT, fontSize: 10, fontWeight: 'bold',
        padding: '2px 8px', display: 'inline-block',
    };
    if (status === 'COMPLETED')   return { ...base, background: STATUS_COLORS.COMPLETED, color: '#fff' };
    if (status === 'IN_PROGRESS') return { ...base, background: STATUS_COLORS.IN_PROGRESS, color: '#fff' };
    if (status === 'CANCELLED')   return { ...base, background: STATUS_COLORS.CANCELLED, color: '#fff' };
    return { ...base, background: STATUS_COLORS.PENDING, color: '#fff' };
};

const isUUID = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default function MobileScannerView({
    manufacturingOrders, workCenters, items, authFetch, onRefresh, onClose,
}: MobileScannerViewProps) {
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [scannedWOId, setScannedWOId]         = useState<string | null>(null);
    const [logQty, setLogQty]                   = useState('');
    const [logOperator, setLogOperator]         = useState('');
    const [logNotes, setLogNotes]               = useState('');
    const [logWorkCenterId, setLogWorkCenterId] = useState('');
    const [materialRows, setMaterialRows]       = useState<MaterialRow[]>([]);
    const [submittingLog, setSubmittingLog]     = useState(false);
    const [logSuccess, setLogSuccess]           = useState('');
    const [logError, setLogError]               = useState('');
    const [error, setError]                     = useState<string | null>(null);
    const [subPickerIdx, setSubPickerIdx]       = useState<number | null>(null);
    const [subQuery, setSubQuery]               = useState('');
    const [beamNumber, setBeamNumber]           = useState('');
    const [beamBatchId, setBeamBatchId]         = useState('');
    const [beamBatches, setBeamBatches]         = useState<any[]>([]);

    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const terminalId = useRef(Math.random().toString(36).substr(2, 6).toUpperCase());

    const allWOs = manufacturingOrders.flatMap((mo: any) =>
        (mo.work_orders || []).map((wo: any) => ({ ...wo, _mo: mo }))
    );
    const scannedWO = scannedWOId
        ? (allWOs.find((wo: any) => wo.id === scannedWOId) || null)
        : null;
    const scannedWOParentMO = scannedWO?._mo || null;

    const woTarget = scannedWO?.qty ?? 0;
    const woDone   = scannedWO?.qty_completed_total ?? 0;
    const woPct    = woTarget > 0 ? Math.min(100, Math.round((woDone / woTarget) * 100)) : 0;

    const isBeamItem = (itemId: string) => {
        const it = (items || []).find((i: any) => i.id === itemId);
        return (it?.category_path || []).some((p: string) => (p || '').toLowerCase() === 'beam');
    };
    // Beam output: WO produces a physical beam — Beam item MO, BEAM- code, or BEAMING work center
    const woWcType = ((workCenters || []).find((wc: any) => wc.id === scannedWO?.work_center_id)?.center_type || '').toUpperCase();
    const isBeamOutput = !!scannedWO && !!scannedWOParentMO
        && (isBeamItem(scannedWOParentMO.item_id) || (scannedWOParentMO.item_code || '').startsWith('BEAM-') || woWcType === 'BEAMING');

    // Beam input: any material line with batch stock at the input location → operator picks the batch/beam
    const materialItemIds = scannedWO ? Array.from(new Set(materialRows.map(r => r.item_id))) : [];
    useEffect(() => {
        if (!materialItemIds.length) { setBeamBatches([]); setBeamBatchId(''); return; }
        const loc = scannedWO?.input_location_id;
        Promise.all(materialItemIds.map(id =>
            authFetch(`${API_BASE}/batches?item_id=${id}${loc ? `&location_id=${loc}` : ''}&limit=200`)
                .then((r: Response) => (r.ok ? r.json() : []))
                .catch(() => [])
        )).then(results => {
            setBeamBatches(results.flat().filter((b: any) => (b.remaining ?? 0) > 0));
        });
    }, [JSON.stringify(materialItemIds), scannedWOId]);

    // Scanner lifecycle — active when no WO selected
    useEffect(() => {
        if (scannedWOId) return;

        const timer = setTimeout(() => {
            if (!document.getElementById('mobile-reader')) return;
            const scanner = new Html5QrcodeScanner('mobile-reader', { fps: 10, qrbox: { width: 220, height: 220 } }, false);
            scannerRef.current = scanner;
            scanner.render(
                (decodedText: string) => {
                    if (!isUUID(decodedText)) {
                        setError('Not a valid Work Order QR code.');
                        return;
                    }
                    const found = allWOs.find((wo: any) => wo.id === decodedText);
                    if (found) {
                        setScannedWOId(found.id);
                        setError(null);
                        scanner.clear().catch(() => {});
                    } else {
                        setError(`WO "${decodedText.slice(0, 8)}..." not found in active orders.`);
                    }
                },
                () => {}
            );
        }, 100);

        return () => {
            clearTimeout(timer);
            scannerRef.current?.clear().catch(() => {});
        };
    }, [manufacturingOrders, scannedWOId]);

    // Build material rows from BOM when WO scanned
    useEffect(() => {
        if (!scannedWOId || !scannedWOParentMO) return;
        const bomLines: any[] = scannedWOParentMO.bom?.lines || [];
        setMaterialRows(bomLines.map((line: any) => ({
            item_id: line.item_id,
            item_name: line.item_name || '',
            item_code: line.item_code || '',
            planned_pct: parseFloat(line.percentage) || 0,
            actual_qty: '',
            is_custom: false,
            is_substitute: false,
            orig_item_id: line.item_id,
            orig_item_name: line.item_name || '',
            orig_item_code: line.item_code || '',
        })));
        setLogQty('');
        setLogOperator('');
        setLogNotes('');
        setLogWorkCenterId('');
        setLogSuccess('');
        setLogError('');
        setSubPickerIdx(null);
        setSubQuery('');
        setBeamNumber('');
        setBeamBatchId('');
    }, [scannedWOId]);

    // Recalculate planned actuals when output qty changes
    useEffect(() => {
        const qty = parseFloat(logQty);
        if (!qty || qty <= 0) return;
        setMaterialRows(prev => prev.map(row => {
            if (row.is_custom) return row;
            const planned = (qty * row.planned_pct) / 100;
            return { ...row, actual_qty: planned.toFixed(4) };
        }));
    }, [logQty]);

    const handleReset = () => {
        setScannedWOId(null);
        setError(null);
        setLogSuccess('');
        setLogError('');
    };

    const handleLogWO = async () => {
        setLogError('');
        setLogSuccess('');
        const qty = parseFloat(logQty);
        if (!qty || qty <= 0) { setLogError('Enter a positive quantity'); return; }
        if (!scannedWO || !scannedWOParentMO) return;

        for (const row of materialRows) {
            const v = parseFloat(row.actual_qty);
            if (isNaN(v) || v < 0) {
                setLogError(`Invalid quantity for ${row.item_code || row.item_name}`);
                return;
            }
        }
        if (beamBatches.length > 0 && !beamBatchId) {
            setLogError('Pilih beam yang dipakai');
            return;
        }

        setSubmittingLog(true);
        try {
            const actualItems = materialRows
                .filter(row => parseFloat(row.actual_qty) > 0)
                .map(row => ({ item_id: row.item_id, qty_used: parseFloat(row.actual_qty) }));

            const res = await authFetch(`${API_BASE}/manufacturing-orders/${scannedWOParentMO.id}/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qty_completed: qty,
                    operator_name: logOperator || null,
                    notes: logNotes || null,
                    work_center_id: logWorkCenterId || null,
                    work_order_id: scannedWO.id,
                    actual_items: actualItems,
                    beam_number: isBeamOutput ? (beamNumber.trim() || null) : null,
                    beam_batch_id: beamBatchId || null,
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
            setBeamNumber('');
            setBeamBatchId('');
            setMaterialRows(prev => prev.map(r => ({ ...r, actual_qty: '', is_custom: false })));
            await onRefresh();
        } catch (err: any) {
            setLogError(err.message);
        } finally {
            setSubmittingLog(false);
        }
    };

    return (
        <div style={{ background: XP_BEIGE, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Terminal header */}
            <div style={{ fontFamily: XP_FONT, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: '#555', borderBottom: '1px solid #c0bdb5', paddingBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="bi bi-qr-code-scan" style={{ color: '#1a4a8a' }} />
                Operator Scan Terminal
                <span style={{ marginLeft: 'auto', fontWeight: 'normal', fontSize: 10, color: '#888' }}>ID: {terminalId.current}</span>
            </div>

            {scannedWO && scannedWOParentMO ? (
                <>
                    {/* WO identity panel */}
                    <div style={{ ...xpPanel, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontFamily: XP_FONT, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#666', marginBottom: 2 }}>Work Order Step</div>
                            <div style={{ fontFamily: XP_FONT, fontSize: 16, fontWeight: 'bold', color: '#000080', lineHeight: 1.2 }}>{scannedWO.name}</div>
                            <div style={{ fontFamily: XP_FONT, fontSize: 11, color: '#555', marginTop: 2 }}>
                                {scannedWOParentMO.code} — {scannedWOParentMO.item_name || ''}
                                {scannedWO.work_center_name && <span style={{ marginLeft: 6 }}>| {scannedWO.work_center_name}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                <span style={xpStatusBadge(scannedWO.status)}>{scannedWO.status === 'IN_PROGRESS' ? 'IN PROGRESS' : scannedWO.status}</span>
                                {woTarget > 0 && <span style={{ fontFamily: XP_FONT, fontSize: 11, color: '#555' }}>Target: {woTarget} | Done: {woDone.toFixed(2)}</span>}
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

                        {/* Qty */}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontFamily: XP_FONT, fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>Qty Aktual Diproduksi</div>
                            <input
                                type="number" inputMode="decimal" min="0.0001" step="any" autoFocus
                                value={logQty} onChange={e => setLogQty(e.target.value)}
                                placeholder="Masukkan qty aktual..."
                                style={{ ...xpInput, fontSize: 20, padding: '8px 10px', border: '2px solid #7f9db9' }}
                            />
                        </div>

                        {/* Beam number (beaming WO) */}
                        {isBeamOutput && (
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontFamily: XP_FONT, fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>Nomor Beam</div>
                                <input
                                    type="text"
                                    value={beamNumber} onChange={e => setBeamNumber(e.target.value)}
                                    placeholder="Kosongkan untuk nomor otomatis (BM-...)"
                                    style={{ ...xpInput, fontSize: 16, padding: '6px 10px', border: '2px solid #7f9db9' }}
                                />
                                <div style={{ fontFamily: XP_FONT, fontSize: 9, color: '#888', marginTop: 2 }}>
                                    Beam dicatat sebagai stok batch dengan kg yang diproduksi. Nomor otomatis muncul di catatan entri.
                                </div>
                            </div>
                        )}

                        {/* Beam picker (weaving WO) */}
                        {beamBatches.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontFamily: XP_FONT, fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>Beam yang Dipakai</div>
                                <select
                                    value={beamBatchId}
                                    onChange={e => setBeamBatchId(e.target.value)}
                                    style={{ ...xpInput, appearance: 'auto' }}
                                >
                                    <option value="">— pilih beam —</option>
                                    {beamBatches.map((b: any) => {
                                        const code = (items || []).find((i: any) => i.id === b.item_id)?.code;
                                        return (
                                            <option key={b.id} value={b.id}>
                                                {b.batch_number}{code ? ` (${code})` : ''} — {Number(b.remaining ?? 0).toFixed(2)} kg sisa{b.ends ? `, ${b.ends} ends` : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}

                        {/* Operator + Notes */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontFamily: XP_FONT, fontSize: 10, marginBottom: 3 }}>Operator</div>
                                <input type="text" value={logOperator} onChange={e => setLogOperator(e.target.value)}
                                    placeholder="Nama (opsional)" style={xpInput} />
                            </div>
                            <div style={{ flex: 2 }}>
                                <div style={{ fontFamily: XP_FONT, fontSize: 10, marginBottom: 3 }}>Catatan</div>
                                <input type="text" value={logNotes} onChange={e => setLogNotes(e.target.value)}
                                    placeholder="Batch, shift, keterangan..." style={xpInput} />
                            </div>
                        </div>

                        {/* Work Center / Machine */}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontFamily: XP_FONT, fontSize: 10, marginBottom: 3 }}>Work Center / Machine</div>
                            <select
                                value={logWorkCenterId}
                                onChange={e => setLogWorkCenterId(e.target.value)}
                                style={{ ...xpInput, appearance: 'auto' }}
                            >
                                <option value="">— pilih mesin (opsional) —</option>
                                {workCenters.map((wc: any) => (
                                    <option key={wc.id} value={wc.id}>{wc.name}{wc.code ? ` (${wc.code})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Material Consumption */}
                        {materialRows.length > 0 && (() => {
                            const filteredItems = subQuery.length >= 2
                                ? items.filter((it: any) =>
                                    (it.code || '').toLowerCase().includes(subQuery.toLowerCase()) ||
                                    (it.name || '').toLowerCase().includes(subQuery.toLowerCase())
                                  ).slice(0, 10)
                                : [];
                            return (
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ ...xpSectionLabel, marginTop: 4 }}>Material Consumption</div>
                                <div style={{ fontSize: 9, color: '#888', marginBottom: 6, fontFamily: XP_FONT }}>
                                    Planned = BOM% x output. Tap Sub to use a substitute item if stock is unavailable.
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: XP_FONT }}>
                                    <thead>
                                        <tr style={{ background: '#dddbd0' }}>
                                            <th style={{ padding: '3px 6px', textAlign: 'left', borderBottom: '1px solid #aca899' }}>Material</th>
                                            <th style={{ padding: '3px 6px', textAlign: 'right', borderBottom: '1px solid #aca899', width: 54 }}>Planned</th>
                                            <th style={{ padding: '3px 4px', textAlign: 'right', borderBottom: '1px solid #aca899', width: 76 }}>Actual</th>
                                            <th style={{ padding: '3px 6px', textAlign: 'right', borderBottom: '1px solid #aca899', width: 50 }}>Var</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {materialRows.map((row, idx) => {
                                            const qty = parseFloat(logQty) || 0;
                                            const planned = (qty * row.planned_pct) / 100;
                                            const actual = parseFloat(row.actual_qty) || 0;
                                            const variance = actual - planned;
                                            const isPickingThis = subPickerIdx === idx;
                                            return (
                                                <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f5f4ee', verticalAlign: 'top' }}>
                                                    <td style={{ padding: '3px 4px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 500 }}>{row.item_code}</span>
                                                            {row.is_substitute && (
                                                                <span style={{ fontSize: 9, background: '#fff3cd', border: '1px solid #b8860b', color: '#7a5000', padding: '0 3px', whiteSpace: 'nowrap' }}>
                                                                    SUB
                                                                </span>
                                                            )}
                                                            {row.is_substitute && (
                                                                <span style={{ fontSize: 9, color: '#999', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>
                                                                    {row.orig_item_code}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isPickingThis) { setSubPickerIdx(null); setSubQuery(''); }
                                                                    else { setSubPickerIdx(idx); setSubQuery(''); }
                                                                }}
                                                                style={{ fontFamily: XP_FONT, fontSize: 9, padding: '1px 5px', cursor: 'pointer', background: isPickingThis ? '#c8d8f0' : 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid #808080', color: '#000040' }}
                                                            >
                                                                {isPickingThis ? 'Cancel' : 'Sub'}
                                                            </button>
                                                            {row.is_substitute && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setMaterialRows(prev => prev.map((r, i) => i === idx ? {
                                                                            ...r,
                                                                            item_id: r.orig_item_id,
                                                                            item_name: r.orig_item_name,
                                                                            item_code: r.orig_item_code,
                                                                            is_substitute: false,
                                                                            is_custom: false,
                                                                        } : r));
                                                                        if (isPickingThis) { setSubPickerIdx(null); setSubQuery(''); }
                                                                    }}
                                                                    style={{ fontFamily: XP_FONT, fontSize: 9, padding: '1px 5px', cursor: 'pointer', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid #808080', color: '#900' }}
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '3px 6px', textAlign: 'right', color: '#555' }}>
                                                        {qty > 0 ? planned.toFixed(3) : '—'}
                                                    </td>
                                                    <td style={{ padding: '3px 4px' }}>
                                                        <input
                                                            type="number" min="0" step="any"
                                                            value={row.actual_qty}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setMaterialRows(prev => prev.map((r, i) =>
                                                                    i === idx ? { ...r, actual_qty: val, is_custom: true } : r
                                                                ));
                                                            }}
                                                            placeholder="0"
                                                            style={{ ...xpInput, textAlign: 'right', padding: '2px 4px', fontSize: 12 }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '3px 6px', textAlign: 'right', fontSize: 10, color: variance > 0.0001 ? '#900' : variance < -0.0001 ? '#007000' : '#888' }}>
                                                        {qty > 0 && row.actual_qty ? (variance > 0 ? '+' : '') + variance.toFixed(3) : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Substitute item picker */}
                                {subPickerIdx !== null && (
                                    <div style={{ marginTop: 8, border: '2px solid #1a4a8a', background: '#f0f4ff', padding: 8 }}>
                                        <div style={{ fontFamily: XP_FONT, fontSize: 10, fontWeight: 'bold', color: '#000080', marginBottom: 6 }}>
                                            Select substitute for: {materialRows[subPickerIdx]?.orig_item_code}
                                        </div>
                                        <input
                                            type="text"
                                            autoFocus
                                            placeholder="Type item code or name (min 2 chars)..."
                                            value={subQuery}
                                            onChange={e => setSubQuery(e.target.value)}
                                            style={{ ...xpInput, marginBottom: 6 }}
                                        />
                                        {subQuery.length >= 2 && filteredItems.length === 0 && (
                                            <div style={{ fontFamily: XP_FONT, fontSize: 11, color: '#888', padding: '4px 0' }}>No items found.</div>
                                        )}
                                        {filteredItems.map((it: any) => (
                                            <button
                                                key={it.id}
                                                type="button"
                                                onClick={() => {
                                                    const idx = subPickerIdx;
                                                    setMaterialRows(prev => prev.map((r, i) => i === idx ? {
                                                        ...r,
                                                        item_id: it.id,
                                                        item_name: it.name || '',
                                                        item_code: it.code || '',
                                                        is_substitute: true,
                                                        is_custom: true,
                                                    } : r));
                                                    setSubPickerIdx(null);
                                                    setSubQuery('');
                                                }}
                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 2, fontFamily: XP_FONT, fontSize: 12, cursor: 'pointer', background: '#fff', border: '1px solid #7f9db9', borderRadius: 0 }}
                                            >
                                                <span style={{ fontWeight: 'bold' }}>{it.code}</span>
                                                {it.name && it.name !== it.code && (
                                                    <span style={{ color: '#555', marginLeft: 8, fontSize: 11 }}>{it.name}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            );
                        })()}

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

            ) : (
                <>
                    {/* Scanner idle view */}
                    <div style={{ ...xpInset, overflow: 'hidden' }}>
                        <div id="mobile-reader" style={{ width: '100%' }} />
                    </div>

                    <div style={{ textAlign: 'center', fontFamily: XP_FONT, fontSize: 12, color: '#333' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Ready to Scan</div>
                        <div style={{ fontSize: 11, color: '#666' }}>Point camera at a Work Order QR code (Kartu Kerja)</div>
                    </div>

                    {error && (
                        <div style={{ background: '#fce8e8', border: '1px solid #cc0000', borderLeft: '4px solid #cc0000', padding: '8px 10px', fontFamily: XP_FONT, fontSize: 12, color: '#6b0000' }}>
                            <i className="bi bi-exclamation-triangle-fill" style={{ marginRight: 5 }}></i>{error}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
