'use client';

import { useState, useCallback, useMemo, useRef, Fragment } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { usePaginatedFetch } from '../../context/usePaginatedList';
import { xpFont, xpBtn, TableSkeleton, useTableSkeletonMetrics, useSortable, SortMark, ExpandedRowPanel, expandedRowFrame, CodeChip, CODE_FONT, rowStateBg } from '../shared/xpTheme';
import { xpBevel as sharedXpBevel, xpTitleBar as sharedXpTitleBar, xpToolbar as sharedXpToolbar, SearchField } from '../shared/shellTheme';
import Pager from '../shared/Pager';
import { lvThead, lvSubTh, lvSubTd, lvSubTable, lvSubRow, lvSubCaption, ExpandToggle } from '../shared/listViewTheme';

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

    const PAGE_SIZE = 50;
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Page window, the 350ms-debounced `?search=` box, loading flag and the
    // stale-response race guard all come from the shared hook
    // (context/usePaginatedList.ts). A search change restarts at page 1 inside the
    // hook, so there is no separate page reset to keep in step here.
    const {
        rows, total, loading, error, page, setPage, searchInput, setSearch, refetch: fetchAvailability,
    } = usePaginatedFetch<Row>({
        endpoint: `${API_BASE}/stock/availability`,
        authFetch,
        pageSize: PAGE_SIZE,
    });

    const getAttrValueName = useCallback((valId: string) => {
        for (const attr of attributes) {
            const v = attr.values?.find((x: any) => x.id === valId);
            if (v) return v.value;
        }
        return valId;
    }, [attributes]);

    const variantLabel = useCallback((ids: string[]) =>
        (ids && ids.length) ? ids.map(getAttrValueName).join(' / ') : '', [getAttrValueName]);

    const { sorted, sort, toggle } = useSortable<Row>(rows, {
        item: (r) => r.item_name,
        variant: (r) => variantLabel(r.attribute_value_ids),
        on_hand: (r) => r.qty_on_hand,
        incoming: (r) => r.qty_incoming,
        required: (r) => r.qty_required,
        net_free: (r) => r.qty_net_free,
    });

    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skel = useTableSkeletonMetrics('booking-stock', listBodyRef, sorted.length > 0);

    const shortfallCount = useMemo(() => rows.filter(r => r.qty_net_free < -EPS).length, [rows]);
    const tightCount = useMemo(() => rows.filter(r => r.qty_net_free >= -EPS && r.qty_net_free <= EPS).length, [rows]);

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
    // One side (Required by / Incoming from): mini table + bold total row underneath.
    const detailSide = (
        title: string, color: string, tint: string,
        items: { mo_id: string; mo_code: string; qty: number }[], sign: string, uom: string,
    ) => {
        const total = items.reduce((s, m) => s + m.qty, 0);
        // Shared sub-table chrome, with the header band recoloured per side: this
        // panel's whole point is demand (amber) vs supply (green), so the tint and
        // rule colour are the one thing that deliberately varies per instance.
        const th: React.CSSProperties = { ...lvSubTh(classic), background: tint, color, borderBottom: `1px solid ${color}` };
        const td = lvSubTd(classic);
        return (
            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                <div style={{ ...lvSubCaption(classic), color }}>
                    {title} ({items.length})
                </div>
                <table style={lvSubTable(classic)}>
                    <thead>
                        <tr>
                            <th style={th}>MO</th>
                            <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr><td colSpan={2} style={{ ...td, color: '#999', fontStyle: 'italic' }}>—</td></tr>
                        ) : items.map((m, i) => (
                            <tr key={m.mo_id} style={lvSubRow(classic, i)}>
                                <td style={{ ...td, fontFamily: CODE_FONT, color: '#1a3d90' }}>{m.mo_code}</td>
                                <td style={{ ...td, textAlign: 'right', color, whiteSpace: 'nowrap' }}>{sign}{fmtQty(m.qty)}</td>
                            </tr>
                        ))}
                    </tbody>
                    {items.length > 0 && (
                        <tfoot>
                            <tr>
                                <td style={{ ...td, borderTop: `2px solid ${color}`, fontWeight: 'bold', color }}>Total</td>
                                <td style={{ ...td, borderTop: `2px solid ${color}`, textAlign: 'right', fontWeight: 'bold', color, whiteSpace: 'nowrap' }}>
                                    {sign}{fmtQty(total)} {uom}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        );
    };

    // The rail is health-coded here rather than selection-blue: this table's whole
    // job is shortfall triage, so the panel inherits the row's health color.
    const renderDetail = (r: Row) => (
        <ExpandedRowPanel classic={classic} style={{
            display: 'flex', gap: 24, flexWrap: 'wrap',
            ...expandedRowFrame(classic, healthOf(r.qty_net_free).color),
            padding: classic ? '8px 12px 10px 20px' : '10px 16px',
        }}>
            {detailSide(
                t('demand_from_mos') || 'Required by', '#9a6a00', '#fff3d6',
                r.demand_mos.map(m => ({ mo_id: m.mo_id, mo_code: m.mo_code, qty: m.required_qty })),
                '', r.uom,
            )}
            {detailSide(
                t('incoming_from_mos') || 'Incoming from', '#1a5e2a', '#e2f3e2',
                r.supply_mos.map(m => ({ mo_id: m.mo_id, mo_code: m.mo_code, qty: m.incoming_qty })),
                '+', r.uom,
            )}
        </ExpandedRowPanel>
    );

    const xpBevel: React.CSSProperties = sharedXpBevel();
    const xpTitleBar: React.CSSProperties = sharedXpTitleBar();
    const xpToolbar: React.CSSProperties = sharedXpToolbar({ gap: '6px' });
    const xpTableHeader: React.CSSProperties = {
        ...lvThead(true),
        borderRight: '1px solid #b0aa9c',
        fontSize: '10px', fontWeight: 'bold', color: '#000000', fontFamily: xpFont,
        padding: '3px 8px', position: 'sticky', top: 0, whiteSpace: 'nowrap', userSelect: 'none',
    };
    const xpSep: React.CSSProperties = { width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0 };

    const colLine: React.CSSProperties = { borderRight: '1px solid #d8d4c8' };
    const numCell: React.CSSProperties = { padding: '4px 8px', textAlign: 'right', fontFamily: xpFont, fontSize: '11px', whiteSpace: 'nowrap', ...colLine };
    const numCellM: React.CSSProperties = { whiteSpace: 'nowrap' };

    return (
        <div className={classic ? 'fade-in' : 'fade-in p-2'} style={classic ? { display: 'flex', flexDirection: 'column', height: 'calc(var(--app-vh) - 80px)', minHeight: 0 } : undefined}>
            <div style={classic ? { ...xpBevel, display: 'flex', flexDirection: 'column', flex: 1 } : undefined} className={classic ? undefined : 'card shadow-sm'}>
                <div style={classic ? xpTitleBar : undefined} className={classic ? undefined : 'card-header d-flex align-items-center justify-content-between py-2'}>
                    <span className={classic ? undefined : 'fw-semibold'}>
                        <i className={classic ? 'bi bi-bookmark-check' : 'bi bi-bookmark-check me-2'} style={classic ? { marginRight: 6 } : undefined} />
                        {t('booking_stock') || 'Booking Stock'}
                    </span>
                    <span style={classic ? { fontSize: '10px', opacity: 0.85 } : undefined} className={classic ? undefined : 'badge bg-primary bg-opacity-25 text-primary-emphasis'}>{total} items</span>
                </div>

                <div style={classic ? xpToolbar : undefined} className={classic ? undefined : 'card-body py-2 d-flex flex-wrap align-items-center gap-2 border-bottom'}>
                    <SearchField classic={classic} value={searchInput} onChange={setSearch} placeholder="Search item..." width={classic ? 200 : 240} />
                    {classic && <div style={xpSep} />}
                    <button style={classic ? xpBtn() : undefined} className={classic ? undefined : 'btn btn-sm btn-outline-secondary'} onClick={fetchAvailability} title={classic ? 'Refresh' : undefined}>
                        <i className={classic ? 'bi bi-arrow-clockwise' : 'bi bi-arrow-clockwise me-1'} style={classic ? { marginRight: 4 } : undefined} />Refresh
                    </button>
                    {/* Legend */}
                    <span style={classic ? { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontFamily: xpFont, fontSize: '10px', color: '#555' } : undefined} className={classic ? undefined : 'ms-auto small text-muted d-flex gap-3'}>
                        <span><i className={classic ? 'bi bi-square-fill' : 'bi bi-square-fill me-1'} style={{ color: HEALTH.short.color, ...(classic ? { marginRight: 3 } : {}) }} />Shortfall</span>
                        <span><i className={classic ? 'bi bi-square-fill' : 'bi bi-square-fill me-1'} style={{ color: HEALTH.tight.color, ...(classic ? { marginRight: 3 } : {}) }} />Tight</span>
                        <span><i className={classic ? 'bi bi-square-fill' : 'bi bi-square-fill me-1'} style={{ color: HEALTH.ok.color, ...(classic ? { marginRight: 3 } : {}) }} />OK</span>
                    </span>
                </div>

                {!classic && error && <div className="alert alert-danger py-2 m-2 mb-0">{error}</div>}

                <div style={classic ? { flex: 1, overflowY: 'auto', background: '#ffffff', maxHeight: 'calc(var(--app-vh) - 200px)' } : undefined} className={classic ? undefined : 'table-responsive'}>
                    <table style={classic ? { width: '100%', borderCollapse: 'collapse' } : undefined} className={classic ? undefined : 'table table-sm table-hover align-middle mb-0'}>
                        <thead className={classic ? undefined : 'table-light'}>
                            <tr>
                                {COLS.map(c => (
                                    <th key={c.key} role={classic ? undefined : 'button'}
                                        style={classic ? { ...xpTableHeader, textAlign: c.align || 'left', cursor: 'pointer' } : undefined}
                                        className={classic ? undefined : `user-select-none ${c.align === 'right' ? 'text-end' : ''}`}
                                        onClick={() => toggle(c.key)} title={classic ? 'Sort' : undefined}>
                                        {c.label}<SortMark sort={sort} colKey={c.key} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody ref={classic ? listBodyRef : undefined}>
                            {sorted.map((r, i) => {
                                const k = rowKey(r);
                                const isOpen = expanded.has(k);
                                const variant = variantLabel(r.attribute_value_ids);
                                const h = healthOf(r.qty_net_free);
                                const zebra = i % 2 === 0 ? '#ffffff' : '#f5f3ee';
                                return (
                                    <Fragment key={k}>
                                        <tr onClick={() => toggleRow(k)} title={classic ? 'Click for MO breakdown' : undefined}
                                            style={classic
                                                ? { background: isOpen ? rowStateBg('expanded', true) : (h === HEALTH.short ? h.tint : zebra), borderBottom: '1px solid #c0bdb5', cursor: 'pointer' }
                                                : { cursor: 'pointer' }}
                                            className={classic ? undefined : (h === HEALTH.short ? 'table-danger' : undefined)}>
                                            <td style={classic ? { padding: '4px 8px 4px 5px', fontFamily: xpFont, borderLeft: `3px solid ${h.color}` } : { borderLeft: `3px solid ${h.color}` }}>
                                                <ExpandToggle expanded={isOpen} classic={classic} onToggle={() => toggleRow(k)} label="MO breakdown" style={{ marginRight: 5 }} />
                                                {classic ? (
                                                    <>
                                                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#000' }}>{r.item_name}</span>
                                                        <div style={{ fontSize: '10px', color: '#666', fontVariant: 'all-small-caps', marginLeft: 18 }}>{r.item_code}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="fw-medium">{r.item_name}</span>
                                                        <CodeChip code={r.item_code} classic={false} tier={2} className="ms-2" />
                                                    </>
                                                )}
                                            </td>
                                            <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '11px' } : undefined}>
                                                {classic ? (
                                                    <span style={{ background: '#e8e1f0', border: '1px solid #a890c0', padding: '0 5px', fontSize: '10px', color: '#3a2a4a' }} title="Netting is plant-wide, not per-location">
                                                        Plant-wide
                                                    </span>
                                                ) : (
                                                    <span className="badge bg-secondary-subtle text-secondary-emphasis" title="Netting is plant-wide, not per-location">Plant-wide</span>
                                                )}
                                            </td>
                                            <td style={classic ? { padding: '4px 8px', fontFamily: xpFont, fontSize: '10px' } : undefined} className={classic ? undefined : 'small'}>
                                                {variant
                                                    ? (classic
                                                        ? <span style={{ background: '#dde8f5', border: '1px solid #7f9db9', padding: '0 5px', color: '#1a3d7a' }}>{variant}</span>
                                                        : <span className="badge bg-info-subtle text-info-emphasis">{variant}</span>)
                                                    : (classic
                                                        ? <span style={{ color: '#999', fontStyle: 'italic' }}>Standard</span>
                                                        : <span className="text-muted">Standard</span>)}
                                            </td>
                                            <td style={{ ...(classic ? numCell : numCellM), color: '#00008b' }} className={classic ? undefined : 'text-end'}>{fmtQty(r.qty_on_hand)}</td>
                                            <td style={{ ...(classic ? numCell : numCellM), color: r.qty_incoming ? '#1a5e2a' : '#bbb' }} className={classic ? undefined : 'text-end'}>
                                                {r.qty_incoming ? `+${fmtQty(r.qty_incoming)}` : '—'}
                                            </td>
                                            <td style={{ ...(classic ? numCell : numCellM), color: '#7a3a00' }} className={classic ? undefined : 'text-end'}>{fmtQty(r.qty_required)}</td>
                                            <td style={{ ...(classic ? numCell : numCellM), fontWeight: 'bold', color: h.color }} className={classic ? undefined : 'text-end fw-bold'}>
                                                {fmtQty(r.qty_net_free)}
                                                {classic
                                                    ? <span style={{ fontWeight: 'normal', fontSize: 9, color: '#999', marginLeft: 4 }}>{r.uom}</span>
                                                    : <> <small className="text-muted fw-normal">{r.uom}</small></>}
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr>
                                                <td colSpan={COLS.length} style={classic ? { padding: 0 } : undefined} className={classic ? undefined : 'p-0'}>
                                                    {renderDetail(r)}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                            {!loading && sorted.length === 0 && (
                                <tr>
                                    <td colSpan={COLS.length} style={classic ? { textAlign: 'center', padding: '24px', fontFamily: xpFont, fontSize: '11px', color: '#666', fontStyle: 'italic' } : undefined} className={classic ? undefined : 'text-center text-muted py-4'}>
                                        No components are currently demanded by ongoing MOs.
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                classic
                                    ? <TableSkeleton rows={8} cols={skel.cols ?? COLS.length} classic rowHeight={skel.rowHeight} fillHeight={skel.fillHeight} />
                                    : <tr><td colSpan={COLS.length} className="text-center text-muted py-4">Loading...</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={classic ? {
                    background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                    padding: '2px 8px', display: 'flex', gap: 16, alignItems: 'center',
                    fontFamily: xpFont, fontSize: '11px', color: '#333',
                } : undefined} className={classic ? undefined : 'card-footer d-flex gap-3 small text-muted align-items-center'}>
                    {shortfallCount > 0 && <span style={classic ? { color: HEALTH.short.color } : undefined} className={classic ? undefined : 'text-danger'}><b>{shortfallCount}</b> shortfall</span>}
                    {tightCount > 0 && <span style={{ color: HEALTH.tight.color }}><b>{tightCount}</b> tight</span>}
                    {classic && error && <span style={{ color: '#c00000' }}>· {error}</span>}
                    <span style={classic ? { marginLeft: 'auto', color: '#666' } : undefined} className={classic ? undefined : 'ms-auto'}>Net Free = On Hand + Incoming − Required</span>
                </div>
                {classic ? (
                    <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
                ) : (
                    <div className="card-footer pt-0">
                        <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
                    </div>
                )}
            </div>
        </div>
    );
}
