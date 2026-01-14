import { useState } from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  appName: string;
}

export default function Sidebar({ activeTab, setActiveTab, appName }: SidebarProps) {
  const [inventoryExpanded, setInventoryExpanded] = useState(true);

  const menuItems = [
    { id: 'locations', label: 'Locations', icon: 'bi-geo-alt' },
    { id: 'bom', label: 'Bill of Materials', icon: 'bi-diagram-3' },
    { id: 'manufacturing', label: 'Manufacturing', icon: 'bi-gear-wide-connected' },
    { id: 'stock', label: 'Stock Entry', icon: 'bi-arrow-left-right' },
    { id: 'reports', label: 'Reports', icon: 'bi-bar-chart' },
  ];

  return (
    <div className="sidebar d-flex flex-column justify-content-between">
      <div>
        <div className="sidebar-header">
          <i className="bi bi-window-stack me-2 d-none d-classic-inline"></i>
          <span className="fs-4 fw-bold text-primary text-truncate" title={appName}>{appName}</span>
        </div>
        
        <ul className="nav flex-column py-3">
          {/* Expandable Inventory Section */}
          <li className="nav-item">
            <a 
              href="#" 
              className={`nav-link d-flex justify-content-between align-items-center ${activeTab.startsWith('inventory') ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setInventoryExpanded(!inventoryExpanded); }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-box-seam"></i>
                <span>Inventory</span>
              </div>
              <i className={`bi bi-chevron-${inventoryExpanded ? 'down' : 'right'} small`}></i>
            </a>
            
            {inventoryExpanded && (
              <ul className="nav flex-column ps-4 bg-light bg-opacity-50">
                <li>
                  <a href="#" className={`nav-link py-2 small ${activeTab === 'inventory' ? 'fw-bold text-primary' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('inventory'); }}>
                    <i className="bi bi-list-ul me-2"></i>Item Inventory
                  </a>
                </li>
                <li>
                  <a href="#" className={`nav-link py-2 small ${activeTab === 'attributes' ? 'fw-bold text-primary' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('attributes'); }}>
                    <i className="bi bi-tags me-2"></i>Attributes
                  </a>
                </li>
                <li>
                  <a href="#" className={`nav-link py-2 small ${activeTab === 'categories' ? 'fw-bold text-primary' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('categories'); }}>
                    <i className="bi bi-grid me-2"></i>Categories
                  </a>
                </li>
              </ul>
            )}
          </li>

          {menuItems.map((item) => (
            <li className="nav-item" key={item.id}>
              <a 
                href="#" 
                className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
                onClick={(e) => { e.preventDefault(); setActiveTab(item.id); }}
              >
                <i className={`bi ${item.icon}`}></i>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="p-3 text-center border-top bg-light">
          <small className="text-muted fw-bold">Powered by Teras ERP</small>
      </div>
    </div>
  );
}