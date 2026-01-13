'use client';

import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import InventoryView from './components/InventoryView';
import AttributesView from './components/AttributesView';
import BOMView from './components/BOMView';
import ManufacturingView from './components/ManufacturingView';
import StockEntryView from './components/StockEntryView';
import ReportsView from './components/ReportsView';

const API_BASE = 'http://localhost:8000';

export default function Home() {
  const [activeTab, setActiveTab] = useState('inventory');

  // Master Data
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [boms, setBoms] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);

  const fetchData = async () => {
    try {
      const [itemsRes, locsRes, stockRes, attrsRes, bomsRes, woRes] = await Promise.all([
          fetch(`${API_BASE}/items`),
          fetch(`${API_BASE}/locations`),
          fetch(`${API_BASE}/stock`),
          fetch(`${API_BASE}/attributes`),
          fetch(`${API_BASE}/boms`),
          fetch(`${API_BASE}/work-orders`)
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (locsRes.ok) setLocations(await locsRes.json());
      if (stockRes.ok) setStockEntries(await stockRes.json());
      if (attrsRes.ok) setAttributes(await attrsRes.json());
      if (bomsRes.ok) setBoms(await bomsRes.json());
      if (woRes.ok) setWorkOrders(await woRes.json());
    } catch (e) {
      console.error("Failed to fetch data", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Handlers ---

  const handleCreateItem = async (item: any) => {
    await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    fetchData();
  };

  const handleCreateLocation = async (location: any) => {
    await fetch(`${API_BASE}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location)
    });
    fetchData();
  };

  const handleCreateAttribute = async (attr: any) => {
    await fetch(`${API_BASE}/attributes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attr)
    });
    fetchData();
  };

  const handleCreateBOM = async (bom: any) => {
      const payload: any = { ...bom };
      if (!payload.variant_id) delete payload.variant_id;
      
      const res = await fetch(`${API_BASE}/boms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      
      if (res.ok) {
          alert('BOM Created!');
          fetchData();
      } else {
          const err = await res.json();
          alert(`Error: ${err.detail}`);
      }
  };

  const handleCreateWO = async (wo: any) => {
      const payload: any = { ...wo };
      if (!payload.due_date) delete payload.due_date;

      const res = await fetch(`${API_BASE}/work-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (res.ok) {
          alert('Work Order Created!');
          fetchData();
      } else {
          const err = await res.json();
          alert(`Error: ${err.detail}`);
      }
  };

  const handleUpdateWOStatus = async (woId: string, status: string) => {
      await fetch(`${API_BASE}/work-orders/${woId}/status?status=${status}`, {
          method: 'PUT'
      });
      fetchData();
  };

  const handleRecordStock = async (entry: any) => {
    const payload: any = { ...entry };
    if (!payload.variant_id) delete payload.variant_id;

    await fetch(`${API_BASE}/items/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    alert('Stock recorded successfully!');
    fetchData();
  };

  return (
    <div className="d-flex">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="main-content flex-grow-1">
        <header className="mb-4 d-flex justify-content-between align-items-center">
            <h2 className="text-capitalize mb-0 fw-bold text-dark">{activeTab.replace('-', ' ')}</h2>
            <div className="d-flex align-items-center gap-3">
                <span className="text-muted small">v0.2.0</span>
                <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style={{width: 32, height: 32}}>
                    <i className="bi bi-person-fill"></i>
                </div>
            </div>
        </header>

        {activeTab === 'inventory' && (
            <InventoryView 
                items={items} 
                locations={locations} 
                attributes={attributes}
                onCreateItem={handleCreateItem} 
                onCreateLocation={handleCreateLocation} 
                onRefresh={fetchData} 
            />
        )}

        {activeTab === 'attributes' && (
            <AttributesView 
                attributes={attributes} 
                onCreateAttribute={handleCreateAttribute} 
            />
        )}

        {activeTab === 'bom' && (
            <BOMView 
                items={items} 
                boms={boms} 
                onCreateBOM={handleCreateBOM} 
            />
        )}

        {activeTab === 'manufacturing' && (
            <ManufacturingView 
                items={items} 
                boms={boms} 
                workOrders={workOrders} 
                onCreateWO={handleCreateWO} 
                onUpdateStatus={handleUpdateWOStatus} 
            />
        )}

        {activeTab === 'stock' && (
            <StockEntryView 
                items={items} 
                locations={locations} 
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
      </div>
    </div>
  );
}
