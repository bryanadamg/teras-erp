'use client';

import { useState, useEffect } from 'react';
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
import { useRouter } from 'next/navigation';
import DashboardView from './components/DashboardView';
import ConfirmModal from './components/ConfirmModal';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api';

export default function Home() {
  const { showToast } = useToast();
  const { language, setLanguage, t } = useLanguage();
  const { currentUser, loading, logout } = useUser();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [appName, setAppName] = useState('Teras ERP');
  const [uiStyle, setUiStyle] = useState('classic');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
      if (!loading && !currentUser) {
          router.push('/login');
      }
  }, [currentUser, loading, router]);

  if (loading || !currentUser) return null; // Or a loading spinner

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
    try {
      const [itemsRes, locsRes, stockRes, attrsRes, catsRes, uomsRes, bomsRes, wcRes, opRes, woRes, balRes, soRes, sampRes] = await Promise.all([
          fetch(`${API_BASE}/items`),
          fetch(`${API_BASE}/locations`),
          fetch(`${API_BASE}/stock`),
          fetch(`${API_BASE}/attributes`),
          fetch(`${API_BASE}/categories`),
          fetch(`${API_BASE}/uoms`),
          fetch(`${API_BASE}/boms`),
          fetch(`${API_BASE}/work-centers`),
          fetch(`${API_BASE}/operations`),
          fetch(`${API_BASE}/work-orders`),
          fetch(`${API_BASE}/stock/balance`),
          fetch(`${API_BASE}/sales-orders`),
          fetch(`${API_BASE}/samples`)
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
    fetchData();
    // Load settings from local storage
    const savedName = localStorage.getItem('app_name');
    if (savedName) setAppName(savedName);
    
    const savedStyle = localStorage.getItem('ui_style');
    if (savedStyle) setUiStyle(savedStyle);
  }, []);

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

  // --- Handlers ---

  const handleCreateItem = async (item: any) => {
    const res = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    fetchData();
    return res;
  };

  const handleUpdateItem = async (itemId: string, data: any) => {
      await fetch(`${API_BASE}/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
      });
      fetchData();
  };

  const handleDeleteItem = async (itemId: string) => {
      requestConfirm('Delete Item?', 'Are you sure you want to delete this item?', async () => {
          const res = await fetch(`${API_BASE}/items/${itemId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Item deleted successfully', 'success');
              fetchData();
          } else {
              showToast('Failed to delete item', 'danger');
          }
      });
  };

  const handleAddVariantToItem = async (itemId: string, variant: any) => {
      await fetch(`${API_BASE}/items/${itemId}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(variant)
      });
      fetchData();
  };

  const handleDeleteVariant = async (variantId: string) => {
      await fetch(`${API_BASE}/items/variants/${variantId}`, {
          method: 'DELETE'
      });
      fetchData();
  };

  const handleCreateLocation = async (location: any) => {
    const res = await fetch(`${API_BASE}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location)
    });
    
    if (res && res.status === 400) {
        // Suggestion logic could be added here too
        let baseCode = location.code;
        const baseMatch = baseCode.match(/^(.*)-(\d+)$/);
        if (baseMatch) baseCode = baseMatch[1];
        let counter = 1;
        let suggestedCode = `${baseCode}-${counter}`;
        while (locations.some((l: any) => l.code === suggestedCode)) {
            counter++;
            suggestedCode = `${baseCode}-${counter}`;
        }
        showToast(`Location Code exists. Try: ${suggestedCode}`, 'warning');
        return res; // let view handle it
    }
    
    fetchData();
    return res;
  };

  const handleDeleteLocation = async (locationId: string) => {
      requestConfirm('Delete Location?', 'Are you sure you want to delete this location?', async () => {
          const res = await fetch(`${API_BASE}/locations/${locationId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Location deleted successfully', 'success');
              fetchData();
          } else {
              showToast('Failed to delete location', 'danger');
          }
      });
  };

  const handleCreateAttribute = async (attr: any) => {
    await fetch(`${API_BASE}/attributes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attr)
    });
    fetchData();
  };

  const handleUpdateAttribute = async (id: string, name: string) => {
      await fetch(`${API_BASE}/attributes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
      });
      fetchData();
  };

  const handleDeleteAttribute = async (attributeId: string) => {
      requestConfirm('Delete Attribute?', 'Are you sure you want to delete this attribute template? This may affect items using it.', async () => {
          const res = await fetch(`${API_BASE}/attributes/${attributeId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('Attribute template deleted', 'success');
              fetchData();
          } else {
              showToast('Failed to delete attribute', 'danger');
          }
      });
  };

  const handleAddAttributeValue = async (attributeId: string, value: string) => {
      await fetch(`${API_BASE}/attributes/${attributeId}/values`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
      });
      fetchData();
  };

  const handleUpdateAttributeValue = async (valueId: string, value: string) => {
      await fetch(`${API_BASE}/attributes/values/${valueId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
      });
      fetchData();
  };

  const handleDeleteAttributeValue = async (valueId: string) => {
      await fetch(`${API_BASE}/attributes/values/${valueId}`, {
          method: 'DELETE'
      });
      fetchData();
  };

  const handleCreateCategory = async (name: string) => {
      await fetch(`${API_BASE}/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
      });
      fetchData();
  };

  const handleDeleteCategory = async (categoryId: string) => {
      await fetch(`${API_BASE}/categories/${categoryId}`, {
          method: 'DELETE'
      });
      fetchData();
  };

  const handleCreateUOM = async (name: string) => {
      await fetch(`${API_BASE}/uoms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
      });
      fetchData();
  };

  const handleDeleteUOM = async (uomId: string) => {
      await fetch(`${API_BASE}/uoms/${uomId}`, {
          method: 'DELETE'
      });
      fetchData();
  };

  // --- Routing Handlers ---
  const handleCreateWorkCenter = async (wc: any) => {
      const res = await fetch(`${API_BASE}/work-centers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wc)
      });
      if (res.ok) {
          showToast('Work Center added!', 'success');
          fetchData();
      } else {
          showToast('Error creating Work Center', 'danger');
      }
  };

  const handleDeleteWorkCenter = async (id: string) => {
      await fetch(`${API_BASE}/work-centers/${id}`, { method: 'DELETE' });
      fetchData();
  };

  const handleCreateOperation = async (op: any) => {
      const res = await fetch(`${API_BASE}/operations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op)
      });
      if (res.ok) {
          showToast('Operation added!', 'success');
          fetchData();
      } else {
          showToast('Error creating Operation', 'danger');
      }
  };

  const handleDeleteOperation = async (id: string) => {
      await fetch(`${API_BASE}/operations/${id}`, { method: 'DELETE' });
      fetchData();
  };

  // -------------------------

  const handleCreateBOM = async (bom: any) => {
      const payload: any = { ...bom };
      if (!payload.attribute_value_ids) payload.attribute_value_ids = [];
      
      const res = await fetch(`${API_BASE}/boms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      
      if (res.ok) {
          showToast('BOM Created successfully!', 'success');
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
      }
      return res;
  };

  const handleDeleteBOM = async (bomId: string) => {
      requestConfirm('Delete BOM?', 'Are you sure you want to delete this BOM?', async () => {
          const res = await fetch(`${API_BASE}/boms/${bomId}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('BOM deleted successfully', 'success');
              fetchData();
          } else {
              showToast('Failed to delete BOM', 'danger');
          }
      });
  };

  // --- Sales & Samples Handlers ---
  const handleCreatePO = async (po: any) => {
      const res = await fetch(`${API_BASE}/sales-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(po)
      });
      if (res.ok) {
          showToast('Purchase Order created successfully!', 'success');
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
      }
  };

  const handleDeletePO = async (id: string) => {
      requestConfirm('Delete PO?', 'Are you sure you want to delete this PO?', async () => {
          const res = await fetch(`${API_BASE}/sales-orders/${id}`, { method: 'DELETE' });
          if (res.ok) {
              showToast('PO deleted successfully', 'success');
              fetchData();
          } else {
              showToast('Failed to delete PO', 'danger');
          }
      });
  };

  const handleCreateSample = async (sample: any) => {
      const payload: any = { ...sample };
      if (!payload.sales_order_id) delete payload.sales_order_id;
      
      const res = await fetch(`${API_BASE}/samples`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      
      if (res.ok) {
          showToast('Sample Request created successfully!', 'success');
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
      }
  };

  const handleUpdateSampleStatus = async (id: string, status: string) => {
      await fetch(`${API_BASE}/samples/${id}/status?status=${status}`, {
          method: 'PUT'
      });
      showToast(`Sample status updated to ${status}`, 'info');
      fetchData();
  };

  const handleDeleteSample = async (id: string) => {
      requestConfirm('Delete Sample Request?', 'Are you sure you want to delete this request?', async () => {
          await fetch(`${API_BASE}/samples/${id}`, { method: 'DELETE' });
          fetchData();
      });
  };

  // --- Manufacturing Handlers ---

  const handleCreateWO = async (wo: any) => {
      const payload: any = { ...wo };
      if (!payload.due_date) delete payload.due_date;

      const res = await fetch(`${API_BASE}/work-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (res.ok) {
          const createdWO = await res.json();
          if (createdWO.is_material_available === false) {
              showToast('Work Order created, but insufficient materials!', 'warning');
          } else {
              showToast('Work Order Created successfully!', 'success');
          }
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
      }
      return res;
  };

  const handleUpdateWOStatus = async (woId: string, status: string) => {
      const res = await fetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, {
          method: 'PUT'
      });
      
      if (res.ok) {
          showToast(`Work Order status updated to ${status}`, 'info');
          fetchData();
      } else {
          const err = await res.json();
          showToast(`Error: ${err.detail}`, 'danger');
      }
  };

  const handleRecordStock = async (entry: any) => {
    const payload: any = { ...entry };
    if (!payload.attribute_value_ids) payload.attribute_value_ids = [];

    const res = await fetch(`${API_BASE}/items/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
        showToast('Stock recorded successfully!', 'success');
        fetchData();
    } else {
        showToast('Failed to record stock', 'danger');
    }
  };

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
                  <div className="d-none d-md-block">User: {currentUser.full_name} | {new Date().toLocaleDateString()}</div>
                  <button className="btn btn-sm btn-danger py-0" style={{fontSize: '10px'}} onClick={logout}>Logout</button>
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
                  <button className="btn btn-sm"><i className="bi bi-file-earmark-plus me-1"></i>{t('create')}</button>
                  <button className="btn btn-sm"><i className="bi bi-save me-1"></i>{t('save')}</button>
                  <button className="btn btn-sm text-danger"><i className="bi bi-trash me-1"></i>{t('delete')}</button>
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