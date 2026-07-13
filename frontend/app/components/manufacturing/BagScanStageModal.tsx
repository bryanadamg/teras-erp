'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useData } from '../../context/DataContext';
import { useToast } from '../shared/Toast';
import ModalWrapper from '../shared/ModalWrapper';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 13, border: '1px solid #7f9db9',
    background: 'white', height: 28, padding: '0 6px', outline: 'none', boxSizing: 'border-box', width: '100%',
};
const xpBtn = (primary?: boolean): React.CSSProperties => primary ? {
    fontFamily: xpFont, fontSize: 11, padding: '2px 14px',
    background: 'linear-gradient(to bottom, #b0e8b0, #70c870)',
    border: '1px solid', borderColor: '#d0f0d0 #0a3e0a #0a3e0a #1a5e1a',
    cursor: 'pointer', fontWeight: 'bold', color: '#004000',
} : {
    fontFamily: xpFont, fontSize: 11, padding: '2px 10px',
    background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    cursor: 'pointer',
};

interface RequiredMaterial {
    item_id: string;
    item_code: string | null;
    item_name: string | null;
    attribute_value_ids: string[];
    required_qty: number;
    source_location_id: string | null;
    source_location_name: string | null;
    staged: number;
    shortfall: number;
    lot_tracked: boolean;
}

interface Props {
    wo: any;
    onClose: () => void;
    onStaged: (updatedWO: any) => void;
}

/**
 * Scan-to-stage: floor operator scans greige bag QR codes (each = one lot) to
 * stage them into a DYEING WO's input location — no manual lot typing. Each bag
 * label QR encodes the lot number, resolved via GET /batches/resolve. Whole lots
 * move (over-stage allowed, with a warning past the WO's required qty). Commits
 * through the standard POST /work-orders/{id}/stage with allow_overstage=true.
 */
