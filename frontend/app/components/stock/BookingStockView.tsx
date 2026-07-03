'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { xpFont, xpBtn, XPLoading, useSortable, SortMark } from '../shared/xpTheme';

// Booking Stock: per-item material availability across all ongoing MOs.
//   net_free = on_hand + incoming - required
// Incoming = outstanding output of in-flight production MOs (production-only;
// purchase orders are not yet counted). Self-fetches /stock/availability.

const fmtQty = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

// Net-free health, with a small epsilon so float dust doesn't read as a shortfall.
const EPS = 0.0005;
const HEALTH = {
    short: { color: '#c00000', tint: '#fdeeee', label: 'SHORT' },
    tight: { color: '#9a6a00', tint: '#fff8e6', label: 'TIGHT' },
    ok:    { color: '#2d7a2d', tint: '#ffffff', label: 'OK' },
};
const healthOf = (nf: number) => (nf < -EPS ? HEALTH.short : nf <= EPS ? HEALTH.tight : HEALTH.ok);

type Row = {
    item_id: string;
    item_code: string;
    item_name: string;
    uom: string;
    attribute_value_ids: string[];
    location_id: string;
    location_name: string;
    qty_on_hand: number;
    qty_required: number;
    qty_incoming: number;
    qty_net_free: number;
    demand_mos: { mo_id: string; mo_code: string; mo_qty: number; required_qty: number }[];
    supply_mos: { mo_id: string; mo_code: string; mo_qty: number; incoming_qty: number }[];
};

