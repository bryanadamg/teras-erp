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
import { useToast } from './components/Toast';
import { useLanguage } from './context/LanguageContext';
import { useUser } from './context/UserContext';
import DashboardView from './components/DashboardView';
import QRScannerView from './components/QRScannerView';

const envBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';
const API_BASE = envBase.endsWith('/api') ? envBase : `${envBase}/api`;

export default function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const { language, setLanguage, t } = useLanguage();
  const { currentUser, loading, hasPermission, logout, login, refreshUsers } = useUser();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appName, setAppName] = useState('Terras ERP');
  const [uiStyle, setUiStyle] = useState('classic');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

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

  const fetchData = useCallback(async (targetTab?: string) => {
    if (!currentUser) return;
    const fetchTarget = targetTab || activeTab;
    
    try {
        const token = localStorage.getItem('access_token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const CACHE_KEY = 'terras_master_cache';
        const CACHE_TTL = 3600000; 
        const savedCache = localStorage.getItem(CACHE_KEY);
        let masterFetched = false;

        if (isInitialLoad && savedCache) {
            const parsed = JSON.parse(savedCache);
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
                const data = parsed.data;
                setLocations(data.locations || []); setAttributes(data.attributes || []); setCategories(data.categories || []);
                setUoms(data.uoms || []); setWorkCenters(data.workCenters || []); setOperations(data.operations || []);
                setPartners(data.partners || []);
                setIsInitialLoad(false); masterFetched = true;
            }
        }

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

        if (['dashboard', 'inventory', 'sample-masters', 'bom', 'manufacturing', 'sales-orders', 'purchase-orders', 'stock', 'reports', 'samples'].includes(fetchTarget)) {
            const skip = (itemPage - 1) * pageSize;
            requests.push(fetch(`${API_BASE}/items?skip=${skip}&limit=${pageSize}&search=${encodeURIComponent(itemSearch)}&category=${encodeURIComponent(itemCategory)}`, { headers }));
            requestTypes.push('items');
        }
        if (fetchTarget === 'dashboard') { requests.push(fetch(`${API_BASE}/dashboard/kpis`, { headers })); requestTypes.push('kpis'); }
        if (['bom', 'manufacturing', 'dashboard', 'samples'].includes(fetchTarget)) { requests.push(fetch(`${API_BASE}/boms`, { headers })); requestTypes.push('boms'); }
        if (['manufacturing', 'dashboard', 'reports'].includes(fetchTarget)) { const skip = (woPage - 1) * pageSize; requests.push(fetch(`${API_BASE}/work-orders?skip=${skip}&limit=${pageSize}`, { headers })); requestTypes.push('work-orders'); }
        if (['stock', 'dashboard', 'reports', 'manufacturing', 'inventory'].includes(fetchTarget)) { requests.push(fetch(`${API_BASE}/stock/balance`, { headers })); requestTypes.push('balance'); }
        if (['stock', 'reports'].includes(fetchTarget)) { const skip = (reportPage - 1) * pageSize; requests.push(fetch(`${API_BASE}/stock?skip=${skip}&limit=${pageSize}`, { headers })); requestTypes.push('stock-ledger'); }
        if (['sales-orders', 'samples', 'dashboard', 'inventory'].includes(fetchTarget)) { requests.push(fetch(`${API_BASE}/sales-orders`, { headers })); requestTypes.push('sales-orders'); requests.push(fetch(`${API_BASE}/samples`, { headers })); requestTypes.push('samples'); }
        if (['purchase-orders', 'dashboard'].includes(fetchTarget)) { requests.push(fetch(`${API_BASE}/purchase-orders`, { headers })); requestTypes.push('purchase-orders'); }
        if (fetchTarget === 'audit-logs') { const skip = (auditPage - 1) * pageSize; requests.push(fetch(`${API_BASE}/audit-logs?skip=${skip}&limit=${pageSize}&entity_type=${auditType}`, { headers })); requestTypes.push('audit-logs'); }

        const responses = await Promise.all(requests);
        const newMasterData: any = {};
        for (let i = 0; i < responses.length; i++) {
            const res = responses[i]; const type = requestTypes[i]; if (!res.ok) continue;
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
            const existingCache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{"data":{}}');
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: { ...existingCache.data, ...newMasterData } }));
            setIsInitialLoad(false);
        }
    } catch (e) { console.error("Fetch Error", e); }
  }, [currentUser, activeTab, itemPage, woPage, auditPage, reportPage, itemSearch, itemCategory, auditType, isInitialLoad, pageSize]);

  const handleTabHover = (tab: string) => fetchData(tab);

  useEffect(() => {
    if (currentUser) fetchData();
    const savedName = localStorage.getItem('app_name'); if (savedName) setAppName(savedName);
    const savedStyle = localStorage.getItem('ui_style'); if (savedStyle) setUiStyle(savedStyle);
  }, [currentUser, activeTab, itemPage, woPage, auditPage, reportPage, itemSearch, itemCategory, auditType]);

  const fetchDataRef = useRef(fetchData);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { fetchDataRef.current = fetchData; activeTabRef.current = activeTab; }, [fetchData, activeTab]);

  useEffect(() => {
      if (!currentUser) return;
      const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/events';
      let ws: WebSocket; let reconnectTimer: any;
      const connect = () => {
          ws = new WebSocket(wsUrl);
          ws.onmessage = (event) => {
              try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'WORK_ORDER_UPDATE') {
                      setWorkOrders((prev: any) => prev.map((wo: any) => wo.id === data.wo_id ? { ...wo, status: data.status, actual_start_date: data.actual_start_date, actual_end_date: data.actual_end_date } : wo));
                      if (['dashboard', 'manufacturing', 'stock'].includes(activeTabRef.current)) fetchDataRef.current();
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

  const authFetch = async (url: string, options: any = {}) => {
      const token = localStorage.getItem('access_token');
      return fetch(url, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${token}` } });
  };

  const handleUpdateWOStatus = async (woId: string, status: string) => {
      const res = await authFetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, { method: 'PUT' });
      if (res.ok) { fetchData(); return true; } 
      else { const err = await res.json(); showToast(`Error: ${err.detail}`, 'danger'); return false; }
  };

  const handleCreateWO = async (payload: any) => {
      const res = await authFetch(`${API_BASE}/work-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      fetchData(); return res;
  };

  const handleDeleteWO = async (woId: string) => {
      if (!confirm('Are you sure?')) return;
      const res = await authFetch(`${API_BASE}/work-orders/${woId}`, { method: 'DELETE' });
      if (res.ok) { showToast('Work Order deleted', 'success'); fetchData(); }
  };

  const handleCreateItem = async (p: any) => {
      const res = await authFetch(`${API_BASE}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Item created', 'success'); fetchData(); }
  };

  const handleUpdateItem = async (id: string, p: any) => {
      const res = await authFetch(`${API_BASE}/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Item updated', 'success'); fetchData(); }
  };

  const handleDeleteItem = async (id: string) => {
      if (!confirm('Delete item?')) return;
      const res = await authFetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Item deleted', 'success'); fetchData(); }
  };

  const handleAddVariantToItem = async (itemId: string, payload: any) => {
      const res = await authFetch(`${API_BASE}/items/${itemId}/variants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { showToast('Variant added', 'success'); fetchData(); }
  };

  const handleDeleteVariant = async (id: string) => {
      if (!confirm('Delete variant?')) return;
      const res = await authFetch(`${API_BASE}/variants/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Variant deleted', 'success'); fetchData(); }
  };

  const handleCreateCategory = async (p: any) => {
      const res = await authFetch(`${API_BASE}/categories`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Category created', 'success'); fetchData(); }
  };

  const handleCreateUOM = async (p: any) => {
      const res = await authFetch(`${API_BASE}/uoms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('UOM created', 'success'); fetchData(); }
  };

  const handleCreateLocation = async (p: any) => {
      const res = await authFetch(`${API_BASE}/locations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Location created', 'success'); fetchData(); }
  };

  const handleCreateAttribute = async (p: any) => {
      const res = await authFetch(`${API_BASE}/attributes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Attribute created', 'success'); fetchData(); }
  };

  const handleUpdateAttribute = async (id: string, p: any) => {
      const res = await authFetch(`${API_BASE}/attributes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Attribute updated', 'success'); fetchData(); }
  };

  const handleDeleteAttribute = async (id: string) => {
      if (!confirm('Delete attribute?')) return;
      const res = await authFetch(`${API_BASE}/attributes/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Attribute deleted', 'success'); fetchData(); }
  };

  const handleCreateBOM = async (p: any) => {
      const res = await authFetch(`${API_BASE}/boms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('BOM created', 'success'); fetchData(); }
  };

  const handleCreateWorkCenter = async (p: any) => {
      const res = await authFetch(`${API_BASE}/work-centers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Work Center created', 'success'); fetchData(); }
  };

  const handleCreateOperation = async (p: any) => {
      const res = await authFetch(`${API_BASE}/operations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Operation created', 'success'); fetchData(); }
  };

  const handleCreateSO = async (p: any) => {
      const res = await authFetch(`${API_BASE}/sales-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Sales Order created', 'success'); fetchData(); }
  };

  const handleCreateRealPO = async (p: any) => {
      const res = await authFetch(`${API_BASE}/purchase-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Purchase Order created', 'success'); fetchData(); }
  };

  const handleReceivePO = async (id: string) => {
      const res = await authFetch(`${API_BASE}/purchase-orders/${id}/receive`, { method: 'PUT' });
      if (res.ok) { showToast('PO Received into Stock', 'success'); fetchData(); }
  };

  const handleCreateSample = async (p: any) => {
      const res = await authFetch(`${API_BASE}/samples`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Sample Request created', 'success'); fetchData(); }
  };

  const handleUpdateSampleStatus = async (id: string, status: string) => {
      const res = await authFetch(`${API_BASE}/samples/${id}/status?status=${status}`, { method: 'PUT' });
      if (res.ok) { showToast('Sample status updated', 'success'); fetchData(); }
  };

  const handleCreatePartner = async (p: any) => {
      const res = await authFetch(`${API_BASE}/partners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Partner created', 'success'); fetchData(); }
  };

  const handleUpdatePartner = async (id: string, p: any) => {
      const res = await authFetch(`${API_BASE}/partners/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Partner updated', 'success'); fetchData(); }
  };

  const handleDeletePartner = async (id: string) => {
      if (!confirm('Are you sure?')) return;
      const res = await authFetch(`${API_BASE}/partners/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('Partner deleted', 'success'); fetchData(); }
      else { const err = await res.json(); showToast(`Error: ${err.detail}`, 'danger'); }
  };

  const handleAddStock = async (p: any) => {
      const res = await authFetch(`${API_BASE}/stock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.ok) { showToast('Stock Entry recorded', 'success'); fetchData(); }
  };

  const handleLoginSubmit = async (e: any) => {
      e.preventDefault(); setIsLoggingIn(true);
      const success = await login(loginUser, loginPass);
      if (!success) setLoginError('Invalid credentials');
      setIsLoggingIn(false);
  };

  if (loading) return <div className="d-flex justify-content-center align-items-center vh-100 bg-light text-muted fw-bold">INITIALIZING TERRAS CORE...</div>;

  if (!currentUser) {
      return (
          <div className="landing-page vh-100 overflow-hidden position-relative bg-dark d-flex align-items-center">
              <div className="container" style={{zIndex: 10}}>
                  <div className="row justify-content-center">
                      <div className="col-md-4">
                          <div className="card shadow-lg p-4 border-0">
                              <div className="text-center mb-4">
                                  <h1 className="h3 fw-bold text-primary mb-1">Terras ERP</h1>
                                  <p className="text-muted small">Enter your credentials to access the system</p>
                              </div>
                              <form onSubmit={handleLoginSubmit}>
                                  <div className="mb-3">
                                      <label className="form-label small">Username</label>
                                      <input type="text" className="form-control" value={loginUser} onChange={e => setLoginUser(e.target.value)} required />
                                  </div>
                                  <div className="mb-4">
                                      <label className="form-label small">Password</label>
                                      <input type="password" className="form-control" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
                                  </div>
                                  {loginError && <div className="alert alert-danger py-2 small">{loginError}</div>}
                                  <button type="submit" className="btn btn-primary w-100 fw-bold py-2" disabled={isLoggingIn}>
                                      {isLoggingIn ? 'Logging in...' : 'Sign In'}
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
        <Sidebar activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setIsMobileSidebarOpen(false); }} onTabHover={handleTabHover} appName={appName} isOpen={isMobileSidebarOpen} />

        <div className="main-content flex-grow-1 overflow-auto bg-light">
            <div className={`app-header sticky-top bg-white border-bottom shadow-sm px-4 d-flex justify-content-between align-items-center no-print ${uiStyle === 'classic' ? 'classic-header' : ''}`}>
              <div className="d-flex align-items-center gap-3">
                  <button className="btn btn-link d-md-none p-0 text-dark" onClick={() => setIsMobileSidebarOpen(true)}><i className="bi bi-list fs-3"></i></button>
                  <h5 className="mb-0 fw-bold text-dark d-none d-md-block text-uppercase letter-spacing-1">{activeTab.replace('-', ' ')}</h5>
              </div>
              
              <div className="d-flex align-items-center gap-2 gap-md-3">
                  <button className={`btn btn-sm ${uiStyle === 'classic' ? 'btn-light' : 'btn-outline-secondary'}`} onClick={() => setActiveTab('scanner')} title="Scan QR Code"><i className="bi bi-qr-code-scan"></i></button>
                  {hasPermission('admin.access') && <button className={`btn btn-sm ${uiStyle === 'classic' ? 'btn-light' : 'btn-outline-info'}`} onClick={() => setActiveTab('settings')} title="Settings"><i className="bi bi-gear-fill"></i></button>}
                  <div className="dropdown">
                      <button className="btn btn-sm btn-light border d-flex align-items-center gap-2 rounded-pill px-2" data-bs-toggle="dropdown" id="userDropdown">
                          <i className="bi bi-person-circle text-primary"></i><span className="small fw-bold d-none d-sm-inline">{currentUser.username}</span>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2" aria-labelledby="userDropdown">
                          <li className="px-3 py-2 border-bottom mb-1"><div className="small fw-bold">{currentUser.full_name}</div></li>
                          <li><button className="dropdown-item py-2 small" onClick={() => setActiveTab('settings')}><i className="bi bi-gear me-2"></i>Preferences & Admin</button></li>
                          {hasPermission('admin.access') && <li><button className="dropdown-item py-2 small" onClick={() => setActiveTab('audit-logs')}><i className="bi bi-activity me-2"></i>System Audit</button></li>}
                          <li><hr className="dropdown-divider" /></li>
                          <li><button className="dropdown-item py-2 small text-danger" onClick={logout}><i className="bi bi-box-arrow-right me-2"></i>Logout</button></li>
                      </ul>
                  </div>
              </div>
            </div>

            <div className="p-4">
                {activeTab === 'dashboard' && <DashboardView items={items} locations={locations} stockBalance={stockBalance} workOrders={workOrders} stockEntries={stockEntries} samples={samples} salesOrders={salesOrders} kpis={dashboardKPIs} />}
                {activeTab === 'scanner' && <div className="container-fluid py-2 h-100"><div className="row justify-content-center"><div className="col-md-8 col-lg-6"><QRScannerView workOrders={workOrders} items={items} boms={boms} locations={locations} attributes={attributes} stockBalance={stockBalance} onUpdateStatus={handleUpdateWOStatus} onClose={() => setActiveTab('manufacturing')} /></div></div></div>}
                {activeTab === 'inventory' && <InventoryView items={items} attributes={attributes} categories={categories} uoms={uoms} onCreateItem={handleCreateItem} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddVariant={handleAddVariantToItem} onDeleteVariant={handleDeleteVariant} onRefresh={fetchData} currentPage={itemPage} totalItems={itemTotal} pageSize={pageSize} onPageChange={setItemPage} searchTerm={itemSearch} onSearchChange={setItemSearch} categoryFilter={itemCategory} onCategoryChange={setItemCategory} />}
                {activeTab === 'sample-masters' && <InventoryView items={items} attributes={attributes} categories={categories} uoms={uoms} onCreateItem={handleCreateItem} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} onAddVariant={handleAddVariantToItem} onDeleteVariant={handleDeleteVariant} onRefresh={fetchData} currentPage={itemPage} totalItems={itemTotal} pageSize={pageSize} onPageChange={setItemPage} searchTerm={itemSearch} onSearchChange={setItemSearch} forcedCategory="Sample" />}
                {activeTab === 'locations' && <LocationsView locations={locations} onCreate={handleCreateLocation} />}
                {activeTab === 'attributes' && <AttributesView attributes={attributes} onCreate={handleCreateAttribute} onUpdate={handleUpdateAttribute} onDelete={handleDeleteAttribute} />}
                {activeTab === 'categories' && <CategoriesView categories={categories} onCreate={handleCreateCategory} />}
                {activeTab === 'uom' && <UOMView uoms={uoms} onCreate={handleCreateUOM} />}
                {activeTab === 'manufacturing' && <ManufacturingView items={items} boms={boms} locations={locations} attributes={attributes} workOrders={workOrders} stockBalance={stockBalance} workCenters={workCenters} operations={operations} onCreateWO={handleCreateWO} onUpdateStatus={handleUpdateWOStatus} onDeleteWO={handleDeleteWO} currentPage={woPage} totalItems={woTotal} pageSize={pageSize} onPageChange={setWoPage} />}
                {activeTab === 'bom' && <BOMView items={items} attributes={attributes} boms={boms} operations={operations} workCenters={workCenters} onCreateBOM={handleCreateBOM} />}
                {activeTab === 'routing' && <RoutingView workCenters={workCenters} operations={operations} onCreateWorkCenter={handleCreateWorkCenter} onCreateOperation={handleCreateOperation} />}
                {activeTab === 'stock' && <StockEntryView items={items} locations={locations} attributes={attributes} stockBalance={stockBalance} onAddStock={handleAddStock} />}
                {activeTab === 'sales-orders' && <SalesOrderView items={items} attributes={attributes} salesOrders={salesOrders} partners={partners} onCreateSO={handleCreateSO} onDeleteSO={async (id:string)=>{await authFetch(`${API_BASE}/sales-orders/${id}`,{method:'DELETE'});fetchData();}} />}
                {activeTab === 'purchase-orders' && <PurchaseOrderView items={items} attributes={attributes} purchaseOrders={purchaseOrders} partners={partners} locations={locations} onCreatePO={handleCreateRealPO} onReceivePO={handleReceivePO} onDeletePO={async (id:string)=>{await authFetch(`${API_BASE}/purchase-orders/${id}`,{method:'DELETE'});fetchData();}} />}
                {activeTab === 'samples' && <SampleRequestView items={items} attributes={attributes} salesOrders={salesOrders} samples={samples} onCreateSample={handleCreateSample} onUpdateStatus={handleUpdateSampleStatus} />}
                {activeTab === 'customers' && <PartnersView partners={partners} type="CUSTOMER" onCreate={handleCreatePartner} onUpdate={handleUpdatePartner} onDelete={handleDeletePartner} />}
                {activeTab === 'suppliers' && <PartnersView partners={partners} type="SUPPLIER" onCreate={handleCreatePartner} onUpdate={handleUpdatePartner} onDelete={handleDeletePartner} />}
                {activeTab === 'reports' && <ReportsView stockEntries={stockEntries} items={items} locations={locations} attributes={attributes} currentPage={reportPage} totalItems={reportTotal} pageSize={pageSize} onPageChange={setReportPage} />}
                {activeTab === 'audit-logs' && <AuditLogsView auditLogs={auditLogs} currentPage={auditPage} totalItems={auditTotal} pageSize={pageSize} onPageChange={setAuditPage} filterType={auditType} onFilterChange={setAuditType} />}
                {activeTab === 'settings' && <SettingsView appName={appName} onUpdateAppName={setAppName} uiStyle={uiStyle} onUpdateUIStyle={setUiStyle} onClearCache={() => { localStorage.removeItem('terras_master_cache'); fetchData(); }} />}
            </div>
        </div>
    </div>
  );
}
