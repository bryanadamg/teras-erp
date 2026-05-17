'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const xpFont = 'Tahoma, "Segoe UI", sans-serif';
const xpInput: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, border: '1px solid #7f9db9',
    background: 'white', height: 20, padding: '0 4px', outline: 'none', width: '100%',
    borderRadius: 0, boxSizing: 'border-box',
};
const xpLabel: React.CSSProperties = {
    fontFamily: xpFont, fontSize: 11, display: 'block', marginBottom: 2,
};

interface BomEntryState {
    bomId: string;
    sizeQtys: Record<string, string>;
    totalQty: string;
    attributeValueIds: string[];
    locked?: boolean;
    rawSoQtys?: Record<string, number>;
}

interface Props {
    boms: any[];
    items: any[];
    attributes: any[];
    locations: any[];
    onSave: (payload: any) => Promise<any>;
    onClose: () => void;
    initialBomId?: string;
    initialSizes?: Record<string, string>;
    initialTotalQty?: string;
    initialBomEntries?: Array<{
        bomId: string;
        sizeQtys: Record<string, string>;
        totalQty: string;
        attributeValueIds?: string[];
        locked?: boolean;
    }>;
    salesOrderId?: string;
    productionRuns?: any[];
}

function hasStandardSizes(bom: any): boolean {
    return (bom?.sizes || []).some((s: any) => s.size_id && !s.label);
}

function applyFormula(
    sizes: any[],
    rawQtys: Record<string, number>,
    tolerancePct: number
): Record<string, string> {
    const factor = 1 + tolerancePct / 100;
    const byName = (name: string) => {
        const s = sizes.find((s: any) => !s.label && s.size_name === name);
        return s ? (rawQtys[s.id] ?? 0) : 0;
    };
    const sRaw = byName('S');
    const mRaw = byName('M');
    const lRaw = byName('L');

    const result: Record<string, string> = {};
    for (const s of sizes) {
        const isStandard = s.size_id && !s.label;
        if (!isStandard) {
            const raw = rawQtys[s.id];
            result[s.id] = raw != null ? String(raw) : '';
            continue;
        }
        let qty: number;
        switch (s.size_name) {
            case 'S':  qty = 0; break;
            case 'M':  qty = (sRaw + mRaw) * 0.5 * factor; break;
            case 'L':  qty = ((sRaw + mRaw) * 0.5 + lRaw) * factor; break;
            default:   qty = (rawQtys[s.id] ?? 0) * factor; break;
        }
        result[s.id] = qty > 0 ? String(Math.ceil(qty)) : '';
    }
    return result;
}