export default function BookingStockView() {
    const { t } = useLanguage();
    const { uiStyle } = useTheme();
    const { authFetch, attributes = [] } = useData();
    const classic = uiStyle === 'classic';

    const API_BASE = useMemo(() => {
        const env = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
        return env.replace(/\/api$/, '') + '/api';
    }, []);

    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const fetchAvailability = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await authFetch(`${API_BASE}/stock/availability`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setRows(await res.json());
        } catch (e: any) {
            setError(e.message || 'Failed to load booking stock');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authFetch]);

    useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

    const getAttrValueName = useCallback((valId: string) => {
        for (const attr of attributes) {
            const v = attr.values?.find((x: any) => x.id === valId);
            if (v) return v.value;
        }
        return valId;
    }, [attributes]);

    const variantLabel = useCallback((ids: string[]) =>
        (ids && ids.length) ? ids.map(getAttrValueName).join(' / ') : '', [getAttrValueName]);

    // Client-side item search over the server result.
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(r =>
            r.item_name.toLowerCase().includes(term) ||
            r.item_code.toLowerCase().includes(term));
    }, [rows, search]);

    const { sorted, sort, toggle } = useSortable<Row>(filtered, {
        item: (r) => r.item_name,
        variant: (r) => variantLabel(r.attribute_value_ids),
        on_hand: (r) => r.qty_on_hand,
        incoming: (r) => r.qty_incoming,
        required: (r) => r.qty_required,
        net_free: (r) => r.qty_net_free,
    });

    const shortfallCount = useMemo(() => filtered.filter(r => r.qty_net_free < -EPS).length, [filtered]);
    const tightCount = useMemo(() => filtered.filter(r => r.qty_net_free >= -EPS && r.qty_net_free <= EPS).length, [filtered]);

    const rowKey = (r: Row) => `${r.item_id}-${r.attribute_value_ids.join(',')}`;
    const toggleRow = (k: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });

    const COLS: { key: string; label: string; align?: 'right' }[] = [
        { key: 'item', label: t('item') || 'Item' },
        { key: 'location', label: t('location') || 'Location' },
        { key: 'variant', label: t('variant') || 'Variant' },
        { key: 'on_hand', label: t('on_hand') || 'On Hand', align: 'right' },
        { key: 'incoming', label: t('incoming') || 'Incoming', align: 'right' },
        { key: 'required', label: t('required') || 'Required', align: 'right' },
        { key: 'net_free', label: t('net_free') || 'Net Free', align: 'right' },
    ];

    // ── MO drill-down (shared by both themes) ──────────────────────────────────
    const renderDetail = (r: Row) => (
        <div style={{
            display: 'flex', gap: 28, flexWrap: 'wrap',
            fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : 12.5,
            padding: classic ? '8px 12px 10px 34px' : '10px 16px',
        }}>
            <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 'bold', color: '#9a6a00', marginBottom: 4, fontVariant: 'all-small-caps', letterSpacing: '0.5px' }}>
                    {t('demand_from_mos') || 'Required by'} ({r.demand_mos.length})
                </div>
                {r.demand_mos.length === 0
                    ? <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>
                    : r.demand_mos.map(m => (
                        <div key={m.mo_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '1px 0' }}>
                            <span style={{ fontFamily: 'monospace', color: '#1a3d90' }}>{m.mo_code}</span>
                            <span style={{ color: '#7a3a00', whiteSpace: 'nowrap' }}>{fmtQty(m.required_qty)} {r.uom}</span>
                        </div>
                    ))}
            </div>
            <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 'bold', color: '#1a5e2a', marginBottom: 4, fontVariant: 'all-small-caps', letterSpacing: '0.5px' }}>
                    {t('incoming_from_mos') || 'Incoming from'} ({r.supply_mos.length})
                </div>
                {r.supply_mos.length === 0
                    ? <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>
                    : r.supply_mos.map(m => (
                        <div key={m.mo_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '1px 0' }}>
                            <span style={{ fontFamily: 'monospace', color: '#1a3d90' }}>{m.mo_code}</span>
                            <span style={{ color: '#1a5e2a', whiteSpace: 'nowrap' }}>+{fmtQty(m.incoming_qty)} {r.uom}</span>
                        </div>
                    ))}
            </div>
        </div>
    );

    // ════════════════════════════ CLASSIC ════════════════════════════════════
    if (classic) {
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
            padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
        };
        const xpInputS: React.CSSProperties = {
            fontFamily: xpFont, fontSize: '11px', border: '1px solid #7f9db9',
            boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px',
            background: '#ffffff', color: '#000000', height: '20px', outline: 'none',
        };
        const xpTableHeader: React.CSSProperties = {
            background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
            fontSize: '10px', fontWeight: 'bold', color: '#000000', fontFamily: xpFont,
            padding: '3px 8px', position: 'sticky', top: 0, whiteSpace: 'nowrap', userSelect: 'none',
        };
        const xpSep: React.CSSProperties = { width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0 };

        const numCell: React.CSSProperties = { padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', whiteSpace: 'nowrap' };

        return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ ...xpBevel, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={xpTitleBar}>
                        <span><i className="bi bi-bookmark-check" style={{ marginRight: 6 }} />{t('booking_stock') || 'Booking Stock'}</span>
                        <span style={{ fontSize: '10px', opacity: 0.85 }}>{filtered.length} items</span>
                    </div>

                    <div style={xpToolbar}>
                        <i className="bi bi-search" style={{ fontSize: '11px', color: '#666' }} />
                        <input
                            style={{ ...xpInputS, width: 200 }}
                            placeholder="Search item..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <div style={xpSep} />
                        <button style={xpBtn()} onClick={fetchAvailability} title="Refresh">
                            <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
                        </button>
                        {/* Legend */}
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontFamily: xpFont, fontSize: '10px', color: '#555' }}>
                            <span><i className="bi bi-square-fill" style={{ color: HEALTH.short.color, marginRight: 3 }} />Shortfall</span>
                            <span><i className="bi bi-square-fill" style={{ color: HEALTH.tight.color, marginRight: 3 }} />Tight</span>
                            <span><i className="bi bi-square-fill" style={{ color: HEALTH.ok.color, marginRight: 3 }} />OK</span>
                        </span>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff', maxHeight: 'calc(100vh - 200px)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {COLS.map(c => (
                                        <th key={c.key}
                                            style={{ ...xpTableHeader, textAlign: c.align || 'left', cursor: 'pointer' }}
                                            onClick={() => toggle(c.key)} title="Sort">
                                            {c.label}<SortMark sort={sort} colKey={c.key} />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((r, i) => {
                                    const k = rowKey(r);
                                    const isOpen = expanded.has(k);
                                    const variant = variantLabel(r.attribute_value_ids);
                                    const h = healthOf(r.qty_net_free);
                                    const zebra = i % 2 === 0 ? '#ffffff' : '#f5f3ee';
                                    return (
                                        <Fragment key={k}>
                                            <tr onClick={() => toggleRow(k)} title="Click for MO breakdown"
                                                style={{ background: isOpen ? '#fffbe6' : (h === HEALTH.short ? h.tint : zebra), borderBottom: '1px solid #c0bdb5', cursor: 'pointer' }}>
                                                <td style={{ padding: '4px 8px 4px 5px', fontFamily: xpFont, borderLeft: `3px solid ${h.color}` }}>
                                                    <i className={`bi ${isOpen ? 'bi-caret-down-fill' : 'bi-caret-right-fill'}`} style={{ fontSize: 8, marginRight: 5, color: '#888' }} />
                                                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#000' }}>{r.item_name}</span>
                                                    <div style={{ fontSize: '10px', color: '#666', fontVariant: 'all-small-caps', marginLeft: 18 }}>{r.item_code}</div>
                                                </td>
                                                <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '11px' }}>
                                                    <span style={{ background: '#e8e1f0', border: '1px solid #a890c0', padding: '0 5px', fontSize: '10px', color: '#3a2a4a' }} title="Netting is plant-wide, not per-location">
                                                        Plant-wide
                                                    </span>
                                                </td>
                                                <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: '10px' }}>
                                                    {variant
                                                        ? <span style={{ background: '#dde8f5', border: '1px solid #7f9db9', padding: '0 5px', color: '#1a3d7a' }}>{variant}</span>
                                                        : <span style={{ color: '#999', fontStyle: 'italic' }}>Standard</span>}
                                                </td>
                                                <td style={{ ...numCell, color: '#00008b' }}>{fmtQty(r.qty_on_hand)}</td>
                                                <td style={{ ...numCell, color: r.qty_incoming ? '#1a5e2a' : '#bbb' }}>
                                                    {r.qty_incoming ? `+${fmtQty(r.qty_incoming)}` : '—'}
                                                </td>
                                                <td style={{ ...numCell, color: '#7a3a00' }}>{fmtQty(r.qty_required)}</td>
                                                <td style={{ ...numCell, fontWeight: 'bold', color: h.color }}>
                                                    {fmtQty(r.qty_net_free)}
                                                    <span style={{ fontWeight: 'normal', fontSize: 9, color: '#999', marginLeft: 4 }}>{r.uom}</span>
                                                </td>
                                            </tr>
                                            {isOpen && (
                                                <tr>
                                                    <td colSpan={COLS.length} style={{ background: '#fffdf2', borderBottom: '1px solid #e0d8b0', borderLeft: `3px solid ${h.color}` }}>
                                                        {renderDetail(r)}
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                                {!loading && sorted.length === 0 && (
                                    <tr>
                                        <td colSpan={COLS.length} style={{ textAlign: 'center', padding: '24px', fontFamily: xpFont, fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                                            No components are currently demanded by ongoing MOs.
                                        </td>
                                    </tr>
                                )}
                                {loading && (
                                    <tr><td colSpan={COLS.length}><XPLoading label="Loading booking stock..." /></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{
                        background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                        padding: '2px 8px', display: 'flex', gap: 16, alignItems: 'center',
                        fontFamily: xpFont, fontSize: '11px', color: '#333',
                    }}>
                        <span><b>{filtered.length}</b> items</span>
                        {shortfallCount > 0 && <span style={{ color: HEALTH.short.color }}><b>{shortfallCount}</b> shortfall</span>}
                        {tightCount > 0 && <span style={{ color: HEALTH.tight.color }}><b>{tightCount}</b> tight</span>}
                        {error && <span style={{ color: '#c00000' }}>· {error}</span>}
                        <span style={{ marginLeft: 'auto', color: '#666' }}>Net Free = On Hand + Incoming − Required</span>
                    </div>
                </div>
            </div>
        );
    }

    // ════════════════════════════ MODERN ═════════════════════════════════════
    const numCellM: React.CSSProperties = { whiteSpace: 'nowrap' };
    return (
        <div className="fade-in p-2">
            <div className="card shadow-sm">
                <div className="card-header d-flex align-items-center justify-content-between py-2">
                    <span className="fw-semibold"><i className="bi bi-bookmark-check me-2" />{t('booking_stock') || 'Booking Stock'}</span>
                    <span className="badge bg-primary bg-opacity-25 text-primary-emphasis">{filtered.length} items</span>
                </div>

                <div className="card-body py-2 d-flex flex-wrap align-items-center gap-2 border-bottom">
                    <div className="input-group input-group-sm" style={{ width: 240 }}>
                        <span className="input-group-text"><i className="bi bi-search" /></span>
                        <input className="form-control" placeholder="Search item..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <button className="btn btn-sm btn-outline-secondary" onClick={fetchAvailability}>
                        <i className="bi bi-arrow-clockwise me-1" />Refresh
                    </button>
                    <span className="ms-auto small text-muted d-flex gap-3">
                        <span><i className="bi bi-square-fill me-1" style={{ color: HEALTH.short.color }} />Shortfall</span>
                        <span><i className="bi bi-square-fill me-1" style={{ color: HEALTH.tight.color }} />Tight</span>
                        <span><i className="bi bi-square-fill me-1" style={{ color: HEALTH.ok.color }} />OK</span>
                    </span>
                </div>

                {error && <div className="alert alert-danger py-2 m-2 mb-0">{error}</div>}

                <div className="table-responsive">
                    <table className="table table-sm table-hover align-middle mb-0">
                        <thead className="table-light">
                            <tr>
                                {COLS.map(c => (
                                    <th key={c.key} role="button" className={`user-select-none ${c.align === 'right' ? 'text-end' : ''}`} onClick={() => toggle(c.key)}>
                                        {c.label}<SortMark sort={sort} colKey={c.key} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r) => {
                                const k = rowKey(r);
                                const isOpen = expanded.has(k);
                                const variant = variantLabel(r.attribute_value_ids);
                                const h = healthOf(r.qty_net_free);
                                return (
                                    <Fragment key={k}>
                                        <tr onClick={() => toggleRow(k)} style={{ cursor: 'pointer' }} className={h === HEALTH.short ? 'table-danger' : undefined}>
                                            <td style={{ borderLeft: `3px solid ${h.color}` }}>
                                                <i className={`bi ${isOpen ? 'bi-caret-down-fill' : 'bi-caret-right-fill'} me-1 text-muted small`} />
                                                <span className="fw-medium">{r.item_name}</span>
                                                <small className="text-muted font-monospace ms-2">{r.item_code}</small>
                                            </td>
                                            <td><span className="badge bg-secondary-subtle text-secondary-emphasis" title="Netting is plant-wide, not per-location">Plant-wide</span></td>
                                            <td className="small">{variant
                                                ? <span className="badge bg-info-subtle text-info-emphasis">{variant}</span>
                                                : <span className="text-muted">Standard</span>}</td>
                                            <td className="text-end" style={{ ...numCellM, color: '#00008b' }}>{fmtQty(r.qty_on_hand)}</td>
                                            <td className="text-end" style={{ ...numCellM, color: r.qty_incoming ? '#1a5e2a' : '#bbb' }}>
                                                {r.qty_incoming ? `+${fmtQty(r.qty_incoming)}` : '—'}
                                            </td>
                                            <td className="text-end" style={{ ...numCellM, color: '#7a3a00' }}>{fmtQty(r.qty_required)}</td>
                                            <td className="text-end fw-bold" style={{ ...numCellM, color: h.color }}>
                                                {fmtQty(r.qty_net_free)} <small className="text-muted fw-normal">{r.uom}</small>
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="table-active"><td colSpan={COLS.length} className="p-0">{renderDetail(r)}</td></tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                            {!loading && sorted.length === 0 && (
                                <tr><td colSpan={COLS.length} className="text-center text-muted py-4">No components are currently demanded by ongoing MOs.</td></tr>
                            )}
                            {loading && (
                                <tr><td colSpan={COLS.length} className="text-center text-muted py-4">Loading...</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="card-footer d-flex gap-3 small text-muted align-items-center">
                    <span><b>{filtered.length}</b> items</span>
                    {shortfallCount > 0 && <span className="text-danger"><b>{shortfallCount}</b> shortfall</span>}
                    {tightCount > 0 && <span style={{ color: HEALTH.tight.color }}><b>{tightCount}</b> tight</span>}
                    <span className="ms-auto">Net Free = On Hand + Incoming − Required</span>
                </div>
            </div>
        </div>
    );
}
