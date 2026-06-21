'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from './UserContext';
import { useToast } from '../components/shared/Toast';

const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

interface DataContextType {
    items: any[];
    locations: any[];
    locationCategories: any[];
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
    itemIndex: Record<string, { name: string; code: string }>;
    companyProfile: any;

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
    handleTabHover: (tab: string) => void;
    authFetch: (url: string, options?: any) => Promise<Response>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
    const { currentUser } = useUser();
    const { showToast } = useToast();

    // Data State
    const [items, setItems] = useState([]);
    const [locations, setLocations] = useState([]);
    const [locationCategories, setLocationCategories] = useState([]);
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
    const [itemIndex, setItemIndex] = useState<Record<string, { name: string; code: string }>>({});
    const [companyProfile, setCompanyProfile] = useState<any>(null);

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
    const [itemSearch, setItemSearch] = useState('');
    const [moSearch, setMoSearch] = useState('');
    const [prSearch, setPrSearch] = useState('');
    const [categoryL1, setCategoryL1] = useState('');
    const [categoryL2, setCategoryL2] = useState('');
    const [categoryL3, setCategoryL3] = useState('');
    const [auditType, setAuditType] = useState('');
    const [isInitialLoad, setIsInitialLoad] = useState(true);

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

    const authFetch = useCallback(async (url: string, options: any = {}) => {
        const token = localStorage.getItem('access_token');
        return fetch(url, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${token}` } });
    }, []);

    const inFlightRef = useRef<Record<string, Promise<any>>>({});

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
            const CACHE_KEY = 'terras_master_cache_v2';
            const CACHE_TTL = 3600000; 
            const savedCache = localStorage.getItem(CACHE_KEY);
            let masterFetched = false;

            if (isInitialLoad && savedCache) {
                const parsed = JSON.parse(savedCache);
                if (Date.now() - parsed.timestamp < CACHE_TTL) {
                    const data = parsed.data;
                    setLocations(data.locations || []); setLocationCategories(data.locationCategories || []); setAttributes(data.attributes || []); setCategories(data.categories || []);
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
                requests.push(fetch(`${API_BASE}/location-categories`, { headers })); requestTypes.push('location-categories');
                requests.push(fetch(`${API_BASE}/attributes`, { headers })); requestTypes.push('attributes');
                requests.push(fetch(`${API_BASE}/categories`, { headers })); requestTypes.push('categories');
                requests.push(fetch(`${API_BASE}/uoms`, { headers })); requestTypes.push('uoms');
                requests.push(fetch(`${API_BASE}/sizes`, { headers })); requestTypes.push('sizes');
                requests.push(fetch(`${API_BASE}/work-centers`, { headers })); requestTypes.push('work-centers');
                requests.push(fetch(`${API_BASE}/operations`, { headers })); requestTypes.push('operations');
                requests.push(fetch(`${API_BASE}/partners`, { headers })); requestTypes.push('partners');
                requests.push(fetch(`${API_BASE}/settings/company`, { headers })); requestTypes.push('company-profile');
                requests.push(fetch(`${API_BASE}/items/lookup`, { headers })); requestTypes.push('item-lookup');
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
            // paginated items page (fixes UUID-instead-of-name in lists/prints).
            // Master block already fetches it on initial load; this refreshes it
            // after item CRUD without double-fetching during the first load.
            if (!isInitialLoad && fetchTarget.includes('inventory')) {
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
            }

            // Engineering
            if (fetchTarget.includes('bom') || fetchTarget.includes('manufacturing') || fetchTarget.includes('work-orders') || fetchTarget.includes('production-runs') || fetchTarget.includes('samples') || fetchTarget.includes('sales-orders')) {
                requests.push(fetch(`${API_BASE}/boms`, { headers }));
                requestTypes.push('boms');
            }

            // MES (Manufacturing Orders + Production Runs)
            if (fetchTarget.includes('manufacturing') || fetchTarget.includes('work-orders') || fetchTarget.includes('production-runs') || fetchTarget.includes('sales-orders') || fetchTarget === 'dashboard' || fetchTarget === '' || fetchTarget.includes('reports')) {
                const moSkip = (woPage - 1) * pageSize;
                const moAllLevels = fetchTarget.includes('work-orders') ? '&all_levels=true' : '';
                const moSearchParam = moSearch ? `&search=${encodeURIComponent(moSearch)}` : '';
                requests.push(fetch(`${API_BASE}/manufacturing-orders?skip=${moSkip}&limit=${pageSize}${moAllLevels}${moSearchParam}`, { headers }));
                requestTypes.push('manufacturing-orders');
                const prSkip = (prPage - 1) * pageSize;
                const prSearchParam = prSearch ? `&search=${encodeURIComponent(prSearch)}` : '';
                requests.push(fetch(`${API_BASE}/production-runs?skip=${prSkip}&limit=${pageSize}${prSearchParam}`, { headers }));
                requestTypes.push('production-runs');
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
            if (fetchTarget.includes('sales-orders') || fetchTarget.includes('samples') || fetchTarget.includes('customers')) {
                requests.push(fetch(`${API_BASE}/sales-orders`, { headers }));
                requestTypes.push('sales-orders');
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
            for (let i = 0; i < responses.length; i++) {
                const res = responses[i]; const type = requestTypes[i];
                if (!res.ok) { console.warn(`[DataContext] ${type} fetch failed: HTTP ${res.status} ${res.url}`); failedTypes.push(`${type} (${res.status})`); continue; }
                const data = await res.json();
                switch(type) {
                    case 'locations': setLocations(data); newMasterData.locations = data; break;
                    case 'location-categories': setLocationCategories(data); newMasterData.locationCategories = data; break;
                    case 'attributes': setAttributes(data); newMasterData.attributes = data; break;
                    case 'categories': setCategories(data); newMasterData.categories = data; break;
                    case 'uoms': setUoms(data); newMasterData.uoms = data; break;
                    case 'sizes': setSizes(data); newMasterData.sizes = data; break;
                    case 'work-centers': setWorkCenters(data); newMasterData.workCenters = data; break;
                    case 'operations': setOperations(data); newMasterData.operations = data; break;
                    case 'partners': setPartners(data); newMasterData.partners = data; break;
                    case 'company-profile': setCompanyProfile(data); newMasterData.companyProfile = data; break;
                    case 'items': setItems(data.items); setItemTotal(data.total); break;
                    case 'item-lookup': { const idx: Record<string, { name: string; code: string }> = {}; for (const it of (data || [])) idx[String(it.id)] = { name: it.name, code: it.code }; setItemIndex(idx); newMasterData.itemIndex = idx; break; }
                    case 'kpis': setDashboardKPIs(data); break;
                    case 'dashboard-summary': setDashboardSummary(data); break;
                    case 'boms': setBoms(data); break;
                    case 'manufacturing-orders': setManufacturingOrders(data.items); setWoTotal(data.total); break;
                    case 'production-runs': setProductionRuns(data.items); setPrTotal(data.total); break;
                    case 'balance': setStockBalance(data); break;
                    case 'stock-ledger': setStockEntries(data.items || []); setReportTotal(data.total || 0); break;
                    case 'sales-orders': setSalesOrders(data); break;
                    case 'samples': setSamples(data); break;
                    case 'purchase-orders': setPurchaseOrders(data); break;
                    case 'audit-logs': setAuditLogs(data.items); setAuditTotal(data.total); break;
                }
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
        }
        };

        const p = run().finally(() => { delete inFlightRef.current[fetchTarget]; });
        inFlightRef.current[fetchTarget] = p;
        return p;
    }, [currentUser, itemPage, woPage, prPage, auditPage, reportPage, itemSearch, moSearch, prSearch, categoryL1, categoryL2, categoryL3, auditType, isInitialLoad, pageSize, showToast]);

    const handleTabHover = (tab: string) => fetchData(tab);

    useEffect(() => { if (currentUser) fetchData(); }, [currentUser, itemPage, woPage, prPage, auditPage, reportPage, itemSearch, moSearch, prSearch, categoryL1, categoryL2, categoryL3, auditType, fetchData]);

    // WebSocket Logic
    const fetchDataRef = useRef(fetchData);
    useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

    useEffect(() => {
        if (!currentUser) return;
        
        // WebSocket logic is safe here as it only runs on client
        const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/events';
        let ws: WebSocket;
        let reconnectTimer: any;

        const connect = () => {
            ws = new WebSocket(wsUrl);
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    switch (data.type) {
                        case 'WORK_ORDER_UPDATE':
                        case 'MANUFACTURING_ORDER_UPDATE':
                            setManufacturingOrders((prev: any[]) => prev.map((mo: any) =>
                                mo.id === data.mo_id ? { ...mo, status: data.status } : mo
                            ));
                            fetchDataRef.current('work-orders');
                            showToast(`Manufacturing Order ${data.code} updated: ${data.status}`, 'info');
                            break;
                        case 'PRODUCTION_RUN_UPDATE':
                            fetchDataRef.current('work-orders');
                            break;
                        case 'KPI_UPDATE':
                            // A mutation invalidated the KPI cache — refresh dashboard
                            // KPIs + summary so the numbers stay live.
                            fetchDataRef.current('dashboard');
                            break;
                        default:
                            break;
                    }
                } catch (e) { console.error("WS Error", e); }
            };
            ws.onclose = (e) => { if (e.code !== 1000) reconnectTimer = setTimeout(connect, 5000); };
            ws.onerror = () => ws.close();
        };
        connect();
        return () => { if (ws) ws.close(1000); clearTimeout(reconnectTimer); };
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

    const value = React.useMemo(() => ({
        items, locations, locationCategories, attributes, categories, uoms, sizes, boms, manufacturingOrders, productionRuns,
        stockEntries, stockBalance, workCenters, operations, salesOrders, purchaseOrders, samples, auditLogs,
        partners, dashboardKPIs, dashboardSummary, itemIndex, companyProfile,
        pagination: { itemPage, setItemPage, itemTotal, woPage, setWoPage, woTotal, prPage, setPrPage, prTotal, auditPage, setAuditPage, auditTotal, reportPage, setReportPage, reportTotal, moSearch, setMoSearch: handleSetMoSearch, prSearch, setPrSearch: handleSetPrSearch, pageSize },
        filters: { itemSearch, setItemSearch, categoryL1, setCategoryL1: handleSetCategoryL1, categoryL2, setCategoryL2: handleSetCategoryL2, categoryL3, setCategoryL3, auditType, setAuditType },
        fetchData, handleTabHover, authFetch
    }), [
        items, locations, locationCategories, attributes, categories, uoms, sizes, boms, manufacturingOrders, productionRuns,
        stockEntries, stockBalance, workCenters, operations, salesOrders, purchaseOrders, samples, auditLogs,
        partners, dashboardKPIs, dashboardSummary, itemIndex, companyProfile,
        itemPage, itemTotal, woPage, woTotal, prPage, prTotal, auditPage, auditTotal, reportPage, reportTotal, pageSize,
        itemSearch, moSearch, prSearch, categoryL1, categoryL2, categoryL3, auditType, fetchData, handleTabHover, authFetch,
        handleSetCategoryL1, handleSetCategoryL2, handleSetMoSearch, handleSetPrSearch
    ]);

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) throw new Error('useData must be used within DataProvider');
    return context;
};
