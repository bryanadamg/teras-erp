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
  
  // Dashboard State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appName, setAppName] = useState('Terras ERP');
  const [uiStyle, setUiStyle] = useState('classic');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Login State
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Confirmation State
  const [confirmState, setConfirmState] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Master Data
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [operations, setOperations] = useState([]);
  const [boms, setBoms] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [stockBalance, setStockBalance] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [samples, setSamples] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [partners, setPartners] = useState([]);
  const [dashboardKPIs, setDashboardKPIs] = useState<any>({});

  // Pagination State
  const [itemPage, setItemPage] = useState(1);
  const [itemTotal, setItemTotal] = useState(0);
  const [woPage, setWoPage] = useState(1);
  const [woTotal, setWoTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const [reportTotal, setReportTotal] = useState(0);
  const [pageSize] = useState(50);

  // Search State
  const [itemSearch, setItemSearch] = useState('');
  const [itemCategory, setItemCategory] = useState('');

  // Audit Log Filters
  const [auditType, setAuditType] = useState('');

    // Initial Load Flag
    const [isInitialLoad, setIsInitialLoad] = useState(true);
  
    // Helper to fetch only what's needed
    const fetchData = useCallback(async (targetTab?: string) => {
      if (!currentUser) return;
      const fetchTarget = targetTab || activeTab;
      
      try {
          const token = localStorage.getItem('access_token');
          const headers = { 'Authorization': `Bearer ${token}` };
          
          // --- MASTER DATA PERSISTENCE ---
          const CACHE_KEY = 'terras_master_cache';
          const CACHE_TTL = 3600000; // 1 hour
          const now = Date.now();
  
          if (isInitialLoad || fetchTarget === 'settings') {
              const savedCache = localStorage.getItem(CACHE_KEY);
              let useCache = false;
  
              if (savedCache && fetchTarget !== 'settings') {
                  const { timestamp, data } = JSON.parse(savedCache);
                  if (now - timestamp < CACHE_TTL) {
                      setLocations(data.locations);
                      setAttributes(data.attributes);
                      setCategories(data.categories);
                      setUoms(data.uoms);
                      setWorkCenters(data.workCenters);
                      setOperations(data.operations);
                      setPartners(data.partners);
                      useCache = true;
                      setIsInitialLoad(false);
                  }
              }
  
              if (!useCache) {
                  const [locs, attrs, cats, units, wcs, ops, parts] = await Promise.all([
                      fetch(`${API_BASE}/locations`, { headers }),
                      fetch(`${API_BASE}/attributes`, { headers }),
                      fetch(`${API_BASE}/categories`, { headers }),
                      fetch(`${API_BASE}/uoms`, { headers }),
                      fetch(`${API_BASE}/work-centers`, { headers }),
                      fetch(`${API_BASE}/operations`, { headers }),
                      fetch(`${API_BASE}/partners`, { headers })
                  ]);
                  
                  const masterData = {
                      locations: locs.ok ? await locs.json() : [],
                      attributes: attrs.ok ? await attrs.json() : [],
                      categories: cats.ok ? await cats.json() : [],
                      uoms: units.ok ? await units.json() : [],
                      workCenters: wcs.ok ? await wcs.json() : [],
                      operations: ops.ok ? await ops.json() : [],
                      partners: parts.ok ? await parts.json() : []
                  };
  
                  setLocations(masterData.locations);
                  setAttributes(masterData.attributes);
                  setCategories(masterData.categories);
                  setUoms(masterData.uoms);
                  setWorkCenters(masterData.workCenters);
                  setOperations(masterData.operations);
                  setPartners(masterData.partners);
  
                  localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: now, data: masterData }));
                  setIsInitialLoad(false);
              }
          }
  
          // --- Domain Specific Fetches ---
  
          // Inventory & BOMs
          if (['dashboard', 'inventory', 'sample-masters', 'bom', 'manufacturing', 'sales-orders', 'purchase-orders', 'stock', 'reports'].includes(fetchTarget)) {
              const itemSkip = (itemPage - 1) * pageSize;
              const itemsRes = await fetch(`${API_BASE}/items?skip=${itemSkip}&limit=${pageSize}&search=${encodeURIComponent(itemSearch)}&category=${encodeURIComponent(itemCategory)}`, { headers });
              if (itemsRes.ok) {
                  const data = await itemsRes.json();
                  setItems(data.items);
                  setItemTotal(data.total);
              }
          }
  
          // Dashboard KPIs
          if (fetchTarget === 'dashboard') {
              const kpiRes = await fetch(`${API_BASE}/dashboard/kpis`, { headers });
              if (kpiRes.ok) setDashboardKPIs(await kpiRes.json());
          }
  
          // BOMs (Needed for Manufacturing, BOM view)
          if (['bom', 'manufacturing', 'dashboard'].includes(fetchTarget)) {
              const bomsRes = await fetch(`${API_BASE}/boms`, { headers });
              if (bomsRes.ok) setBoms(await bomsRes.json());
          }
  
          // Manufacturing (Work Orders)
          if (['manufacturing', 'dashboard', 'reports'].includes(fetchTarget)) {
              const woSkip = (woPage - 1) * pageSize;
              const woRes = await fetch(`${API_BASE}/work-orders?skip=${woSkip}&limit=${pageSize}`, { headers });
              if (woRes.ok) {
                  const data = await woRes.json();
                  setWorkOrders(data.items);
                  setWoTotal(data.total);
              }
          }
  
          // Stock Data
          if (['stock', 'dashboard', 'reports', 'manufacturing'].includes(fetchTarget)) {
              const balanceRes = await fetch(`${API_BASE}/stock/balance`, { headers });
              if (balanceRes.ok) setStockBalance(await balanceRes.json());
          }
          
          if (['stock', 'reports'].includes(fetchTarget)) {
               const reportSkip = (reportPage - 1) * pageSize;
               const stockRes = await fetch(`${API_BASE}/stock?skip=${reportSkip}&limit=${pageSize}`, { headers });
               if (stockRes.ok) {
                  const data = await stockRes.json();
                  setStockEntries(data.items || []);
                  setReportTotal(data.total || 0);
               }
          }
  
          // Sales & Samples
          if (['sales-orders', 'samples', 'dashboard'].includes(fetchTarget)) {
              const soRes = await fetch(`${API_BASE}/sales-orders`, { headers });
              if (soRes.ok) setSalesOrders(await soRes.json());
  
              const sampRes = await fetch(`${API_BASE}/samples`, { headers });
              if (sampRes.ok) setSamples(await sampRes.json());
          }
  
          // Purchase Orders
          if (['purchase-orders', 'dashboard'].includes(fetchTarget)) {
              const poRes = await fetch(`${API_BASE}/purchase-orders`, { headers });
              if (poRes.ok) setPurchaseOrders(await poRes.json());
          }
  
          // Audit Logs
          if (fetchTarget === 'audit-logs') {
              const auditSkip = (auditPage - 1) * pageSize;
              const auditRes = await fetch(`${API_BASE}/audit-logs?skip=${auditSkip}&limit=${pageSize}&entity_type=${auditType}`, { headers });
              if (auditRes.ok) {
                  const data = await auditRes.json();
                  setAuditLogs(data.items);
                  setAuditTotal(data.total);
              }
          }
  
      } catch (e) {
        console.error("Failed to fetch data", e);
      }
    }, [currentUser, activeTab, itemPage, woPage, auditPage, reportPage, itemSearch, itemCategory, auditType, isInitialLoad, pageSize]);
  
    // Pre-fetch handler
    const handleTabHover = (tab: string) => {
        // Small delay to ensure it's an intentional hover
        fetchData(tab);
    };
  useEffect(() => {
    if (currentUser) {
        fetchData();
    }
    
    const savedName = localStorage.getItem('app_name');
    if (savedName) setAppName(savedName);
    
    const savedStyle = localStorage.getItem('ui_style');
    if (savedStyle) setUiStyle(savedStyle);
  }, [currentUser, activeTab, itemPage, woPage, auditPage, reportPage, itemSearch, itemCategory, auditType]);

  // --- REAL-TIME EVENT STREAM (WebSockets) ---
  const fetchDataRef = useRef(fetchData);
  const activeTabRef = useRef(activeTab);
  
  useEffect(() => {
      fetchDataRef.current = fetchData;
      activeTabRef.current = activeTab;
  }, [fetchData, activeTab]);

  useEffect(() => {
      if (!currentUser) return;

      // Robust URL replacement for wss support
      const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws/events';
      let ws: WebSocket;
      let reconnectTimer: any;

      const connect = () => {
          ws = new WebSocket(wsUrl);

          ws.onmessage = (event) => {
              try {
                  const data = JSON.parse(event.data);
                  if (data.type === 'WORK_ORDER_UPDATE') {
                      // Trigger optimized refresh if on relevant tabs using Ref to avoid stale closure
                      if (['dashboard', 'manufacturing', 'stock'].includes(activeTabRef.current)) {
                          fetchDataRef.current();
                      }
                      showToast(`Real-time: Work Order ${data.code} updated to ${data.status}`, 'info');
                  }
              } catch (e) {
                  console.error("WS Message Error", e);
              }
          };

          ws.onclose = (e) => {
              if (e.code !== 1000) { // Don't reconnect if closed normally
                  reconnectTimer = setTimeout(connect, 5000);
              }
          };

          ws.onerror = (err) => {
              console.error("WS Error", err);
              ws.close();
          };
      };

      connect();

      return () => {
          if (ws) ws.close(1000);
          clearTimeout(reconnectTimer);
      };
  }, [currentUser]); // Only depends on currentUser, stable for the session

  const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoggingIn(true);
      setLoginError('');
      try {
          await login(loginUser, loginPass);
          // Redirect handled by UserContext state change triggering re-render
      } catch (err) {
          setLoginError('ACCESS_DENIED: Invalid Credentials');
      } finally {
          setIsLoggingIn(false);
      }
  };

  const handleUpdateAppName = (name: string) => {
      setAppName(name);
      localStorage.setItem('app_name', name);
  };

  const handleUpdateUIStyle = (style: string) => {
      setUiStyle(style);
      localStorage.setItem('ui_style', style);
  };

  // Helper for confirmation
  const requestConfirm = (title: string, message: string, action: () => void) => {
      setConfirmState({
          isOpen: true,
          title,
          message,
          onConfirm: () => {
              action();
              setConfirmState(prev => ({ ...prev, isOpen: false }));
          }
      });
  };

  // --- API Wrappers (Auth Included) ---
  const authFetch = async (url: string, options: any = {}) => {
      const token = localStorage.getItem('access_token');
      const headers = { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers 
      };
      return fetch(url, { ...options, headers });
  };

  const handleCreateItem = async (item: any) => {
    const res = await authFetch(`${API_BASE}/items`, {
      method: 'POST',
      body: JSON.stringify(item)
    });
    fetchData();
    return res;
  };

  const handleUpdateItem = async (itemId: string, data: any) => {
      await authFetch(`${API_BASE}/items/${itemId}`, {
          method: 'PUT',
          body: JSON.stringify(data)
      });
      fetchData();
  };

  const handleDeleteItem = async (itemId: string) => {
      requestConfirm('Delete Item?', 'Are you sure you want to delete this item?', async () => {
          const res = await authFetch(`${API_BASE}/items/${itemId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Item deleted successfully', 'success');
              fetchData();
          } else {
              const err = await res.json();
              showToast(`Error: ${err.detail || 'Failed to delete item'}`, 'danger');
          }
      });
  };

  const handleAddVariantToItem = async (itemId: string, variant: any) => {
      await authFetch(`${API_BASE}/items/${itemId}/variants`, {
          method: 'POST',
          body: JSON.stringify(variant)
      });
      fetchData();
  };

  const handleDeleteVariant = async (variantId: string) => {
      await authFetch(`${API_BASE}/items/variants/${variantId}`, {
          method: 'DELETE'
      });
      fetchData();
  };

  const handleCreateLocation = async (location: any) => {
    const res = await authFetch(`${API_BASE}/locations`, {
      method: 'POST',
      body: JSON.stringify(location)
    });
    fetchData();
    return res;
  };

  const handleDeleteLocation = async (locationId: string) => {
      requestConfirm('Delete Location?', 'Are you sure you want to delete this location?', async () => {
          const res = await authFetch(`${API_BASE}/locations/${locationId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Location deleted successfully', 'success');
              fetchData();
          } else {
              showToast('Failed to delete location', 'danger');
          }
      });
  };

  const handleCreateAttribute = async (attr: any) => {
    await authFetch(`${API_BASE}/attributes`, {
        method: 'POST',
        body: JSON.stringify(attr)
    });
    fetchData();
  };

  const handleUpdateAttribute = async (id: string, name: string) => {
      await authFetch(`${API_BASE}/attributes/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name })
      });
      fetchData();
  };

  const handleDeleteAttribute = async (attributeId: string) => {
      requestConfirm('Delete Attribute?', 'Are you sure you want to delete this attribute template?', async () => {
          const res = await authFetch(`${API_BASE}/attributes/${attributeId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Attribute template deleted', 'success');
              fetchData();
          }
      });
  };

  const handleAddAttributeValue = async (attributeId: string, value: string) => {
      await authFetch(`${API_BASE}/attributes/${attributeId}/values`, {
          method: 'POST',
          body: JSON.stringify({ value })
      });
      fetchData();
  };

  const handleUpdateAttributeValue = async (valueId: string, value: string) => {
      await authFetch(`${API_BASE}/attributes/values/${valueId}`, {
          method: 'PUT',
          body: JSON.stringify({ value })
      });
      fetchData();
  };

  const handleDeleteAttributeValue = async (valueId: string) => {
      await authFetch(`${API_BASE}/attributes/values/${valueId}`, {
          method: 'DELETE'
      });
      fetchData();
  };

  const handleCreateCategory = async (name: string) => {
      await authFetch(`${API_BASE}/categories`, {
          method: 'POST',
          body: JSON.stringify({ name })
      });
      fetchData();
  };

  const handleDeleteCategory = async (categoryId: string) => {
      const res = await authFetch(`${API_BASE}/categories/${categoryId}`, {
          method: 'DELETE'
      });
      if (res.ok) {
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail || 'Failed to delete category'}`, 'danger');
      }
  };

  const handleCreateUOM = async (name: string) => {
      await authFetch(`${API_BASE}/uoms`, {
          method: 'POST',
          body: JSON.stringify({ name })
      });
      fetchData();
  };

  const handleDeleteUOM = async (uomId: string) => {
      const res = await authFetch(`${API_BASE}/uoms/${uomId}`, {
          method: 'DELETE'
      });
      if (res.ok) {
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail || 'Failed to delete UOM'}`, 'danger');
      }
  };

  const handleCreateWorkCenter = async (wc: any) => {
      const res = await authFetch(`${API_BASE}/work-centers`, {
          method: 'POST',
          body: JSON.stringify(wc)
      });
      if (res.ok) {
          showToast('Work Center added!', 'success');
          fetchData();
      }
  };

  const handleDeleteWorkCenter = async (id: string) => {
      await authFetch(`${API_BASE}/work-centers/${id}`, { method: 'DELETE' });
      fetchData();
  };

  const handleCreateOperation = async (op: any) => {
      const res = await authFetch(`${API_BASE}/operations`, {
          method: 'POST',
          body: JSON.stringify(op)
      });
      if (res.ok) {
          showToast('Operation added!', 'success');
          fetchData();
      }
  };

  const handleDeleteOperation = async (id: string) => {
      await authFetch(`${API_BASE}/operations/${id}`, { method: 'DELETE' });
      fetchData();
  };

  const handleCreateBOM = async (bom: any) => {
      const res = await authFetch(`${API_BASE}/boms`, {
          method: 'POST',
          body: JSON.stringify(bom)
      });
      if (res.ok) {
          showToast('BOM Created successfully!', 'success');
          fetchData();
      }
      return res;
  };

  const handleDeleteBOM = async (bomId: string) => {
      requestConfirm('Delete BOM?', 'Are you sure?', async () => {
          const res = await authFetch(`${API_BASE}/boms/${bomId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('BOM deleted successfully', 'success');
              fetchData();
          } else {
              const err = await res.json();
              showToast(`Error: ${err.detail || 'Failed to delete BOM'}`, 'danger');
          }
      });
  };

  const handleCreatePO = async (po: any) => {
      const res = await authFetch(`${API_BASE}/sales-orders`, {
          method: 'POST',
          body: JSON.stringify(po)
      });
      if (res.ok) {
          showToast('PO created successfully!', 'success');
          fetchData();
      }
  };

  const handleDeletePO = async (id: string) => {
      requestConfirm('Delete PO?', 'Are you sure?', async () => {
          await authFetch(`${API_BASE}/sales-orders/${id}`, { method: 'DELETE' });
          fetchData();
      });
  };

  const handleCreateRealPO = async (po: any) => {
      const res = await authFetch(`${API_BASE}/purchase-orders`, {
          method: 'POST',
          body: JSON.stringify(po)
      });
      if (res.ok) {
          showToast('Purchase Order created!', 'success');
          fetchData();
      }
  };

  const handleDeleteRealPO = async (id: string) => {
      requestConfirm('Delete PO?', 'Are you sure?', async () => {
          await authFetch(`${API_BASE}/purchase-orders/${id}`, { method: 'DELETE' });
          fetchData();
      });
  };

  const handleReceivePO = async (id: string) => {
      const res = await authFetch(`${API_BASE}/purchase-orders/${id}/receive`, {
          method: 'POST'
      });
      if (res.ok) {
          showToast('PO Received! Stock has been updated.', 'success');
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
      }
  };

  const handleCreateSample = async (sample: any) => {
      const res = await authFetch(`${API_BASE}/samples`, {
          method: 'POST',
          body: JSON.stringify(sample)
      });
      if (res.ok) {
          showToast('Sample created successfully!', 'success');
          fetchData();
      }
  };

  const handleUpdateSampleStatus = async (id: string, status: string) => {
      await authFetch(`${API_BASE}/samples/${id}/status?status=${status}`, {
          method: 'PUT'
      });
      fetchData();
  };

  const handleDeleteSample = async (id: string) => {
      requestConfirm('Delete Sample?', 'Are you sure?', async () => {
          await authFetch(`${API_BASE}/samples/${id}`, { method: 'DELETE' });
          fetchData();
      });
  };

  const handleCreateWO = async (wo: any) => {
      const res = await authFetch(`${API_BASE}/work-orders`, {
          method: 'POST',
          body: JSON.stringify(wo)
      });
      if (res.ok) {
          showToast('WO created successfully!', 'success');
          fetchData();
      }
      return res;
  };

  const handleUpdateWOStatus = async (woId: string, status: string) => {
      const res = await authFetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, {
          method: 'PUT'
      });
      if (res.ok) {
          showToast(`WO status updated`, 'info');
          fetchData();
          return true;
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
          return false;
      }
  };

  const handleDeleteWO = async (woId: string) => {
      requestConfirm('Delete Work Order?', 'Are you sure you want to delete this Work Order? This action cannot be undone.', async () => {
          const res = await authFetch(`${API_BASE}/work-orders/${woId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Work Order deleted successfully', 'success');
              fetchData();
          } else {
              const err = await res.json();
              showToast(`Error: ${err.detail}`, 'danger');
          }
      });
  };

  const handleDownloadTemplate = async () => {
      try {
          const res = await authFetch(`${API_BASE}/items/template`);
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'items_template.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
      } catch (e) {
          showToast('Failed to download template', 'danger');
      }
  };

  const handleImportItems = async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/items/import`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }, // No Content-Type for FormData
          body: formData
      });
      
      const data = await res.json();
      fetchData();
      return data;
  };

  const handleRecordStock = async (entry: any) => {
    const res = await authFetch(`${API_BASE}/items/stock`, {
      method: 'POST',
      body: JSON.stringify(entry)
    });
    if (res.ok) {
        showToast('Stock recorded!', 'success');
        fetchData();
    }
  };

  const handleCreatePartner = async (partner: any) => {
      const res = await authFetch(`${API_BASE}/partners`, {
          method: 'POST',
          body: JSON.stringify(partner)
      });
      if (res.ok) {
          showToast('Partner added successfully!', 'success');
          fetchData();
      }
  };

  const handleUpdatePartner = async (id: string, partner: any) => {
      const res = await authFetch(`${API_BASE}/partners/${id}`, {
          method: 'PUT',
          body: JSON.stringify(partner)
      });
      if (res.ok) {
          showToast('Partner updated!', 'success');
          fetchData();
      }
  };

  const handleDeletePartner = async (id: string) => {
      requestConfirm('Delete Partner?', 'Are you sure?', async () => {
          const res = await authFetch(`${API_BASE}/partners/${id}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Partner deleted', 'success');
              fetchData();
          }
      });
  };

  if (loading) {
      return (
          <div className="vh-100 d-flex align-items-center justify-content-center bg-light">
              <div className="spinner-border text-primary" role="status"></div>
          </div>
      );
  }

  // --- RENDER LANDING PAGE FOR NON-AUTH USERS ---
  if (!currentUser) {
    return (
        <div className={`landing-page ui-style-${uiStyle} min-vh-100 d-flex flex-column`} style={{backgroundColor: '#e0e0e0', color: '#000'}}>
            {/* Top Corporate Navigation */}
            <nav className="navbar navbar-expand-lg border-bottom border-secondary bg-white py-2 sticky-top" style={{boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}}>
                <div className="container">
                    <a className="navbar-brand fw-bold d-flex align-items-center text-primary" href="#" style={{fontFamily: 'Tahoma, sans-serif'}}>
                        <i className="bi bi-grid-3x3-gap-fill me-2 fs-4"></i>
                        TERRAS <span className="fw-normal ms-1 text-dark">ENTERPRISE</span>
                    </a>
                    <div className="d-none d-md-flex align-items-center gap-3 small">
                        <div className="d-flex align-items-center text-secondary">
                            <i className="bi bi-server me-1"></i> System v1.0
                        </div>
                        <div className="d-flex align-items-center text-success fw-bold">
                            <i className="bi bi-check-circle-fill me-1"></i> ONLINE
                        </div>
                        <span className="badge bg-light text-dark border">SECURE</span>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="flex-grow-1 d-flex align-items-center position-relative" style={{
                background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                borderBottom: '1px solid #999'
            }}>
                <div className="container py-5">
                    <div className="row align-items-center gy-5">
                        <div className="col-lg-6">
                            <div className="mb-3 d-inline-flex align-items-center px-2 py-1 bg-white border rounded shadow-sm">
                                <span className="badge bg-primary me-2">NEW</span>
                                <small className="fw-bold text-secondary text-uppercase" style={{fontSize: '0.7rem'}}>Industrial Standard 4.0</small>
                            </div>
                            <h1 className="display-4 fw-bold mb-3 text-dark" style={{fontFamily: 'Tahoma, sans-serif', letterSpacing: '-1px'}}>
                                Precision Manufacturing <br/>
                                <span className="text-primary">Management System</span>
                            </h1>
                            <p className="lead text-secondary mb-4" style={{maxWidth: '550px', fontSize: '1.1rem'}}>
                                A complete Enterprise Resource Planning solution designed for agility, accuracy, and scalability. Streamline your operations from inventory to fulfillment.
                            </p>
                            
                            <div className="d-flex gap-3 text-secondary small fw-bold">
                                <span><i className="bi bi-check-lg text-primary me-1"></i> Real-time Stock</span>
                                <span><i className="bi bi-check-lg text-primary me-1"></i> Multi-level BOM</span>
                                <span><i className="bi bi-check-lg text-primary me-1"></i> Audit Trail</span>
                            </div>
                        </div>
                        
                        {/* Corporate Login Module */}
                        <div className="col-lg-5 offset-lg-1">
                            <div className="card border-0 shadow-lg" style={{borderRadius: '4px'}}>
                                <div className="card-header bg-primary text-white py-3" style={{borderRadius: '4px 4px 0 0'}}>
                                    <h5 className="mb-0 fw-bold"><i className="bi bi-shield-lock me-2"></i>Secure Access</h5>
                                </div>
                                <div className="card-body p-4 bg-white">
                                    {loginError && (
                                        <div className="alert alert-danger d-flex align-items-center py-2 mb-3 small" role="alert">
                                            <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                            <div>{loginError}</div>
                                        </div>
                                    )}
                                    <form onSubmit={handleLoginSubmit}>
                                        <div className="mb-3">
                                            <label className="form-label small fw-bold text-secondary text-uppercase">Username / ID</label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-light border-end-0"><i className="bi bi-person"></i></span>
                                                <input 
                                                    className="form-control border-start-0"
                                                    value={loginUser}
                                                    onChange={e => setLoginUser(e.target.value)}
                                                    required
                                                    placeholder="Enter your ID"
                                                />
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <label className="form-label small fw-bold text-secondary text-uppercase">Password</label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-light border-end-0"><i className="bi bi-key"></i></span>
                                                <input 
                                                    type="password"
                                                    className="form-control border-start-0" 
                                                    value={loginPass}
                                                    onChange={e => setLoginPass(e.target.value)}
                                                    required
                                                    placeholder="••••••••"
                                                />
                                            </div>
                                        </div>
                                        <button 
                                            type="submit" 
                                            className="btn btn-primary w-100 py-2 fw-bold"
                                            style={{borderRadius: '2px'}}
                                            disabled={isLoggingIn}
                                        >
                                            {isLoggingIn ? 'Authenticating...' : 'Sign In'}
                                        </button>
                                        <div className="text-center mt-3">
                                            <small className="text-muted">Authorized Personnel Only</small>
                                        </div>
                                    </form>
                                </div>
                                <div className="card-footer bg-light text-center py-2 border-top">
                                    <small className="text-muted" style={{fontSize: '0.7rem'}}>Terras Systems © 2026. All Rights Reserved.</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Corporate Features Strip */}
            <section className="py-5 bg-white border-bottom">
                <div className="container">
                    <div className="row g-4 text-center">
                        {[ 
                            { icon: 'bi-box-seam', title: 'Inventory Control', desc: 'Precise tracking across multiple warehouses.' }, 
                            { icon: 'bi-diagram-3', title: 'Advanced Engineering', desc: 'Recursive BOMs and automated recipe generation.' }, 
                            { icon: 'bi-gear-wide-connected', title: 'Production Management', desc: 'End-to-end work order scheduling and monitoring.' }, 
                            { icon: 'bi-graph-up-arrow', title: 'Business Intelligence', desc: 'Real-time analytics and detailed reporting.' } 
                        ].map((f, i) => (
                            <div key={i} className="col-md-3">
                                <div className="p-3 h-100">
                                    <div className="mb-3 d-inline-flex align-items-center justify-content-center bg-light text-primary rounded-circle" style={{width: '60px', height: '60px'}}>
                                        <i className={`bi ${f.icon} fs-3`}></i>
                                    </div>
                                    <h6 className="fw-bold text-dark">{f.title}</h6>
                                    <p className="text-muted small mb-0">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Technical Specs / Footer */}
            <footer className="bg-dark text-white py-4 mt-auto">
                <div className="container">
                    <div className="row align-items-center">
                        <div className="col-md-6 mb-3 mb-md-0">
                            <h6 className="text-uppercase fw-bold mb-2 small text-white-50">System Architecture</h6>
                            <div className="d-flex gap-3 small font-monospace text-white-50">
                                <span>Python 3.11</span>
                                <span>PostgreSQL 15</span>
                                <span>React 18</span>
                            </div>
                        </div>
                        <div className="col-md-6 text-md-end">
                            <a href={`${API_BASE}/docs`} target="_blank" className="btn btn-sm btn-outline-light rounded-0" style={{fontSize: '0.75rem'}}>
                                <i className="bi bi-code-slash me-1"></i> API Documentation
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
  }

  // --- RENDER MAIN DASHBOARD FOR AUTHENTICATED USERS ---
  return (
    <div className={`d-flex flex-column ui-style-${uiStyle}`} style={{ minHeight: '100vh' }}>
      <ConfirmModal 
          isOpen={confirmState.isOpen}
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Mobile Overlay */}
      <div 
        className={`mobile-overlay ${isMobileSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      ></div>

      {/* Classic Top Header (only visible in classic) */}
      {uiStyle === 'classic' && (
          <div className="classic-header shadow-sm d-flex justify-content-between align-items-center px-3" style={{ background: 'var(--win-header-grad)', height: '30px', color: 'white' }}>
              <div className="d-flex align-items-center gap-2">
                  <button className="btn btn-sm text-white d-md-none p-0" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
                      <i className="bi bi-list fs-5"></i>
                  </button>
                  <div className="fw-bold"><i className="bi bi-cpu-fill me-2"></i>{appName}</div>
              </div>
              <div className="d-flex align-items-center gap-3 small">
                  {/* Quick Scan Shortcut */}
                  <button 
                    className="btn btn-sm p-0 text-white" 
                    onClick={() => setActiveTab('scanner')} 
                    title="Quick Scan Terminal"
                  >
                      <i className="bi bi-qr-code-scan fs-6"></i>
                  </button>
                  <div>
                      <select 
                          className="form-select form-select-sm py-0 ps-1 pe-3" 
                          style={{height: '20px', fontSize: '11px', background: 'transparent', color: 'white', border: '1px solid white'}}
                          value={language}
                          onChange={(e) => setLanguage(e.target.value as any)}
                      >
                          <option value="en" style={{color: 'black'}}>English</option>
                          <option value="id" style={{color: 'black'}}>Indonesia</option>
                      </select>
                  </div>
                  <div className="d-none d-md-block">User: {currentUser?.full_name} | {new Date().toLocaleDateString()}</div>
                  <button className="btn btn-sm btn-link text-white p-0 ms-2" onClick={() => logout()} title="Logout">
                      <i className="bi bi-power"></i>
                  </button>
              </div>
          </div>
      )}

      <div className="d-flex flex-grow-1">
        <Sidebar 
            activeTab={activeTab} 
            setActiveTab={(tab) => { setActiveTab(tab); setIsMobileSidebarOpen(false); }} 
            onTabHover={handleTabHover}
            appName={appName} 
            isOpen={isMobileSidebarOpen}
        />
        
        <div className="main-content flex-grow-1">
          {/* Classic Toolbar */}
          {uiStyle === 'classic' && (
              <div className="classic-toolbar">
                  <button className="btn btn-sm" onClick={() => fetchData()}><i className="bi bi-arrow-clockwise me-1"></i>{t('refresh')}</button>
                  <div className="vr mx-1"></div>
                  <button className="btn btn-sm"><i className="bi bi-printer me-1"></i>{t('print')}</button>
              </div>
          )}

          <header className={`mb-4 d-flex justify-content-between align-items-center ${uiStyle === 'classic' ? 'd-none' : ''}`}>
              <div className="d-flex align-items-center gap-3">
                  <button className="btn btn-light d-md-none border" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
                      <i className="bi bi-list"></i>
                  </button>
                  <h2 className="text-capitalize mb-0 fw-bold text-dark">{t(activeTab.replace('-', '_')) || activeTab.replace('-', ' ')}</h2>
              </div>
              <div className="d-flex align-items-center gap-3">
                  <button 
                    className="btn btn-primary btn-sm shadow-sm d-flex align-items-center gap-2 px-3" 
                    onClick={() => setActiveTab('scanner')}
                  >
                      <i className="bi bi-qr-code-scan"></i>
                      <span className="d-none d-sm-inline fw-bold small">SCAN</span>
                  </button>
                  <button className="btn btn-outline-secondary btn-sm d-none d-md-block" onClick={() => fetchData()}>
                      <i className="bi bi-arrow-clockwise me-1"></i>{t('refresh')}
                  </button>
                  <select 
                      className="form-select form-select-sm" 
                      style={{width: '120px'}}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as any)}
                  >
                      <option value="en">English</option>
                      <option value="id">Indonesia</option>
                  </select>
                  
                  <span className="text-muted small">v0.2.0</span>
                  <div 
                      className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm" 
                      style={{width: 32, height: 32, cursor: 'pointer'}}
                      onClick={() => setActiveTab('settings')}
                      title="Settings"
                  >
                      <i className="bi bi-person-fill"></i>
                  </div>
                  <button className="btn btn-light btn-sm shadow-sm text-danger" onClick={() => logout()} title="Logout">
                      <i className="bi bi-power"></i>
                  </button>
              </div>
          </header>

          {/* Settings shortcut for Classic theme (since header is hidden) */}
          {uiStyle === 'classic' && activeTab !== 'settings' && (
              <div className="text-end mb-2">
                  <button className="btn btn-sm btn-light" onClick={() => setActiveTab('settings')}> 
                      <i className="bi bi-person-gear me-1"></i>{t('account_settings')}
                  </button>
              </div>
          )}

        {activeTab === 'dashboard' && (
            <DashboardView 
                items={items} 
                locations={locations}
                stockBalance={stockBalance}
                workOrders={workOrders}
                stockEntries={stockEntries}
                samples={samples}
                salesOrders={salesOrders}
                kpis={dashboardKPIs}
            />
        )}

        {activeTab === 'scanner' && (
            <div className="container-fluid py-4 h-100">
                <div className="row justify-content-center h-100">
                    <div className="col-md-8 col-lg-6">
                        <QRScannerView 
                            workOrders={workOrders} 
                            items={items}
                            boms={boms}
                            locations={locations}
                            attributes={attributes}
                            stockBalance={stockBalance}
                            onUpdateStatus={handleUpdateWOStatus} 
                            onClose={() => setActiveTab('manufacturing')} 
                        />
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'inventory' && (
            <InventoryView 
                items={items} 
                attributes={attributes}
                categories={categories}
                uoms={uoms}
                onCreateItem={handleCreateItem} 
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddVariant={handleAddVariantToItem}
                onDeleteVariant={handleDeleteVariant}
                onCreateCategory={handleCreateCategory}
                onDownloadTemplate={handleDownloadTemplate}
                onImportItems={handleImportItems}
                onRefresh={fetchData} 
                currentPage={itemPage}
                totalItems={itemTotal}
                pageSize={pageSize}
                onPageChange={setItemPage}
                searchTerm={itemSearch}
                onSearchChange={setItemSearch}
                categoryFilter={itemCategory}
                onCategoryChange={setItemCategory}
            />
        )}

        {activeTab === 'sample-masters' && (
            <InventoryView 
                items={items} 
                attributes={attributes}
                categories={categories}
                uoms={uoms}
                onCreateItem={handleCreateItem} 
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onAddVariant={handleAddVariantToItem}
                onDeleteVariant={handleDeleteVariant}
                onCreateCategory={handleCreateCategory}
                onRefresh={fetchData} 
                forcedCategory="Sample"
            />
        )}

        {activeTab === 'samples' && (
            <SampleRequestView 
                samples={samples}
                salesOrders={salesOrders}
                items={items}
                attributes={attributes}
                onCreateSample={handleCreateSample}
                onUpdateStatus={handleUpdateSampleStatus}
                onDeleteSample={handleDeleteSample}
                uiStyle={uiStyle}
            />
        )}

        {activeTab === 'locations' && (
            <LocationsView 
                locations={locations}
                onCreateLocation={handleCreateLocation}
                onDeleteLocation={handleDeleteLocation}
                onRefresh={fetchData}
            />
        )}

        {activeTab === 'attributes' && (
            <AttributesView 
                attributes={attributes} 
                onCreateAttribute={handleCreateAttribute}
                onUpdateAttribute={handleUpdateAttribute}
                onDeleteAttribute={handleDeleteAttribute}
                onAddValue={handleAddAttributeValue}
                onUpdateValue={handleUpdateAttributeValue}
                onDeleteValue={handleDeleteAttributeValue}
            />
        )}

        {activeTab === 'categories' && (
            <CategoriesView 
                categories={categories}
                onCreateCategory={handleCreateCategory}
                onDeleteCategory={handleDeleteCategory}
            />
        )}

        {activeTab === 'uom' && (
            <UOMView 
                uoms={uoms}
                onCreateUOM={handleCreateUOM}
                onDeleteUOM={handleDeleteUOM}
                onRefresh={fetchData}
            />
        )}

        {activeTab === 'bom' && (
            <BOMView 
                items={items} 
                boms={boms}
                locations={locations}
                attributes={attributes}
                workCenters={workCenters}
                operations={operations}
                onCreateBOM={handleCreateBOM} 
                onDeleteBOM={handleDeleteBOM}
                onCreateItem={handleCreateItem}
            />
        )}

        {activeTab === 'routing' && (
            <RoutingView 
                workCenters={workCenters}
                operations={operations}
                onCreateWorkCenter={handleCreateWorkCenter}
                onDeleteWorkCenter={handleDeleteWorkCenter}
                onCreateOperation={handleCreateOperation}
                onDeleteOperation={handleDeleteOperation}
                onRefresh={fetchData}
            />
        )}

        {activeTab === 'manufacturing' && (
            <ManufacturingView 
                items={items} 
                boms={boms} 
                locations={locations} 
                attributes={attributes}
                workOrders={workOrders} 
                stockBalance={stockBalance}
                workCenters={workCenters}
                operations={operations}
                onCreateWO={handleCreateWO} 
                onUpdateStatus={handleUpdateWOStatus} 
                onDeleteWO={handleDeleteWO}
                currentPage={woPage}
                totalItems={woTotal}
                pageSize={pageSize}
                onPageChange={setWoPage}
            />
        )}

        {activeTab === 'sales-orders' && (
            <SalesOrderView 
                items={items} 
                attributes={attributes}
                salesOrders={salesOrders}
                partners={partners}
                onCreateSO={handleCreatePO}
                onDeleteSO={handleDeletePO}
            />
        )}

        {activeTab === 'purchase-orders' && (
            <PurchaseOrderView 
                items={items} 
                attributes={attributes}
                purchaseOrders={purchaseOrders}
                partners={partners}
                locations={locations}
                onCreatePO={handleCreateRealPO}
                onDeletePO={handleDeleteRealPO}
                onReceivePO={handleReceivePO}
            />
        )}

        {activeTab === 'customers' && (
            <PartnersView 
                partners={partners}
                type="CUSTOMER"
                onCreate={handleCreatePartner}
                onUpdate={handleUpdatePartner}
                onDelete={handleDeletePartner}
            />
        )}

        {activeTab === 'suppliers' && (
            <PartnersView 
                partners={partners}
                type="SUPPLIER"
                onCreate={handleCreatePartner}
                onUpdate={handleUpdatePartner}
                onDelete={handleDeletePartner}
            />
        )}

        {activeTab === 'stock' && (
            <StockEntryView 
                items={items} 
                locations={locations} 
                attributes={attributes}
                stockBalance={stockBalance}
                onRecordStock={handleRecordStock} 
            />
        )}

        {activeTab === 'reports' && (
            <ReportsView 
                stockEntries={stockEntries} 
                items={items} 
                locations={locations} 
                categories={categories}
                onRefresh={fetchData} 
                currentPage={reportPage}
                totalItems={reportTotal}
                pageSize={pageSize}
                onPageChange={setReportPage}
            />
        )}

        {activeTab === 'audit-logs' && (
            <AuditLogsView 
                auditLogs={auditLogs} 
                currentPage={auditPage}
                totalItems={auditTotal}
                pageSize={pageSize}
                onPageChange={setAuditPage}
                filterType={auditType}
                onFilterChange={setAuditType}
            />
        )}

        {activeTab === 'settings' && (
            <SettingsView 
                appName={appName}
                onUpdateAppName={handleUpdateAppName}
                uiStyle={uiStyle}
                onUpdateUIStyle={handleUpdateUIStyle}
                requestConfirm={requestConfirm}
            />
        )}
        </div>
      </div>
    </div>
  );
}
