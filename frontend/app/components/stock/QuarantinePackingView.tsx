'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useData } from '../../context/DataContext';
import { useUser } from '../../context/UserContext';
import { useTimezone } from '../../context/TimezoneContext';
import { useToast } from '../shared/Toast';
import { ShellWindow, ShellTitleBar, xpToolbar as sharedXpToolbar, SearchField, ToolbarCount } from '../shared/shellTheme';
import { lvTh, lvThead, lvTd, lvRow, lvBtn, lvInput, lvLabel, lvSep, LV_XP_FONT, LV_MODERN_FONT } from '../shared/listViewTheme';
import {
    StatusChip, StatusCountPill, TableSkeleton, useRowHeightProbe, XPStatusBar, XPEmptyState,
    XPActionButton, ColorSwatchChip, ExpandedRowPanel, CodeChip,
} from '../shared/xpTheme';
import Pager from '../shared/Pager';
import { API_BASE } from '../shared/apiBase';

/**
 * Quarantine Packing — the QC hold desk between production output and packing.
 *
 * Everything sitting in a quarantine location (Location.is_quarantine, inherited
 * by child zones/bins) lands here, grouped by the MO that produced it.
 *
 * The disposition is set **per lot**, and the MO row shows a rollup. That is
 * deliberate: a batch is rarely uniformly good, and an MO-level-only status
 * would force the whole run to wait on its worst lot. The row-level control is
 * a convenience that writes the same status to every lot of the group — the
 * lot stays the source of truth either way.
 *
 * Only the disposition flagged `is_pass` by the backend ("OK") releases a lot;
 * packing 400s on anything else. This page never moves stock — releasing is a
 * status change, and packing pulls straight out of the quarantine location.
 */

const PAGE_SIZE = 25;

const fmtQty = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

type Lot = {
    batch_id: string | null;
    batch_number: string | null;
    item_id: string;
    qty: number;
    location_id: string | null;
    location_name: string | null;
    quality_status: string | null;
    quarantine_status: string | null;
    quarantine_status_id: string | null;
    quarantine_status_at: string | null;
    quarantine_status_by: string | null;
    quarantine_notes: string | null;
    released: boolean;
    created_at: string | null;
};

type Group = {
    key: string;
    mo_id: string | null;
    mo_code: string | null;
    mo_status: string | null;
    mo_qty: number | null;
    production_run_code: string | null;
    sales_order_code: string | null;
    color_code: string | null;
    color_name: string | null;
    color_hex: string | null;
    labdip_variant_code: string | null;
    item_id: string;
    item_code: string | null;
    item_name: string | null;
    uom: string | null;
    qty_total: number;
    qty_released: number;
    lot_count: number;
    rollup_status: string;
    status_counts: Record<string, number>;
    lots: Lot[];
};

type StatusOption = { id: string; value: string; is_pass: boolean };

// Rollup filter choices that are not attribute values.
const DERIVED_FILTERS = [
    { key: 'NONE', label: 'No status yet' },
    { key: 'MIXED', label: 'Mixed' },
];