export default function BagScanStageModal({ wo, onClose, onStaged }: Props) {
    const { authFetch } = useData() as any;
    const { showToast } = useToast();
    const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

    const [rows, setRows] = useState<RequiredMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);       // resolved batch objects
    const [scanValue, setScanValue] = useState('');
    const [cameraOn, setCameraOn] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const recentRef = useRef<Record<string, number>>({});   // code -> last-seen ms, debounce repeats
    const cartIdsRef = useRef<Set<string>>(new Set());       // resolved batch ids in cart (dedupe)

    const reqByItem = useMemo(() => {
        const m: Record<string, RequiredMaterial> = {};
        rows.forEach(r => { m[String(r.item_id)] = r; });
        return m;
    }, [rows]);

    // Required reference = remaining shortfall summed across this step's materials.
    const totalShortfall = useMemo(() => rows.reduce((s, r) => s + Math.max(0, r.shortfall), 0), [rows]);
    const cartKg = cart.reduce((s, b) => s + Number(b.remaining || 0), 0);
    const overRequired = totalShortfall > 0 && cartKg > totalShortfall + 1e-6;

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await authFetch(`${API_BASE}/work-orders/${wo.id}/required-materials`);
                const data: RequiredMaterial[] = res.ok ? await res.json() : [];
                if (alive) setRows(data);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [wo.id]);

    // Keep the scan input focused so a keyboard-wedge scanner always lands here.
    useEffect(() => {
        if (!cameraOn && !loading) inputRef.current?.focus();
    }, [cameraOn, loading, cart.length]);

    const beep = () => {
        try {
            const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 880; gain.gain.value = 0.08;
            osc.start(); osc.stop(ctx.currentTime + 0.08);
        } catch { /* noop */ }
    };

    const addScan = async (raw: string) => {
        const code = (raw || '').trim();
        if (!code) return;
        // Debounce identical reads (camera fires many frames of one bag).
        const now = Date.now();
        if (recentRef.current[code] && now - recentRef.current[code] < 1500) return;
        recentRef.current[code] = now;

        try {
            const res = await authFetch(`${API_BASE}/batches/resolve?number=${encodeURIComponent(code)}`);
            if (!res.ok) { showToast(`Lot "${code}" not found`, 'danger'); return; }
            const b = await res.json();
            if (cartIdsRef.current.has(b.id)) { showToast(`${b.batch_number} already scanned`, 'warning'); return; }
            if (b.quality_status === 'REJECTED') { showToast(`${b.batch_number} is REJECTED — skipped`, 'danger'); return; }
            if (!reqByItem[String(b.item_id)]) {
                showToast(`${b.batch_number} (${b.item_code || 'item'}) is not a material for this WO`, 'danger');
                return;
            }
            if (Number(b.remaining || 0) <= 0) { showToast(`${b.batch_number} has no stock remaining`, 'danger'); return; }
            cartIdsRef.current.add(b.id);
            setCart(prev => [...prev, b]);
            beep();
        } catch {
            showToast('Scan lookup failed', 'danger');
        }
    };

    const removeFromCart = (id: string) => {
        cartIdsRef.current.delete(id);
        setCart(prev => prev.filter(b => b.id !== id));
    };

    // Camera lifecycle
    useEffect(() => {
        if (!cameraOn) {
            scannerRef.current?.clear().catch(() => {});
            scannerRef.current = null;
            return;
        }
        const timer = setTimeout(() => {
            if (!document.getElementById('bag-scan-reader')) return;
            const scanner = new Html5QrcodeScanner('bag-scan-reader', {
                fps: 10,
                qrbox: (vw: number, vh: number) => {
                    const size = Math.max(180, Math.floor(Math.min(vw, vh) * 0.7));
                    return { width: size, height: size };
                },
                useBarCodeDetectorIfSupported: true,
                showTorchButtonIfSupported: true,
                videoConstraints: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 }, height: { ideal: 720 },
                    advanced: [{ focusMode: 'continuous' } as any],
                } as MediaTrackConstraints,
            }, false);
            scannerRef.current = scanner;
            scanner.render((decoded: string) => { addScan(decoded); }, () => {});
        }, 100);
        return () => { clearTimeout(timer); scannerRef.current?.clear().catch(() => {}); };
    }, [cameraOn]);

    const submit = async () => {
        if (!cart.length) { showToast('Scan at least one bag first', 'danger'); return; }
        const lines = cart.map(b => {
            const rr = reqByItem[String(b.item_id)];
            return {
                item_id: b.item_id,
                qty: Number(b.remaining || 0),
                source_location_id: b.location_id || rr?.source_location_id || null,
                batch_id: b.id,
                attribute_value_ids: rr?.attribute_value_ids || [],
            };
        });
        const missingSrc = lines.find(l => !l.source_location_id);
        if (missingSrc) {
            const b = cart.find(x => x.id === missingSrc.batch_id);
            showToast(`${b?.batch_number || 'A lot'} has no source location`, 'danger');
            return;
        }
        setSubmitting(true);
        try {
            const res = await authFetch(`${API_BASE}/work-orders/${wo.id}/stage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lines, allow_overstage: true }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                showToast(err?.detail || 'Staging failed', 'danger');
                return;
            }
            const updated = await res.json().catch(() => null);
            showToast(`Staged ${cart.length} bag${cart.length === 1 ? '' : 's'} (${cartKg.toFixed(2)} kg) to dyeing`, 'success');
            onStaged(updated);
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalWrapper
            isOpen
            onClose={onClose}
            title={`Scan Bags to Stage — ${wo.code || wo.name}`}
            modeless
            size="lg"
            footer={
                <>
                    <button style={xpBtn(false)} onClick={onClose} disabled={submitting}>Cancel</button>
                    <button style={xpBtn(true)} onClick={submit} disabled={submitting || loading || cart.length === 0}>
                        {submitting ? 'Staging...' : `Stage ${cart.length} Bag${cart.length === 1 ? '' : 's'}`}
                    </button>
                </>
            }
        >
            <div style={{ fontFamily: xpFont, fontSize: 11 }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>
                    Scan each bag to stage it into this dyeing WO&apos;s input location
                    (<b>{wo.input_location?.code || wo.input_location_id || 'no input location'}</b>).
                    Whole lots move — lot number is captured automatically.
                </div>

                {loading ? (
                    <div style={{ color: '#888', padding: 12 }}>Loading required materials...</div>
                ) : rows.length === 0 ? (
                    <div style={{ color: '#b00', padding: 12 }}>
                        This WO has no materials to stage (no routing step assigned, or step has no materials).
                    </div>
                ) : (
                    <>
                        {/* Scan input + camera toggle */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                            <input
                                ref={inputRef}
                                style={xpInput}
                                value={scanValue}
                                placeholder="Scan or type a lot number, then Enter…"
                                onChange={e => setScanValue(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addScan(scanValue);
                                        setScanValue('');
                                    }
                                }}
                                disabled={cameraOn}
                            />
                            <button style={{ ...xpBtn(false), whiteSpace: 'nowrap' }} onClick={() => setCameraOn(v => !v)}>
                                {cameraOn ? 'Stop Camera' : 'Use Camera'}
                            </button>
                        </div>

                        {cameraOn && (
                            <div style={{ marginBottom: 8 }}>
                                <div id="bag-scan-reader" style={{ width: '100%', maxWidth: 360, margin: '0 auto' }} />
                            </div>
                        )}

                        {/* Totals + over-stage warning */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                            <span>Bags: <b>{cart.length}</b></span>
                            <span>Total: <b>{cartKg.toFixed(2)} kg</b></span>
                            <span style={{ color: '#555' }}>Required: {totalShortfall.toFixed(2)} kg</span>
                        </div>
                        {overRequired && (
                            <div style={{ background: '#fff3cd', border: '1px solid #b8860b', color: '#7a5000', padding: '4px 8px', marginBottom: 8, fontSize: 10 }}>
                                Staged load ({cartKg.toFixed(2)} kg) exceeds the WO&apos;s required {totalShortfall.toFixed(2)} kg by{' '}
                                <b>{(cartKg - totalShortfall).toFixed(2)} kg</b>. All scanned bags will still be staged.
                            </div>
                        )}

                        {/* Cart */}
                        <div style={{ border: '1px solid #7f9db9', maxHeight: 300, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                                <thead>
                                    <tr style={{ background: '#d4d0c8', textAlign: 'left', position: 'sticky', top: 0 }}>
                                        <th style={{ padding: '3px 5px', width: 34 }}>#</th>
                                        <th style={{ padding: '3px 5px' }}>Lot</th>
                                        <th style={{ padding: '3px 5px' }}>Item</th>
                                        <th style={{ padding: '3px 5px' }}>Location</th>
                                        <th style={{ padding: '3px 5px', textAlign: 'right' }}>Kg</th>
                                        <th style={{ padding: '3px 5px', width: 30 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cart.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: 10, color: '#aaa', textAlign: 'center' }}>No bags scanned yet.</td></tr>
                                    ) : cart.map((b, i) => (
                                        <tr key={b.id} style={{ borderBottom: '1px solid #cfccc4' }}>
                                            <td style={{ padding: '3px 5px', color: '#888' }}>{i + 1}</td>
                                            <td style={{ padding: '3px 5px', fontFamily: 'monospace', fontWeight: 'bold' }}>{b.batch_number}</td>
                                            <td style={{ padding: '3px 5px' }}>{b.item_code || b.item_name || '—'}</td>
                                            <td style={{ padding: '3px 5px', color: '#0058e6' }}>{b.location_name || '—'}</td>
                                            <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 'bold' }}>{Number(b.remaining || 0).toFixed(2)}</td>
                                            <td style={{ padding: '3px 5px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => removeFromCart(b.id)}
                                                    style={{ ...xpBtn(false), padding: '0 5px', color: '#900' }}
                                                    title="Remove"
                                                >×</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </ModalWrapper>
    );
}
