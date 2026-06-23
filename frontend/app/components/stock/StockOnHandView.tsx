import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSortable, SortMark } from '../shared/xpTheme';
import { useToast } from '../shared/Toast';

interface StockOnHandViewProps {
    locations: any[];
    stockBalance: any[];
    attributes: any[];
    onRefresh: () => void;
    authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
    apiBase: string;
}

const UNCAT = '__uncat__';

export default function StockOnHandView({ locations, stockBalance, attributes, onRefresh, authFetch, apiBase }: StockOnHandViewProps) {
    const { uiStyle } = useTheme();
    const { t } = useLanguage();
    const { showToast } = useToast();
    const classic = uiStyle === 'classic';

    const [batches, setBatches] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [itemFilter, setItemFilter] = useState('');

    // Transfer modal state
    const [transferTarget, setTransferTarget] = useState<any>(null);
    const [transferToLoc, setTransferToLoc] = useState('');
    const [transferQty, setTransferQty] = useState('');
    const [transferCones, setTransferCones] = useState('');
    const [transferBoxes, setTransferBoxes] = useState('');
    const [transferDrums, setTransferDrums] = useState('');
    const [transferring, setTransferring] = useState(false);

    const [rebuilding, setRebuilding] = useState(false);
    const handleRebuild = async () => {
        if (rebuilding) return;
        setRebuilding(true);
        try {
            const res = await authFetch(`${apiBase}/stock/balances/rebuild`, { method: 'POST' });
            if (res.ok) { showToast('Stock balances rebuilt from ledger', 'success'); onRefresh(); }
            else { showToast(`Rebuild failed (HTTP ${res.status})`, 'danger'); }
        } catch { showToast('Rebuild failed — network error', 'danger'); }
        finally { setRebuilding(false); }
    };

    const openTransfer = (bal: any) => {
        setTransferTarget(bal);
        setTransferToLoc('');
        setTransferQty(String(bal.qty));
        // Default packaging counts to the full holding; operator trims as needed.
        setTransferCones(bal.qty_cones ? String(bal.qty_cones) : '');
        setTransferBoxes(bal.qty_boxes ? String(bal.qty_boxes) : '');
        setTransferDrums(bal.qty_drums ? String(bal.qty_drums) : '');
    };

    const handleTransfer = async () => {
        if (!transferTarget) return;
        const qty = parseFloat(transferQty);
        if (!qty || qty <= 0) { showToast('Enter a positive quantity', 'danger'); return; }
        if (!transferToLoc) { showToast('Select a destination location', 'danger'); return; }
        setTransferring(true);
        try {
            const res = await authFetch(`${apiBase}/stock/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: transferTarget.item_id,
                    from_location_id: transferTarget.location_id,
                    to_location_id: transferToLoc,
                    qty,
                    batch_id: transferTarget.batch_key || null,
                    attribute_value_ids: transferTarget.attribute_value_ids || [],
                    qty_cones: transferCones ? parseInt(transferCones, 10) : null,
                    qty_boxes: transferBoxes ? parseInt(transferBoxes, 10) : null,
                    qty_drums: transferDrums ? parseInt(transferDrums, 10) : null,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Transfer failed');
            }
            showToast('Transfer recorded', 'success');
            setTransferTarget(null);
            onRefresh();
        } catch (err: any) {
            showToast(err.message, 'danger');
        } finally {
            setTransferring(false);
        }
    };

    useEffect(() => {
        authFetch(`${apiBase}/batches?limit=500`)
            .then(r => r.ok ? r.json() : [])
            .then(setBatches)
            .catch(() => {});
    }, [apiBase]);

    const batchMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const b of batches) m[b.id] = b.batch_number;
        return m;
    }, [batches]);

    const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || id;

    const locMap = useMemo(() => {
        const m: Record<string, any> = {};
        for (const l of (locations || [])) m[l.id] = l;
        return m;
    }, [locations]);
    // A location's parent warehouse.
    const getWarehouseId = (locId: string): string | null => locMap[locId]?.parent_id || null;
    const getWarehouseName = (locId: string): string => locMap[locId]?.parent_name || '';

    // Top-level locations (warehouses/areas) for the filter dropdown.
    const warehouses = useMemo(
        () => (locations || []).filter((l: any) => !l.parent_id).sort((a: any, b: any) => a.name.localeCompare(b.name)),
        [locations]
    );

    // Location dropdown narrows to the chosen warehouse.
    const locationOptions = useMemo(() => {
        const ls = [...(locations || [])].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        if (!warehouseFilter) return ls;
        if (warehouseFilter === UNCAT) return ls.filter((l: any) => !l.parent_id);
        return ls.filter((l: any) => l.parent_id === warehouseFilter);
    }, [locations, warehouseFilter]);

    const onWarehouseChange = (val: string) => {
        setWarehouseFilter(val);
        if (val && locationFilter) {
            const wid = getWarehouseId(locationFilter);
            const matches = val === UNCAT ? !wid : wid === val;
            if (!matches) setLocationFilter('');
        }
    };

    const getAttrValueName = (valId: string) => {
        for (const attr of attributes) {
            const v = attr.values?.find((v: any) => v.id === valId);
            if (v) return v.value;
        }
        return valId;
    };

    // Packaging counts (no UOM conversion) — show only nonzero units.
    const pkgParts = (bal: any): { n: number; label: string }[] => {
        const out: { n: number; label: string }[] = [];
        const c = bal.qty_cones || 0, b = bal.qty_boxes || 0, d = bal.qty_drums || 0;
        if (c) out.push({ n: c, label: c === 1 || c === -1 ? 'cone' : 'cones' });
        if (b) out.push({ n: b, label: b === 1 || b === -1 ? 'box' : 'boxes' });
        if (d) out.push({ n: d, label: d === 1 || d === -1 ? 'drum' : 'drums' });
        return out;
    };
    const pkgTotal = (bal: any) => Math.abs(bal.qty_cones || 0) + Math.abs(bal.qty_boxes || 0) + Math.abs(bal.qty_drums || 0);

    const filtered = useMemo(() => {
        const s = search.toLowerCase();
        return (stockBalance || []).filter((bal: any) => {
            if (locationFilter && bal.location_id !== locationFilter) return false;
            if (warehouseFilter) {
                const wid = getWarehouseId(bal.location_id);
                if (warehouseFilter === UNCAT) { if (wid) return false; }
                else if (wid !== warehouseFilter) return false;
            }
            if (itemFilter && bal.item_id !== itemFilter) return false;
            if (!s) return true;
            const name = (bal.item_name || '').toLowerCase();
            const code = (bal.item_code || '').toLowerCase();
            const itemCat = (bal.item_category_name || '').toLowerCase();
            const loc = (bal.location_name || getLocationName(bal.location_id)).toLowerCase();
            const wh = getWarehouseName(bal.location_id).toLowerCase();
            const batch = bal.batch_key ? (batchMap[bal.batch_key] || bal.batch_key).toLowerCase() : '';
            return name.includes(s) || code.includes(s) || itemCat.includes(s) || loc.includes(s) || wh.includes(s) || batch.includes(s);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stockBalance, search, locationFilter, warehouseFilter, itemFilter, batchMap, locMap]);

    const negativeCount = filtered.filter((b: any) => b.qty < 0).length;

    const sortCols = useMemo(() => ({
        item:        (b: any) => b.item_name || b.item_code,
        itemCategory: (b: any) => b.item_category_name || '',
        location: (b: any) => b.location_name || getLocationName(b.location_id),
        warehouse: (b: any) => getWarehouseName(b.location_id) || '',
        batch:    (b: any) => b.batch_key ? (batchMap[b.batch_key] || b.batch_key) : null,
        qty:      (b: any) => b.qty,
        packaging: (b: any) => pkgTotal(b),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [batchMap, locations, locMap]);
    const { sorted: sortedRows, sort, toggle: toggleSort } = useSortable(filtered, sortCols);

    const balanceItems = useMemo(() => {
        const seen = new Set<string>();
        const result: { id: string; name: string }[] = [];
        for (const bal of (stockBalance || [])) {
            if (!seen.has(bal.item_id)) {
                seen.add(bal.item_id);
                result.push({ id: bal.item_id, name: bal.item_name || bal.item_id });
            }
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [stockBalance]);

    // ── XP style helpers ─────────────────────────────────────────────────────
    const xpFont = 'Tahoma, "Segoe UI", sans-serif';
    const xpBevel: React.CSSProperties = {
        border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
        boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0,
    };
    const xpTitleBar: React.CSSProperties = {
        background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#ffffff',
        fontFamily: xpFont, fontSize: '12px', fontWeight: 'bold',
        padding: '4px 8px', borderBottom: '1px solid #003080',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '26px',
    };
    const xpToolbar: React.CSSProperties = {
        background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898',
        padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const,
    };
    const xpInput: React.CSSProperties = {
        fontFamily: xpFont, fontSize: '11px', border: '1px solid #7f9db9',
        boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px',
        background: '#ffffff', color: '#000000', height: '20px', outline: 'none',
    };
    const xpSelect: React.CSSProperties = { ...xpInput, height: '22px' };
    const xpTableHeader: React.CSSProperties = {
        background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
        fontSize: '10px', fontWeight: 'bold', color: '#000000', fontFamily: xpFont,
        padding: '3px 8px', position: 'sticky' as const, top: 0,
    };
    const xpBtn = (extra: any = {}): React.CSSProperties => ({
        fontFamily: xpFont, fontSize: '11px', padding: '2px 10px', cursor: 'pointer',
        background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid',
        borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000000', borderRadius: 0, ...extra,
    });
    const xpSep: React.CSSProperties = {
        width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0,
    };

    const renderRow = (bal: any, i: number) => {
        const batchLabel = bal.batch_key ? (batchMap[bal.batch_key] || bal.batch_key) : '-';
        const qtyColor = bal.qty < 0 ? '#c00000' : '#00008b';

        if (classic) {
            return (
                <tr key={`${bal.item_id}-${bal.location_id}-${bal.batch_key}-${i}`}
                    style={{ background: i % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' }}>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#000' }}>{bal.item_name}</div>
                        <div style={{ fontSize: '10px', color: '#666', fontVariant: 'all-small-caps' }}>{bal.item_code}</div>
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px' }}>
                        {bal.item_category_name ? (
                            <span style={{ background: '#e4eef0', border: '1px solid #8fb3bb', padding: '0 5px', fontSize: '10px', color: '#2a464a' }}>
                                {bal.item_category_name}
                            </span>
                        ) : (
                            <span style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>—</span>
                        )}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px', color: '#000' }}>
                        {bal.location_name || getLocationName(bal.location_id)}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px' }}>
                        {getWarehouseName(bal.location_id) ? (
                            <span style={{ background: '#eef0e4', border: '1px solid #b7bb8f', padding: '0 5px', fontSize: '10px', color: '#4a4a2a' }}>
                                {getWarehouseName(bal.location_id)}
                            </span>
                        ) : (
                            <span style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>—</span>
                        )}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px' }}>
                        {bal.batch_key ? (
                            <span style={{ background: '#fff8dc', border: '1px solid #c8a000', padding: '0 5px', fontSize: '10px', color: '#5a3c00' }}>
                                {batchLabel}
                            </span>
                        ) : (
                            <span style={{ fontSize: '10px', color: '#999', fontStyle: 'italic' }}>-</span>
                        )}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {bal.attribute_value_ids?.length > 0 ? (
                                bal.attribute_value_ids.map((vid: string) => (
                                    <span key={vid} style={{ background: '#dde8f5', border: '1px solid #7f9db9', padding: '0 4px', fontFamily: xpFont, fontSize: '10px', color: '#333' }}>
                                        {getAttrValueName(vid)}
                                    </span>
                                ))
                            ) : (
                                <span style={{ fontFamily: xpFont, fontSize: '10px', color: '#888', fontStyle: 'italic' }}>Standard</span>
                            )}
                        </div>
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', fontWeight: 'bold', color: qtyColor, whiteSpace: 'nowrap' }}>
                        {bal.qty}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', color: '#666', whiteSpace: 'nowrap' }}>
                        {bal.item_uom || ''}
                    </td>
                    <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '10px', whiteSpace: 'nowrap' }}>
                        {pkgParts(bal).length === 0
                            ? <span style={{ color: '#999' }}>-</span>
                            : pkgParts(bal).map((p, idx) => (
                                <span key={idx} style={{ color: p.n < 0 ? '#c00000' : '#5a3c00' }}>
                                    {idx > 0 ? ' / ' : ''}{p.n} {p.label}
                                </span>
                            ))}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', color: '#444', whiteSpace: 'nowrap' }}>
                        {bal.item_ends != null ? bal.item_ends : ''}
                    </td>
                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        {bal.qty > 0 && (
                            <button style={xpBtn({ fontSize: '10px', padding: '1px 6px' })} onClick={() => openTransfer(bal)} title="Transfer to another location">
                                Move
                            </button>
                        )}
                    </td>
                </tr>
            );
        }

        return (
            <tr key={`${bal.item_id}-${bal.location_id}-${bal.batch_key}-${i}`}>
                <td>
                    <div className="fw-medium">{bal.item_name}</div>
                    <small className="text-muted font-monospace">{bal.item_code}</small>
                </td>
                <td>
                    {bal.item_category_name ? (
                        <span className="badge bg-info-subtle text-info-emphasis">{bal.item_category_name}</span>
                    ) : (
                        <span className="text-muted">—</span>
                    )}
                </td>
                <td>{bal.location_name || getLocationName(bal.location_id)}</td>
                <td>
                    {getWarehouseName(bal.location_id) ? (
                        <span className="badge bg-secondary-subtle text-secondary-emphasis">{getWarehouseName(bal.location_id)}</span>
                    ) : (
                        <span className="text-muted">—</span>
                    )}
                </td>
                <td>
                    {bal.batch_key ? (
                        <span className="badge bg-warning text-dark">{batchLabel}</span>
                    ) : (
                        <span className="text-muted">-</span>
                    )}
                </td>
                <td>
                    {bal.attribute_value_ids?.length > 0 ? (
                        bal.attribute_value_ids.map((vid: string) => (
                            <span key={vid} className="badge bg-info text-dark me-1">{getAttrValueName(vid)}</span>
                        ))
                    ) : (
                        <span className="text-muted small">Standard</span>
                    )}
                </td>
                <td className="text-end fw-bold" style={{ color: qtyColor, whiteSpace: 'nowrap' }}>{bal.qty}</td>
                <td className="text-muted small" style={{ whiteSpace: 'nowrap' }}>{bal.item_uom || ''}</td>
                <td className="small" style={{ whiteSpace: 'nowrap' }}>
                    {pkgParts(bal).length === 0
                        ? <span className="text-muted">-</span>
                        : pkgParts(bal).map((p, idx) => (
                            <span key={idx} className={p.n < 0 ? 'text-danger' : ''}>
                                {idx > 0 ? ' / ' : ''}{p.n} {p.label}
                            </span>
                        ))}
                </td>
                <td className="text-end small" style={{ whiteSpace: 'nowrap' }}>{bal.item_ends != null ? bal.item_ends : ''}</td>
                <td>
                    {bal.qty > 0 && (
                        <button className="btn btn-sm btn-outline-primary py-0" onClick={() => openTransfer(bal)} title="Transfer to another location">
                            Move
                        </button>
                    )}
                </td>
            </tr>
        );
    };

    const transferModal = transferTarget && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 20200 }}>
            <div className="modal-dialog modal-dialog-centered modal-sm">
                <div className="modal-content" style={classic ? { ...xpBevel, borderRadius: 0 } : {}}>
                    {classic ? (
                        <div style={xpTitleBar}>
                            <span>Transfer Stock</span>
                            <span style={{ cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setTransferTarget(null)}>X</span>
                        </div>
                    ) : (
                        <div className="modal-header">
                            <h6 className="modal-title">Transfer Stock</h6>
                            <button className="btn-close" onClick={() => setTransferTarget(null)} />
                        </div>
                    )}
                    <div style={{ padding: 12, fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : undefined }}>
                        <div style={{ marginBottom: 8 }}>
                            <strong>{transferTarget.item_name}</strong>
                            <div style={{ fontSize: 10, color: '#666' }}>
                                From: {transferTarget.location_name || getLocationName(transferTarget.location_id)}
                                {transferTarget.batch_key ? ` · Lot: ${batchMap[transferTarget.batch_key] || transferTarget.batch_key}` : ''}
                                {' · '}Available: {transferTarget.qty} {transferTarget.item_uom || ''}
                            </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Destination</label>
                            <select
                                style={classic ? { ...xpSelect, width: '100%' } : undefined}
                                className={classic ? '' : 'form-select form-select-sm'}
                                value={transferToLoc}
                                onChange={e => setTransferToLoc(e.target.value)}
                            >
                                <option value="">— select location —</option>
                                {locations
                                    .filter((l: any) => l.id !== transferTarget.location_id && !l.has_children)
                                    .map((l: any) => (
                                        <option key={l.id} value={l.id}>{l.parent_name ? `${l.parent_name} / ${l.name}` : l.name}</option>
                                    ))}
                            </select>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>Quantity</label>
                            <input
                                type="number" min="0.0001" step="any"
                                style={classic ? { ...xpInput, width: '100%' } : undefined}
                                className={classic ? '' : 'form-control form-control-sm'}
                                value={transferQty}
                                onChange={e => setTransferQty(e.target.value)}
                            />
                        </div>
                        <div style={{ marginBottom: 4 }}>
                            <label style={{ display: 'block', marginBottom: 2 }} className={classic ? '' : 'form-label small text-muted'}>
                                Packaging to move <span style={{ color: '#888', fontWeight: 'normal' }}>(optional)</span>
                            </label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {([
                                    ['Cones', transferCones, setTransferCones],
                                    ['Boxes', transferBoxes, setTransferBoxes],
                                    ['Drums', transferDrums, setTransferDrums],
                                ] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                                    <div key={lbl} style={{ flex: 1 }}>
                                        <input
                                            type="number" min="0" step="1" placeholder={lbl}
                                            title={lbl}
                                            style={classic ? { ...xpInput, width: '100%' } : undefined}
                                            className={classic ? '' : 'form-control form-control-sm'}
                                            value={val}
                                            onChange={e => set(e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div style={{ padding: '6px 12px', display: 'flex', gap: 6, justifyContent: 'flex-end', borderTop: '1px solid #c0c0c0' }}>
                        <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-secondary'} onClick={() => setTransferTarget(null)}>Cancel</button>
                        <button style={classic ? xpBtn() : undefined} className={classic ? '' : 'btn btn-sm btn-primary'} onClick={handleTransfer} disabled={transferring}>
                            {transferring ? 'Moving...' : 'Transfer'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    if (classic) {
        return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ ...xpBevel, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={xpTitleBar}>
                        <span><i className="bi bi-boxes" style={{ marginRight: 6 }} />{t('stock_on_hand') || 'Stock On-Hand'}</span>
                        <span style={{ fontSize: '10px', opacity: 0.85 }}>{filtered.length} records</span>
                    </div>
                    <div style={xpToolbar}>
                        <i className="bi bi-search" style={{ fontSize: '11px', color: '#666' }} />
                        <input
                            style={{ ...xpInput, width: 180 }}
                            placeholder="Search item, location, lot..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <div style={xpSep} />
                        <select style={{ ...xpSelect, width: 160 }} value={warehouseFilter} onChange={e => onWarehouseChange(e.target.value)}>
                            <option value="">All Warehouses</option>
                            {warehouses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            <option value={UNCAT}>No Warehouse</option>
                        </select>
                        <select style={{ ...xpSelect, width: 150 }} value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                            <option value="">All Locations</option>
                            {locationOptions.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <select style={{ ...xpSelect, width: 180 }} value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
                            <option value="">All Items</option>
                            {balanceItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <div style={xpSep} />
                        <button style={xpBtn()} onClick={onRefresh} title="Refresh">
                            <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
                        </button>
                        <button style={xpBtn()} onClick={handleRebuild} disabled={rebuilding} title="Recompute stock balances from the ledger (use if balances look stale)">
                            <i className="bi bi-arrow-repeat" style={{ marginRight: 4 }} />{rebuilding ? 'Rebuilding...' : 'Rebuild'}
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff', maxHeight: 'calc(100vh - 200px)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer' }} onClick={() => toggleSort('item')} title="Sort">Item<SortMark sort={sort} colKey="item" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer' }} onClick={() => toggleSort('itemCategory')} title="Sort">Item Category<SortMark sort={sort} colKey="itemCategory" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer' }} onClick={() => toggleSort('location')} title="Sort">{t('locations') || 'Location'}<SortMark sort={sort} colKey="location" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer' }} onClick={() => toggleSort('warehouse')} title="Sort">Warehouse<SortMark sort={sort} colKey="warehouse" /></th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer' }} onClick={() => toggleSort('batch')} title="Sort">Lot<SortMark sort={sort} colKey="batch" /></th>
                                    <th style={xpTableHeader}>{t('attributes') || 'Attributes'}</th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('qty')} title="Sort">{t('qty') || 'Qty'}<SortMark sort={sort} colKey="qty" /></th>
                                    <th style={xpTableHeader}>UOM</th>
                                    <th style={{ ...xpTableHeader, cursor: 'pointer' }} onClick={() => toggleSort('packaging')} title="Sort">Packaging<SortMark sort={sort} colKey="packaging" /></th>
                                    <th style={{ ...xpTableHeader, textAlign: 'right' }}>Ends</th>
                                    <th style={xpTableHeader}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.map((bal: any, i: number) => renderRow(bal, i))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={11} style={{ textAlign: 'center', padding: '24px', fontFamily: xpFont, fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                                            No stock records found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div style={{
                        background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                        padding: '2px 8px', display: 'flex', gap: 16,
                        fontFamily: xpFont, fontSize: '11px', color: '#333',
                    }}>
                        <span><b>{filtered.length}</b> rows</span>
                        {negativeCount > 0 && <span style={{ color: '#c00000' }}><b>{negativeCount}</b> negative</span>}
                        <span style={{ marginLeft: 'auto', color: '#666' }}>Total: {(stockBalance || []).length} SKUs</span>
                    </div>
                </div>
                {transferModal}
            </div>
        );
    }

    // ── Modern (Bootstrap) mode ───────────────────────────────────────────────
    return (
        <div className="fade-in">
            <div className="card shadow-sm border-0">
                <div className="card-header bg-primary bg-opacity-10 text-primary-emphasis d-flex justify-content-between align-items-center py-3">
                    <h5 className="card-title mb-0"><i className="bi bi-boxes me-2" />{t('stock_on_hand') || 'Stock On-Hand'}</h5>
                    <span className="badge bg-primary bg-opacity-25 text-primary-emphasis">{filtered.length} records</span>
                </div>
                <div className="card-body pb-0">
                    <div className="row g-2 mb-3">
                        <div className="col-md-3">
                            <input
                                className="form-control form-control-sm"
                                placeholder="Search item, location, category, lot..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="col-md-2">
                            <select className="form-select form-select-sm" value={warehouseFilter} onChange={e => onWarehouseChange(e.target.value)}>
                                <option value="">All Warehouses</option>
                                {warehouses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                <option value={UNCAT}>No Warehouse</option>
                            </select>
                        </div>
                        <div className="col-md-2">
                            <select className="form-select form-select-sm" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
                                <option value="">All Locations</option>
                                {locationOptions.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                        <div className="col-md-3">
                            <select className="form-select form-select-sm" value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
                                <option value="">All Items</option>
                                {balanceItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                        </div>
                        <div className="col-md-2">
                            <button className="btn btn-outline-secondary btn-sm w-100" onClick={onRefresh}>
                                <i className="bi bi-arrow-clockwise me-1" />Refresh
                            </button>
                        </div>
                        <div className="col-md-2">
                            <button className="btn btn-outline-secondary btn-sm w-100" onClick={handleRebuild} disabled={rebuilding} title="Recompute stock balances from the ledger (use if balances look stale)">
                                <i className="bi bi-arrow-repeat me-1" />{rebuilding ? 'Rebuilding...' : 'Rebuild'}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="table-responsive">
                    <table className="table table-hover table-sm mb-0">
                        <thead className="table-light">
                            <tr>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('item')} title="Sort">Item<SortMark sort={sort} colKey="item" /></th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('itemCategory')} title="Sort">Item Category<SortMark sort={sort} colKey="itemCategory" /></th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('location')} title="Sort">{t('locations') || 'Location'}<SortMark sort={sort} colKey="location" /></th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('warehouse')} title="Sort">Warehouse<SortMark sort={sort} colKey="warehouse" /></th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('batch')} title="Sort">Lot<SortMark sort={sort} colKey="batch" /></th>
                                <th>{t('attributes') || 'Attributes'}</th>
                                <th className="text-end" style={{ cursor: 'pointer' }} onClick={() => toggleSort('qty')} title="Sort">{t('qty') || 'Qty'}<SortMark sort={sort} colKey="qty" /></th>
                                <th>UOM</th>
                                <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('packaging')} title="Sort">Packaging<SortMark sort={sort} colKey="packaging" /></th>
                                <th className="text-end">Ends</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map((bal: any, i: number) => renderRow(bal, i))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="text-center text-muted py-4">No stock records found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="card-footer text-muted d-flex gap-3 small">
                    <span><b>{filtered.length}</b> rows shown</span>
                    {negativeCount > 0 && <span className="text-danger"><b>{negativeCount}</b> negative</span>}
                    <span className="ms-auto">Total: {(stockBalance || []).length} SKUs</span>
                </div>
            </div>
            {transferModal}
        </div>
    );
}
