'use client';

import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import InventoryView from './components/InventoryView';
import LocationsView from './components/LocationsView';
import AttributesView from './components/AttributesView';
import BOMView from './components/BOMView';
import ManufacturingView from './components/ManufacturingView';
import StockEntryView from './components/StockEntryView';
import ReportsView from './components/ReportsView';
import SettingsView from './components/SettingsView';
import CategoriesView from './components/CategoriesView';
import { useToast } from './components/Toast';

const API_BASE = 'http://localhost:8000';

export default function Home() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('inventory');
  const [appName, setAppName] = useState('Teras ERP');
  const [uiStyle, setUiStyle] = useState('default');

  // Master Data
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [boms, setBoms] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [stockBalance, setStockBalance] = useState([]);

  const fetchData = async () => {
    try {
      const [itemsRes, locsRes, stockRes, attrsRes, catsRes, bomsRes, woRes, balRes] = await Promise.all([
          fetch(`${API_BASE}/items`),
          fetch(`${API_BASE}/locations`),
          fetch(`${API_BASE}/stock`),
          fetch(`${API_BASE}/attributes`),
          fetch(`${API_BASE}/categories`),
          fetch(`${API_BASE}/boms`),
          fetch(`${API_BASE}/work-orders`),
          fetch(`${API_BASE}/stock/balance`)
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (locsRes.ok) setLocations(await locsRes.json());
      if (stockRes.ok) setStockEntries(await stockRes.json());
      if (attrsRes.ok) setAttributes(await attrsRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
      if (bomsRes.ok) setBoms(await bomsRes.json());
      if (woRes.ok) setWorkOrders(await woRes.json());
      if (balRes.ok) setStockBalance(await balRes.json());
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
    fetchData();
    return res;
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

  const handleCreateBOM = async (bom: any) => {
      const payload: any = { ...bom };
      // Updated to use attribute_value_ids
      if (!payload.attribute_value_ids) payload.attribute_value_ids = [];
      
      const res = await fetch(`${API_BASE}/boms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      
      fetchData();
      return res;
  };

  const handleCreateWO = async (wo: any) => {
      const payload: any = { ...wo };
      if (!payload.due_date) delete payload.due_date;

      const res = await fetch(`${API_BASE}/work-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      fetchData();
      return res;
  };

  const handleUpdateWOStatus = async (woId: string, status: string) => {
      await fetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, {
          method: 'PUT'
      });
      showToast(`Work Order status updated to ${status}`, 'info');
      fetchData();
  };

  const handleRecordStock = async (entry: any) => {
    const payload: any = { ...entry };
    // Updated to use attribute_value_ids
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
      {/* Classic Top Header (only visible in classic) */}
      {uiStyle === 'classic' && (
          <div className="classic-header shadow-sm d-flex justify-content-between align-items-center px-3" style={{ background: 'var(--win-header-grad)', height: '30px', color: 'white' }}>
              <div className="fw-bold"><i className="bi bi-cpu-fill me-2"></i>{appName}</div>
              <div className="small">User: Administrator | {new Date().toLocaleDateString()}</div>
          </div>
      )}

      <div className="d-flex flex-grow-1">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} appName={appName} />
        
        <div className="main-content flex-grow-1">
          {/* Classic Toolbar */}
          {uiStyle === 'classic' && (
              <div className="classic-toolbar">
                  <button className="btn btn-sm" onClick={() => fetchData()}><i className="bi bi-arrow-clockwise me-1"></i>Refresh</button>
                  <div className="vr mx-1"></div>
                  <button className="btn btn-sm"><i className="bi bi-file-earmark-plus me-1"></i>New</button>
                  <button className="btn btn-sm"><i className="bi bi-save me-1"></i>Save</button>
                  <button className="btn btn-sm text-danger"><i className="bi bi-trash me-1"></i>Delete</button>
                  <div className="vr mx-1"></div>
                  <button className="btn btn-sm"><i className="bi bi-printer me-1"></i>Print</button>
              </div>
          )}

          <header className={`mb-4 d-flex justify-content-between align-items-center ${uiStyle === 'classic' ? 'd-none' : ''}`}>
              <h2 className="text-capitalize mb-0 fw-bold text-dark">{activeTab.replace('-', ' ')}</h2>
              <div className="d-flex align-items-center gap-3">
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
                  <button className="btn btn-sm btn-light border" onClick={() => setActiveTab('settings')}>
                      <i className="bi bi-person-gear me-1"></i>Account Settings
                  </button>
              </div>
          )}

        {activeTab === 'inventory' && (
            <InventoryView 
                items={items} 
                attributes={attributes}
                categories={categories}
                onCreateItem={handleCreateItem} 
                onUpdateItem={handleUpdateItem}
                onAddVariant={handleAddVariantToItem}
                onDeleteVariant={handleDeleteVariant}
                onCreateCategory={handleCreateCategory}
                onRefresh={fetchData} 
            />
        )}

        {activeTab === 'locations' && (
            <LocationsView 
                locations={locations}
                onCreateLocation={handleCreateLocation}
                onRefresh={fetchData}
            />
        )}

        {activeTab === 'attributes' && (
            <AttributesView 
                attributes={attributes} 
                onCreateAttribute={handleCreateAttribute}
                onUpdateAttribute={handleUpdateAttribute}
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

        {activeTab === 'bom' && (
            <BOMView 
                items={items} 
                boms={boms}
                attributes={attributes}
                onCreateBOM={handleCreateBOM} 
            />
        )}

        {activeTab === 'manufacturing' && (
            <ManufacturingView 
                items={items} 
                boms={boms} 
                locations={locations}
                attributes={attributes}
                workOrders={workOrders} 
                onCreateWO={handleCreateWO} 
                onUpdateStatus={handleUpdateWOStatus} 
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