function BomEntryRow({
    entry, index, boms, items, attributes, onChange, onRemove, canRemove,
}: {
    entry: BomEntryState;
    index: number;
    boms: any[];
    items: any[];
    attributes: any[];
    onChange: (updated: BomEntryState) => void;
    onRemove: () => void;
    canRemove: boolean;
}) {
    const selectedBom = boms.find((b: any) => b.id === entry.bomId) || null;
    const sizes = selectedBom?.sizes || [];

    const item = selectedBom ? items.find((it: any) => it.id === selectedBom.item_id) : null;
    const itemAttrIds: string[] = item?.attribute_ids?.map(String) || [];
    const bomAttrIds: string[] = selectedBom?.attribute_value_ids || [];
    const freeAttributes = !selectedBom ? [] : attributes.filter((attr: any) => {
        if (!attr.values?.length) return false;
        if (!itemAttrIds.includes(String(attr.id))) return false;
        return !(attr.values || []).some((v: any) => bomAttrIds.includes(v.id));
    });

    const handleAttrChange = (attr: any, valId: string) => {
        const attrValueIds: string[] = (attr.values || []).map((v: any) => v.id);
        const others = entry.attributeValueIds.filter((id: string) => !attrValueIds.includes(id));
        onChange({ ...entry, attributeValueIds: valId ? [...others, valId] : others });
    };

    return (
        <div style={{ border: '1px solid #aca899', borderRadius: 3, padding: '10px 8px 8px', background: '#f5f4ee', position: 'relative' }}>
            <span style={{ position: 'absolute', top: -8, left: 8, background: '#f5f4ee', padding: '0 4px', fontSize: 10, fontWeight: 'bold', color: '#000080' }}>
                BOM Entry {index + 1}
            </span>
            {canRemove && (
                <button
                    onClick={onRemove}
                    style={{ position: 'absolute', top: -8, right: 6, background: '#c84040', border: '1px solid #800', color: '#fff', fontSize: 9, padding: '1px 5px', cursor: 'pointer', fontFamily: xpFont }}
                >
                    Remove
                </button>
            )}
            <div style={{ marginBottom: 6 }}>
                <label style={xpLabel}>Product Recipe (BOM)</label>
                <select
                    style={{ ...xpInput, height: 20 }}
                    value={entry.bomId}
                    onChange={e => onChange({ ...entry, bomId: e.target.value, sizeQtys: {}, totalQty: '', attributeValueIds: [] })}
                    disabled={entry.locked}
                >
                    <option value="">-- Select a BOM --</option>
                    {boms.map((b: any) => (
                        <option key={b.id} value={b.id}>[{b.code}]  {b.item_name || b.item_code}</option>
                    ))}
                </select>
            </div>

            {freeAttributes.map((attr: any) => {
                const selectedValId = entry.attributeValueIds.find(
                    (id: string) => (attr.values || []).some((v: any) => v.id === id)
                ) || '';
                return (
                    <div key={attr.id} style={{ marginBottom: 6 }}>
                        <label style={xpLabel}>{attr.name}</label>
                        <select
                            style={{ ...xpInput, height: 20 }}
                            value={selectedValId}
                            onChange={e => handleAttrChange(attr, e.target.value)}
                        >
                            <option value="">-- None --</option>
                            {(attr.values || []).map((v: any) => (
                                <option key={v.id} value={v.id}>{v.value}</option>
                            ))}
                        </select>
                    </div>
                );
            })}

            {selectedBom && sizes.length > 0 && (
                <div>
                    <label style={{ ...xpLabel, fontWeight: 'bold', marginBottom: 4 }}>Qty per Size</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4 }}>
                        {sizes.map((s: any) => (
                            <div key={s.id}>
                                <label style={{ ...xpLabel, fontWeight: 'bold', fontSize: 10 }}>
                                    {s.label || s.size?.name || s.size_name || (s.target_measurement ? String(s.target_measurement) : `S${s.id.slice(0, 4)}`)}
                                </label>
                                <input
                                    type="number" min="0" style={xpInput} placeholder="0"
                                    value={entry.sizeQtys[s.id] || ''}
                                    onChange={e => onChange({ ...entry, sizeQtys: { ...entry.sizeQtys, [s.id]: e.target.value } })}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {selectedBom && sizes.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={xpLabel}>Total Quantity</label>
                    <input
                        type="number" min="0" style={{ ...xpInput, width: 100 }} placeholder="0"
                        value={entry.totalQty}
                        onChange={e => onChange({ ...entry, totalQty: e.target.value })}
                    />
                </div>
            )}
        </div>
    );
}

export default function ProductionRunModal({
    boms, items, attributes, locations, onSave, onClose,
    initialBomId, initialSizes, initialTotalQty, initialBomEntries, salesOrderId, productionRuns,
}: Props) {
    const [code, setCode] = useState('');
    const [locationCode, setLocationCode] = useState('');
    const [sourceLocationCode, setSourceLocationCode] = useState('');
    const [targetStart, setTargetStart] = useState('');
    const [targetEnd, setTargetEnd] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [tolerance, setTolerance] = useState<number>(0);

    const [bomEntries, setBomEntries] = useState<BomEntryState[]>(() => {
        if (initialBomEntries && initialBomEntries.length > 0) {
            return initialBomEntries.map(e => ({
                ...e,
                attributeValueIds: e.attributeValueIds || [],
                locked: true,
                rawSoQtys: Object.fromEntries(
                    Object.entries(e.sizeQtys).map(([k, v]) => [k, parseFloat(v) || 0])
                ),
            }));
        }
        if (initialBomId) {
            return [{
                bomId: initialBomId,
                sizeQtys: initialSizes || {},
                totalQty: initialTotalQty || '',
                attributeValueIds: [],
                locked: true,
                rawSoQtys: initialSizes
                    ? Object.fromEntries(Object.entries(initialSizes).map(([k, v]) => [k, parseFloat(v) || 0]))
                    : undefined,
            }];
        }
        return [{ bomId: '', sizeQtys: {}, totalQty: '', attributeValueIds: [] }];
    });

    useEffect(() => {
        if (initialBomEntries && initialBomEntries.length > 0) {
            setBomEntries(initialBomEntries.map(e => ({
                ...e,
                attributeValueIds: e.attributeValueIds || [],
                locked: true,
                rawSoQtys: Object.fromEntries(
                    Object.entries(e.sizeQtys).map(([k, v]) => [k, parseFloat(v) || 0])
                ),
            })));
        } else if (initialBomId) {
            setBomEntries([{
                bomId: initialBomId,
                sizeQtys: initialSizes || {},
                totalQty: initialTotalQty || '',
                attributeValueIds: [],
                locked: true,
                rawSoQtys: initialSizes
                    ? Object.fromEntries(Object.entries(initialSizes).map(([k, v]) => [k, parseFloat(v) || 0]))
                    : undefined,
            }]);
        }
    }, [initialBomEntries, initialBomId, initialSizes, initialTotalQty]);

    useEffect(() => {
        const firstBom = boms.find((b: any) => b.id === bomEntries[0]?.bomId);
        if (firstBom) {
            const item = firstBom.item_name || firstBom.item_code || 'ITEM';
            const base = `PR-${item.toUpperCase().replace(/\s+/g, '-').slice(0, 12)}`;
            const existingCodes = new Set((productionRuns || []).map((pr: any) => String(pr.code)));
            let n = 1;
            let candidate = `${base}-${String(n).padStart(3, '0')}`;
            while (existingCodes.has(candidate)) {
                n++;
                candidate = `${base}-${String(n).padStart(3, '0')}`;
            }
            setCode(candidate);
        }
    }, [bomEntries[0]?.bomId]);

    const showFormulaSection = bomEntries.some(e =>
        e.rawSoQtys && e.locked && e.bomId && hasStandardSizes(boms.find((b: any) => b.id === e.bomId))
    );

    const handleApplyFormula = () => {
        setBomEntries(prev => prev.map(entry => {
            if (!entry.rawSoQtys || !entry.locked || !entry.bomId) return entry;
            const bom = boms.find((b: any) => b.id === entry.bomId);
            if (!bom || !hasStandardSizes(bom)) return entry;
            return { ...entry, sizeQtys: applyFormula(bom.sizes, entry.rawSoQtys, tolerance) };
        }));
    };

    const addEntry = () => setBomEntries(prev => [...prev, { bomId: '', sizeQtys: {}, totalQty: '', attributeValueIds: [] }]);
    const removeEntry = (i: number) => setBomEntries(prev => prev.filter((_, idx) => idx !== i));
    const updateEntry = (i: number, updated: BomEntryState) =>
        setBomEntries(prev => prev.map((e, idx) => idx === i ? updated : e));

    const handleSave = async () => {
        if (!code || !locationCode) {
            setError('Code and Location are required.');
            return;
        }
        const validEntries = bomEntries.filter(e => e.bomId);
        if (!validEntries.length) {
            setError('At least one BOM must be selected.');
            return;
        }

        setError('');
        setIsSaving(true);
        try {
            const bom_entries = validEntries.map(entry => {
                const selectedBom = boms.find((b: any) => b.id === entry.bomId);
                const sizes = selectedBom?.sizes || [];
                const attribute_value_ids = entry.attributeValueIds.length > 0
                    ? entry.attributeValueIds
                    : undefined;
                if (sizes.length > 0) {
                    const sizeEntries = sizes
                        .filter((s: any) => parseFloat(entry.sizeQtys[s.id] || '0') > 0)
                        .map((s: any) => ({ bom_size_id: s.id, qty: parseFloat(entry.sizeQtys[s.id]) }));
                    return { bom_id: entry.bomId, sizes: sizeEntries, attribute_value_ids };
                }
                const qty = parseFloat(entry.totalQty || '0');
                return { bom_id: entry.bomId, total_qty: qty > 0 ? qty : undefined, attribute_value_ids };
            });

            const res = await onSave({
                code,
                bom_entries,
                location_code: locationCode,
                source_location_code: sourceLocationCode || undefined,
                target_start_date: targetStart || undefined,
                target_end_date: targetEnd || undefined,
                sales_order_id: salesOrderId || undefined,
            });
            if (res && !res.ok) {
                const err = await res.json().catch(() => ({}));
                setError(err.detail || 'Failed to create Production Run');
                return;
            }
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to create Production Run');
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 560, background: '#ece9d8', border: '2px solid #0a246a', fontFamily: xpFont, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: 'linear-gradient(to right, #0a246a, #a6caf0, #0a246a)', padding: '3px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 12, textShadow: '1px 1px 2px rgba(0,0,0,0.6)' }}>
                        New Production Run
                    </span>
                    <button onClick={onClose} style={{ width: 21, height: 21, background: 'linear-gradient(to bottom, #e06060, #b03030)', border: '1px solid #800', borderRadius: 2, cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 'bold' }}>x</button>
                </div>

                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: '80vh' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                            <label style={xpLabel}>Run Code</label>
                            <input style={xpInput} value={code} onChange={e => setCode(e.target.value)} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                            <label style={xpLabel}>Output Location</label>
                            <select style={{ ...xpInput, height: 20 }} value={locationCode} onChange={e => setLocationCode(e.target.value)}>
                                <option value="">Select...</option>
                                {locations.map((l: any) => <option key={l.id} value={l.code}>{l.name}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={xpLabel}>Source Location</label>
                            <select style={{ ...xpInput, height: 20 }} value={sourceLocationCode} onChange={e => setSourceLocationCode(e.target.value)}>
                                <option value="">Same as output</option>
                                {locations.map((l: any) => <option key={l.id} value={l.code}>{l.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                            <label style={xpLabel}>Target Start</label>
                            <input type="date" style={xpInput} value={targetStart} onChange={e => setTargetStart(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={xpLabel}>Target End</label>
                            <input type="date" style={xpInput} value={targetEnd} onChange={e => setTargetEnd(e.target.value)} />
                        </div>
                    </div>

                    {bomEntries.map((entry, i) => (
                        <BomEntryRow
                            key={i}
                            entry={entry}
                            index={i}
                            boms={boms}
                            items={items}
                            attributes={attributes}
                            onChange={updated => updateEntry(i, updated)}
                            onRemove={() => removeEntry(i)}
                            canRemove={bomEntries.length > 1 && !entry.locked}
                        />
                    ))}

                    {showFormulaSection && (
                        <div style={{ border: '1px solid #b0a890', borderRadius: 3, padding: '6px 8px', background: '#faf9f0' }}>
                            <div style={{ fontSize: 10, fontWeight: 'bold', color: '#5a4a00', marginBottom: 4 }}>
                                Size Absorption Formula (S absorbed into M/L)
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <label style={{ ...xpLabel, marginBottom: 0, whiteSpace: 'nowrap' }}>Tolerance %</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={10}
                                    step={0.5}
                                    style={{ ...xpInput, width: 60 }}
                                    value={tolerance}
                                    onChange={e => {
                                        const v = parseFloat(e.target.value);
                                        setTolerance(isNaN(v) ? 0 : Math.min(10, Math.max(0, v)));
                                    }}
                                />
                                <button
                                    onClick={handleApplyFormula}
                                    style={{ fontFamily: xpFont, fontSize: 11, padding: '2px 10px', background: 'linear-gradient(to bottom, #e8f0ff, #c0d0f0)', border: '1px solid', borderColor: '#d0d8f0 #4060a0 #4060a0 #d0d8f0', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    Apply Formula
                                </button>
                                <span style={{ fontSize: 9, color: '#666', lineHeight: 1.2 }}>
                                    S=0 | M=(S+M)/2 | L=(S+M)/2+L | XL+=ordered
                                </span>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={addEntry}
                        style={{ fontFamily: xpFont, fontSize: 11, padding: '2px 10px', background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer', alignSelf: 'flex-start' }}
                    >
                        + Add BOM
                    </button>

                    {error && <div style={{ fontSize: 10, color: '#a00', background: '#fff0f0', border: '1px solid #f0a0a0', padding: '4px 8px' }}>{error}</div>}
                </div>

                <div style={{ borderTop: '1px solid #aca899', padding: '6px 10px', display: 'flex', justifyContent: 'flex-end', gap: 6, background: '#ece9d8' }}>
                    <button onClick={onClose} style={{ fontFamily: xpFont, fontSize: 11, padding: '2px 10px', background: 'linear-gradient(to bottom, #f0efe6, #dddbd0)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving}
                        style={{ fontFamily: xpFont, fontSize: 11, padding: '2px 12px', background: 'linear-gradient(to bottom, #b0e8b0, #70c870)', border: '1px solid', borderColor: '#d0f0d0 #0a3e0a #0a3e0a #1a5e1a', cursor: 'pointer', fontWeight: 'bold', color: '#004000', opacity: isSaving ? 0.6 : 1 }}>
                        {isSaving ? 'Creating...' : 'Create Production Run'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
