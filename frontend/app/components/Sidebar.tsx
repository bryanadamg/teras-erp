import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onTabHover?: (tab: string) => void; // Added for pre-fetching
  appName: string;
  isOpen?: boolean;
}

export default function Sidebar({ activeTab, setActiveTab, onTabHover, appName, isOpen }: SidebarProps) {
  const { t } = useLanguage();
  const { hasPermission } = useUser();
  const [inventoryExpanded, setInventoryExpanded] = useState(true);
  const [attributesExpanded, setAttributesExpanded] = useState(false); // Nested state
  const [salesExpanded, setSalesExpanded] = useState(true);
  const [procurementExpanded, setProcurementExpanded] = useState(true);
  const [engineeringExpanded, setEngineeringExpanded] = useState(true);
  const [reportsExpanded, setReportsExpanded] = useState(true);

  const handleTabClick = (tab: string, e: React.MouseEvent) => {
      e.preventDefault();
      setActiveTab(tab);
  };

  const handleHover = (tab: string) => {
      if (onTabHover) onTabHover(tab);
  };

  return (
    <div className={`sidebar d-flex flex-column justify-content-between ${isOpen ? 'mobile-open' : ''}`}>
      <div>
        <div className="sidebar-header">
          <i className="bi bi-window-stack me-2 d-none d-classic-inline"></i>
          <span className="fs-4 fw-bold text-primary text-truncate" title={appName}>{appName}</span>
        </div>
        
        <ul className="nav flex-column py-3">
          {/* Dashboard */}
          <li className="nav-item">
            <a 
              href="#" 
              className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={(e) => handleTabClick('dashboard', e)}
              onMouseEnter={() => handleHover('dashboard')}
            >
              <i className="bi bi-speedometer2"></i>
              {t('dashboard') || 'Dashboard'}
            </a>
          </li>

          {/* Sales Section */}
          <li className="nav-item">
            <a 
              href="#" 
              className={`nav-link d-flex justify-content-between align-items-center ${['sales-orders', 'customers'].includes(activeTab) ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setSalesExpanded(!salesExpanded); }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-graph-up-arrow"></i>
                <span>{t('sales')}</span>
              </div>
              <i className={`bi bi-chevron-${salesExpanded ? 'down' : 'right'} small`}></i>
            </a>
            
            {salesExpanded && (
              <ul className="nav flex-column ps-4 bg-light bg-opacity-50">
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'sales-orders' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('sales-orders', e)}
                    onMouseEnter={() => handleHover('sales-orders')}
                  >
                    <i className="bi bi-receipt me-2"></i>{t('sales_orders')}
                  </a>
                </li>
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'customers' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('customers', e)}
                    onMouseEnter={() => handleHover('customers')}
                  >
                    <i className="bi bi-people me-2"></i>{t('customers')}
                  </a>
                </li>
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'samples' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('samples', e)}
                    onMouseEnter={() => handleHover('samples')}
                  >
                    <i className="bi bi-eyedropper me-2"></i>{t('sample_requests')}
                  </a>
                </li>
              </ul>
            )}
          </li>

          {/* Procurement Section */}
          <li className="nav-item">
            <a 
              href="#" 
              className={`nav-link d-flex justify-content-between align-items-center ${['purchase-orders', 'suppliers'].includes(activeTab) ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setProcurementExpanded(!procurementExpanded); }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-cart3"></i>
                <span>{t('procurement') || 'Procurement'}</span>
              </div>
              <i className={`bi bi-chevron-${procurementExpanded ? 'down' : 'right'} small`}></i>
            </a>
            {procurementExpanded && (
            <ul className="nav flex-column ps-4 bg-light bg-opacity-50">
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'purchase-orders' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('purchase-orders', e)}
                    onMouseEnter={() => handleHover('purchase-orders')}
                  >
                    <i className="bi bi-bag-check me-2"></i>{t('purchase_orders')}
                  </a>
                </li>
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'suppliers' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('suppliers', e)}
                    onMouseEnter={() => handleHover('suppliers')}
                  >
                    <i className="bi bi-truck me-2"></i>{t('suppliers')}
                  </a>
                </li>
            </ul>
            )}
          </li>

          {/* Inventory Section */}
          {(hasPermission('inventory.manage') || hasPermission('stock.entry') || hasPermission('locations.manage')) && (
          <li className="nav-item">
            <a 
              href="#" 
              className={`nav-link d-flex justify-content-between align-items-center ${['inventory', 'attributes', 'categories', 'uom', 'locations', 'stock'].includes(activeTab) ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setInventoryExpanded(!inventoryExpanded); }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-box-seam"></i>
                <span>{t('inventory')}</span>
              </div>
              <i className={`bi bi-chevron-${inventoryExpanded ? 'down' : 'right'} small`}></i>
            </a>
            
            {inventoryExpanded && (
              <ul className="nav flex-column ps-4 bg-light bg-opacity-50">
                {hasPermission('inventory.manage') && (
                <>
                    <li>
                    <a href="#" 
                        className={`nav-link py-2 small ${activeTab === 'inventory' ? 'fw-bold text-primary' : ''}`} 
                        onClick={(e) => handleTabClick('inventory', e)}
                        onMouseEnter={() => handleHover('inventory')}
                    >
                        <i className="bi bi-list-ul me-2"></i>{t('item_inventory')}
                    </a>
                    </li>
                    <li>
                    <a href="#" 
                        className={`nav-link py-2 small ${activeTab === 'sample-masters' ? 'fw-bold text-primary' : ''}`} 
                        onClick={(e) => handleTabClick('sample-masters', e)}
                        onMouseEnter={() => handleHover('sample-masters')}
                    >
                        <i className="bi bi-box2-heart me-2"></i>{t('sample_masters') || 'Sample Masters'}
                    </a>
                    </li>
                    
                    {/* Nested Attributes Section */}
                    <li className="nav-item">
                        <a 
                          href="#" 
                          className={`nav-link py-2 small d-flex justify-content-between align-items-center ${['attributes', 'categories', 'uom'].includes(activeTab) ? 'text-primary fw-bold' : ''}`}
                          onClick={(e) => { e.preventDefault(); setAttributesExpanded(!attributesExpanded); }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <i className="bi bi-tags"></i>
                            <span>{t('attributes')} & Metadata</span>
                          </div>
                          <i className={`bi bi-chevron-${attributesExpanded ? 'down' : 'right'} small`}></i>
                        </a>
                        
                        {attributesExpanded && (
                            <ul className="nav flex-column ps-3 border-start ms-2">
                                <li>
                                    <a href="#" 
                                        className={`nav-link py-1 small ${activeTab === 'attributes' ? 'fw-bold text-primary' : ''}`} 
                                        onClick={(e) => handleTabClick('attributes', e)}
                                        onMouseEnter={() => handleHover('attributes')}
                                    >
                                        <i className="bi bi-palette me-2"></i>Variants
                                    </a>
                                </li>
                                <li>
                                    <a href="#" 
                                        className={`nav-link py-1 small ${activeTab === 'categories' ? 'fw-bold text-primary' : ''}`} 
                                        onClick={(e) => handleTabClick('categories', e)}
                                        onMouseEnter={() => handleHover('categories')}
                                    >
                                        <i className="bi bi-grid me-2"></i>{t('categories')}
                                    </a>
                                </li>
                                <li>
                                    <a href="#" 
                                        className={`nav-link py-1 small ${activeTab === 'uom' ? 'fw-bold text-primary' : ''}`} 
                                        onClick={(e) => handleTabClick('uom', e)}
                                        onMouseEnter={() => handleHover('uom')}
                                    >
                                        <i className="bi bi-rulers me-2"></i>UOM
                                    </a>
                                </li>
                            </ul>
                        )}
                    </li>
                </>
                )}
                
                {hasPermission('stock.entry') && (
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'stock' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('stock', e)}
                    onMouseEnter={() => handleHover('stock')}
                  >
                    <i className="bi bi-arrow-left-right me-2"></i>{t('stock_entry')}
                  </a>
                </li>
                )}

                {hasPermission('locations.manage') && (
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'locations' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('locations', e)}
                    onMouseEnter={() => handleHover('locations')}
                  >
                    <i className="bi bi-geo-alt me-2"></i>{t('locations')}
                  </a>
                </li>
                )}
              </ul>
            )}
          </li>
          )}

          {/* Engineering Section */}
          {(hasPermission('manufacturing.manage') || hasPermission('work_order.manage')) && (
          <li className="nav-item">
            <a 
              href="#" 
              className={`nav-link d-flex justify-content-between align-items-center ${['bom', 'routing', 'manufacturing'].includes(activeTab) ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setEngineeringExpanded(!engineeringExpanded); }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-tools"></i>
                <span>{t('engineering')}</span>
              </div>
              <i className={`bi bi-chevron-${engineeringExpanded ? 'down' : 'right'} small`}></i>
            </a>
            
            {engineeringExpanded && (
              <ul className="nav flex-column ps-4 bg-light bg-opacity-50">
                {hasPermission('manufacturing.manage') && (
                <>
                    <li>
                    <a href="#" 
                        className={`nav-link py-2 small ${activeTab === 'bom' ? 'fw-bold text-primary' : ''}`} 
                        onClick={(e) => handleTabClick('bom', e)}
                        onMouseEnter={() => handleHover('bom')}
                    >
                        <i className="bi bi-diagram-3 me-2"></i>{t('bom')}
                    </a>
                    </li>
                    <li>
                    <a href="#" 
                        className={`nav-link py-2 small ${activeTab === 'routing' ? 'fw-bold text-primary' : ''}`} 
                        onClick={(e) => handleTabClick('routing', e)}
                        onMouseEnter={() => handleHover('routing')}
                    >
                        <i className="bi bi-signpost-split me-2"></i>{t('routing')}
                    </a>
                    </li>
                </>
                )}
                
                {hasPermission('work_order.manage') && (
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'manufacturing' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('manufacturing', e)}
                    onMouseEnter={() => handleHover('manufacturing')}
                  >
                    <i className="bi bi-gear-wide-connected me-2"></i>{t('work_orders')}
                  </a>
                </li>
                )}
              </ul>
            )}
          </li>
          )}

          {/* Reports Section */}
          {hasPermission('reports.view') && (
          <li className="nav-item">
            <a 
              href="#" 
              className={`nav-link d-flex justify-content-between align-items-center ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={(e) => { e.preventDefault(); setReportsExpanded(!reportsExpanded); }}
            >
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-bar-chart"></i>
                <span>{t('reports')}</span>
              </div>
              <i className={`bi bi-chevron-${reportsExpanded ? 'down' : 'right'} small`}></i>
            </a>
            
            {reportsExpanded && (
              <ul className="nav flex-column ps-4 bg-light bg-opacity-50">
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'reports' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('reports', e)}
                    onMouseEnter={() => handleHover('reports')}
                  >
                    <i className="bi bi-journal-text me-2"></i>{t('stock_ledger') || 'Stock Ledger'}
                  </a>
                </li>
                {hasPermission('admin.access') && (
                <li>
                  <a href="#" 
                    className={`nav-link py-2 small ${activeTab === 'audit-logs' ? 'fw-bold text-primary' : ''}`} 
                    onClick={(e) => handleTabClick('audit-logs', e)}
                    onMouseEnter={() => handleHover('audit-logs')}
                  >
                    <i className="bi bi-activity me-2"></i>Audit Logs
                  </a>
                </li>
                )}
              </ul>
            )}
          </li>
          )}
        </ul>
      </div>
      
      <div className="p-3 text-center border-top bg-light">
          <small className="text-muted fw-bold">{t('powered_by')} Terras ERP</small>
      </div>
    </div>
  );
}