export default function QuarantinePackingView() {
    const { uiStyle } = useTheme();
    const classic = uiStyle === 'classic';
    const { authFetch, subscribeLiveEvents } = useData();
    const { hasPermission } = useUser();
    const { formatDateTime: tzDateTime } = useTimezone();
    const { showToast } = useToast();

    const canSetStatus = hasPermission('quarantine.set_status');

    const [groups, setGroups] = useState<Group[]>([]);
    const [statuses, setStatuses] = useState<StatusOption[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [truncated, setTruncated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState<string | null>(null);

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // Skeleton sizing: measure one real row so the placeholders shown on the next
    // load are exactly as tall as the rows that replace them.
    const listBodyRef = useRef<HTMLTableSectionElement>(null);
    const skelRowH = useRowHeightProbe(classic ? 'quarantine-classic' : 'quarantine', listBodyRef, groups.length > 0);

    // Debounced 350ms before it drives a server fetch — same shape as item search.
    useEffect(() => {
        const id = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(id);
    }, [searchInput]);

    useEffect(() => { setPage(1); }, [search, statusFilter]);

    const fetchStatuses = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/quarantine/statuses`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setStatuses(await res.json());
        } catch {
            setStatuses([]);
        }
    }, [authFetch]);

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            const res = await authFetch(`${API_BASE}/quarantine?${params.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setGroups(data.items || []);
            setTotal(data.total ?? 0);
            setTruncated(!!data.truncated);
        } catch (e: any) {
            setError(e?.message || 'Failed to load quarantine stock');
            setGroups([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [authFetch, page, search, statusFilter]);

    useEffect(() => { fetchStatuses(); }, [fetchStatuses]);
    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    // Another QC user releasing a lot, or production landing more output in the
    // hold area, both arrive as a 'stock' live event — reload rather than leave a
    // stale queue on screen.
    useEffect(() => subscribeLiveEvents(kind => {
        if (kind === 'stock') fetchGroups();
    }), [subscribeLiveEvents, fetchGroups]);

    const passOption = useMemo(() => statuses.find(s => s.is_pass), [statuses]);

    const setStatus = useCallback(async (batchIds: string[], statusValueId: string | null, label: string) => {
        const ids = batchIds.filter(Boolean);
        if (!ids.length) {
            showToast('These rows have no lot, so they cannot be given a status', 'warning');
            return;
        }
        setSaving(ids.join(','));
        try {
            const res = await authFetch(`${API_BASE}/quarantine/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_ids: ids, status_value_id: statusValueId }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || `HTTP ${res.status}`);
            }
            showToast(`${label} set on ${ids.length} lot${ids.length > 1 ? 's' : ''}`, 'success');
            await fetchGroups();
        } catch (e: any) {
            showToast(e?.message || 'Could not set the status', 'danger');
        } finally {
            setSaving(null);
        }
    }, [authFetch, fetchGroups, showToast]);

    const toggleRow = (k: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });

    // ── Status <select>: shared by the group row and each lot row ─────────────
    const StatusSelect = ({ value, onPick, disabled, width = 150, placeholder }: {
        value: string; onPick: (id: string | null, label: string) => void;
        disabled?: boolean; width?: number; placeholder: string;
    }) => (
        <select
            value={value}
            disabled={disabled || !canSetStatus || !statuses.length}
            title={!canSetStatus ? 'Needs the Set Quarantine Status permission' : undefined}
            onChange={e => {
                const id = e.target.value;
                if (!id) { onPick(null, 'No status'); return; }
                onPick(id, statuses.find(s => s.id === id)?.value || 'Status');
            }}
            style={lvInput(classic, { width })}
            className={classic ? '' : 'form-select form-select-sm'}
        >
            <option value="">{placeholder}</option>
            {statuses.map(s => (
                <option key={s.id} value={s.id}>{s.value}{s.is_pass ? ' — releases' : ''}</option>
            ))}
        </select>
    );

    const COL_COUNT = 8;

    // ── Per-lot detail table (both themes) ────────────────────────────────────
    const renderLots = (g: Group) => (
        <ExpandedRowPanel classic={classic} style={{
            padding: classic ? '8px 12px 10px 18px' : '10px 16px',
        }}>
            <div style={{
                fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT,
                fontSize: classic ? 10 : 11, color: '#666',
                fontVariant: 'all-small-caps', letterSpacing: '0.5px', marginBottom: 4,
            }}>
                Lots on hold — status is set per lot; the row above is their rollup
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                <thead style={lvThead(classic)}>
                    <tr>
                        <th style={lvTh(classic)}>Lot</th>
                        <th style={{ ...lvTh(classic), width: 110, textAlign: 'right' }}>Qty</th>
                        <th style={{ ...lvTh(classic), width: 170 }}>Location</th>
                        <th style={{ ...lvTh(classic), width: 130 }}>Status</th>
                        <th style={{ ...lvTh(classic), width: 190 }}>Decided</th>
                        <th style={{ ...lvTh(classic), width: 170, borderRight: 'none' }}>Set</th>
                    </tr>
                </thead>
                <tbody>
                    {g.lots.map((l, i) => (
                        <tr key={l.batch_id || `nolot-${i}`} style={lvRow(classic, i)}>
                            <td style={lvTd(classic)}>
                                {l.batch_number
                                    ? <CodeChip code={l.batch_number} classic={classic} />
                                    : <span style={{ color: '#999', fontStyle: 'italic' }}>No lot</span>}
                                {l.quality_status === 'REJECTED' && (
                                    <StatusChip status="REJECTED" style={{ marginLeft: 6 }} tint />
                                )}
                            </td>
                            <td style={{ ...lvTd(classic), textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {fmtQty(l.qty)} <span style={{ color: '#999', fontSize: 10 }}>{g.uom}</span>
                            </td>
                            <td style={lvTd(classic)}>{l.location_name || '—'}</td>
                            <td style={lvTd(classic)}>
                                {l.quarantine_status
                                    ? <StatusChip status={l.quarantine_status.replace(/\s+/g, '_')} label={l.quarantine_status} />
                                    : <StatusChip status="NONE" label="No status" tint />}
                            </td>
                            <td style={{ ...lvTd(classic), fontSize: classic ? 10 : 11, color: '#666' }}>
                                {l.quarantine_status_at
                                    ? `${l.quarantine_status_by || '—'} · ${tzDateTime(l.quarantine_status_at)}`
                                    : '—'}
                            </td>
                            <td style={{ ...lvTd(classic), borderRight: 'none' }}>
                                {l.batch_id ? (
                                    <StatusSelect
                                        value={l.quarantine_status_id || ''}
                                        width={160}
                                        placeholder="No status"
                                        disabled={saving !== null}
                                        onPick={(id, label) => setStatus([l.batch_id as string], id, label)}
                                    />
                                ) : (
                                    <span style={{ fontSize: 10, color: '#999', fontStyle: 'italic' }}
                                        title="Un-lotted stock carries no lot record to disposition. Lot-track the item to gate it.">
                                        Not lot-tracked
                                    </span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </ExpandedRowPanel>
    );

    // ── Toolbar ───────────────────────────────────────────────────────────────
    const toolbar = (
        <div style={classic
            ? sharedXpToolbar({ flexShrink: 0 })
            : {
                background: '#fff', borderBottom: '1px solid #dbe1ea', padding: '8px 10px',
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0,
            }}>
            <SearchField classic={classic} value={searchInput} onChange={setSearchInput} placeholder="MO, lot, item or SO..." width={230} />
            <div style={lvSep(classic)} />
            <span style={{ ...lvLabel(classic), display: 'inline', marginBottom: 0 }}>Status</span>
            <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={lvInput(classic, { width: 160 })}
                className={classic ? '' : 'form-select form-select-sm'}
            >
                <option value="">All</option>
                {DERIVED_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                {statuses.map(s => (
                    <option key={s.id} value={s.value.toUpperCase()}>{s.value}</option>
                ))}
            </select>
            <div style={lvSep(classic)} />
            <button style={lvBtn(classic)} onClick={fetchGroups} title="Refresh">
                <i className="bi bi-arrow-clockwise" style={{ marginRight: 4 }} />Refresh
            </button>
            {!canSetStatus && (
                <span style={{ fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT, fontSize: classic ? 10 : 11, color: '#9a6a00' }}>
                    <i className="bi bi-lock" style={{ marginRight: 4 }} />Read-only — no Set Quarantine Status permission
                </span>
            )}
            <ToolbarCount classic={classic} right>
                {total.toLocaleString()} MO group{total === 1 ? '' : 's'}
            </ToolbarCount>
        </div>
    );

    // ── Main table ────────────────────────────────────────────────────────────
    const body = (
        <div style={{ flex: 1, minHeight: 0, width: '100%', background: '#fff', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                <thead style={lvThead(classic, true)}>
                    <tr>
                        <th style={lvTh(classic)}>Manufacturing Order</th>
                        <th style={lvTh(classic)}>Item</th>
                        <th style={{ ...lvTh(classic), width: 150 }}>Colour</th>
                        <th style={{ ...lvTh(classic), width: 70, textAlign: 'right' }}>Lots</th>
                        <th style={{ ...lvTh(classic), width: 120, textAlign: 'right' }}>Qty Held</th>
                        <th style={{ ...lvTh(classic), width: 120, textAlign: 'right' }}>Released</th>
                        <th style={{ ...lvTh(classic), width: 140 }}>Status</th>
                        <th style={{ ...lvTh(classic), width: 250, borderRight: 'none' }}>Set for whole MO</th>
                    </tr>
                </thead>
                <tbody ref={listBodyRef}>
                    {groups.map((g, i) => {
                        const open = expanded.has(g.key);
                        const lotIds = g.lots.map(l => l.batch_id).filter(Boolean) as string[];
                        const allReleased = g.lot_count > 0 && g.qty_released >= g.qty_total - 1e-6;
                        return (
                            <Fragment key={g.key}>
                                <tr
                                    onClick={() => toggleRow(g.key)}
                                    title="Click to see the lots"
                                    style={{
                                        ...lvRow(classic, i),
                                        cursor: 'pointer',
                                        // Only override when open — `background: undefined` still wins over
                                        // the spread above (last key in the literal), which is what was
                                        // silently wiping the zebra stripe off every closed row.
                                        ...(open ? { background: classic ? '#fffbe6' : '#f1f5f9' } : {}),
                                    }}
                                >
                                    <td style={lvTd(classic)}>
                                        <i className={`bi ${open ? 'bi-caret-down-fill' : 'bi-caret-right-fill'}`}
                                            style={{ fontSize: 8, marginRight: 5, color: '#888' }} />
                                        {g.mo_code
                                            ? <CodeChip code={g.mo_code} classic={classic} tone="accent" />
                                            : <span style={{ color: '#999', fontStyle: 'italic' }}>No MO</span>}
                                        {g.mo_status && <StatusChip status={g.mo_status} style={{ marginLeft: 6 }} tint />}
                                        <div style={{ fontSize: 10, color: '#666', marginLeft: 18 }}>
                                            {[g.production_run_code, g.sales_order_code].filter(Boolean).join(' · ') || ' '}
                                        </div>
                                    </td>
                                    <td style={lvTd(classic)}>
                                        <span style={{ fontWeight: 'bold' }}>{g.item_name}</span>
                                        <div style={{ fontSize: 10, color: '#666', fontVariant: 'all-small-caps' }}>{g.item_code}</div>
                                    </td>
                                    <td style={lvTd(classic)}>
                                        {g.color_name
                                            ? <ColorSwatchChip classic={classic} label={g.color_code ? `${g.color_code} ${g.color_name}` : g.color_name} hex={g.color_hex} />
                                            : g.labdip_variant_code
                                                ? <span style={{ fontSize: 10, color: '#9a6a00' }} title="Shade still awaiting lab-dip approval">{g.labdip_variant_code}</span>
                                                : <span style={{ color: '#999', fontStyle: 'italic', fontSize: 10 }}>Greige</span>}
                                    </td>
                                    <td style={{ ...lvTd(classic), textAlign: 'right' }}>{g.lot_count}</td>
                                    <td style={{ ...lvTd(classic), textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {fmtQty(g.qty_total)} <span style={{ color: '#999', fontSize: 10 }}>{g.uom}</span>
                                    </td>
                                    <td style={{
                                        ...lvTd(classic), textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 'bold',
                                        color: allReleased ? '#2d7a2d' : g.qty_released > 0 ? '#9a6a00' : '#999',
                                    }}>
                                        {fmtQty(g.qty_released)}
                                    </td>
                                    <td style={lvTd(classic)}>
                                        <StatusChip
                                            status={g.rollup_status}
                                            label={g.rollup_status === 'NONE' ? 'No status' : g.rollup_status.replace(/_/g, ' ')}
                                            title={Object.entries(g.status_counts)
                                                .map(([k, n]) => `${n} × ${k === 'NONE' ? 'no status' : k}`).join(', ')}
                                        />
                                    </td>
                                    <td style={{ ...lvTd(classic), borderRight: 'none' }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <StatusSelect
                                                value=""
                                                width={140}
                                                placeholder={`Apply to ${g.lot_count} lot${g.lot_count > 1 ? 's' : ''}...`}
                                                disabled={saving !== null || !lotIds.length}
                                                onPick={(id, label) => setStatus(lotIds, id, label)}
                                            />
                                            {passOption && !allReleased && lotIds.length > 0 && (
                                                <XPActionButton
                                                    classic={classic}
                                                    tone="success"
                                                    icon="bi-check2-circle"
                                                    label="OK all"
                                                    title={`Set ${passOption.value} on every lot of this MO — releases them to packing`}
                                                    disabled={saving !== null || !canSetStatus}
                                                    onClick={() => setStatus(lotIds, passOption.id, passOption.value)}
                                                />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                {open && (
                                    <tr>
                                        <td colSpan={COL_COUNT} style={{ padding: 0 }}>
                                            {renderLots(g)}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                    {loading && <TableSkeleton rows={7} cols={COL_COUNT} classic={classic} tdStyle={lvTd(classic)} rowHeight={skelRowH} />}
                    {!loading && groups.length === 0 && (
                        <tr>
                            <td colSpan={COL_COUNT} style={{ padding: 0 }}>
                                <XPEmptyState
                                    icon="bi-shield-check"
                                    message={search || statusFilter
                                        ? 'No held stock matches this filter.'
                                        : 'Nothing is on hold — no stock is sitting in a quarantine location.'}
                                />
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const heldTotal = useMemo(() => groups.reduce((s, g) => s + g.qty_total, 0), [groups]);
    const awaiting = useMemo(() => groups.filter(g => g.rollup_status !== 'OK').length, [groups]);

    return (
        <ShellWindow classic={classic} fill="page" className="fade-in">
            <ShellTitleBar
                classic={classic}
                icon="bi-shield-exclamation"
                title="Quarantine Packing"
                subtitle="Stock held in quarantine, grouped by MO. Only lots set to OK can be packed."
            />
            {toolbar}
            {error && (
                <div style={{
                    fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT, fontSize: 11,
                    color: '#c00000', padding: '6px 12px', background: '#fdeeee',
                }}>{error}</div>
            )}
            {truncated && (
                <div style={{
                    fontFamily: classic ? LV_XP_FONT : LV_MODERN_FONT, fontSize: 11,
                    color: '#9a6a00', padding: '6px 12px', background: '#fff8e6',
                }}>
                    <i className="bi bi-exclamation-triangle" style={{ marginRight: 5 }} />
                    Too much stock on hold to list in full — only the largest holdings are shown. Clear the backlog or narrow the search.
                </div>
            )}
            {body}
            <XPStatusBar right={`Held ${fmtQty(heldTotal)} across ${groups.length} group${groups.length === 1 ? '' : 's'} on this page`}>
                <StatusCountPill status="NONE" count={awaiting} label="awaiting decision" classic={classic} />
            </XPStatusBar>
            <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} hideWhenEmpty />
        </ShellWindow>
    );
}
