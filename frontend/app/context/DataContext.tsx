'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUser } from './UserContext';
import { useToast } from '../components/shared/Toast';

const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

// requestType -> the domain key views read via useData().loading.*
const LOADING_KEY: Record<string, string> = {
    items: 'items', boms: 'boms', 'manufacturing-orders': 'manufacturingOrders',
    'production-runs': 'productionRuns', balance: 'stockBalance', 'stock-ledger': 'stockEntries',
    'sales-orders': 'salesOrders', 'purchase-orders': 'purchaseOrders', samples: 'samples',
    'audit-logs': 'auditLogs', partners: 'partners',
};

// One entry of the full item index (/items/lookup — EVERY item, not the paginated
// `items` page). attribute_ids/variant_type are here so variant-aware UI (the BOM
// designer's Colors/Combo dropdowns) works for items outside the current page.
// category_path is here for the same reason — goods receipt classifies a PO line
// (Cones vs Drums) by category, and PO lines routinely point at off-page items.
export interface ItemIndexEntry {
    name: string;
    code: string;
    uom?: string;
    lot_tracked?: boolean;
    ends?: number | null;
    variant_type?: string | null;
    attribute_ids?: string[];
    category_id?: string | null;
    category_path?: string[];
}

// Kinds of debounced live (WebSocket) event a page can be told about. One alias
// so adding a kind can't leave the queue, the buffer, and the subscriber
// signature disagreeing — which is exactly what a bare repeated union did.
export type LiveKind = 'production' | 'kpi' | 'stock' | 'weaving' | 'bom' | 'sales';

/** Rows per page of the server-paginated samples list (shared with SampleRequestView). */
export const SAMPLE_PAGE_SIZE = 50;

/** Server-side query for the samples list — filters live on the backend now. */
export interface SampleQuery {
    page?: number;
    search?: string;
    status?: string;
    /** `Sample Category` attribute value id — filtering by id survives a rename. */
    categoryValueId?: string;
    createdFrom?: string;
    createdTo?: string;
    /** Deep-link target: the server returns whichever page contains this row. */
    focusId?: string;
}

export interface SamplesMeta {
    total: number;
    unread: number;
    /** Color-grain tallies over the whole filtered set, not the page. */
    colorStats: Record<string, number>;
    page: number;
}

interface DataContextType {
    items: any[];
    locations: any[];
    attributes: any[];
    categories: any[];
    uoms: any[];
    sizes: any[];
    boms: any[];
    manufacturingOrders: any[];
    productionRuns: any[];
    stockEntries: any[];
    stockBalance: any[];
    workCenters: any[];
    operations: any[];
    salesOrders: any[];
    purchaseOrders: any[];
    samples: any[];
    samplesMeta: SamplesMeta;
    auditLogs: any[];
    partners: any[];
    dashboardKPIs: any;
    dashboardSummary: any;
    dashboardKpiHistory: any;
    dashboardWorkOrders: any[];
    itemIndex: Record<string, ItemIndexEntry>;
    companyProfile: any;
    /**
     * Client-edited print layouts (one row per customised doc type; absent = the
     * built-in default applies). Master data: tiny, and any page can open a print
     * modal, so it loads with the rest of the master set rather than per-route.
     */
    printTemplates: any[];
    refreshPrintTemplates: () => Promise<void>;
    wsStatus: 'connecting' | 'open' | 'closed';

    // True until the domain's first fetch attempt (success or failure) resolves.
    // Views gate their empty-state message on this so "no data yet" never
    // flashes as "there is no data" before the request completes.
    loading: {
        items: boolean; boms: boolean; manufacturingOrders: boolean; productionRuns: boolean;
        stockBalance: boolean; stockEntries: boolean; salesOrders: boolean; purchaseOrders: boolean;
        samples: boolean; auditLogs: boolean; partners: boolean;
    };

    /**
     * Measured progress of the initial data load: `done` responses out of
     * `total` requests actually issued. `total === 0` means no tracked load is
     * running — every later fetch is too small to be worth a determinate bar.
     */
    loadProgress: { done: number; total: number };

    // Pagination & Search State
    pagination: {
        itemPage: number; setItemPage: (p: number) => void; itemTotal: number;
        woPage: number; setWoPage: (p: number) => void; woTotal: number;
        prPage: number; setPrPage: (p: number) => void; prTotal: number;
        auditPage: number; setAuditPage: (p: number) => void; auditTotal: number;
        reportPage: number; setReportPage: (p: number) => void; reportTotal: number;
        moSearch: string; setMoSearch: (s: string) => void;
        prSearch: string; setPrSearch: (s: string) => void;
        pageSize: number;
    };
    
    filters: {
        itemSearch: string; setItemSearch: (s: string) => void;
        categoryL1: string; setCategoryL1: (c: string) => void;
        categoryL2: string; setCategoryL2: (c: string) => void;
        categoryL3: string; setCategoryL3: (c: string) => void;
        auditType: string; setAuditType: (t: string) => void;
    };

