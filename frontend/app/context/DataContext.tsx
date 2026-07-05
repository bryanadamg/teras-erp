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
    'audit-logs': 'auditLogs',
};

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
    auditLogs: any[];
    partners: any[];
    dashboardKPIs: any;
    dashboardSummary: any;
    dashboardKpiHistory: any;
    dashboardWorkOrders: any[];
    itemIndex: Record<string, { name: string; code: string; uom?: string; lot_tracked?: boolean }>;
    companyProfile: any;
    wsStatus: 'connecting' | 'open' | 'closed';

    // True until the domain's first fetch attempt (success or failure) resolves.
    // Views gate their empty-state message on this so "no data yet" never
    // flashes as "there is no data" before the request completes.
    loading: {
        items: boolean; boms: boolean; manufacturingOrders: boolean; productionRuns: boolean;
        stockBalance: boolean; stockEntries: boolean; salesOrders: boolean; purchaseOrders: boolean;
        samples: boolean; auditLogs: boolean;
    };

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
    refreshSamples: () => Promise<void>;
    refreshItemMetadata: () => Promise<void>;
    refreshRouting: () => Promise<void>;
    handleTabHover: (tab: string) => void;
    authFetch: (url: string, options?: any) => Promise<Response>;
    subscribeLiveEvents: (fn: (kind: 'production' | 'kpi' | 'stock' | 'weaving') => void) => () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

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
    const [auditLogs, setAuditLogs] = useState([]);
    const [partners, setPartners] = useState([]);
    const [dashboardKPIs, setDashboardKPIs] = useState<any>({});
    const [dashboardSummary, setDashboardSummary] = useState<any>(null);
    const [dashboardKpiHistory, setDashboardKpiHistory] = useState<any>({});
    const [dashboardWorkOrders, setDashboardWorkOrders] = useState<any[]>([]);
    const [itemIndex, setItemIndex] = useState<Record<string, { name: string; code: string; uom?: string; lot_tracked?: boolean }>>({});
    const [companyProfile, setCompanyProfile] = useState<any>(null);
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

    const fetchData = useCallback((target?: string) => {
        if (!currentUser) return Promise.resolve();
        // In the new routing system, we can use the pathname or a passed target
        const fetchTarget = target || (typeof window !== 'undefined' ? window.location.pathname.substring(1) : 'dashboard') || 'dashboard';

        // Dedupe: if an identical fetch for this target is already running, reuse it.
        // Collapses the sidebar-click + destination-page-mount double fetch, and the
        // hover-prefetch + click sequence, into a single round-trip to the backend.
        if (inFlightRef.current[fetchTarget]) return inFlightRef.current[fetchTarget];

        const run = async () => {
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            // v3: itemIndex now carries uom/lot_tracked (needed by PackingView) —
            // bump so a stale v2 cache doesn't serve an index missing those fields.
            const CACHE_KEY = 'terras_master_cache_v3';
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
                    setItemIndex(data.itemIndex || {});
                    setIsInitialLoad(false); masterFetched = true;
                }
            }

            const requests: Promise<any>[] = [];
            const requestTypes: string[] = [];

            // 1. MASTER DATA (Locations, Partners, etc.)
            // Fetch if initial load OR explicitly targeted OR on Settings/Locations page
            if ((isInitialLoad && !masterFetched) || fetchTarget === 'settings' || fetchTarget === 'locations' || fetchTarget === 'item-metadata' || fetchTarget === 'routing') {
                requests.push(fetch(`${API_BASE}/locations`, { headers })); requestTypes.push('locations');
                requests.push(fetch(`${API_BASE}/attributes`, { headers })); requestTypes.push('attributes');
                requests.push(fetch(`${API_BASE}/categories`, { headers })); requestTypes.push('categories');
                requests.push(fetch(`${API_BASE}/uoms`, { headers })); requestTypes.push('uoms');
                requests.push(fetch(`${API_BASE}/sizes`, { headers })); requestTypes.push('sizes');
                requests.push(fetch(`${API_BASE}/work-centers`, { headers })); requestTypes.push('work-centers');
                requests.push(fetch(`${API_BASE}/operations`, { headers })); requestTypes.push('operations');
                requests.push(fetch(`${API_BASE}/partners`, { headers })); requestTypes.push('partners');
                requests.push(fetch(`${API_BASE}/settings/company`, { headers })); requestTypes.push('company-profile');
            }

            // 2. DOMAIN DATA (Inventory, Orders, etc.)
            // Only fetch what matches the current route to minimize load
            
            // Items & Inventory
            if (['dashboard', 'inventory', 'sample-masters', 'bom', 'manufacturing', 'work-orders', 'manufacturing-orders', 'production-runs', 'sales-orders', 'purchase-orders', 'stock', 'reports', 'samples'].some(t => fetchTarget.includes(t))) {
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
            if (fetchTarget.includes('samples')) {
                requests.push(fetch(`${API_BASE}/samples`, { headers }));
                requestTypes.push('samples');
            }

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

            const responses = await Promise.all(requests);
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
                    case 'items': setItems(data.items); setItemTotal(data.total); break;
                    case 'item-lookup': { const idx: Record<string, { name: string; code: string; uom?: string; lot_tracked?: boolean }> = {}; for (const it of (data || [])) idx[String(it.id)] = { name: it.name, code: it.code, uom: it.uom, lot_tracked: it.lot_tracked }; setItemIndex(idx); newMasterData.itemIndex = idx; break; }
                    case 'kpis': setDashboardKPIs(data); break;
                    case 'dashboard-summary': setDashboardSummary(data); break;
                    case 'kpi-history': setDashboardKpiHistory(data); break;
                    case 'boms': setBoms(data); break;
                    case 'manufacturing-orders': setManufacturingOrders(data.items); setWoTotal(data.total); break;
                    case 'manufacturing-orders-slim': setDashboardWorkOrders(data.items); break;
                    case 'production-runs': setProductionRuns(data.items); setPrTotal(data.total); break;
                    case 'balance': setStockBalance(data); break;
                    case 'stock-ledger': setStockEntries(data.items || []); setReportTotal(data.total || 0); break;
                    case 'sales-orders': setSalesOrders(data); break;
                    case 'samples': setSamples(data); break;
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
            const [moRes, prRes] = await Promise.all([
                fetch(`${API_BASE}/manufacturing-orders?skip=${moSkip}&limit=${pageSize}${moSearchParam}`, { headers }),
                fetch(`${API_BASE}/production-runs?skip=${prSkip}&limit=${pageSize}${prSearchParam}`, { headers }),
            ]);
            if (moRes.ok) { const d = await moRes.json(); setManufacturingOrders(d.items); setWoTotal(d.total); }
            if (prRes.ok) { const d = await prRes.json(); setProductionRuns(d.items); setPrTotal(d.total); }
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

    // Targeted refresh for the Samples page after a sample mutation — same
    // reasoning as refreshSalesOrders: goes straight to /samples instead of the
    // broad fetchData() (which no longer even pulls boms/sales-orders for this
    // route, but still would re-pull items + master data unnecessarily).
    const refreshSamples = useCallback(async () => {
        if (!currentUser) return;
        try {
            const token = localStorage.getItem('access_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const res = await fetch(`${API_BASE}/samples`, { headers, cache: 'no-store' });
            if (res.ok) { const d = await res.json(); setSamples(d); }
        } catch (e) { console.error('refreshSamples error', e); }
    }, [currentUser]);

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
                fetch(`${API_BASE}/work-centers`, { headers, cache: 'no-store' }),
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

    // WebSocket Logic
    const fetchDataRef = useRef(fetchData);
    useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
    const refreshManufacturingRef = useRef(refreshManufacturing);
    useEffect(() => { refreshManufacturingRef.current = refreshManufacturing; }, [refreshManufacturing]);
    const refreshStockBalanceRef = useRef(refreshStockBalance);
    useEffect(() => { refreshStockBalanceRef.current = refreshStockBalance; }, [refreshStockBalance]);
    const refreshDashboardKPIsRef = useRef(refreshDashboardKPIs);
    useEffect(() => { refreshDashboardKPIsRef.current = refreshDashboardKPIs; }, [refreshDashboardKPIs]);

    // Pages that own their data (e.g. /work-orders fetches its own list) subscribe
    // here to be told when a debounced batch of live events has arrived.
    const liveSubsRef = useRef<Set<(kind: 'production' | 'kpi' | 'stock' | 'weaving') => void>>(new Set());
    const subscribeLiveEvents = useCallback((fn: (kind: 'production' | 'kpi' | 'stock' | 'weaving') => void) => {
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
        const pending = { kinds: new Set<'production' | 'kpi' | 'stock' | 'weaving'>(), codes: new Map<string, string>() };

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
        };
        const queueLive = (kind: 'production' | 'kpi' | 'stock' | 'weaving', code?: string, status?: string) => {
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
                        case 'KPI_UPDATE':
                            // A mutation invalidated the KPI cache — refresh dashboard
                            // KPIs + summary so the numbers stay live.
                            queueLive('kpi');
                            break;
                        case 'STOCK_UPDATE':
                            queueLive('stock');
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
    }), [loadedOnce]);

    const value = React.useMemo(() => ({
        items, locations, attributes, categories, uoms, sizes, boms, manufacturingOrders, productionRuns,
        stockEntries, stockBalance, workCenters, operations, salesOrders, purchaseOrders, samples, auditLogs,
        partners, dashboardKPIs, dashboardSummary, dashboardKpiHistory, dashboardWorkOrders, itemIndex, companyProfile,
        wsStatus,
        loading,
        pagination: { itemPage, setItemPage, itemTotal, woPage, setWoPage, woTotal, prPage, setPrPage, prTotal, auditPage, setAuditPage, auditTotal, reportPage, setReportPage, reportTotal, moSearch, setMoSearch: handleSetMoSearch, prSearch, setPrSearch: handleSetPrSearch, pageSize },
        filters: { itemSearch: itemSearchInput, setItemSearch: handleSetItemSearch, categoryL1, setCategoryL1: handleSetCategoryL1, categoryL2, setCategoryL2: handleSetCategoryL2, categoryL3, setCategoryL3, auditType, setAuditType },
        fetchData, refreshManufacturing, refreshPurchaseOrders, refreshSalesOrders, refreshSamples, refreshItemMetadata, refreshRouting, handleTabHover, authFetch, subscribeLiveEvents
    }), [
        items, locations, attributes, categories, uoms, sizes, boms, manufacturingOrders, productionRuns,
        stockEntries, stockBalance, workCenters, operations, salesOrders, purchaseOrders, samples, auditLogs,
        partners, dashboardKPIs, dashboardSummary, dashboardKpiHistory, dashboardWorkOrders, itemIndex, companyProfile, wsStatus, loading,
        itemPage, itemTotal, woPage, woTotal, prPage, prTotal, auditPage, auditTotal, reportPage, reportTotal, pageSize,
        itemSearchInput, moSearch, prSearch, categoryL1, categoryL2, categoryL3, auditType, fetchData, refreshManufacturing, refreshPurchaseOrders, refreshSalesOrders, refreshSamples, refreshItemMetadata, refreshRouting, handleTabHover, authFetch,
        handleSetCategoryL1, handleSetCategoryL2, handleSetMoSearch, handleSetPrSearch, handleSetItemSearch, subscribeLiveEvents
    ]);

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) throw new Error('useData must be used within DataProvider');
    return context;
};
