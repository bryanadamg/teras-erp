'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { StatusChip, xpFont as XP_FONT, xpInput as xpInputBase } from '../shared/xpTheme';
import { toNum } from '../shared/format';
import { MOBILE_BG, MobilePanel, MobileScreenBar, MobileButton, MobileNotice } from './mobileTheme';
import { machinesOfCenterType, toMachineOptions } from '../shared/workCenterTree';
import { BoxRow, seedBoxRows, filledBoxRows, hasUnweighedBox, uomIsKg, boxAltTotal, boxAltPayload } from '../shared/packingBoxes';
import { orderBasePerAlt, altToBase, baseToAlt } from '../shared/altUnit';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';

const xpInput: React.CSSProperties = xpInputBase({ fontSize: 13, height: 'auto', padding: '6px 8px', width: '100%', boxSizing: 'border-box' });
const xpLabel: React.CSSProperties = { fontFamily: XP_FONT, fontSize: 11, color: '#333', display: 'block', marginBottom: 3 };

const num = toNum;

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
export default function PackingScanView({ authFetch, initialCode, onClose }: { authFetch: (url: string, options?: any) => Promise<Response>; initialCode?: string; onClose: () => void }) {
    const [po, setPo] = useState<any | null>(null);
    const [unit, setUnit] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [manualCode, setManualCode] = useState('');
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const scanLockRef = useRef(false);

    const [qty, setQty] = useState('');
    // Count in the order's alt selling unit, when it has one. The base qty above
    // stays the canonical figure — this only drives it.
    const [qtyAlt, setQtyAlt] = useState('');
    // One row per physical carton, seeded from the order's pack size. The packer
    // logs after the boxes are packed and weighed, so each row's scale reading is
    // required — it is the N.W. line on that carton's label, and the server
    // refuses to mint an unweighed carton.
    const [boxRows, setBoxRows] = useState<BoxRow[]>([]);
    const [sourceBatch, setSourceBatch] = useState('');
    const [operator, setOperator] = useState('');
    const [notes, setNotes] = useState('');
    const [lots, setLots] = useState<any[]>([]);
    // Machine this shift is packing on. Seeded from the order, so the packer only
    // touches it when they have moved to a different machine.
    const [workCenterId, setWorkCenterId] = useState('');
    const [machines, setMachines] = useState<any[]>([]);
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
            // Seed a row per carton the remaining qty implies; the packer corrects
            // the split and fills in each scale reading.
            setBoxRows(seedBoxRows(rem, num(found.pack_size)));
            return;
        }

        setError('Not a packing QR code. Expected PCK- (packing order) or PU- (carton).');
    }, [authFetch]);

    // Opened from the shared scanner: that screen already decoded the label, so
    // act on it here instead of making the packer scan the same card twice.
    const seededRef = useRef(false);
    useEffect(() => {
        if (!initialCode || seededRef.current) return;
        seededRef.current = true;
        resolveCode(initialCode);
    }, [initialCode, resolveCode]);

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

    // Work centers are not in scope on this screen (the mobile shell mounts no
    // DataContext domain load for them), so fetch the bounded list once a packing
    // order is open — same scoping rule as the desktop picker.
    useEffect(() => {
        if (!po) return;
        setWorkCenterId(String(po.work_center_id || ''));
        if (machines.length) return;
        (async () => {
            const res = await authFetch(`${API_BASE}/work-centers?limit=2000`);
            if (!res.ok) return;
            const d = await res.json();
            setMachines(Array.isArray(d) ? d : (d.items || []));
        })();
    }, [po, authFetch]); // eslint-disable-line react-hooks/exhaustive-deps

    // Alt selling unit of this order (Pic = a roll, Pcs = a cut piece). When the
    // order carries one the packer counts in it and every base figure follows —
    // same rule and same shared conversion as the desktop pack modal.
    const altUom = po?.uom2 || '';
    const altFactor = orderBasePerAlt(po);
    const hasAlt = !!(altUom && altFactor);

    const onQtyChange = (v: string) => {
        setQty(v);
        setBoxRows(prev => seedBoxRows(num(v), num(po?.pack_size), prev, hasAlt ? altFactor : null));
    };
    // Counting in the alt unit: the base qty follows the count, not the reverse.
    const onQtyAltChange = (v: string) => {
        setQtyAlt(v);
        const derived = altToBase(num(v), altFactor);
        if (derived !== null && num(v) > 0) onQtyChange(String(derived));
    };
    const updateBox = (i: number, patch: Partial<BoxRow>) =>
        setBoxRows(prev => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
    const addBox = () => setBoxRows(prev => [...prev, { qty: '', kg: '', alt: '' }]);
    const removeBox = (i: number) => setBoxRows(prev => prev.filter((_, idx) => idx !== i));

    // A typed count fills the box's base qty; a typed base qty only back-fills a
    // count that isn't there yet — on a kg item the qty ends up being the scale
    // reading, which must not turn a box of 12 pieces into 11.8.
    const setBoxAlt = (i: number, val: string) => {
        const derived = altToBase(num(val), altFactor);
        updateBox(i, { alt: val, ...(derived !== null && num(val) > 0 ? { qty: String(derived) } : {}) });
    };
    const setBoxQty = (i: number, val: string) => {
        const backfill = hasAlt && !(num(boxRows[i]?.alt) > 0) ? baseToAlt(num(val), altFactor) : null;
        updateBox(i, { qty: val, ...(backfill !== null ? { alt: String(backfill) } : {}) });
    };

    const boxes = filledBoxRows(boxRows);
    const boxTotal = boxes.reduce((s, b) => s + num(b.qty), 0);
    const boxMismatch = num(qty) > 0 && Math.abs(boxTotal - num(qty)) > 1e-3;
    // Weighed in kg already — the carton qty is its net weight, so there is one
    // input, not two that could disagree on the label. See shared/packingBoxes.
    const qtyIsWeight = uomIsKg(po?.item_uom);
    const weightsMissing = !qtyIsWeight && hasUnweighedBox(boxRows);
    const weightTotal = boxes.reduce((s, b) => s + (qtyIsWeight ? num(b.qty) : num(b.kg)), 0);
    const altTotal = hasAlt ? boxAltTotal(boxRows) : 0;

    const logPack = async () => {
        const label = (po?.package_label || 'carton').toLowerCase();
        if (num(qty) <= 0) { setError('Enter a quantity to pack.'); return; }
        if (!boxes.length) { setError(`At least one ${label} is required.`); return; }
        if (boxMismatch) {
            setError(`${po.package_label}s total ${boxTotal.toFixed(2)} but ${num(qty).toFixed(2)} is being packed.`);
            return;
        }
        if (weightsMissing) { setError(`Weigh every ${label} — the label prints its net weight.`); return; }
        setLogging(true);
        setError(null);
        try {
            const res = await authFetch(`${API_BASE}/packing/${po.id}/complete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qty: num(qty),
                    boxes: boxes.map(b => num(b.qty)),
                    box_weights: boxes.map(b => (qtyIsWeight ? num(b.qty) : num(b.kg))),
                    // Null per carton where no count was typed — the server derives
                    // just that one rather than every carton's.
                    box_alt_qtys: hasAlt ? boxAltPayload(boxRows) : null,
                    source_batch_id: sourceBatch || null,
                    work_center_id: workCenterId || null,
                    operator: operator || null,
                    notes: notes || null,
                }),
            });
            if (res.ok) {
                const fresh = await res.json();
                const before = new Set((po.packed_units || []).map((u: any) => String(u.id)));
                setLastCartons((fresh.packed_units || []).filter((u: any) => !before.has(String(u.id))));
                setPo(fresh);
                setQty(''); setQtyAlt(''); setNotes(''); setBoxRows([]);
                playBeep();
            } else {
                const e = await res.json().catch(() => ({}));
                setError(e.detail || 'Packing failed.');
            }
        } finally { setLogging(false); }
    };

    const machineOptions = toMachineOptions(machinesOfCenterType(machines, 'PACKING'));

    const reset = () => { setPo(null); setUnit(null); setError(null); setLastCartons([]); setManualCode(''); };

    return (
        <div style={{ fontFamily: XP_FONT, background: MOBILE_BG, minHeight: 'var(--app-vh)', padding: 10 }}>
            <MobileScreenBar
                icon="bi-box2-fill"
                title="Packing Scanner"
                right={<MobileButton compact icon="bi-arrow-left" onClick={onClose}>Back</MobileButton>}
            />

            {error && (
                <MobileNotice tone="red">{error}</MobileNotice>
            )}

            {!po && !unit && (
                <>
                    <MobilePanel icon="bi-camera-fill" title="Scan" style={{ marginBottom: 10 }}>
                        <div id="packing-reader" style={{ width: '100%' }} />
                    </MobilePanel>
                    <MobilePanel icon="bi-keyboard-fill" title="Or type a code">
                        <input
                            style={xpInput}
                            placeholder="PCK-00001 or PU-20260802-0001"
                            value={manualCode}
                            onChange={e => setManualCode(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') resolveCode(manualCode); }}
                        />
                        <MobileButton tone="launch" icon="bi-arrow-return-left" onClick={() => resolveCode(manualCode)} style={{ marginTop: 8 }}>
                            Open
                        </MobileButton>
                    </MobilePanel>
                </>
            )}

            {unit && (
                <MobilePanel icon="bi-box2-fill" title={`Carton ${unit.batch_number}`}>
                    <Row label="Item" value={`${unit.item_name || ''} (${unit.item_code || ''})`} />
                    <Row label="Carton no." value={String(unit.package_no ?? '—')} />
                    <Row label="Qty in stock" value={num(unit.qty).toLocaleString()} />
                    <Row label="Location" value={unit.location_name || '—'} />
                    <Row label="Packing order" value={unit.packing_order_code || '—'} />
                    <Row label="Quality" value={unit.quality_status} />
                    <MobileButton icon="bi-upc-scan" onClick={reset} style={{ marginTop: 10 }}>Scan another</MobileButton>
                </MobilePanel>
            )}

            {po && (
                <>
                    <MobilePanel
                        icon="bi-clipboard-check-fill"
                        title={po.code}
                        right={<StatusChip status={po.status} />}
                        style={{ marginBottom: 10 }}
                    >
                        <Row label="Item" value={`${po.item_name || ''} (${po.item_code || ''})`} />
                        <Row label="Colour" value={po.color_name || '—'} />
                        <Row label="Sales order" value={po.sales_order_code || 'to stock'} />
                        <Row label="Target" value={`${num(po.qty_target).toLocaleString()} ${po.item_uom || ''}`} />
                        <Row label="Packed" value={`${num(po.qty_packed).toLocaleString()} · ${po.package_count || 0} ${(po.package_label || 'carton').toLowerCase()}s`} />
                        <Row label="Machine" value={po.work_center_name || 'not assigned'} />
                    </MobilePanel>

                    {lastCartons.length > 0 && (
                        <MobileNotice tone="green">
                            <strong>Packed:</strong>
                            {lastCartons.map((u: any) => (
                                <div key={u.id}>
                                    #{u.package_no} · {u.batch_number} ·{' '}
                                    {u.alt_qty != null && altUom ? `${num(u.alt_qty)} ${altUom} · ` : ''}
                                    {num(u.qty).toLocaleString()}
                                </div>
                            ))}
                            <div style={{ marginTop: 4, fontSize: 11 }}>Print these labels from the desktop Packing Orders screen.</div>
                        </MobileNotice>
                    )}

                    <MobilePanel icon="bi-pencil-square" title="Log packing">
                        {hasAlt && (
                            <>
                                <label style={xpLabel}>
                                    Qty packed ({altUom})
                                    <span style={{ fontWeight: 'normal', color: '#777' }}>
                                        {' '}— 1 {altUom} = {altFactor} {po.item_uom || ''}
                                    </span>
                                </label>
                                <input type="number" min={0} style={xpInput} value={qtyAlt}
                                    onChange={e => onQtyAltChange(e.target.value)} />
                            </>
                        )}
                        <label style={{ ...xpLabel, marginTop: hasAlt ? 8 : 0 }}>
                            Qty packed{hasAlt ? ` (${po.item_uom || 'base'})` : ''}
                        </label>
                        <input type="number" min={0} style={xpInput} value={qty} onChange={e => onQtyChange(e.target.value)} />
                        <label style={{ ...xpLabel, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>
                                {po.package_label || 'Carton'}s packed &amp; weighed
                                {qtyIsWeight && (
                                    <span style={{ fontWeight: 'normal', color: '#777' }}>
                                        {' '}— qty is the net weight
                                    </span>
                                )}
                            </span>
                            <MobileButton compact icon="bi-plus-lg" onClick={addBox}>Add</MobileButton>
                        </label>
                        {boxRows.length === 0 && (
                            <div style={{ fontSize: 11, color: '#777', padding: '2px 0' }}>
                                Enter a quantity to generate {(po.package_label || 'carton').toLowerCase()}s.
                            </div>
                        )}
                        {boxRows.map((b, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: '#777', width: 22 }}>#{i + 1}</span>
                                {hasAlt && (
                                    <input type="number" min={0} step="any" style={{ ...xpInput, flex: 1 }}
                                        placeholder={altUom} value={b.alt}
                                        onChange={e => setBoxAlt(i, e.target.value)} />
                                )}
                                <input type="number" min={0} step="any" style={{ ...xpInput, flex: 1 }}
                                    value={b.qty} onChange={e => setBoxQty(i, e.target.value)} />
                                {!qtyIsWeight && (
                                    <input type="number" min={0} step="any" required
                                        style={{ ...xpInput, flex: 1, background: num(b.kg) > 0 ? '#fff' : '#fffbe6' }}
                                        placeholder="net wt kg" value={b.kg} onChange={e => updateBox(i, { kg: e.target.value })} />
                                )}
                                <MobileButton compact tone="danger" icon="bi-x-lg" onClick={() => removeBox(i)} />
                            </div>
                        ))}
                        {boxRows.length > 0 && (
                            <div style={{ fontSize: 11, color: boxMismatch || weightsMissing ? '#7a4a00' : '#0a3e0a', marginTop: 2 }}>
                                {boxMismatch
                                    ? `Boxed ${boxTotal.toFixed(2)} of ${num(qty).toFixed(2)}`
                                    : weightsMissing
                                        ? `Weigh every ${(po.package_label || 'carton').toLowerCase()}`
                                        : `${boxes.length} ${(po.package_label || 'carton').toLowerCase()}s${hasAlt ? ` · ${altTotal.toLocaleString()} ${altUom}` : ''} · ${weightTotal.toFixed(2)} kg`}
                            </div>
                        )}
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
                        {machineOptions.length > 0 && (
                            <>
                                <label style={{ ...xpLabel, marginTop: 8 }}>Machine</label>
                                <select style={xpInput} value={workCenterId} onChange={e => setWorkCenterId(e.target.value)}>
                                    <option value="">— none —</option>
                                    {machineOptions.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </>
                        )}
                        <label style={{ ...xpLabel, marginTop: 8 }}>Operator</label>
                        <input style={xpInput} value={operator} onChange={e => setOperator(e.target.value)} />
                        <label style={{ ...xpLabel, marginTop: 8 }}>Notes</label>
                        <input style={xpInput} value={notes} onChange={e => setNotes(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <MobileButton icon="bi-upc-scan" onClick={reset}>Scan another</MobileButton>
                            <MobileButton tone="create" icon="bi-box-seam" disabled={logging} onClick={logPack} style={{ flex: 1 }}>
                                {logging ? 'Packing...' : 'Pack'}
                            </MobileButton>
                        </div>
                    </MobilePanel>
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
