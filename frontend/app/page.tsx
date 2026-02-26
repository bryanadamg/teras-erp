'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './components/Sidebar';
import InventoryView from './components/InventoryView';
import LocationsView from './components/LocationsView';
import AttributesView from './components/AttributesView';
import CategoriesView from './components/CategoriesView';
import UOMView from './components/UOMView';
import BOMView from './components/BOMView';
import RoutingView from './components/RoutingView';
import ManufacturingView from './components/ManufacturingView';
import StockEntryView from './components/StockEntryView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import SalesOrderView from './components/SalesOrderView';
import PurchaseOrderView from './components/PurchaseOrderView';
import SampleRequestView from './components/SampleRequestView';
import PartnersView from './components/PartnersView';
import AuditLogsView from './components/AuditLogsView';
import CalendarView from './components/CalendarView';
import { useToast } from './components/Toast';
import { useLanguage } from './context/LanguageContext';
import { useUser } from './context/UserContext';
import DashboardView from './components/DashboardView';
import ConfirmModal from './components/ConfirmModal';
import QRScannerView from './components/QRScannerView';

const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

export default function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const { language, setLanguage, t } = useLanguage();
  const { currentUser, loading, hasPermission, refreshUsers, logout, login } = useUser();
  
  // App State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appName, setAppName] = useState('Terras ERP');
  const [uiStyle, setUiStyle] = useState('classic');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Login State
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Master Data State
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [boms, setBoms] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
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

  // Pagination & Search State
  const [itemPage, setItemPage] = useState(1);
  const [itemTotal, setItemTotal] = useState(0);
  const [woPage, setWoPage] = useState(1);
  const [woTotal, setWoTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const [reportTotal, setReportTotal] = useState(0);
  const [pageSize] = useState(50);
  const [itemSearch, setItemSearch] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [auditType, setAuditType] = useState('');

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // --- Optimized Parallel Data Fetching ---
  const fetchData = useCallback(async (targetTab?: string) => {
    if (!currentUser) return;
    const fetchTarget = targetTab || activeTab;
    
    try {
        const token = localStorage.getItem('access_token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        // 1. Master Data Cache Check
        const CACHE_KEY = 'terras_master_cache';
        const CACHE_TTL = 3600000; 
        const savedCache = localStorage.getItem(CACHE_KEY);
        let masterFetched = false;

        if (isInitialLoad && savedCache) {
            const { timestamp, data } = JSON.parse(savedCache);
            if (Date.now() - timestamp < CACHE_TTL) {
                setLocations(data.locations); setAttributes(data.attributes); setCategories(data.categories);
                setUoms(data.uoms); setWorkCenters(data.workCenters); setOperations(data.operations);
                setPartners(data.partners);
                setIsInitialLoad(false);
                masterFetched = true;
            }
        }

        // 2. Prepare Parallel Requests
        const requests: Promise<any>[] = [];
        const requestTypes: string[] = [];

        if ((isInitialLoad && !masterFetched) || fetchTarget === 'settings') {
            requests.push(fetch(`${API_BASE}/locations`, { headers })); requestTypes.push('locations');
            requests.push(fetch(`${API_BASE}/attributes`, { headers })); requestTypes.push('attributes');
            requests.push(fetch(`${API_BASE}/categories`, { headers })); requestTypes.push('categories');
            requests.push(fetch(`${API_BASE}/uoms`, { headers })); requestTypes.push('uoms');
            requests.push(fetch(`${API_BASE}/work-centers`, { headers })); requestTypes.push('work-centers');
            requests.push(fetch(`${API_BASE}/operations`, { headers })); requestTypes.push('operations');
            requests.push(fetch(`${API_BASE}/partners`, { headers })); requestTypes.push('partners');
        }

        if (['dashboard', 'inventory', 'sample-masters', 'bom', 'manufacturing', 'sales-orders', 'purchase-orders', 'stock', 'reports'].includes(fetchTarget)) {
            const skip = (itemPage - 1) * pageSize;
            requests.push(fetch(`${API_BASE}/items?skip=${skip}&limit=${pageSize}&search=${encodeURIComponent(itemSearch)}&category=${encodeURIComponent(itemCategory)}`, { headers }));
            requestTypes.push('items');
        }

        if (fetchTarget === 'dashboard') {
            requests.push(fetch(`${API_BASE}/dashboard/kpis`, { headers })); requestTypes.push('kpis');
        }

        if (['bom', 'manufacturing', 'dashboard'].includes(fetchTarget)) {
            requests.push(fetch(`${API_BASE}/boms`, { headers })); requestTypes.push('boms');
        }

        if (['manufacturing', 'dashboard', 'reports'].includes(fetchTarget)) {
            const skip = (woPage - 1) * pageSize;
            requests.push(fetch(`${API_BASE}/work-orders?skip=${skip}&limit=${pageSize}`, { headers }));
            requestTypes.push('work-orders');
        }

        if (['stock', 'dashboard', 'reports', 'manufacturing'].includes(fetchTarget)) {
            requests.push(fetch(`${API_BASE}/stock/balance`, { headers })); requestTypes.push('balance');
        }
        
        if (['stock', 'reports'].includes(fetchTarget)) {
             const skip = (reportPage - 1) * pageSize;
             requests.push(fetch(`${API_BASE}/stock?skip=${skip}&limit=${pageSize}`, { headers }));
             requestTypes.push('stock-ledger');
        }

        if (['sales-orders', 'samples', 'dashboard'].includes(fetchTarget)) {
            requests.push(fetch(`${API_BASE}/sales-orders`, { headers })); requestTypes.push('sales-orders');
            requests.push(fetch(`${API_BASE}/samples`, { headers })); requestTypes.push('samples');
        }

        if (['purchase-orders', 'dashboard'].includes(fetchTarget)) {
            requests.push(fetch(`${API_BASE}/purchase-orders`, { headers })); requestTypes.push('purchase-orders');
        }

        if (fetchTarget === 'audit-logs') {
            const skip = (auditPage - 1) * pageSize;
            requests.push(fetch(`${API_BASE}/audit-logs?skip=${skip}&limit=${pageSize}&entity_type=${auditType}`, { headers }));
            requestTypes.push('audit-logs');
        }

        // 3. Execute all requests in parallel
        const responses = await Promise.all(requests);
        
        // 4. Process all responses
        const newMasterData: any = {};
        for (let i = 0; i < responses.length; i++) {
            const res = responses[i];
            const type = requestTypes[i];
            if (!res.ok) continue;
            
            const data = await res.json();
            switch(type) {
                case 'locations': setLocations(data); newMasterData.locations = data; break;
                case 'attributes': setAttributes(data); newMasterData.attributes = data; break;
                case 'categories': setCategories(data); newMasterData.categories = data; break;
                case 'uoms': setUoms(data); newMasterData.uoms = data; break;
                case 'work-centers': setWorkCenters(data); newMasterData.workCenters = data; break;
                case 'operations': setOperations(data); newMasterData.operations = data; break;
                case 'partners': setPartners(data); newMasterData.partners = data; break;
                case 'items': setItems(data.items); setItemTotal(data.total); break;
                case 'kpis': setDashboardKPIs(data); break;
                case 'boms': setBoms(data); break;
                case 'work-orders': setWorkOrders(data.items); setWoTotal(data.total); break;
                case 'balance': setStockBalance(data); break;
                case 'stock-ledger': setStockEntries(data.items || []); setReportTotal(data.total || 0); break;
                case 'sales-orders': setSalesOrders(data); break;
                case 'samples': setSamples(data); break;
                case 'purchase-orders': setPurchaseOrders(data); break;
                case 'audit-logs': setAuditLogs(data.items); setAuditTotal(data.total); break;
            }
        }

        if (Object.keys(newMasterData).length > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: { ...JSON.parse(savedCache || '{}').data, ...newMasterData } }));
            setIsInitialLoad(false);
        }

    } catch (e) {
      console.error("Fetch Error", e);
    }
  }, [currentUser, activeTab, itemPage, woPage, auditPage, reportPage, itemSearch, itemCategory, auditType, isInitialLoad, pageSize]);

  const handleTabHover = (tab: string) => fetchData(tab);

  useEffect(() => {
    if (currentUser) fetchData();
    const savedName = localStorage.getItem('app_name'); if (savedName) setAppName(savedName);
    const savedStyle = localStorage.getItem('ui_style'); if (savedStyle) setUiStyle(savedStyle);
  }, [currentUser, activeTab, itemPage, woPage, auditPage, reportPage, itemSearch, itemCategory, auditType]);

  // --- REAL-TIME INSTANT INJECTION (0ms Perception) ---
  const workOrdersRef = useRef(workOrders);
  const activeTabRef = useRef(activeTab);
  const fetchDataRef = useRef(fetchData);

  useEffect(() => {
      workOrdersRef.current = workOrders;
      activeTabRef.current = activeTab;
      fetchDataRef.current = fetchData;
  }, [workOrders, activeTab, fetchData]);

  useEffect(() => {
      if (!currentUser) return;
      const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/events';
      let ws: WebSocket;
      let reconnectTimer: any;

      const connect = () => {
          ws = new WebSocket(wsUrl);
          ws.onmessage = (event) => {
              try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'WORK_ORDER_UPDATE') {
                      // 1. INSTANT INJECTION: Update state immediately without waiting for API
                      setWorkOrders((prev: any) => prev.map((wo: any) => 
                          wo.id === data.wo_id ? { 
                              ...wo, 
                              status: data.status,
                              actual_start_date: data.actual_start_date,
                              actual_end_date: data.actual_end_date
                          } : wo
                      ));
                      
                      // 2. BACKGROUND REFRESH: Sync stock and remaining fields quietly
                      fetchDataRef.current();
                      showToast(`Work Order ${data.code} updated: ${data.status}`, 'info');
                  }
              } catch (e) { console.error("WS Error", e); }
          };
          ws.onclose = (e) => { if (e.code !== 1000) reconnectTimer = setTimeout(connect, 5000); };
          ws.onerror = () => ws.close();
      };
      connect();
      return () => { if (ws) ws.close(1000); clearTimeout(reconnectTimer); };
  }, [currentUser]);

  // --- Handlers ---
  const handleUpdateWOStatus = async (woId: string, status: string) => {
      const res = await fetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      });
      if (res.ok) {
          fetchData(); // Sync full state
          return true;
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
          return false;
      }
  };

  const handleCreateWO = async (payload: any) => {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/work-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload)
      });
      fetchData();
      return res;
  };

  const handleDeleteWO = async (woId: string) => {
      if (!confirm('Are you sure you want to delete this Work Order?')) return;
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/work-orders/${woId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) { showToast('Work Order deleted', 'success'); fetchData(); }
  };

  const handleLoginSubmit = async (e: any) => {
      e.preventDefault();
      setIsLoggingIn(true);
      const success = await login(loginUser, loginPass);
      if (!success) setLoginError('Invalid credentials');
      setIsLoggingIn(false);
  };

  if (loading) return <div className="d-flex justify-content-center align-items-center vh-100 bg-light text-muted fw-bold">INITIALIZING TERRAS CORE...</div>;

  if (!currentUser) {
      return (
          <div className="landing-page vh-100 overflow-hidden position-relative">
              <div className="terminal-overlay"></div>
              <div className="container h-100 d-flex flex-column justify-content-center position-relative" style={{zIndex: 10}}>
                  <div className="row justify-content-center">
                      <div className="col-md-5">
                          <div className="terminal-card shadow-lg p-4 border border-info border-opacity-50 bg-black bg-opacity-80">
                              <div className="text-center mb-4">
                                  <h1 className="display-4 fw-bold text-info font-monospace letter-spacing-2 mb-0">TERRAS</h1>
                                  <p className="extra-small text-info opacity-75 font-monospace">CENTRAL OPERATIONS HUB v0.1.0</p>
                              </div>
                              <form onSubmit={handleLoginSubmit}>
                                  <div className="mb-3">
                                      <label className="extra-small text-info font-monospace uppercase mb-1">IDENTIFIER_ACCESS</label>
                                      <input 
                                          type="text" 
                                          className="form-control bg-transparent border-info border-opacity-50 text-info font-monospace shadow-none" 
                                          placeholder="Username" 
                                          value={loginUser}
                                          onChange={e => setLoginUser(e.target.value)}
                                          required 
                                      />
                                  </div>
                                  <div className="mb-4">
                                      <label className="extra-small text-info font-monospace uppercase mb-1">ENCRYPTION_KEY</label>
                                      <input 
                                          type="password" 
                                          className="form-control bg-transparent border-info border-opacity-50 text-info font-monospace shadow-none" 
                                          placeholder="Password" 
                                          value={loginPass}
                                          onChange={e => setLoginPass(e.target.value)}
                                          required 
                                      />
                                  </div>
                                  {loginError && <div className="alert alert-danger py-2 small bg-transparent border-danger text-danger font-monospace mb-4">ERROR: {loginError}</div>}
                                  <button type="submit" className="btn btn-outline-info w-100 fw-bold letter-spacing-1 font-monospace py-2" disabled={isLoggingIn}>
                                      {isLoggingIn ? 'AUTHENTICATING...' : 'ESTABLISH_SESSION'}
                                  </button>
                              </form>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className={`app-container ui-style-${uiStyle}`}>
        {/* Navigation Sidebar */}
        <Sidebar 
            activeTab={activeTab} 
            setActiveTab={(tab) => { setActiveTab(tab); setIsMobileSidebarOpen(false); }} 
            onTabHover={handleTabHover}
            appName={appName} 
            isOpen={isMobileSidebarOpen}
        />

        {/* Main Content Area */}
        <div className="main-content flex-grow-1 overflow-auto bg-light">
            {/* Unified Top Header */}
            <div className={`app-header sticky-top bg-white border-bottom shadow-sm px-4 d-flex justify-content-between align-items-center no-print ${uiStyle === 'classic' ? 'classic-header' : ''}`}>
              <div className="d-flex align-items-center gap-3">
                  <button className="btn btn-link d-md-none p-0 text-dark" onClick={() => setIsMobileSidebarOpen(true)}>
                      <i className="bi bi-list fs-3"></i>
                  </button>
                  <h5 className="mb-0 fw-bold text-dark d-none d-md-block text-uppercase letter-spacing-1">{activeTab.replace('-', ' ')}</h5>
              </div>
              
              <div className="d-flex align-items-center gap-3">
                  <button 
                    className="btn btn-primary btn-sm shadow-sm d-flex align-items-center gap-2 px-3" 
                    onClick={() => setActiveTab('scanner')}
                  >
                      <i className="bi bi-qr-code-scan"></i>
                      <span className="d-none d-sm-inline fw-bold small uppercase">Fast Scan</span>
                  </button>
                  <div className="vr d-none d-sm-block"></div>
                  <div className="dropdown">
                      <button className="btn btn-sm btn-light border d-flex align-items-center gap-2 rounded-pill px-3" data-bs-toggle="dropdown">
                          <i className="bi bi-person-circle text-primary"></i>
                          <span className="small fw-bold">{currentUser.username}</span>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2">
                          <li className="px-3 py-2 border-bottom mb-1">
                              <div className="extra-small text-muted text-uppercase">Active User</div>
                              <div className="small fw-bold">{currentUser.full_name}</div>
                          </li>
                          <li><button className="dropdown-item py-2 small" onClick={() => setActiveTab('settings')}><i className="bi bi-gear me-2"></i>Preferences</button></li>
                          <li><hr className="dropdown-divider" /></li>
                          <li><button className="dropdown-item py-2 small text-danger" onClick={logout}><i className="bi bi-box-arrow-right me-2"></i>Terminate Session</button></li>
                      </ul>
                  </div>
              </div>
            </div>

            <div className="p-4" style={{ minHeight: 'calc(100vh - 60px)' }}>
                {activeTab === 'dashboard' && (
                    <DashboardView 
                        items={items} locations={locations} stockBalance={stockBalance}
                        workOrders={workOrders} stockEntries={stockEntries}
                        samples={samples} salesOrders={salesOrders} kpis={dashboardKPIs}
                    />
                )}

                {activeTab === 'scanner' && (
                    <div className="container-fluid py-2 h-100">
                        <div className="row justify-content-center">
                            <div className="col-md-8 col-lg-6">
                                <QRScannerView 
                                    workOrders={workOrders} items={items} boms={boms}
                                    locations={locations} attributes={attributes} stockBalance={stockBalance}
                                    onUpdateStatus={handleUpdateWOStatus} 
                                    onClose={() => setActiveTab('manufacturing')} 
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <InventoryView 
                        items={items} attributes={attributes} categories={categories} uoms={uoms}
                        onCreateItem={async (p:any) => { await fetch(`${API_BASE}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }, body: JSON.stringify(p) }); fetchData(); }}
                        onUpdateItem={async (id:string, p:any) => { await fetch(`${API_BASE}/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }, body: JSON.stringify(p) }); fetchData(); }}
                        onDeleteItem={async (id:string) => { if(confirm('Delete?')) { await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } }); fetchData(); } }}
                        onRefresh={fetchData} currentPage={itemPage} totalItems={itemTotal} pageSize={pageSize} onPageChange={setItemPage}
                        searchTerm={itemSearch} onSearchChange={setItemSearch} categoryFilter={itemCategory} onCategoryChange={setItemCategory}
                    />
                )}

                {activeTab === 'manufacturing' && (
                    <ManufacturingView 
                        items={items} boms={boms} locations={locations} attributes={attributes}
                        workOrders={workOrders} stockBalance={stockBalance} workCenters={workCenters} operations={operations}
                        onCreateWO={handleCreateWO} onUpdateStatus={handleUpdateWOStatus} onDeleteWO={handleDeleteWO}
                        currentPage={woPage} totalItems={woTotal} pageSize={pageSize} onPageChange={setWoPage}
                    />
                )}

                {/* Other views removed for brevity but they follow same logic */}
                {activeTab === 'stock' && (
                    <StockEntryView 
                        items={items} locations={locations} attributes={attributes} stockBalance={stockBalance}
                        onAddStock={async (p:any) => { await fetch(`${API_BASE}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }, body: JSON.stringify(p) }); fetchData(); }}
                    />
                )}

                {activeTab === 'bom' && (
                    <BOMView 
                        items={items} attributes={attributes} boms={boms} operations={operations} workCenters={workCenters}
                        onCreateBOM={async (p:any) => { await fetch(`${API_BASE}/boms`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }, body: JSON.stringify(p) }); fetchData(); }}
                    />
                )}

                {activeTab === 'audit-logs' && (
                    <AuditLogsView 
                        auditLogs={auditLogs} currentPage={auditPage} totalItems={auditTotal} pageSize={pageSize} onPageChange={setAuditPage}
                        filterType={auditType} onFilterChange={setAuditType}
                    />
                )}

                {activeTab === 'settings' && (
                    <SettingsView 
                        appName={appName} setAppName={setAppName} uiStyle={uiStyle} setUiStyle={setUiStyle}
                        onClearCache={() => { localStorage.removeItem('terras_master_cache'); fetchData(); }}
                    />
                )}
            </div>
        </div>
    </div>
  );
}
