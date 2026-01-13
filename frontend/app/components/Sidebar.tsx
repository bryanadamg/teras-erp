interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  appName: string;
}

export default function Sidebar({ activeTab, setActiveTab, appName }: SidebarProps) {
  const menuItems = [
    { id: 'inventory', label: 'Inventory', icon: 'bi-box-seam' },
    { id: 'locations', label: 'Locations', icon: 'bi-geo-alt' },
    { id: 'attributes', label: 'Attributes & Categories', icon: 'bi-tags' },
    { id: 'bom', label: 'Bill of Materials', icon: 'bi-diagram-3' },
    { id: 'manufacturing', label: 'Manufacturing', icon: 'bi-gear-wide-connected' },
    { id: 'stock', label: 'Stock Entry', icon: 'bi-arrow-left-right' },
    { id: 'reports', label: 'Reports', icon: 'bi-bar-chart' },
  ];

  return (
    <div className="sidebar d-flex flex-column justify-content-between">
      <div>
        <div className="sidebar-header">
          <span className="fs-4 fw-bold text-primary text-truncate" title={appName}>{appName}</span>
        </div>
        <ul className="nav flex-column py-3">
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
