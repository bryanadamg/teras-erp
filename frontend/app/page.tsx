'use client';

import { useState, useEffect } from 'react';
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
import PurchaseOrderView from './components/PurchaseOrderView';
import SampleRequestView from './components/SampleRequestView';
import { useToast } from './components/Toast';
import { useLanguage } from './context/LanguageContext';
import { useUser } from './context/UserContext';
import DashboardView from './components/DashboardView';
import ConfirmModal from './components/ConfirmModal';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

export default function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const { language, setLanguage, t } = useLanguage();
  const { currentUser, loading, hasPermission, refreshUsers, logout } = useUser();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appName, setAppName] = useState('Teras ERP');
  const [uiStyle, setUiStyle] = useState('classic');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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
  const [samples, setSamples] = useState([]);

  const fetchData = async () => {
    if (!currentUser) return;
    try {
      const token = localStorage.getItem('access_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [itemsRes, locsRes, stockRes, attrsRes, catsRes, uomsRes, bomsRes, wcRes, opRes, woRes, balRes, soRes, sampRes] = await Promise.all([
          fetch(`${API_BASE}/items`, { headers }),
          fetch(`${API_BASE}/locations`, { headers }),
          fetch(`${API_BASE}/stock`, { headers }),
          fetch(`${API_BASE}/attributes`, { headers }),
          fetch(`${API_BASE}/categories`, { headers }),
          fetch(`${API_BASE}/uoms`, { headers }),
          fetch(`${API_BASE}/boms`, { headers }),
          fetch(`${API_BASE}/work-centers`, { headers }),
          fetch(`${API_BASE}/operations`, { headers }),
          fetch(`${API_BASE}/work-orders`, { headers }),
          fetch(`${API_BASE}/stock/balance`, { headers }),
          fetch(`${API_BASE}/sales-orders`, { headers }),
          fetch(`${API_BASE}/samples`, { headers })
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (locsRes.ok) setLocations(await locsRes.json());
      if (stockRes.ok) setStockEntries(await stockRes.json());
      if (attrsRes.ok) setAttributes(await attrsRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
      if (uomsRes.ok) setUoms(await uomsRes.json());
      if (bomsRes.ok) setBoms(await bomsRes.json());
      if (wcRes.ok) setWorkCenters(await wcRes.json());
      if (opRes.ok) setOperations(await opRes.json());
      if (woRes.ok) setWorkOrders(await woRes.json());
      if (balRes.ok) setStockBalance(await balRes.json());
      if (soRes.ok) setSalesOrders(await soRes.json());
      if (sampRes.ok) setSamples(await sampRes.json());
    } catch (e) {
      console.error("Failed to fetch data", e);
    }
  };

  useEffect(() => {
    if (currentUser) {
        fetchData();
    }
    
    const savedName = localStorage.getItem('app_name');
    if (savedName) setAppName(savedName);
    
    const savedStyle = localStorage.getItem('ui_style');
    if (savedStyle) setUiStyle(savedStyle);
  }, [currentUser]);

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
              showToast('Failed to delete item', 'danger');
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
      await authFetch(`${API_BASE}/categories/${categoryId}`, {
          method: 'DELETE'
      });
      fetchData();
  };

  const handleCreateUOM = async (name: string) => {
      await authFetch(`${API_BASE}/uoms`, {
          method: 'POST',
          body: JSON.stringify({ name })
      });
      fetchData();
  };

  const handleDeleteUOM = async (uomId: string) => {
      await authFetch(`${API_BASE}/uoms/${uomId}`, {
          method: 'DELETE'
      });
      fetchData();
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
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
      }
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
        <div className={`landing-page ui-style-${uiStyle} min-vh-100 bg-white`}>
            {/* Top Navigation */}
            <nav className="navbar navbar-expand-lg border-bottom py-3 sticky-top bg-white">
                <div className="container">
                    <a className="navbar-brand fw-bold text-primary fs-3 d-flex align-items-center" href="#">
                        <i className="bi bi-cpu-fill me-2"></i>{appName}
                    </a>
                    <div className="d-flex gap-3">
                        <button className="btn btn-light border" onClick={() => router.push('/login')}>Login</button>
                        <button className="btn btn-primary px-4 shadow-sm" onClick={() => router.push('/login')}>Get Started</button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="py-5 py-md-5 bg-light position-relative overflow-hidden">
                <div className="container position-relative z-3">
                    <div className="row align-items-center py-5">
                        <div className="col-lg-6 mb-5 mb-lg-0">
                            <span className="badge bg-primary bg-opacity-10 text-primary px-3 py-2 mb-3 rounded-pill fw-bold">v0.2.0 Open Alpha</span>
                            <h1 className="display-3 fw-bold text-dark mb-4 lh-sm">
                                The Next Generation of <span className="text-primary">Manufacturing</span>
                            </h1>
                            <p className="lead text-muted mb-5 fs-4">
                                A high-performance, modular ERP engineered for agility. Bridge the gap between engineering, sales, and the factory floor with Teras ERP.
                            </p>
                            <div className="d-flex flex-wrap gap-3">
                                <button className="btn btn-primary btn-lg px-5 py-3 shadow" onClick={() => router.push('/login')}>
                                    Launch Control Center <i className="bi bi-arrow-right ms-2"></i>
                                </button>
                                <button className="btn btn-outline-secondary btn-lg px-4 py-3 border-2">
                                    Explore Modules
                                </button>
                            </div>
                        </div>
                        <div className="col-lg-6">
                            <div className="p-2 bg-white rounded-4 shadow-lg border">
                                <img 
                                    src="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1000" 
                                    className="img-fluid rounded-3" 
                                    alt="Factory Interface" 
                                />
                            </div>
                        </div>
                    </div>
                </div>
                {/* Background Shapes */}
                <div className="position-absolute top-0 end-0 mt-n5 me-n5 opacity-10">
                    <i className="bi bi-grid-3x3-gap-fill" style={{fontSize: '20rem'}}></i>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-5">
                <div className="container py-5">
                    <div className="text-center mb-5">
                        <h2 className="fw-bold display-5 mb-3">Modular Excellence</h2>
                        <p className="text-muted fs-5 mx-auto" style={{maxWidth: '700px'}}>Built with a focus on granular data control and high-efficiency workflows.</p>
                    </div>
                    <div className="row g-4">
                        {[
                            { icon: 'bi-box-seam', title: 'Smart Inventory', desc: 'Manage multi-location stock with deep attribute support. Prevent negative stock automatically.' },
                            { icon: 'bi-diagram-3', title: 'Advanced BOM', desc: 'Recursive hierarchical recipes with visual tree structures and material shortage tracking.' },
                            { icon: 'bi-gear-wide-connected', title: 'Production (MES)', desc: 'Real-time Work Order execution with start/finish timestamps and automated reconciliation.' },
                            { icon: 'bi-eyedropper', title: 'Sampling (PLM)', desc: 'Full lifecycle management for prototypes. Approved samples promote seamlessly to inventory.' },
                            { icon: 'bi-cart3', title: 'Sales Tracking', desc: 'Trace incoming POs from customer entry through prototype approval to final shipment.' },
                            { icon: 'bi-shield-lock', title: 'Granular RBAC', desc: 'Secure the operation with role-based access and direct user-level permission overrides.' }
                        ].map((f, i) => (
                            <div key={i} className="col-md-4">
                                <div className="card h-100 border-0 shadow-sm hover-up p-4">
                                    <div className="feature-icon-wrapper bg-primary bg-opacity-10 text-primary rounded-3 d-inline-flex align-items-center justify-content-center mb-4" style={{width: 60, height: 60}}>
                                        <i className={`bi ${f.icon} fs-2`}></i>
                                    </div>
                                    <h4 className="fw-bold mb-3">{f.title}</h4>
                                    <p className="text-muted mb-0">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Theme Showcase */}
            <section className="py-5 bg-dark text-white">
                <div className="container py-5">
                    <div className="row align-items-center">
                        <div className="col-lg-5 mb-5 mb-lg-0">
                            <h2 className="fw-bold display-5 mb-4">Adaptive UI Engine</h2>
                            <p className="lead opacity-75 mb-4">Choose the interface that matches your workflow. From modern rounded styles to our high-efficiency Classic XP theme.</p>
                            <ul className="list-unstyled mb-5">
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-success me-3"></i> <strong>Classic (XP):</strong> Optimized for desktop productivity.</li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-success me-3"></i> <strong>Modern:</strong> Contemporary aesthetic for casual use.</li>
                                <li className="mb-3 d-flex align-items-center"><i className="bi bi-check-circle-fill text-success me-3"></i> <strong>Compact:</strong> Maximum data density for power users.</li>
                            </ul>
                            <button className="btn btn-outline-light btn-lg px-4 py-2" onClick={() => router.push('/login')}>Try Classic Mode</button>
                        </div>
                        <div className="col-lg-7">
                            <div className="rounded-4 overflow-hidden border border-white border-opacity-25 shadow-lg">
                                <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1000" className="img-fluid" alt="Dashboard" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-5 border-top bg-light">
                <div className="container text-center">
                    <p className="fw-bold text-primary mb-2">{appName}</p>
                    <p className="text-muted small">&copy; 2026 Teras Systems. Built for high-stakes production.</p>
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
              </div>
          </div>
      )}

      <div className="d-flex flex-grow-1">
        <Sidebar 
            activeTab={activeTab} 
            setActiveTab={(tab) => { setActiveTab(tab); setIsMobileSidebarOpen(false); }} 
            appName={appName} 
            isOpen={isMobileSidebarOpen}
        />
        
        <div className="main-content flex-grow-1">
          {/* Classic Toolbar */}
          {uiStyle === 'classic' && (
              <div className="classic-toolbar">
                  <button className="btn btn-sm" onClick={() => fetchData()}><i className="bi bi-arrow-clockwise me-1"></i>{t('refresh')}</button>
                  <div className="vr mx-1"></div>
                  <button className="btn btn-sm" onClick={() => logout()}><i className="bi bi-box-arrow-right me-1"></i>Logout</button>
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
            />
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
                onRefresh={fetchData} 
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
                onCreateWO={handleCreateWO} 
                onUpdateStatus={handleUpdateWOStatus} 
            />
        )}

        {activeTab === 'purchase-orders' && (
            <PurchaseOrderView 
                items={items} 
                attributes={attributes}
                salesOrders={salesOrders}
                onCreatePO={handleCreatePO}
                onDeletePO={handleDeletePO}
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
            />
        )}

        {activeTab === 'settings' && (
            <SettingsView 
                appName={appName}
                onUpdateAppName={handleUpdateAppName}
                uiStyle={uiStyle}
                onUpdateUIStyle={handleUpdateUIStyle}
            />
        )}
        </div>
      </div>
    </div>
  );
}
