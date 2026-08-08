'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { StatusChip, xpFont as XP_FONT } from '../shared/xpTheme';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

const XP_BEIGE = '#ece9d8';

const xpBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: XP_FONT, fontSize: 13, padding: '6px 14px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    color: '#000000', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
    ...extra,
});
const xpBtnGreen = (extra: React.CSSProperties = {}) => xpBtn({
    background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)',
    borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', ...extra,
});
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
const xpLabel: React.CSSProperties = { fontFamily: XP_FONT, fontSize: 11, color: '#333', display: 'block', marginBottom: 3 };

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function playBeep() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.frequency.value = 880;
        osc.connect(ctx.destination);
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 120);
    } catch { /* no audio on this device */ }
}

/**
 * Mobile packing scanner — the floor half of a packing order.
 *
 * Deliberately separate from the WO ScannerView: that screen is built around
 * BOM material rows and WO completions, and a packing order has neither. Here a
 * PCK- code opens the pack-logging form; a PU- code just reports what that
 * carton is, so a packer can identify a box without opening the desktop app.
 */
export default function PackingScanView({ authFetch, onClose }: { authFetch: (url: string, options?: any) => Promise<Response>; onClose: () => void }) {
    const [po, setPo] = useState<any | null>(null);
    const [unit, setUnit] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [manualCode, setManualCode] = useState('');
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const scanLockRef = useRef(false);

    const [qty, setQty] = useState('');
    const [packageCount, setPackageCount] = useState('1');
    const [sourceBatch, setSourceBatch] = useState('');
    const [operator, setOperator] = useState('');
    const [notes, setNotes] = useState('');
    const [lots, setLots] = useState<any[]>([]);
    const [logging, setLogging] = useState(false);
    const [lastCartons, setLastCartons] = useState<any[]>([]);

    const resolveCode = useCallback(async (raw: string) => {
        const code = raw.trim();
        if (!code) return;
        setError(null);
        const upper = code.toUpperCase();

        if (upper.startsWith('PU-')) {
            const res = await authFetch(`${API_BASE}/packing/packed-units/resolve?code=${encodeURIComponent(code)}`);
            if (res.ok) { setUnit(await res.json()); setPo(null); playBeep(); }
            else { const e = await res.json().catch(() => ({})); setError(e.detail || `Carton "${code}" not found.`); }
            return;
        }

        if (upper.startsWith('PCK-')) {
            // No code lookup endpoint — the list is already filtered and small.
            const res = await authFetch(`${API_BASE}/packing?size=200`);
            if (!res.ok) { setError('Could not load packing orders.'); return; }
            const d = await res.json();
            const found = (d.items || []).find((o: any) => String(o.code).toUpperCase() === upper);
            if (!found) { setError(`Packing order "${code}" not found.`); return; }
            if (found.status === 'COMPLETED' || found.status === 'CANCELLED') {
                setError(`Packing order ${found.code} is ${found.status}.`);
                return;
            }
            playBeep();
            setPo(found);
            setUnit(null);
            const rem = Math.max(0, num(found.qty_target) - num(found.qty_packed));
            setQty(rem ? String(rem) : '');
            const ps = num(found.pack_size);
            setPackageCount(ps > 0 && rem > 0 ? String(Math.max(1, Math.ceil(rem / ps))) : '1');
            return;
        }

        setError('Not a packing QR code. Expected PCK- (packing order) or PU- (carton).');
    }, [authFetch]);

    // Camera stays mounted only while nothing is resolved — same lifecycle as the
    // WO scanner, so the stream is released as soon as a form takes over.
    useEffect(() => {
        if (po || unit) return;
        const timer = setTimeout(() => {
            const qrbox = (vw: number, vh: number) => {
                const size = Math.floor(Math.min(vw, vh) * 0.7);
                return { width: size, height: size };
            };
            const scanner = new Html5QrcodeScanner('packing-reader', {
                fps: 10,
                qrbox,
                useBarCodeDetectorIfSupported: true,
                showTorchButtonIfSupported: true,
                videoConstraints: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    focusMode: 'continuous',
                    advanced: [{ focusMode: 'continuous' } as any],
                } as MediaTrackConstraints,
            }, false);
            scannerRef.current = scanner;
            scanLockRef.current = false;
            scanner.render(
                (decodedText: string) => {
                    if (scanLockRef.current) return;
                    scanLockRef.current = true;
                    resolveCode(decodedText).finally(() => {
                        scanner.clear().catch(() => {});
                        scanLockRef.current = false;
                    });
                },
                () => {}
            );
        }, 100);
        return () => {
            clearTimeout(timer);
            scannerRef.current?.clear().catch(() => {});
        };
    }, [po, unit, resolveCode]);

    useEffect(() => {
        (async () => {
            if (!po) return;
            const res = await authFetch(`${API_BASE}/batches?item_id=${po.item_id}`);
            if (res.ok) setLots(await res.json() || []);
        })();
    }, [po, authFetch]);

    const onQtyChange = (v: string) => {
        setQty(v);
        const ps = num(po?.pack_size);
        if (ps > 0 && num(v) > 0) setPackageCount(String(Math.max(1, Math.ceil(num(v) / ps))));
    };

    const logPack = async () => {
        if (num(qty) <= 0) { setError('Enter a quantity to pack.'); return; }
        if (num(packageCount) <= 0) { setError('At least one carton is required.'); return; }
        setLogging(true);
        setError(null);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}/complete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qty: num(qty),
                    package_count: parseInt(packageCount, 10),
                    source_batch_id: sourceBatch || null,
                    operator: operator || null,
                    notes: notes || null,
                }),
            });
            if (res.ok) {
                const fresh = await res.json();
                const before = new Set((po.packed_units || []).map((u: any) => String(u.id)));
                setLastCartons((fresh.packed_units || []).filter((u: any) => !before.has(String(u.id))));
                setPo(fresh);
                setQty(''); setNotes('');
                playBeep();
            } else {
                const e = await res.json().catch(() => ({}));
                setError(e.detail || 'Packing failed.');
            }
        } finally { setLogging(false); }
    };

    const reset = () => { setPo(null); setUnit(null); setError(null); setLastCartons([]); setManualCode(''); };

    return (
        <div style={{ fontFamily: XP_FONT, background: XP_BEIGE, minHeight: '100vh', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong style={{ fontSize: 15 }}>Packing Scanner</strong>
                <button style={xpBtn()} onClick={onClose}>Close</button>
            </div>

            {error && (
                <div style={{ background: '#ffe8e8', border: '1px solid #c00', color: '#800', padding: '6px 10px', fontSize: 12, marginBottom: 10 }}>
                    {error}
                </div>
            )}

            {!po && !unit && (
                <>
                    <div style={{ ...xpPanel, marginBottom: 10 }}>
                        <div style={xpSectionLabel}>Scan</div>
                        <div id="packing-reader" style={{ width: '100%' }} />
                    </div>
                    <div style={xpPanel}>
                        <div style={xpSectionLabel}>Or type a code</div>
                        <input
                            style={xpInput}
                            placeholder="PCK-00001 or PU-20260802-0001"
                            value={manualCode}
                            onChange={e => setManualCode(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') resolveCode(manualCode); }}
                        />
                        <button style={{ ...xpBtn(), marginTop: 8 }} onClick={() => resolveCode(manualCode)}>Open</button>
                    </div>
                </>
            )}

            {unit && (
                <div style={xpPanel}>
                    <div style={xpSectionLabel}>Carton {unit.batch_number}</div>
                    <Row label="Item" value={`${unit.item_name || ''} (${unit.item_code || ''})`} />
                    <Row label="Carton no." value={String(unit.package_no ?? '—')} />
                    <Row label="Qty in stock" value={num(unit.qty).toLocaleString()} />
                    <Row label="Location" value={unit.location_name || '—'} />
                    <Row label="Packing order" value={unit.packing_order_code || '—'} />
                    <Row label="Quality" value={unit.quality_status} />
                    <button style={{ ...xpBtn(), marginTop: 10 }} onClick={reset}>Scan another</button>
                </div>
            )}

            {po && (
                <>
                    <div style={{ ...xpPanel, marginBottom: 10 }}>
                        <div style={xpSectionLabel}>{po.code}</div>
                        <Row label="Item" value={`${po.item_name || ''} (${po.item_code || ''})`} />
                        <Row label="Colour" value={po.color_name || '—'} />
                        <Row label="Sales order" value={po.sales_order_code || 'to stock'} />
                        <Row label="Target" value={`${num(po.qty_target).toLocaleString()} ${po.item_uom || ''}`} />
                        <Row label="Packed" value={`${num(po.qty_packed).toLocaleString()} · ${po.package_count || 0} ${(po.package_label || 'carton').toLowerCase()}s`} />
                        <div style={{ marginTop: 6 }}><StatusChip status={po.status} /></div>
                    </div>

                    {lastCartons.length > 0 && (
                        <div style={{ background: '#eef7ee', border: '1px solid #2d7a2d', color: '#0a3e0a', padding: '8px 10px', fontSize: 12, marginBottom: 10 }}>
                            <strong>Packed:</strong>
                            {lastCartons.map((u: any) => (
                                <div key={u.id}>#{u.package_no} · {u.batch_number} · {num(u.qty).toLocaleString()}</div>
                            ))}
                            <div style={{ marginTop: 4, fontSize: 11 }}>Print these labels from the desktop Packing Orders screen.</div>
                        </div>
                    )}

                    <div style={xpPanel}>
                        <div style={xpSectionLabel}>Log packing</div>
                        <label style={xpLabel}>Qty packed</label>
                        <input type="number" min={0} style={xpInput} value={qty} onChange={e => onQtyChange(e.target.value)} />
                        <label style={{ ...xpLabel, marginTop: 8 }}>Number of {(po.package_label || 'carton').toLowerCase()}s</label>
                        <input type="number" min={1} style={xpInput} value={packageCount} onChange={e => setPackageCount(e.target.value)} />
                        {lots.length > 0 && (
                            <>
                                <label style={{ ...xpLabel, marginTop: 8 }}>Source lot</label>
                                <select style={xpInput} value={sourceBatch} onChange={e => setSourceBatch(e.target.value)}>
                                    <option value="">— select lot —</option>
                                    {lots.map((b: any) => (
                                        <option key={b.id} value={b.id}>
                                            {b.batch_number}{b.remaining != null ? ` (${Number(b.remaining).toFixed(2)} sisa)` : ''}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}
                        <label style={{ ...xpLabel, marginTop: 8 }}>Operator</label>
                        <input style={xpInput} value={operator} onChange={e => setOperator(e.target.value)} />
                        <label style={{ ...xpLabel, marginTop: 8 }}>Notes</label>
                        <input style={xpInput} value={notes} onChange={e => setNotes(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button style={xpBtn()} onClick={reset}>Scan another</button>
                            <button style={{ ...xpBtnGreen(), flex: 1, justifyContent: 'center' }} disabled={logging} onClick={logPack}>
                                {logging ? 'Packing...' : 'Pack'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '2px 0' }}>
            <span style={{ color: '#555' }}>{label}</span>
            <span style={{ fontWeight: 'bold', textAlign: 'right' }}>{value}</span>
        </div>
    );
}
