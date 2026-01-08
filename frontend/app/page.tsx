'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000';

export default function Home() {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  
  const [newItem, setNewItem] = useState({ code: '', name: '', uom: '' });
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });
  const [stockEntry, setStockEntry] = useState({ item_code: '', location_code: '', qty: 0 });

  const fetchData = async () => {
    try {
      const itemsRes = await fetch(`${API_BASE}/items`);
      const locsRes = await fetch(`${API_BASE}/locations`);
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (locsRes.ok) setLocations(await locsRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateItem = async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    setNewItem({ code: '', name: '', uom: '' });
    fetchData();
  };

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE}/locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLocation)
    });
    setNewLocation({ code: '', name: '' });
    fetchData();
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE}/items/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stockEntry)
    });
    setStockEntry({ item_code: '', location_code: '', qty: 0 });
    alert('Stock added!');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Teras ERP</h1>
      
      <div style={{ display: 'flex', gap: '40px' }}>
        
        {/* Items Section */}
        <div>
          <h2>Items</h2>
          <ul>
            {items.map((item: any) => (
              <li key={item.id}>{item.code} - {item.name} ({item.uom})</li>
            ))}
          </ul>
          <h3>Add Item</h3>
          <form onSubmit={handleCreateItem}>
            <input placeholder="Code" value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} required /><br/>
            <input placeholder="Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} required /><br/>
            <input placeholder="UOM" value={newItem.uom} onChange={e => setNewItem({...newItem, uom: e.target.value})} required /><br/>
            <button type="submit">Add Item</button>
          </form>
        </div>

        {/* Locations Section */}
        <div>
          <h2>Locations</h2>
          <ul>
            {locations.map((loc: any) => (
              <li key={loc.id}>{loc.code} - {loc.name}</li>
            ))}
          </ul>
          <h3>Add Location</h3>
          <form onSubmit={handleCreateLocation}>
            <input placeholder="Code" value={newLocation.code} onChange={e => setNewLocation({...newLocation, code: e.target.value})} required /><br/>
            <input placeholder="Name" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} required /><br/>
            <button type="submit">Add Location</button>
          </form>
        </div>

        {/* Stock Section */}
        <div>
          <h2>Add Stock</h2>
          <form onSubmit={handleAddStock}>
            <select value={stockEntry.item_code} onChange={e => setStockEntry({...stockEntry, item_code: e.target.value})} required>
              <option value="">Select Item</option>
              {items.map((item: any) => <option key={item.id} value={item.code}>{item.name}</option>)}
            </select><br/>
            <select value={stockEntry.location_code} onChange={e => setStockEntry({...stockEntry, location_code: e.target.value})} required>
              <option value="">Select Location</option>
              {locations.map((loc: any) => <option key={loc.id} value={loc.code}>{loc.name}</option>)}
            </select><br/>
            <input type="number" placeholder="Qty" value={stockEntry.qty} onChange={e => setStockEntry({...stockEntry, qty: parseFloat(e.target.value)})} required /><br/>
            <button type="submit">Record Stock</button>
          </form>
        </div>

      </div>
    </div>
  );
}
