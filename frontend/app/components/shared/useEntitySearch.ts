'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useData } from '../../context/DataContext';

// Server-side typeahead primitive for every SearchableSelect that can't be fed a
// client-side list. Master tables (items, combos) run to thousands of rows, so the
// pickers query one bounded page per keystroke instead of filtering whatever the
// shared DataContext page happens to have cached from another tab — a candidate
// outside that page is otherwise unreachable no matter what the user types.
//
// The named presets below are the supported picker scopes; they differ only in the
// backend filter they pin. Add a preset rather than inlining a fetch at a call site,
// so the debounce, the out-of-order-response guard, and the resolve cache stay in
// one place.

export interface EntitySearchConfig {
    /** Path under /api, e.g. 'items' or 'combos'. */
    path: string;
    /** Fixed query params pinning this picker's backend scope. */
    params?: Record<string, string>;
    /** Page-size param name — /items calls it `limit`, /combos calls it `size`. */
    pageSizeParam?: string;
    pageSize?: number;
    debounceMs?: number;
    /**
     * Rows the caller already holds (typically DataContext's page). Merged into the
     * resolve cache only, never into `results` — priming the dropdown stays the
     * server's job so it always reflects this picker's scope.
     */
    seed?: any[];
    /** Cache key for resolve(); combos key their option value off attribute_value_id. */
    idKey?: string;
}

export interface EntitySearchResult {
    /** The current result page — what the dropdown should render. */
    results: any[];
    /** Debounced search callback for SearchableSelect's `onSearch`. */
    onSearch: (term: string) => void;
    /**
     * Look up any row seen so far (seed + every result page). A selected value keeps
     * resolving its name/code after the result window has moved past it.
     */
    resolve: (id: string) => any | undefined;
}

const apiBase = () => {
    const env = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
    return env.endsWith('/api') ? env : `${env}/api`;
};

export function useEntitySearch(config: EntitySearchConfig): EntitySearchResult {
    const {
        path, params, pageSizeParam = 'limit', pageSize = 50,
        debounceMs = 300, seed, idKey = 'id',
    } = config;
    const { authFetch } = useData();
    const [results, setResults] = useState<any[]>([]);
    const [cache, setCache] = useState<Record<string, any>>({});
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Monotonic request id: a response is only applied if no newer request has
    // started since. Without this, a slow page for "co" can land after the fast
    // page for "cotton" and overwrite the results the user is actually looking at.
    const seq = useRef(0);
    const inFlight = useRef<AbortController | null>(null);
    // Inline object literals from callers would be a fresh identity every render,
    // rebuilding fetchResults and refiring the priming effect forever.
    const paramsKey = JSON.stringify(params ?? {});

    const merge = useCallback((rows: any[]) => {
        if (!rows?.length) return;
        setCache(prev => {
            const next = { ...prev };
            let changed = false;
            for (const row of rows) {
                const key = String(row?.[idKey] ?? '');
                if (key && next[key] !== row) { next[key] = row; changed = true; }
            }
            return changed ? next : prev;
        });
    }, [idKey]);

    const fetchResults = useCallback(async (search = '') => {
        inFlight.current?.abort();
        const ctl = new AbortController();
        inFlight.current = ctl;
        const mySeq = ++seq.current;
        try {
            const qs = new URLSearchParams({
                ...JSON.parse(paramsKey),
                [pageSizeParam]: String(pageSize),
            });
            if (search) qs.set('search', search);
            const res = await authFetch(`${apiBase()}/${path}?${qs.toString()}`, { signal: ctl.signal });
            if (!res.ok || mySeq !== seq.current) return;
            const data = await res.json();
            if (mySeq !== seq.current) return;
            setResults(Array.isArray(data) ? data : (data.items ?? []));
        } catch { /* aborted or offline — leave the last good page in place */ }
    }, [authFetch, path, paramsKey, pageSizeParam, pageSize]);

    const onSearch = useCallback((term: string) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fetchResults(term), debounceMs);
    }, [fetchResults, debounceMs]);

    // Prime the first page on mount; drop the debounce and any in-flight request on unmount.
    useEffect(() => {
        fetchResults();
        return () => {
            if (timer.current) clearTimeout(timer.current);
            inFlight.current?.abort();
        };
    }, [fetchResults]);

    useEffect(() => { merge(results); }, [results, merge]);
    useEffect(() => { if (seed?.length) merge(seed); }, [seed, merge]);

    const resolve = useCallback((id: string) => cache[String(id)], [cache]);

    return { results, onSearch, resolve };
}

// --- Picker scopes -------------------------------------------------------------
// Each preset pins one backend scope. Params are module constants so their identity
// is stable across renders.

interface PresetOptions {
    debounceMs?: number;
    seed?: any[];
}

const FINISHED_GOODS = { finished_goods: 'true' };
const RAW_MATERIALS = { raw_materials: 'true' };
const PURCHASABLE = { purchasable: 'true' };
const ACTIVE_COMBOS = { status: 'active' };

/** Every item, unscoped — stock entry, stock-on-hand, and BOM substitutes. */
export const useItemSearch = (o: PresetOptions = {}) =>
    useEntitySearch({ path: 'items', ...o });

/** Finished-Goods subtree — Sales Order, Lab Dip, and Packing pickers. */
export const useFinishedGoodsSearch = (o: PresetOptions = {}) =>
    useEntitySearch({ path: 'items', params: FINISHED_GOODS, ...o });

/** Raw-Material subtree — the yarn counterpart of useFinishedGoodsSearch. */
export const useRawMaterialSearch = (o: PresetOptions = {}) =>
    useEntitySearch({ path: 'items', params: RAW_MATERIALS, ...o });

/** Raw Material + Chemical + Dye, unioned server-side — PO lines order all three. */
export const usePurchasableItemSearch = (o: PresetOptions = {}) =>
    useEntitySearch({ path: 'items', params: PURCHASABLE, ...o });

/**
 * Active Combo Library. Combos number in the thousands, hence a server typeahead
 * rather than the client-cached Attribute.values list. Keyed by attribute_value_id
 * because that — not the Combo row id — is what variant selection stores.
 */
export const useComboSearch = (o: PresetOptions = {}) =>
    useEntitySearch({ path: 'combos', params: ACTIVE_COMBOS, pageSizeParam: 'size', idKey: 'attribute_value_id', ...o });

/** The option shape SearchableSelect wants, for the standard id/name/code item row. */
export const itemToOption = (it: any) => ({ value: it.id, label: it.name, subLabel: it.code });