    fetchData: (targetTab?: string) => Promise<void>;
    refreshManufacturing: () => Promise<void>;
    refreshPurchaseOrders: () => Promise<void>;
    refreshSalesOrders: () => Promise<void>;
    /** Server-paginated samples fetch; omit the query to replay the last one. */
    loadSamples: (q?: SampleQuery) => Promise<void>;
    refreshSamples: () => Promise<void>;
    refreshItemMetadata: () => Promise<void>;
    refreshRouting: () => Promise<void>;
    handleTabHover: (tab: string) => void;
    authFetch: (url: string, options?: any) => Promise<Response>;
    subscribeLiveEvents: (fn: (kind: LiveKind) => void) => () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

/**
 * localStorage key for the master-data cache. Module-level because targeted
 * refreshers write through to it as well as `fetchData` — a refresher that updates
 * only React state leaves the cache serving its stale copy on the next page load,
 * which is exactly how saved print templates stopped reaching the floor.
 */
const MASTER_CACHE_KEY = 'terras_master_cache_v6';

/** Merge a slice into the cached master data, keeping the existing timestamp. */
function patchMasterCache(patch: Record<string, any>) {
    try {
        const raw = localStorage.getItem(MASTER_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        localStorage.setItem(MASTER_CACHE_KEY, JSON.stringify({
            timestamp: parsed.timestamp,
            data: { ...(parsed.data || {}), ...patch },
        }));
    } catch { /* cache is best-effort; a write failure must not break the refresh */ }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
    const { currentUser, logout } = useUser();
    const { showToast } = useToast();

    // Data State
    const [items, setItems] = useState([]);
    const [locations, setLocations] = useState([]);
    const [attributes, setAttributes] = useState([]);
    const [categories, setCategories] = useState([]);
    const [uoms, setUoms] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [boms, setBoms] = useState([]);
    const [manufacturingOrders, setManufacturingOrders] = useState<any[]>([]);
    const [productionRuns, setProductionRuns] = useState<any[]>([]);
    const [stockEntries, setStockEntries] = useState([]);
    const [stockBalance, setStockBalance] = useState([]);
    const [workCenters, setWorkCenters] = useState([]);
    const [operations, setOperations] = useState([]);
    const [salesOrders, setSalesOrders] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [samples, setSamples] = useState([]);
    const [samplesMeta, setSamplesMeta] = useState<SamplesMeta>({ total: 0, unread: 0, colorStats: {}, page: 1 });
    const [auditLogs, setAuditLogs] = useState([]);
    const [partners, setPartners] = useState([]);
    const [dashboardKPIs, setDashboardKPIs] = useState<any>({});
    const [dashboardSummary, setDashboardSummary] = useState<any>(null);
    const [dashboardKpiHistory, setDashboardKpiHistory] = useState<any>({});
    const [dashboardWorkOrders, setDashboardWorkOrders] = useState<any[]>([]);
    const [itemIndex, setItemIndex] = useState<Record<string, ItemIndexEntry>>({});
    const [companyProfile, setCompanyProfile] = useState<any>(null);
    const [printTemplates, setPrintTemplates] = useState<any[]>([]);
    const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');

    // UI & Sync State
    const [itemPage, setItemPage] = useState(1);
    const [itemTotal, setItemTotal] = useState(0);
    const [woPage, setWoPage] = useState(1);
    const [woTotal, setWoTotal] = useState(0);
    const [prPage, setPrPage] = useState(1);
    const [prTotal, setPrTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditTotal, setAuditTotal] = useState(0);
    const [reportPage, setReportPage] = useState(1);
    const [reportTotal, setReportTotal] = useState(0);
    const [pageSize] = useState(50);
    const [itemSearch, setItemSearch] = useState('');          // committed — drives fetches
    const [itemSearchInput, setItemSearchInput] = useState(''); // live input value
    const [moSearch, setMoSearch] = useState('');
    const [prSearch, setPrSearch] = useState('');
    const [categoryL1, setCategoryL1] = useState('');
    const [categoryL2, setCategoryL2] = useState('');
    const [categoryL3, setCategoryL3] = useState('');
    const [auditType, setAuditType] = useState('');
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // Tracks which domains have received at least one response (success or
    // failure) since page load. Views use this to distinguish "still loading"
    // from "loaded and genuinely empty" — arrays start as [] either way, so
    // without this every list flashes its empty-state text before data arrives.
    const [loadedOnce, setLoadedOnce] = useState<Record<string, boolean>>({});

    // Determinate progress for the FIRST fetchData round only — the one that
    // fans out to master data + items + BOMs + MOs + PRs + samples + partners.
    // `total` is the real number of requests issued (a warm master cache issues
    // fewer), `done` counts responses as they land, so the bar measures
    // something instead of animating a guess. Later fetches are one or two
    // route-scoped requests: a bar there would flicker more than it informs, so
    // they stay on the indeterminate/skeleton loaders.
    const [loadProgress, setLoadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
    const bootTrackedRef = useRef(false);

    const handleSetMoSearch = useCallback((v: string) => {
        setMoSearch(v); setWoPage(1);
    }, []);

    const handleSetPrSearch = useCallback((v: string) => {
        setPrSearch(v); setPrPage(1);
    }, []);

    const handleSetCategoryL1 = useCallback((v: string) => {
        setCategoryL1(v); setCategoryL2(''); setCategoryL3('');
    }, []);

    const handleSetCategoryL2 = useCallback((v: string) => {
        setCategoryL2(v); setCategoryL3('');
    }, []);

    // Debounced item search: the input echoes instantly (itemSearchInput) but the
    // committed value that triggers a backend round-trip (itemSearch) only updates
    // after a quiet period — previously every keystroke refetched /items.
    const itemSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSetItemSearch = useCallback((v: string) => {
        setItemSearchInput(v);
        if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current);
        itemSearchTimer.current = setTimeout(() => { setItemSearch(v); setItemPage(1); }, 350);
    }, []);
    useEffect(() => () => { if (itemSearchTimer.current) clearTimeout(itemSearchTimer.current); }, []);

    const authFetch = useCallback(async (url: string, options: any = {}) => {
        const token = localStorage.getItem('access_token');
        const res = await fetch(url, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${token}` } });
        // Expired/invalid token — log out so MainLayout's currentUser-null guard
        // redirects to /login, instead of every caller silently getting back a
        // 401 body it doesn't check for. 403 (valid token, missing permission)
        // is untouched — that's not an auth failure, it shouldn't sign anyone out.
        if (res.status === 401) {
            logout();
        }
        return res;
    }, [logout]);

    const inFlightRef = useRef<Record<string, Promise<any>>>({});
    // Mirror itemIndex into a ref so fetchData can check "do we already have the
    // full item index?" without taking itemIndex as a dependency (which would
    // rebuild the callback on every index update).
    const itemIndexRef = useRef(itemIndex);
    useEffect(() => { itemIndexRef.current = itemIndex; }, [itemIndex]);

    // Monotonic generation guard for the production-runs slice. Requests aren't
    // cancelled, so e.g. a filtered fetch made while /production-runs?pr=X is
    // mounted can resolve AFTER the corrective unfiltered fetch fired on unmount,
    // silently re-narrowing productionRuns for every other page (SO's PR badges)
    // with no further trigger to self-correct. Only the response from the most
    // recently *dispatched* call is allowed to commit.
    const prGenRef = useRef(0);

    const fetchData = useCallback((target?: string) => {
        if (!currentUser) return Promise.resolve();
        // In the new routing system, we can use the pathname or a passed target
        const fetchTarget = target || (typeof window !== 'undefined' ? window.location.pathname.substring(1) : 'dashboard') || 'dashboard';

        // Dedupe: if an identical fetch for this target is already running, reuse it.
        // Collapses the sidebar-click + destination-page-mount double fetch, and the
        // hover-prefetch + click sequence, into a single round-trip to the backend.
        if (inFlightRef.current[fetchTarget]) return inFlightRef.current[fetchTarget];

        const run = async () => {
        // Set once the request list is known; drives the app-load bar's cleanup.
        let trackBoot = false;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            // v6: adds printTemplates to the master set. v5 added itemIndex
            // attribute_ids + variant_type (BOM designer variant dropdowns for items
            // off the paginated /items page) on top of v4's ends and v3's
            // uom/lot_tracked — bump so a stale cache doesn't serve a thin index.
            const CACHE_KEY = MASTER_CACHE_KEY;
            const CACHE_TTL = 3600000; 
            const savedCache = localStorage.getItem(CACHE_KEY);
            let masterFetched = false;

            if (isInitialLoad && savedCache) {
                const parsed = JSON.parse(savedCache);
                if (Date.now() - parsed.timestamp < CACHE_TTL) {
                    const data = parsed.data;
                    setLocations(data.locations || []); setAttributes(data.attributes || []); setCategories(data.categories || []);
                    setUoms(data.uoms || []); setSizes(data.sizes || []); setWorkCenters(data.workCenters || []); setOperations(data.operations || []);
                    setPartners(data.partners || []);
                    setPrintTemplates(data.printTemplates || []);
                    setItemIndex(data.itemIndex || {});
                    setIsInitialLoad(false); masterFetched = true;
                    // Master data served from cache issues no /partners request, so the
                    // domain would otherwise never leave its loading state.
                    setLoadedOnce(prev => ({ ...prev, partners: true }));
                }
            }

            const requests: Promise<any>[] = [];
            const requestTypes: string[] = [];
            let myPrGen = 0;

            // 1. MASTER DATA (Locations, Partners, etc.)
            // Fetch if initial load OR explicitly targeted OR on Settings/Locations page
            if ((isInitialLoad && !masterFetched) || fetchTarget === 'settings' || fetchTarget === 'locations' || fetchTarget === 'item-metadata' || fetchTarget === 'routing') {
                requests.push(fetch(`${API_BASE}/locations`, { headers })); requestTypes.push('locations');
                requests.push(fetch(`${API_BASE}/attributes`, { headers })); requestTypes.push('attributes');
                requests.push(fetch(`${API_BASE}/categories`, { headers })); requestTypes.push('categories');
                requests.push(fetch(`${API_BASE}/uoms`, { headers })); requestTypes.push('uoms');
                requests.push(fetch(`${API_BASE}/sizes`, { headers })); requestTypes.push('sizes');
                // limit is explicit: every machine picker walks the whole tree client-side,
                // so a partial page hides machines instead of paging them.
                requests.push(fetch(`${API_BASE}/work-centers?limit=2000`, { headers })); requestTypes.push('work-centers');
                requests.push(fetch(`${API_BASE}/operations`, { headers })); requestTypes.push('operations');
                requests.push(fetch(`${API_BASE}/partners`, { headers })); requestTypes.push('partners');
                requests.push(fetch(`${API_BASE}/settings/company`, { headers })); requestTypes.push('company-profile');
            }

            // Print templates are refetched on EVERY first load, cache hit included —
            // unlike the rest of the master set. A layout the admin saved on their PC
            // has to reach the floor's next print, and the cached copy can be an hour
            // stale (unbounded, in fact: any later master write re-stamps the cache
            // timestamp while carrying the old templates forward). One small row per
            // customised doc type, so the extra request is cheap.
            if (isInitialLoad || fetchTarget === 'settings' || fetchTarget === 'print-designer') {
                requests.push(fetch(`${API_BASE}/print-templates`, { headers })); requestTypes.push('print-templates');
            }

            // 2. DOMAIN DATA (Inventory, Orders, etc.)
            // Only fetch what matches the current route to minimize load
            
            // Items & Inventory
            // NOTE: 'bom' is deliberately NOT in this list. The BOM page renders its
            // line/tree display entirely off itemIndex (/items/lookup, cached), so a
            // plain /bom load no longer pulls the paginated /items page. The array is
            // only needed by the BOMDesigner (create/edit modal) — fetched on demand
            // via fetchTarget 'bom-items' (designer open / deep-link create) or when
            // an item search is active (the designer's server-side picker search).
            const wantItems = ['dashboard', 'inventory', 'sample-masters', 'manufacturing', 'work-orders', 'manufacturing-orders', 'production-runs', 'sales-orders', 'purchase-orders', 'stock', 'reports', 'samples'].some(t => fetchTarget.includes(t))
                || fetchTarget === 'bom-items'
                || (fetchTarget.includes('bom') && !!itemSearch);
            if (wantItems) {
                const skip = (itemPage - 1) * pageSize;
                const effectiveCategoryId = categoryL3 || categoryL2 || categoryL1;
                const categoryParam = effectiveCategoryId ? `&category_id=${effectiveCategoryId}` : '';
                requests.push(fetch(`${API_BASE}/items?skip=${skip}&limit=${pageSize}&search=${encodeURIComponent(itemSearch)}${categoryParam}`, { headers }));
                requestTypes.push('items');
            }

            // Complete item name/code index — resolves names for items beyond the
            // paginated items page (fixes UUID-instead-of-name in lists/prints,
            // incl. the dashboard WO table). Fetch whenever we don't yet have it
            // (covers a stale pre-itemIndex localStorage master cache and any
            // entry route), or after item CRUD on the inventory page.
            const idxEmpty = !itemIndexRef.current || Object.keys(itemIndexRef.current).length === 0;
            if (idxEmpty || fetchTarget.includes('inventory')) {
                requests.push(fetch(`${API_BASE}/items/lookup`, { headers })); requestTypes.push('item-lookup');
            }

            // KPIs + dashboard summary (server-side aggregates: warehouse distribution,
            // low-stock names, delivery readiness, recent movements, yield — so the
            // dashboard no longer ships the full stock-balance + all sales-orders).
            if (fetchTarget === 'dashboard' || fetchTarget === '') {
                requests.push(fetch(`${API_BASE}/dashboard/kpis`, { headers }));
                requestTypes.push('kpis');
                requests.push(fetch(`${API_BASE}/dashboard/summary`, { headers }));
                requestTypes.push('dashboard-summary');
                requests.push(fetch(`${API_BASE}/dashboard/kpis/history?days=30`, { headers }));
                requestTypes.push('kpi-history');
            }

            // Engineering
            // The BOM page self-manages its own paginated /boms/summary fetches
            // (search + pagination state live in bom/page.tsx). DataContext only
            // fetches the full /boms payload for manufacturing/MES/sales routes
            // that need the complete nested tree for WO/PR creation and printing.
            // NOT work-orders: that page reads only workCenters/itemIndex and
            // self-fetches its own flat WO list — boms/MO-tree/stock-balance below
            // are all wasted work there. NOT samples: SampleRequestView never reads
            // boms (only companyProfile/attributes) — every status/read toggle was
            // needlessly re-pulling the full nested BOM tree.
            if (fetchTarget.includes('manufacturing') || fetchTarget.includes('production-runs') || fetchTarget.includes('sales-orders')) {
                requests.push(fetch(`${API_BASE}/boms`, { headers }));
                requestTypes.push('boms');
            }

            // MES (Manufacturing Orders + Production Runs)
            const isDashboard = fetchTarget === 'dashboard' || fetchTarget === '';
            if (fetchTarget.includes('manufacturing') || fetchTarget.includes('production-runs') || fetchTarget.includes('sales-orders') || isDashboard || fetchTarget.includes('reports')) {
                const moSkip = (woPage - 1) * pageSize;
                const moSlim = isDashboard ? '&slim=true' : '';
                const moSearchParam = moSearch ? `&search=${encodeURIComponent(moSearch)}` : '';
                requests.push(fetch(`${API_BASE}/manufacturing-orders?skip=${moSkip}&limit=${pageSize}${moSlim}${moSearchParam}`, { headers }));
                requestTypes.push(isDashboard ? 'manufacturing-orders-slim' : 'manufacturing-orders');
                if (!isDashboard) {
                    const prSkip = (prPage - 1) * pageSize;
                    const prSearchParam = prSearch ? `&search=${encodeURIComponent(prSearch)}` : '';
                    myPrGen = ++prGenRef.current;
                    requests.push(fetch(`${API_BASE}/production-runs?skip=${prSkip}&limit=${pageSize}${prSearchParam}`, { headers }));
                    requestTypes.push('production-runs');
                }
            }

            // Inventory / Stock
            // Only fetch the full stock-balance table on routes that actually consume it
            // (dashboard, stock pages, manufacturing/MO/PR creation-availability). The
            // inventory and work-orders views do NOT read stockBalance, so fetching the
            // whole table there was wasted work — costly on the low-power ARM backend.
            if (fetchTarget.includes('stock') || fetchTarget.includes('manufacturing') || fetchTarget.includes('production-runs')) {
                requests.push(fetch(`${API_BASE}/stock/balance`, { headers }));
                requestTypes.push('balance');
            }
            
            if (fetchTarget.includes('stock') || fetchTarget.includes('reports')) {
                 const skip = (reportPage - 1) * pageSize;
                 requests.push(fetch(`${API_BASE}/stock?skip=${skip}&limit=${pageSize}`, { headers }));
                 requestTypes.push('stock-ledger');
            }

            // Sales & CRM
            // Split: sales-orders page reads salesOrders but not samples; samples
            // page reads samples but not salesOrders; customers page reads neither
            // (only partners, fetched separately in master data) — each used to
            // pull both regardless of which one it actually needed.
            if (fetchTarget.includes('sales-orders')) {
                requests.push(fetch(`${API_BASE}/sales-orders`, { headers }));
                requestTypes.push('sales-orders');
            }
            // NOT samples: the samples list is server-paginated + server-filtered
            // (tens of thousands of rows), so SampleRequestView drives its own
            // fetches through loadSamples() with the active page/filter query.

            // Procurement
            if (fetchTarget.includes('purchase-orders') || fetchTarget.includes('suppliers')) {
                requests.push(fetch(`${API_BASE}/purchase-orders`, { headers }));
                requestTypes.push('purchase-orders');
            }

            // Partners (Customers/Suppliers)
            if (fetchTarget.includes('customers') || fetchTarget.includes('suppliers') || fetchTarget.includes('samples')) {
                requests.push(fetch(`${API_BASE}/partners`, { headers }));
                requestTypes.push('partners');
            }

            // Admin / Audit
            if (fetchTarget.includes('audit-logs')) {
                const audSkip = (auditPage - 1) * pageSize;
                requests.push(fetch(`${API_BASE}/audit-logs?skip=${audSkip}&limit=${pageSize}&entity_type=${auditType}`, { headers }));
                requestTypes.push('audit-logs');
            }

            // Count responses as they land so the app-load bar is measured, not
            // simulated. Wrapping preserves Promise.all's reject-on-first-error.
            let tracked = requests;
            if (!bootTrackedRef.current && requests.length > 0) {
                bootTrackedRef.current = true;
                trackBoot = true;
                const total = requests.length;
                let done = 0;
                setLoadProgress({ done: 0, total });
                const tick = () => { done += 1; setLoadProgress({ done, total }); };
                tracked = requests.map(p => p.then(
                    (r) => { tick(); return r; },
                    (e) => { tick(); throw e; },
                ));
            }
            const responses = await Promise.all(tracked);
            const newMasterData: any = {};
            const failedTypes: string[] = [];
            const touchedDomains = new Set(requestTypes.map(t => LOADING_KEY[t]).filter(Boolean));
            for (let i = 0; i < responses.length; i++) {
                const res = responses[i]; const type = requestTypes[i];
                if (!res.ok) { console.warn(`[DataContext] ${type} fetch failed: HTTP ${res.status} ${res.url}`); failedTypes.push(`${type} (${res.status})`); continue; }
                const data = await res.json();
                switch(type) {
                    case 'locations': setLocations(data); newMasterData.locations = data; break;
                    case 'attributes': setAttributes(data); newMasterData.attributes = data; break;
                    case 'categories': setCategories(data); newMasterData.categories = data; break;
                    case 'uoms': setUoms(data); newMasterData.uoms = data; break;
                    case 'sizes': setSizes(data); newMasterData.sizes = data; break;
                    case 'work-centers': setWorkCenters(data); newMasterData.workCenters = data; break;
                    case 'operations': setOperations(data); newMasterData.operations = data; break;
                    case 'partners': setPartners(data.items || []); newMasterData.partners = data.items || []; break;
                    case 'company-profile': setCompanyProfile(data); newMasterData.companyProfile = data; break;
                    case 'print-templates': setPrintTemplates(data || []); newMasterData.printTemplates = data || []; break;
                    case 'items': setItems(data.items); setItemTotal(data.total); break;
                    case 'item-lookup': { const idx: Record<string, ItemIndexEntry> = {}; for (const it of (data || [])) idx[String(it.id)] = { name: it.name, code: it.code, uom: it.uom, lot_tracked: it.lot_tracked, ends: it.ends, variant_type: it.variant_type, attribute_ids: it.attribute_ids }; setItemIndex(idx); newMasterData.itemIndex = idx; break; }
                    case 'kpis': setDashboardKPIs(data); break;
                    case 'dashboard-summary': setDashboardSummary(data); break;
                    case 'kpi-history': setDashboardKpiHistory(data); break;
                    case 'boms': setBoms(data); break;
                    case 'manufacturing-orders': setManufacturingOrders(data.items); setWoTotal(data.total); break;
                    case 'manufacturing-orders-slim': setDashboardWorkOrders(data.items); break;
                    case 'production-runs':
                        if (myPrGen === prGenRef.current) { setProductionRuns(data.items); setPrTotal(data.total); }
                        break;
                    case 'balance': setStockBalance(data); break;
                    case 'stock-ledger': setStockEntries(data.items || []); setReportTotal(data.total || 0); break;
                    case 'sales-orders': setSalesOrders(data); break;
                    case 'purchase-orders': setPurchaseOrders(data); break;
                    case 'audit-logs': setAuditLogs(data.items); setAuditTotal(data.total); break;
                }
            }
            if (touchedDomains.size > 0) {
                setLoadedOnce(prev => {
                    const next = { ...prev };
                    touchedDomains.forEach(d => { next[d] = true; });
                    return next;
                });
            }
            if (failedTypes.length > 0) {
                showToast(`Some data could not be loaded: ${failedTypes.join(', ')}`, 'warning');
            }
            if (Object.keys(newMasterData).length > 0) {
                const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"data":{}}');
                localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: { ...cache.data, ...newMasterData } }));
                setIsInitialLoad(false);
            }
        } catch (e) {
            console.error("Fetch Error", e);
            showToast('Network error — could not reach the server. Check your connection.', 'danger');
            // Whole round-trip failed before any response was read (offline, DNS,
            // CORS...) — mark every domain as "attempted" so views fall back to
            // their empty/error state instead of spinning forever.
            setLoadedOnce(prev => ({ ...prev, ...Object.fromEntries(Object.values(LOADING_KEY).map(k => [k, true])) }));
        } finally {
            // Retire the bar on both paths — a failed boot must not leave it
            // parked at a partial fill forever.
            if (trackBoot) setLoadProgress({ done: 0, total: 0 });
        }
        };

        const p = run().finally(() => { delete inFlightRef.current[fetchTarget]; });
        inFlightRef.current[fetchTarget] = p;
        return p;
    }, [currentUser, itemPage, woPage, prPage, auditPage, reportPage, itemSearch, moSearch, prSearch, categoryL1, categoryL2, categoryL3, auditType, isInitialLoad, pageSize, showToast]);

    // Targeted refresh for the Manufacturing Orders page: re-pull ONLY the MO
    // (root-only) + PR lists. Used after WO/MO/PR mutations instead of the broad
    // fetchData(), which also re-fetched items + the full nested /boms + the whole
    // stock-balance table — none of which a WO/MO create changes. Cuts a WO create
    // from ~5 heavy calls down to 2 light ones.
    const refreshManufacturing = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const moSkip = (woPage - 1) * pageSize;
            const moSearchParam = moSearch ? `&search=${encodeURIComponent(moSearch)}` : '';
            const prSkip = (prPage - 1) * pageSize;
            const prSearchParam = prSearch ? `&search=${encodeURIComponent(prSearch)}` : '';
            const myPrGen = ++prGenRef.current;
            const [moRes, prRes] = await Promise.all([
                fetch(`${API_BASE}/manufacturing-orders?skip=${moSkip}&limit=${pageSize}${moSearchParam}`, { headers }),
                fetch(`${API_BASE}/production-runs?skip=${prSkip}&limit=${pageSize}${prSearchParam}`, { headers }),
            ]);
            if (moRes.ok) { const d = await moRes.json(); setManufacturingOrders(d.items); setWoTotal(d.total); }
            if (prRes.ok && myPrGen === prGenRef.current) { const d = await prRes.json(); setProductionRuns(d.items); setPrTotal(d.total); }
        } catch (e) { console.error('refreshManufacturing error', e); }
    }, [currentUser, woPage, prPage, moSearch, prSearch, pageSize]);

    // Targeted refresh for the Purchase Orders page after a PO mutation. Goes
    // straight to /purchase-orders instead of the broad fetchData(): fetchData
    // dedupes by target, so a fire-and-forget fetchData() right after a save can
    // attach to a still-in-flight pre-edit GET of the (heavy, unpaginated) PO list
    // and re-render the list with stale data — the edit only appeared after a full
    // page reload. A direct, awaited, no-store fetch bypasses the dedup and the
    // HTTP cache, so the list always reflects the just-saved change.
    const refreshPurchaseOrders = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch(`${API_BASE}/purchase-orders`, { headers, cache: 'no-store' });
            if (res.ok) { const d = await res.json(); setPurchaseOrders(d); }
        } catch (e) { console.error('refreshPurchaseOrders error', e); }
    }, [currentUser]);

    // Targeted refresh for the Sales Orders page after a SO mutation — same
    // reasoning as refreshPurchaseOrders: goes straight to /sales-orders instead
    // of the broad fetchData() (items + full /boms + MOs + PRs + samples + partners).
    const refreshSalesOrders = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch(`${API_BASE}/sales-orders`, { headers, cache: 'no-store' });
            if (res.ok) { const d = await res.json(); setSalesOrders(d); }
        } catch (e) { console.error('refreshSalesOrders error', e); }
    }, [currentUser]);

    // The samples list is fetched one page at a time with the filters applied
    // server-side — the table can hold tens of thousands of requests, so it is
    // never loaded whole. The last query is remembered so a mutation (status
    // change, read toggle, delete) can replay the exact page the user is on.
    const sampleQueryRef = useRef<SampleQuery>({ page: 1 });
    // Filter/page changes fire in bursts (typing, clicking through pages); only
    // the most recently dispatched response may commit, or a slow early request
    // can overwrite the list with the wrong page.
    const sampleGenRef = useRef(0);

    const loadSamples = useCallback(async (q?: SampleQuery) => {
        if (!currentUser) return;
        const query = q ? { ...q } : sampleQueryRef.current;
        // focus_id is a one-shot deep-link jump — don't replay it on refresh.
        sampleQueryRef.current = { ...query, focusId: undefined };
        const params = new URLSearchParams();
        params.set('limit', String(SAMPLE_PAGE_SIZE));
        params.set('skip', String((Math.max(1, query.page || 1) - 1) * SAMPLE_PAGE_SIZE));
        if (query.search) params.set('search', query.search);
        if (query.status && query.status !== 'ALL') params.set('status', query.status);
        if (query.categoryValueId && query.categoryValueId !== 'ALL') params.set('category_value_id', query.categoryValueId);
        if (query.createdFrom) params.set('created_from', query.createdFrom);
        if (query.createdTo) params.set('created_to', query.createdTo);
        if (query.focusId) params.set('focus_id', query.focusId);
        const myGen = ++sampleGenRef.current;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch(`${API_BASE}/samples?${params.toString()}`, { headers, cache: 'no-store' });
            if (res.ok && myGen === sampleGenRef.current) {
                const d = await res.json();
                setSamples(d.items || []);
                setSamplesMeta({
                    total: d.total || 0,
                    unread: d.unread || 0,
                    colorStats: d.color_stats || {},
                    page: d.page || 1,
                });
            }
        } catch (e) {
            console.error('loadSamples error', e);
        } finally {
            if (myGen === sampleGenRef.current) setLoadedOnce(prev => ({ ...prev, samples: true }));
        }
    }, [currentUser]);

    /** Re-run the current samples query after a mutation. */
    const refreshSamples = useCallback(() => loadSamples(), [loadSamples]);

    // Targeted refresh for the Item Metadata page (categories/UOMs/attributes
    // CRUD) — that page reads only these 3 collections, but every small mutation
    // called the broad fetchData(), which on this route refetches ALL master data
    // (locations, sizes, work-centers, operations, partners, company) + items +
    // item-lookup as well.
    const refreshItemMetadata = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const [catRes, uomRes, attrRes] = await Promise.all([
                fetch(`${API_BASE}/categories`, { headers, cache: 'no-store' }),
                fetch(`${API_BASE}/uoms`, { headers, cache: 'no-store' }),
                fetch(`${API_BASE}/attributes`, { headers, cache: 'no-store' }),
            ]);
            if (catRes.ok) setCategories(await catRes.json());
            if (uomRes.ok) setUoms(await uomRes.json());
            if (attrRes.ok) setAttributes(await attrRes.json());
        } catch (e) { console.error('refreshItemMetadata error', e); }
    }, [currentUser]);

    // Targeted refresh for the Routing page (work centers/operations CRUD) —
    // that page reads only workCenters/operations/locations, but every mutation
    // called fetchData('routing'), which refetches ALL 9 master-data endpoints
    // (locations, attributes, categories, uoms, sizes, work-centers, operations,
    // partners, company).
    const refreshRouting = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const [wcRes, opRes, locRes] = await Promise.all([
                fetch(`${API_BASE}/work-centers?limit=2000`, { headers, cache: 'no-store' }),
                fetch(`${API_BASE}/operations`, { headers, cache: 'no-store' }),
                fetch(`${API_BASE}/locations`, { headers, cache: 'no-store' }),
            ]);
            if (wcRes.ok) setWorkCenters(await wcRes.json());
            if (opRes.ok) setOperations(await opRes.json());
            if (locRes.ok) setLocations(await locRes.json());
        } catch (e) { console.error('refreshRouting error', e); }
    }, [currentUser]);

    // Targeted refresh for a STOCK_UPDATE live event — only the balance table,
    // not the broad fetchData() (which on stock/manufacturing routes also re-pulls
    // items + the full nested /boms).
    const refreshStockBalance = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch(`${API_BASE}/stock/balance`, { headers, cache: 'no-store' });
            if (res.ok) { const d = await res.json(); setStockBalance(d); }
        } catch (e) { console.error('refreshStockBalance error', e); }
    }, [currentUser]);

    // Targeted refresh for a PRINT_TEMPLATE_UPDATE live event. Deliberately NOT
    // route-aware (unlike production/stock): a print modal can open from any page,
    // so a layout the client just saved must reach every screen, not only the
    // designer's. Cheap — one row per customised document type.
    const refreshPrintTemplates = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch(`${API_BASE}/print-templates`, { headers, cache: 'no-store' });
            if (res.ok) {
                const data = await res.json() || [];
                setPrintTemplates(data);
                // Write through: without this the next page load restores the pre-edit
                // templates from the master cache and prints the old layout.
                patchMasterCache({ printTemplates: data });
            }
        } catch (e) { console.error('refreshPrintTemplates error', e); }
    }, [currentUser]);

    // Targeted refresh for a KPI_UPDATE live event while on the dashboard — only
    // the 3 KPI-ish calls, not the broad fetchData('dashboard') (which also
    // re-pulls paginated items + item-lookup + a slim MO page, none of which a
    // KPI ping (fired by nearly every sales/sample/stock/item mutation) changes).
    const refreshDashboardKPIs = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const [kpiRes, summaryRes, historyRes] = await Promise.all([
                fetch(`${API_BASE}/dashboard/kpis`, { headers, cache: 'no-store' }),
                fetch(`${API_BASE}/dashboard/summary`, { headers, cache: 'no-store' }),
                fetch(`${API_BASE}/dashboard/kpis/history?days=30`, { headers, cache: 'no-store' }),
            ]);
            if (kpiRes.ok) setDashboardKPIs(await kpiRes.json());
            if (summaryRes.ok) setDashboardSummary(await summaryRes.json());
            if (historyRes.ok) setDashboardKpiHistory(await historyRes.json());
        } catch (e) { console.error('refreshDashboardKPIs error', e); }
    }, [currentUser]);

    const handleTabHover = (tab: string) => fetchData(tab);

    useEffect(() => { if (currentUser) fetchData(); }, [currentUser, itemPage, woPage, prPage, auditPage, reportPage, itemSearch, moSearch, prSearch, categoryL1, categoryL2, categoryL3, auditType, fetchData]);

    // When the manufacturing PR filter is CLEARED (e.g. leaving /production-runs
    // after a deep-link PR-badge click narrowed the shared list to one PR), the
    // global productionRuns must be restored to the full set for every page that
    // reads it (SO PR badges). The corrective fetchData() above can be swallowed
    // by the target dedupe when a narrowed same-target fetch (nav hover-prefetch,
    // sidebar click dispatched while prSearch was still set) is already in flight,
    // leaving the list stuck narrowed until a hard refresh. This dedupe-free,
    // generation-guarded refetch bumps the generation LAST and bypasses the dedupe,
    // so the unfiltered result always wins over any stale narrowed fetch.
    const prevPrSearchRef = useRef(prSearch);
    useEffect(() => {
        const prev = prevPrSearchRef.current;
        prevPrSearchRef.current = prSearch;
        if (!(prev && !prSearch && currentUser)) return;
        (async () => {
            try {
                const token = localStorage.getItem('access_token');
                const headers = { 'Authorization': `Bearer ${token}` };
                const prSkip = (prPage - 1) * pageSize;
                const myPrGen = ++prGenRef.current;
                const res = await fetch(`${API_BASE}/production-runs?skip=${prSkip}&limit=${pageSize}`, { headers, cache: 'no-store' });
                if (res.ok && myPrGen === prGenRef.current) { const d = await res.json(); setProductionRuns(d.items); setPrTotal(d.total); }
            } catch (e) { console.error('restore productionRuns error', e); }
        })();
    }, [prSearch, currentUser, prPage, pageSize]);

    // WebSocket Logic
    const fetchDataRef = useRef(fetchData);
    useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
    const refreshManufacturingRef = useRef(refreshManufacturing);
    useEffect(() => { refreshManufacturingRef.current = refreshManufacturing; }, [refreshManufacturing]);
    const refreshStockBalanceRef = useRef(refreshStockBalance);
    useEffect(() => { refreshStockBalanceRef.current = refreshStockBalance; }, [refreshStockBalance]);
    const refreshDashboardKPIsRef = useRef(refreshDashboardKPIs);
    useEffect(() => { refreshDashboardKPIsRef.current = refreshDashboardKPIs; }, [refreshDashboardKPIs]);
    const refreshPrintTemplatesRef = useRef(refreshPrintTemplates);
    useEffect(() => { refreshPrintTemplatesRef.current = refreshPrintTemplates; }, [refreshPrintTemplates]);

    // Pages that own their data (e.g. /work-orders fetches its own list) subscribe
    // here to be told when a debounced batch of live events has arrived.
    const liveSubsRef = useRef<Set<(kind: LiveKind) => void>>(new Set());
    const subscribeLiveEvents = useCallback((fn: (kind: LiveKind) => void) => {
        liveSubsRef.current.add(fn);
        return () => { liveSubsRef.current.delete(fn); };
    }, []);

    useEffect(() => {
        if (!currentUser) return;

        // WebSocket logic is safe here as it only runs on client
        const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/events';
        let ws: WebSocket;
        let reconnectTimer: any;
        let pingTimer: any;
        let flushTimer: any = null;
        let lastActivity = Date.now();

        // Debounce buffer: a burst of WS events (bulk status change, PR creation
        // fan-out) collapses into ONE refetch + ONE toast per 800ms window instead
        // of one heavy refetch per message. Each of those refetches used to pull
        // items + the full nested /boms + all-level MOs + PRs — a storm.
        const pending = { kinds: new Set<LiveKind>(), codes: new Map<string, string>() };

        const flushLive = () => {
            flushTimer = null;
            const kinds = new Set(pending.kinds);
            const codes = new Map(pending.codes);
            pending.kinds.clear(); pending.codes.clear();
            const path = typeof window !== 'undefined' ? window.location.pathname : '';
            const onDashboard = path === '/' || path.startsWith('/dashboard');

            if (kinds.has('production')) {
                // Route-aware refresh: only re-pull what the CURRENT page reads.
                // Every page re-fetches on mount, so skipping unrelated routes is
                // safe — they're fresh again the moment the user navigates there.
                if (path.startsWith('/manufacturing-orders') || path.startsWith('/production-runs')) {
                    // Root MOs + PRs only; never all_levels → no wrong-MO flash.
                    refreshManufacturingRef.current();
                } else if (onDashboard) {
                    fetchDataRef.current('dashboard');
                }
                liveSubsRef.current.forEach(fn => { try { fn('production'); } catch {} });
                if (codes.size === 1) {
                    const [code, status] = Array.from(codes.entries())[0];
                    showToast(`Manufacturing Order ${code} updated: ${status}`, 'info');
                } else if (codes.size > 1) {
                    showToast(`${codes.size} manufacturing orders updated`, 'info');
                }
            }
            if (kinds.has('kpi')) {
                if (onDashboard && !kinds.has('production')) refreshDashboardKPIsRef.current();
                liveSubsRef.current.forEach(fn => { try { fn('kpi'); } catch {} });
            }
            if (kinds.has('stock')) {
                // Route-aware, same reasoning as 'production': only the routes that
                // actually read stockBalance (per CLAUDE.md) re-pull it.
                if (path.startsWith('/stock') || path.startsWith('/booking-stock') || path.startsWith('/manufacturing-orders') || path.startsWith('/production-runs')) {
                    refreshStockBalanceRef.current();
                } else if (onDashboard) {
                    fetchDataRef.current('dashboard');
                }
                liveSubsRef.current.forEach(fn => { try { fn('stock'); } catch {} });
            }
            if (kinds.has('weaving')) {
                // Pages that self-fetch (WeavingMonitorView) subscribe and reload themselves.
                liveSubsRef.current.forEach(fn => { try { fn('weaving'); } catch {} });
            }
            if (kinds.has('bom')) {
                // A BOM was created/updated/deleted elsewhere. The /bom page owns its
                // own paginated /boms/summary list and reloads via subscription below;
                // DataContext.boms consumers (manufacturing/MES/sales) re-pull the full
                // /boms on their route refetch. Route-aware: only what's on screen.
                if (path.startsWith('/manufacturing') || path.startsWith('/production-runs') || path.startsWith('/sales-orders')) {
                    fetchDataRef.current(path.replace(/^\//, ''));
                }
                liveSubsRef.current.forEach(fn => { try { fn('bom'); } catch {} });
            }
            if (kinds.has('sales')) {
                // SO status is derived from packing/dispatch events that happen on
                // other pages (and other people's devices), so an SO row can change
                // while nobody touched this list. Route-aware like the rest.
                if (path.startsWith('/sales-orders')) fetchDataRef.current('sales-orders');
                liveSubsRef.current.forEach(fn => { try { fn('sales'); } catch {} });
            }
        };
        const queueLive = (kind: LiveKind, code?: string, status?: string) => {
            pending.kinds.add(kind);
            if (code) pending.codes.set(code, status || '');
            if (!flushTimer) flushTimer = setTimeout(flushLive, 800);
        };

        const connect = () => {
            setWsStatus('connecting');
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                lastActivity = Date.now();
                setWsStatus('open');
                clearInterval(pingTimer);
                // App-level heartbeat: ping every 25s; if no traffic for 60s the
                // link is dead (server gone, proxy dropped it) — force a reconnect.
                pingTimer = setInterval(() => {
                    if (Date.now() - lastActivity > 60000) { try { ws.close(); } catch {} return; }
                    try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
                }, 25000);
            };
            ws.onmessage = (event) => {
                lastActivity = Date.now();
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'pong') return;
                    switch (data.type) {
                        case 'WORK_ORDER_UPDATE':
                        case 'MANUFACTURING_ORDER_UPDATE':
                            // Cheap optimistic patch stays immediate; the refetch is debounced.
                            setManufacturingOrders((prev: any[]) => prev.map((mo: any) =>
                                mo.id === data.mo_id ? { ...mo, status: data.status } : mo
                            ));
                            queueLive('production', data.code, data.status);
                            break;
                        case 'PRODUCTION_RUN_UPDATE':
                            queueLive('production');
                            break;
                        case 'PRINT_TEMPLATE_UPDATE':
                            // Not debounced: fires once when an admin saves a layout, and
                            // the payload is one small row. No toast — a layout change is
                            // not news to an operator mid-shift.
                            refreshPrintTemplatesRef.current();
                            break;
                        case 'KPI_UPDATE':
                            // A mutation invalidated the KPI cache — refresh dashboard
                            // KPIs + summary so the numbers stay live.
                            queueLive('kpi');
                            break;
                        case 'STOCK_UPDATE':
                        // A quarantine disposition doesn't move stock, but it changes
                        // which stock is packable — same 'stock' subscribers care, and
                        // the Quarantine Packing page reloads off this.
                        case 'QUARANTINE_UPDATE':
                            queueLive('stock');
                            break;
                        case 'BOM_UPDATE':
                            queueLive('bom');
                            break;
                        case 'SALES_ORDER_UPDATE':
                            queueLive('sales');
                            break;
                        case 'weaving_run':
                            queueLive('weaving');
                            break;
                        default:
                            break;
                    }
                } catch (e) { console.error("WS Error", e); }
            };
            ws.onclose = (e) => { setWsStatus('closed'); clearInterval(pingTimer); if (e.code !== 1000) reconnectTimer = setTimeout(connect, 5000); };
            ws.onerror = () => ws.close();
        };
        connect();
        return () => { clearInterval(pingTimer); if (ws) ws.close(1000); clearTimeout(reconnectTimer); clearTimeout(flushTimer); };
    }, [currentUser, showToast]);

    // Dashboard auto-refresh: while the user is viewing the dashboard, refresh
    // KPIs + summary every 60s so numbers stay live without a manual reload.
    useEffect(() => {
        if (!currentUser) return;
        const id = setInterval(() => {
            const path = typeof window !== 'undefined' ? window.location.pathname : '';
            if (path === '/' || path.startsWith('/dashboard')) fetchDataRef.current('dashboard');
        }, 60000);
        return () => clearInterval(id);
    }, [currentUser]);

    const loading = useMemo(() => ({
        items: !loadedOnce.items, boms: !loadedOnce.boms, manufacturingOrders: !loadedOnce.manufacturingOrders,
        productionRuns: !loadedOnce.productionRuns, stockBalance: !loadedOnce.stockBalance,
        stockEntries: !loadedOnce.stockEntries, salesOrders: !loadedOnce.salesOrders,
        purchaseOrders: !loadedOnce.purchaseOrders, samples: !loadedOnce.samples, auditLogs: !loadedOnce.auditLogs,
        partners: !loadedOnce.partners,
    }), [loadedOnce]);

    const value = React.useMemo(() => ({
        items, locations, attributes, categories, uoms, sizes, boms, manufacturingOrders, productionRuns,
        stockEntries, stockBalance, workCenters, operations, salesOrders, purchaseOrders, samples, samplesMeta, auditLogs,
        partners, dashboardKPIs, dashboardSummary, dashboardKpiHistory, dashboardWorkOrders, itemIndex, companyProfile,
        printTemplates, refreshPrintTemplates,
        wsStatus,
        loading,
        loadProgress,
        pagination: { itemPage, setItemPage, itemTotal, woPage, setWoPage, woTotal, prPage, setPrPage, prTotal, auditPage, setAuditPage, auditTotal, reportPage, setReportPage, reportTotal, moSearch, setMoSearch: handleSetMoSearch, prSearch, setPrSearch: handleSetPrSearch, pageSize },
        filters: { itemSearch: itemSearchInput, setItemSearch: handleSetItemSearch, categoryL1, setCategoryL1: handleSetCategoryL1, categoryL2, setCategoryL2: handleSetCategoryL2, categoryL3, setCategoryL3, auditType, setAuditType },
        fetchData, refreshManufacturing, refreshPurchaseOrders, refreshSalesOrders, loadSamples, refreshSamples, refreshItemMetadata, refreshRouting, handleTabHover, authFetch, subscribeLiveEvents
    }), [
        items, locations, attributes, categories, uoms, sizes, boms, manufacturingOrders, productionRuns,
        stockEntries, stockBalance, workCenters, operations, salesOrders, purchaseOrders, samples, samplesMeta, auditLogs,
        partners, dashboardKPIs, dashboardSummary, dashboardKpiHistory, dashboardWorkOrders, itemIndex, companyProfile,
        printTemplates, refreshPrintTemplates, wsStatus, loading, loadProgress,
        itemPage, itemTotal, woPage, woTotal, prPage, prTotal, auditPage, auditTotal, reportPage, reportTotal, pageSize,
        itemSearchInput, moSearch, prSearch, categoryL1, categoryL2, categoryL3, auditType, fetchData, refreshManufacturing, refreshPurchaseOrders, refreshSalesOrders, loadSamples, refreshSamples, refreshItemMetadata, refreshRouting, handleTabHover, authFetch,
        handleSetCategoryL1, handleSetCategoryL2, handleSetMoSearch, handleSetPrSearch, handleSetItemSearch, subscribeLiveEvents
    ]);

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) throw new Error('useData must be used within DataProvider');
    return context;
};
