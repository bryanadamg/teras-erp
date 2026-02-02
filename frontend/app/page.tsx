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
import AuditLogsView from './components/AuditLogsView';
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
  const { currentUser, loading, hasPermission, refreshUsers, logout, login } = useUser();
  
  // Dashboard State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appName, setAppName] = useState('Teras ERP');
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
        <div className={`landing-page ui-style-${uiStyle} min-vh-100 bg-black text-light font-monospace overflow-hidden position-relative`}>
            {/* Retro Grain Effect */}
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
                backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'%/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' opacity=\'0.05\'%3E%3C/svg%3E")',
                pointerEvents: 'none', zIndex: 10
            }}></div>

            {/* Scanlines Effect */}
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1))',
                backgroundSize: '100% 4px', pointerEvents: 'none', zIndex: 11
            }}></div>

            {/* Top Navigation */}
            <nav className="navbar navbar-dark border-bottom py-3 sticky-top" style={{
                backgroundColor: 'rgba(0,0,0,0.9)', 
                backdropFilter: 'blur(10px)', 
                zIndex: 20,
                borderBottom: '2px solid #00ff9d !important',
                boxShadow: '0 0 15px rgba(0,255,157,0.3)'
            }}>
                <div className="container d-flex justify-content-between align-items-center">
                    <a className="navbar-brand fw-bold text-uppercase d-flex align-items-center" href="#" style={{
                        letterSpacing: '4px', 
                        color: '#00ff9d',
                        textShadow: '0 0 10px #00ff9d'
                    }}>
                        <i className="bi bi-cpu-fill me-2"></i>TERAS_ERP
                    </a>
                    <div className="d-none d-md-flex align-items-center gap-4 small font-monospace text-uppercase" style={{color: '#00ffff'}}>
                        <span className="opacity-75"><i className="bi bi-circle-fill text-success me-2" style={{fontSize: '0.5rem'}}></i>System_Ready</span>
                        <span className="opacity-75"><i className="bi bi-shield-check me-1"></i>Encrypted</span>
                        <span className="text-white border border-light border-opacity-25 px-2">v0.2.0</span>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="py-5 position-relative overflow-hidden" style={{zIndex: 20}}>
                <div className="container position-relative z-3 mt-5">
                    <div className="row align-items-center">
                        <div className="col-lg-6 mb-5 mb-lg-0">
                            <div className="mb-3 d-inline-block border border-primary px-3 py-1 small text-uppercase fw-bold" style={{color: '#ff00ff', borderColor: '#ff00ff !important', backgroundColor: 'rgba(255,0,255,0.05)'}}>
                                INITIALIZING_CORE_PROTOCOLS...
                            </div>
                            <h1 className="display-2 fw-bold mb-4 text-uppercase" style={{textShadow: '3px 3px 0px #ff00ff, -3px -3px 0px #00ffff'}}>
                                TERAS<br/> <span style={{color: 'transparent', WebkitTextStroke: '2px #fff'}}>FACTORY</span><br/> ERP_
                            </h1>
                            <p className="lead mb-5 text-white font-monospace" style={{maxWidth: '600px', lineHeight: '1.8'}}>
                                <span style={{color: '#00ff9d'}}>&gt;</span> ARCHITECTURE: DECOUPLED_V2<br/>
                                <span style={{color: '#00ff9d'}}>&gt;</span> LOAD_BALANCER: ACTIVE<br/>
                                <span style={{color: '#00ff9d'}}>&gt;</span> SECURE_TUNNEL: ESTABLISHED
                            </p>
                        </div>
                        
                        {/* Integrated Login Module */}
                        <div className="col-lg-5 offset-lg-1">
                            <div className="p-4 border border-light border-opacity-25" style={{
                                background: 'rgba(10,10,10,0.8)', 
                                backdropFilter: 'blur(15px)', 
                                boxShadow: '0 0 40px rgba(0,255,157,0.15)',
                                border: '1px solid rgba(0,255,157,0.3) !important'
                            }}>
                                <h4 className="fw-bold mb-4 text-uppercase d-flex justify-content-between align-items-center" style={{color: '#00ff9d'}}>
                                    <span>&gt; LOGIN_</span>
                                    <small className="text-muted" style={{fontSize: '0.6rem'}}>SECURE_PORT_80</small>
                                </h4>
                                {loginError && (
                                    <div className="alert alert-danger rounded-0 border-0 mb-3 font-monospace small" style={{background: 'rgba(255,0,0,0.3)', color: '#fff', borderLeft: '4px solid #ff0000 !important'}}>
                                        [!] ACCESS_DENIED: {loginError}
                                    </div>
                                )}
                                <form onSubmit={handleLoginSubmit}>
                                    <div className="mb-3">
                                        <label className="form-label small text-white text-uppercase mb-1 fw-bold">User_ID</label>
                                        <input 
                                            className="form-control rounded-0 bg-black text-white border-light border-opacity-25 font-monospace py-2"
                                            value={loginUser}
                                            onChange={e => setLoginUser(e.target.value)}
                                            required
                                            placeholder="root@teras"
                                        />
                                    </div>
                                    <div className="mb-4">
                                        <label className="form-label small text-white text-uppercase mb-1 fw-bold">Password_Key</label>
                                        <input 
                                            type="password"
                                            className="form-control rounded-0 bg-black text-white border-light border-opacity-25 font-monospace py-2" 
                                            value={loginPass}
                                            onChange={e => setLoginPass(e.target.value)}
                                            required
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <button 
                                        type="submit" 
                                        className="btn w-100 rounded-0 py-3 fw-bold text-uppercase border-0"
                                        style={{
                                            background: isLoggingIn ? '#333' : 'linear-gradient(45deg, #00ff9d, #00ffff)',
                                            color: '#000',
                                            boxShadow: isLoggingIn ? 'none' : '0 0 20px rgba(0,255,157,0.4)'
                                        }}
                                        disabled={isLoggingIn}
                                    >
                                        {isLoggingIn ? 'VALIDATING...' : 'LOGIN_'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-5" style={{zIndex: 20}}>
                <div className="container py-5">
                    <div className="row g-4">
                        {[ 
                            { icon: 'bi-box-seam', title: 'INVENTORY_DB', desc: 'GLOBAL STOCK ASSET TRACKING ACROSS ALL SECTORS.' }, 
                            { icon: 'bi-diagram-3', title: 'BOM_MATRIX', desc: 'HIERARCHICAL RECIPE COMPUTATION & ASSEMBLY TREE.' }, 
                            { icon: 'bi-gear-wide-connected', title: 'PROD_EXEC', desc: 'REAL-TIME MANUFACTURING CONTROL & STATUS MONITOR.' }, 
                            { icon: 'bi-shield-lock', title: 'SECURE_NET', desc: 'MULTI-LEVEL AUTHENTICATION & GRANULAR ACCESS.' } 
                        ].map((f, i) => (
                            <div key={i} className="col-md-3">
                                <div className="p-4 border border-light border-opacity-25 h-100" style={{background: 'rgba(255,255,255,0.03)', transition: 'all 0.3s'}}>
                                    <i className={`bi ${f.icon} fs-1 mb-3 d-block`} style={{color: '#00ffff', textShadow: '0 0 10px #00ffff'}}></i>
                                    <h5 className="fw-bold mb-2 text-uppercase text-white">{f.title}</h5>
                                    <p className="text-white opacity-75 small mb-0 font-monospace" style={{letterSpacing: '0.5px'}}>{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Technical Blueprint Section */}
            <section className="py-5 border-top border-light border-opacity-25" style={{background: 'rgba(5,5,5,0.5)', zIndex: 20}}>
                <div className="container py-5">
                    <div className="row g-5">
                        <div className="col-lg-4">
                            <h2 className="fw-bold mb-4 text-uppercase" style={{color: '#00ff9d', textShadow: '0 0 10px #00ff9d'}}>System<br/>Specs</h2>
                            <p className="text-white font-monospace small" style={{lineHeight: '2'}}>
                                <span className="text-muted">#</span> ARCHITECTURE: DECOUPLED_MICRO_SERVICES<br/>
                                <span className="text-muted">#</span> KERNEL: PYTHON_3.11_FASTAPI<br/>
                                <span className="text-muted">#</span> INTERFACE: REACT_18_NEXTJS
                            </p>
                            <div className="mt-4">
                                <a href={`${API_BASE}/docs`} className="btn btn-outline-info rounded-0 btn-sm px-4 py-2 text-uppercase fw-bold" target="_blank" style={{borderWidth: '2px'}}>
                                    [ READ_API_DOCS ]
                                </a>
                            </div>
                        </div>
                        <div className="col-lg-8">
                            <div className="row g-4 font-monospace">
                                <div className="col-md-6">
                                    <h6 className="fw-bold mb-2 text-uppercase" style={{color: '#ff00ff'}}>// SECURITY</h6>
                                    <p className="small text-white opacity-75">OAUTH2_JWT_STATELESS_AUTH. ARGON2_ID_HASHING.</p>
                                </div>
                                <div className="col-md-6">
                                    <h6 className="fw-bold mb-2 text-uppercase" style={{color: '#00ffff'}}>// DATABASE</h6>
                                    <p className="small text-white opacity-75">POSTGRESQL_15_OPTIMIZED. ACID_COMPLIANCE.</p>
                                </div>
                                <div className="col-md-6">
                                    <h6 className="fw-bold mb-2 text-uppercase" style={{color: '#ffff00'}}>// LATENCY</h6>
                                    <p className="small text-white opacity-75">ASYNC_IO_CONCURRENCY. MINIMAL_COMPUTE_OVERHEAD.</p>
                                </div>
                                <div className="col-md-6">
                                    <h6 className="fw-bold mb-2 text-uppercase" style={{color: '#00ff9d'}}>// DEPLOYMENT</h6>
                                    <p className="small text-white opacity-75">DOCKER_CONTAINERIZED. CLOUDFLARE_TUNNEL_READY.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-4 border-top border-light border-opacity-25" style={{zIndex: 20}}>
                <div className="container text-center">
                    <p className="text-white opacity-50 small font-monospace mb-0 text-uppercase" style={{letterSpacing: '2px'}}>
                        SYSTEM_STATUS: <span style={{color: '#00ff9d'}}>ONLINE</span> | &copy; 2026 TERAS_SYSTEMS
                    </p>
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
                onDownloadTemplate={handleDownloadTemplate}
                onImportItems={handleImportItems}
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

        {activeTab === 'audit-logs' && (
            <AuditLogsView onRefresh={fetchData} />
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
