'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import {
    xpFont, xpBtn, xpInput, xpSelect,
    XPLoading, XPEmptyState, useSortable, SortMark,
} from '../shared/xpTheme';

// Booking Stock: per-item material availability across all ongoing MOs.
//   net_free = on_hand + incoming - required
// Incoming = outstanding output of in-flight production MOs (production-only;
// purchase orders are not yet counted). Self-fetches /stock/availability.

const fmtQty = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

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
    const { authFetch, locations = [], attributes = [] } = useData();
    const classic = uiStyle === 'classic';

    const API_BASE = useMemo(() => {
        const env = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
        return env.replace(/\/api$/, '') + '/api';
    }, []);

    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const fetchAvailability = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const p = new URLSearchParams();
            if (locationFilter) p.set('location_id', locationFilter);
            const qs = p.toString();
            const res = await authFetch(`${API_BASE}/stock/availability${qs ? `?${qs}` : ''}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setRows(await res.json());
        } catch (e: any) {
            setError(e.message || 'Failed to load booking stock');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [API_BASE, authFetch, locationFilter]);

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

    const sortedLocations = useMemo(
        () => [...locations].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')),
        [locations]
    );

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
        location: (r) => r.location_name,
        variant: (r) => variantLabel(r.attribute_value_ids),
        on_hand: (r) => r.qty_on_hand,
        incoming: (r) => r.qty_incoming,
        required: (r) => r.qty_required,
        net_free: (r) => r.qty_net_free,
    });

    const shortfallCount = useMemo(() => filtered.filter(r => r.qty_net_free < 0).length, [filtered]);

    const rowKey = (r: Row) => `${r.item_id}-${r.location_id}-${r.attribute_value_ids.join(',')}`;
    const toggleRow = (k: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });

    const netColor = (n: number) => n < 0 ? '#c00000' : (n === 0 ? '#b8860b' : '#2d7a2d');

    // ── Toolbar ──────────────────────────────────────────────────────────────
    const toolbar = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                style={classic ? xpSelect({ minWidth: 160 }) : undefined}
                className={classic ? undefined : 'form-select form-select-sm'}
            >
                <option value="">{t('all_locations') || 'All Locations'}</option>
                {sortedLocations.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                ))}
            </select>
            <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_item') || 'Search item...'}
                style={classic ? xpInput({ minWidth: 200 }) : undefined}
                className={classic ? undefined : 'form-control form-control-sm'}
            />
            <button
                onClick={fetchAvailability}
                style={classic ? xpBtn() : undefined}
                className={classic ? undefined : 'btn btn-sm btn-outline-secondary'}
            >
                <i className="bi bi-arrow-clockwise" /> {t('refresh') || 'Refresh'}
            </button>
            <span style={{
                marginLeft: 'auto', fontFamily: classic ? xpFont : undefined,
                fontSize: classic ? 11 : 13, color: shortfallCount ? '#c00000' : '#555',
            }}>
                {shortfallCount > 0
                    ? `${shortfallCount} shortfall${shortfallCount === 1 ? '' : 's'} / ${filtered.length} items`
                    : `${filtered.length} items`}
            </span>
        </div>
    );

    // ── Column headers ───────────────────────────────────────────────────────
    const COLS: { key: string; label: string; align?: 'right' }[] = [
        { key: 'item', label: t('item') || 'Item' },
        { key: 'location', label: t('location') || 'Location' },
        { key: 'variant', label: t('variant') || 'Variant' },
        { key: 'on_hand', label: t('on_hand') || 'On Hand', align: 'right' },
        { key: 'incoming', label: t('incoming') || 'Incoming', align: 'right' },
        { key: 'required', label: t('required') || 'Required', align: 'right' },
        { key: 'net_free', label: t('net_free') || 'Net Free', align: 'right' },
    ];

    const th = (c: typeof COLS[number]) => classic ? {
        padding: '4px 8px', textAlign: (c.align || 'left') as any, cursor: 'pointer',
        fontFamily: xpFont, fontSize: 11, fontWeight: 'bold' as const, color: '#1a3d90',
        borderBottom: '1px solid #7f9db9', background: '#ece9d8', whiteSpace: 'nowrap' as const,
        userSelect: 'none' as const,
    } : undefined;

    // ── Expanded MO drill-down ─────────────────────────────────────────────────
    const renderDetail = (r: Row) => (
        <div style={{
            padding: classic ? '6px 10px 10px 26px' : '8px 14px',
            display: 'flex', gap: 24, flexWrap: 'wrap',
            fontFamily: classic ? xpFont : undefined, fontSize: classic ? 11 : 13,
        }}>
            <div>
                <div style={{ fontWeight: 'bold', color: '#7a3a00', marginBottom: 3 }}>
                    {t('demand_from_mos') || 'Required by'} ({r.demand_mos.length})
                </div>
                {r.demand_mos.length === 0
                    ? <span style={{ color: '#999' }}>-</span>
                    : r.demand_mos.map(m => (
                        <div key={m.mo_id} style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace' }}>{m.mo_code}</span>
                            {' — '}{fmtQty(m.required_qty)} {r.uom}
                        </div>
                    ))}
            </div>
            <div>
                <div style={{ fontWeight: 'bold', color: '#1a5e2a', marginBottom: 3 }}>
                    {t('incoming_from_mos') || 'Incoming from'} ({r.supply_mos.length})
                </div>
                {r.supply_mos.length === 0
                    ? <span style={{ color: '#999' }}>-</span>
                    : r.supply_mos.map(m => (
                        <div key={m.mo_id} style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: 'monospace' }}>{m.mo_code}</span>
                            {' — '}{fmtQty(m.incoming_qty)} {r.uom}
                        </div>
                    ))}
            </div>
        </div>
    );

    // ── Table body ─────────────────────────────────────────────────────────────
    const body = sorted.map((r) => {
        const k = rowKey(r);
        const isOpen = expanded.has(k);
        const variant = variantLabel(r.attribute_value_ids);
        const nf = r.qty_net_free;

        if (classic) {
            return (
                <Fragment key={k}>
                    <tr onClick={() => toggleRow(k)}
                        style={{ cursor: 'pointer', background: isOpen ? '#fffbe6' : (nf < 0 ? '#fdeeee' : '#fff') }}>
                        <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: 11 }}>
                            <i className={`bi ${isOpen ? 'bi-caret-down-fill' : 'bi-caret-right-fill'}`} style={{ fontSize: 8, marginRight: 4, color: '#888' }} />
                            <span style={{ fontWeight: 'bold' }}>{r.item_name}</span>
                            <span style={{ color: '#888', marginLeft: 6, fontFamily: 'monospace', fontSize: 10 }}>{r.item_code}</span>
                        </td>
                        <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: 11 }}>{r.location_name}</td>
                        <td style={{ padding: '4px 8px', fontFamily: xpFont, fontSize: 10, color: variant ? '#333' : '#999' }}>
                            {variant || 'Standard'}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: 11 }}>{fmtQty(r.qty_on_hand)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: 11, color: r.qty_incoming ? '#1a5e2a' : '#aaa' }}>
                            {r.qty_incoming ? `+${fmtQty(r.qty_incoming)}` : '-'}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: 11, color: '#7a3a00' }}>{fmtQty(r.qty_required)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: 11, fontWeight: 'bold', color: netColor(nf) }}>
                            {fmtQty(nf)} <span style={{ fontWeight: 'normal', fontSize: 9, color: '#999' }}>{r.uom}</span>
                        </td>
                    </tr>
                    {isOpen && (
                        <tr><td colSpan={7} style={{ background: '#fffdf2', borderBottom: '1px solid #e0d8b0' }}>{renderDetail(r)}</td></tr>
                    )}
                </Fragment>
            );
        }

        return (
            <Fragment key={k}>
                <tr onClick={() => toggleRow(k)} style={{ cursor: 'pointer' }} className={nf < 0 ? 'table-danger' : undefined}>
                    <td>
                        <i className={`bi ${isOpen ? 'bi-caret-down-fill' : 'bi-caret-right-fill'} me-1 text-muted small`} />
                        <span className="fw-medium">{r.item_name}</span>
                        <small className="text-muted font-monospace ms-2">{r.item_code}</small>
                    </td>
                    <td>{r.location_name}</td>
                    <td className="small">{variant
                        ? <span className="badge bg-info-subtle text-info-emphasis">{variant}</span>
                        : <span className="text-muted">Standard</span>}</td>
                    <td className="text-end">{fmtQty(r.qty_on_hand)}</td>
                    <td className="text-end" style={{ color: r.qty_incoming ? '#1a5e2a' : '#aaa' }}>
                        {r.qty_incoming ? `+${fmtQty(r.qty_incoming)}` : '-'}
                    </td>
                    <td className="text-end" style={{ color: '#7a3a00' }}>{fmtQty(r.qty_required)}</td>
                    <td className="text-end fw-bold" style={{ color: netColor(nf), whiteSpace: 'nowrap' }}>
                        {fmtQty(nf)} <small className="text-muted fw-normal">{r.uom}</small>
                    </td>
                </tr>
                {isOpen && (
                    <tr><td colSpan={7} className="bg-light">{renderDetail(r)}</td></tr>
                )}
            </Fragment>
        );
    });

    // ── Layout ───────────────────────────────────────────────────────────────
    const heading = (
        <div style={{ marginBottom: 10 }}>
            <h5 style={{
                margin: 0, fontFamily: classic ? xpFont : undefined,
                fontSize: classic ? 14 : undefined, color: classic ? '#1a3d90' : undefined,
            }}>
                {t('booking_stock') || 'Booking Stock'}
            </h5>
            <div style={{
                fontSize: classic ? 10 : 12, color: '#777',
                fontFamily: classic ? xpFont : undefined, marginTop: 2,
            }}>
                {t('booking_stock_hint') || 'On-hand and in-flight production vs. outstanding demand from ongoing manufacturing orders. Net Free = On Hand + Incoming − Required.'}
            </div>
        </div>
    );

    return (
        <div style={{ padding: classic ? 12 : 16 }}>
            {heading}
            <div style={{ marginBottom: 10 }}>{toolbar}</div>

            {error && (
                <div className={classic ? undefined : 'alert alert-danger py-2'}
                     style={classic ? { color: '#c00000', fontFamily: xpFont, fontSize: 11, marginBottom: 8 } : undefined}>
                    {error}
                </div>
            )}

            {loading ? (
                classic ? <XPLoading label="Loading booking stock..." />
                        : <div className="text-center text-muted py-4">Loading...</div>
            ) : sorted.length === 0 ? (
                classic ? <XPEmptyState message="No components are currently demanded by ongoing MOs." icon="bi-clipboard-check" />
                        : <div className="text-center text-muted py-4">No components are currently demanded by ongoing MOs.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table
                        style={classic ? { width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #b0a890' } : undefined}
                        className={classic ? undefined : 'table table-sm table-hover align-middle'}
                    >
                        <thead>
                            <tr>
                                {COLS.map(c => (
                                    <th key={c.key} onClick={() => toggle(c.key)}
                                        style={th(c)}
                                        className={classic ? undefined : 'user-select-none'}
                                        role="button">
                                        {c.label}<SortMark sort={sort} colKey={c.key} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>{body}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
