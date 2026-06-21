import { useState, useRef, useLayoutEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onTabHover?: (tab: string) => void;
  appName: string;
  isOpen?: boolean;
}

const xpFont = 'Tahoma, "Segoe UI", sans-serif';

const SIDEBAR_BG   = '#d6dff7';
const SUB_BG       = '#bcc9e8';
const SUB_BG_DEEP  = '#a8b4cc';
const HOVER_BG     = '#316ac5';
const ACTIVE_BG    = '#ffffff';
const ACTIVE_COLOR = '#00309c';
const NAV_COLOR    = '#00309c';
const HDR_BORDER_B = '#0a2060';

function navItemStyle(
  isActive: boolean,
  isHovered: boolean,
  isSub = false,
  isDeepSub = false,
): React.CSSProperties {
  const bg = isHovered ? HOVER_BG
           : isActive  ? ACTIVE_BG
           : isDeepSub ? SUB_BG_DEEP
           : isSub     ? SUB_BG
           : 'transparent';
  return {
    padding: isDeepSub ? '3px 8px 3px 28px'
           : isSub     ? '4px 8px 4px 22px'
           : '5px 8px 5px 14px',
    color:      isHovered ? '#fff' : ACTIVE_COLOR,
    background: bg,
    fontWeight: isActive ? 'bold' : 'normal',
    borderLeft: isActive && !isHovered ? '3px solid #316ac5' : '3px solid transparent',
    borderBottom: '1px solid #c0ccee',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: isSub ? 10.5 : 11,
    fontFamily: xpFont,
    userSelect: 'none' as const,
    transition: 'background 0.08s',
    textDecoration: 'none',
    listStyle: 'none',
  };
}

function sectionHdrStyle(isHovered: boolean): React.CSSProperties {
  return {
    background: isHovered
      ? 'linear-gradient(to right, #4070c8, #2a4da0)'
      : 'linear-gradient(to right, #3060b8, #1a3d90)',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 10,
    padding: '4px 8px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    borderTop: '1px solid #7090cc',
    borderBottom: `1px solid ${HDR_BORDER_B}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none' as const,
    fontFamily: xpFont,
    transition: 'background 0.08s',
  };
}

// ── Modern (clean SaaS) theme primitives ─────────────────────────────────────
// Light sidebar, corporate-blue accent. Mirrors the classic helpers above so the
// component body can pick a palette without branching every style inline.
const modernFont = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const M_PRIMARY     = '#2563eb';
const M_PRIMARY_DK  = '#1d4ed8';
const M_SOFT        = '#eff6ff';
const M_HOVER_BG    = '#f1f5f9';
const M_TEXT        = '#475569';
const M_SECTION     = '#94a3b8';
const M_BORDER      = '#e5e7eb';

function navItemStyleModern(
  isActive: boolean,
  isHovered: boolean,
  isSub = false,
  isDeepSub = false,
): React.CSSProperties {
  const bg = isActive ? M_SOFT : isHovered ? M_HOVER_BG : 'transparent';
  return {
    padding: isDeepSub ? '7px 12px 7px 42px'
           : isSub     ? '7px 12px 7px 34px'
           : '8px 12px 8px 15px',
    color: isActive ? M_PRIMARY : M_TEXT,
    background: bg,
    fontWeight: isActive ? 600 : 500,
    borderLeft: `3px solid ${isActive ? M_PRIMARY : 'transparent'}`,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    fontSize: isSub ? 12.5 : 13,
    fontFamily: modernFont,
    userSelect: 'none' as const,
    transition: 'background 0.12s, color 0.12s',
    textDecoration: 'none',
    listStyle: 'none',
  };
}

function sectionHdrStyleModern(isHovered: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    color: isHovered ? M_PRIMARY : M_SECTION,
    fontWeight: 700,
    fontSize: 10.5,
    padding: '14px 14px 5px',
    letterSpacing: '0.6px',
    textTransform: 'uppercase' as const,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none' as const,
    fontFamily: modernFont,
    transition: 'color 0.12s',
  };
}

export default function Sidebar({ activeTab, setActiveTab, onTabHover, appName, isOpen }: SidebarProps) {
  const { t } = useLanguage();
  const { hasPermission, logout } = useUser();
  const { uiStyle } = useTheme();
  const classic = uiStyle === 'classic';
  const navStyle = classic ? navItemStyle : navItemStyleModern;
  const hdrStyle = classic ? sectionHdrStyle : sectionHdrStyleModern;
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Persist scroll position
  useLayoutEffect(() => {
    const savedScroll = sessionStorage.getItem('terras_sidebar_scroll');
    if (savedScroll && sidebarRef.current) {
      sidebarRef.current.scrollTop = parseInt(savedScroll, 10);
    }
  }, []);

  const handleScroll = () => {
    if (sidebarRef.current) {
      sessionStorage.setItem('terras_sidebar_scroll', sidebarRef.current.scrollTop.toString());
    }
  };

  const [inventoryExpanded,   setInventoryExpanded]   = useState(true);
  const [salesExpanded,       setSalesExpanded]       = useState(true);
  const [procurementExpanded, setProcurementExpanded] = useState(true);
  const [engineeringExpanded, setEngineeringExpanded] = useState(true);
  const [dyeingExpanded,      setDyeingExpanded]      = useState(true);
  const [reportsExpanded,     setReportsExpanded]     = useState(true);

  const [hovered, setHovered] = useState<string | null>(null);
  const prefetchTimer = useRef<any>(null);
  // Hover handlers: set hover styling, and (debounced) prefetch that tab's data so the
  // fetch overlaps the hover→click gap. Debounce avoids firing on fast mouse traversal —
  // only a deliberate pause on an item triggers the prefetch. fetchData dedupes, so the
  // later click/page-mount fetch joins this in-flight request instead of repeating it.
  const H = (key: string) => ({
    onMouseEnter: () => {
      setHovered(key);
      if (onTabHover) {
        if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
        prefetchTimer.current = setTimeout(() => onTabHover(key), 180);
      }
    },
    onMouseLeave: () => {
      setHovered(null);
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    },
  });

  const handleTabClick = (tab: string, e: React.MouseEvent) => {
    e.preventDefault();
    setActiveTab(tab);
    if (onTabHover) onTabHover(tab);
  };

  const chevron = (expanded: boolean) => (
    <span style={{ fontSize: 10, opacity: classic ? 0.85 : 0.6 }}>{expanded ? '▾' : '▸'}</span>
  );

  // Shorthand: a nav link row
  const NavItem = ({
    tab, label, icon, isSub = false, isDeepSub = false,
  }: { tab: string; label: string; icon: string; isSub?: boolean; isDeepSub?: boolean }) => (
    <div
      style={navStyle(activeTab === tab, hovered === tab, isSub, isDeepSub)}
      onClick={(e) => handleTabClick(tab, e)}
      {...H(tab)}
    >
      <span style={{ width: classic ? 14 : 16, textAlign: 'center', fontSize: classic ? 12 : 14 }}><i className={`bi ${icon}`} /></span>
      <span>{label}</span>
    </div>
  );

  return (
    <div
      className={`sidebar ${isOpen ? 'mobile-open' : ''}`}
      ref={sidebarRef}
      onScroll={handleScroll}
      style={{
        background: classic ? SIDEBAR_BG : '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: classic ? xpFont : modernFont,
      }}
    >
      {/* ── Header ── */}
      <div style={classic ? {
        background: 'linear-gradient(to bottom, #1e4eb8 0%, #0a246a 100%)',
        padding: '8px 10px',
        color: '#fff',
        fontSize: 13,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
        borderBottom: '2px solid #0a246a',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
        letterSpacing: '0.2px',
        userSelect: 'none',
        fontFamily: xpFont,
        minHeight: 40,
      } : {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        padding: '15px 16px',
        color: '#fff',
        fontSize: 15,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flexShrink: 0,
        borderBottom: '1px solid #1d4ed8',
        letterSpacing: '0.2px',
        userSelect: 'none',
        fontFamily: modernFont,
        minHeight: 56,
      }}>
        <i className="bi bi-building-fill" style={{ fontSize: 18 }} />
        <span className="text-truncate" title={appName}>{appName}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── Quick Scan ── */}
        <div style={{ padding: classic ? '8px 8px 4px' : '12px 12px 4px' }}>
          <button
            onClick={() => setActiveTab('scanner')}
            {...H('scanner')}
            style={classic ? {
              width: '100%',
              padding: '6px 0',
              background: hovered === 'scanner'
                ? 'linear-gradient(to bottom, #5a9af4, #2a6ce4)'
                : 'linear-gradient(to bottom, #4a8af4, #1a5cd4)',
              borderTop: '1px solid #90c0ff',
              borderLeft: '1px solid #90c0ff',
              borderRight: '1px solid #003088',
              borderBottom: '1px solid #003088',
              color: '#fff',
              fontFamily: xpFont,
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              letterSpacing: '0.5px',
            } : {
              width: '100%',
              padding: '9px 0',
              background: hovered === 'scanner' ? M_PRIMARY_DK : M_PRIMARY,
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontFamily: modernFont,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              letterSpacing: '0.3px',
              boxShadow: '0 1px 2px rgba(37,99,235,0.35)',
              transition: 'background 0.12s',
            }}
          >
            <i className="bi bi-qr-code-scan" /> QUICK SCAN
          </button>
        </div>

        {/* ── Dashboard ── */}
        <NavItem tab="dashboard" label={t('dashboard') || 'Dashboard'} icon="bi-house-door" />

        {/* ── Sales ── */}
        <div
          style={hdrStyle(hovered === 'hdr-sales')}
          onClick={() => setSalesExpanded(!salesExpanded)}
          {...H('hdr-sales')}
        >
          <span><i className="bi bi-graph-up" /> {t('sales') || 'Sales'}</span>
          {chevron(salesExpanded)}
        </div>
        {salesExpanded && (
          <>
            <NavItem tab="sales-orders" label={t('sales_orders') || 'Sales Orders'} icon="bi-file-text" isSub />
            <NavItem tab="packaging"    label="Packaging"                             icon="bi-box2"    isSub />
            <NavItem tab="customers"    label={t('customers') || 'Customers'}        icon="bi-people" isSub />
            <NavItem tab="samples"      label={t('sample_requests') || 'Sample Requests'} icon="bi-flask" isSub />
          </>
        )}

        {/* ── Procurement ── */}
        <div
          style={hdrStyle(hovered === 'hdr-procurement')}
          onClick={() => setProcurementExpanded(!procurementExpanded)}
          {...H('hdr-procurement')}
        >
          <span><i className="bi bi-cart3" /> {t('procurement') || 'Procurement'}</span>
          {chevron(procurementExpanded)}
        </div>
        {procurementExpanded && (
          <>
            <NavItem tab="purchase-orders" label={t('purchase_orders') || 'Purchase Orders'} icon="bi-bag" isSub />
            <NavItem tab="suppliers"        label={t('suppliers') || 'Suppliers'}              icon="bi-truck" isSub />
          </>
        )}

        {/* ── Inventory ── */}
        {(hasPermission('inventory.manage') || hasPermission('stock.entry') || hasPermission('locations.manage')) && (
          <>
            <div
              style={hdrStyle(hovered === 'hdr-inventory')}
              onClick={() => setInventoryExpanded(!inventoryExpanded)}
              {...H('hdr-inventory')}
            >
              <span><i className="bi bi-box-seam" /> {t('inventory') || 'Inventory'}</span>
              {chevron(inventoryExpanded)}
            </div>
            {inventoryExpanded && (
              <>
                {hasPermission('inventory.manage') && (
                  <>
                    <NavItem tab="inventory"     label={t('item_inventory') || 'Item Inventory'} icon="bi-list-check" isSub />
                    <NavItem tab="item-metadata" label={t('attributes') || 'Attributes'} icon="bi-tag" isSub />
                  </>
                )}
                {hasPermission('inventory.manage') && (
                  <NavItem tab="batches" label="Batch / Lot" icon="bi-upc-scan" isSub />
                )}
                {hasPermission('inventory.manage') && (
                  <NavItem tab="stock-on-hand" label={t('stock_on_hand') || 'Stock On-Hand'} icon="bi-boxes" isSub />
                )}
                {hasPermission('stock.entry') && (
                  <NavItem tab="stock"     label={t('stock_adjustment') || 'Stock Adjustment'} icon="bi-arrow-left-right" isSub />
                )}
                {hasPermission('locations.manage') && (
                  <NavItem tab="locations" label={t('locations') || 'Locations'}     icon="bi-geo-alt" isSub />
                )}
              </>
            )}
          </>
        )}

        {/* ── Engineering ── */}
        {(hasPermission('manufacturing.manage') || hasPermission('work_order.manage')) && (
          <>
            <div
              style={hdrStyle(hovered === 'hdr-engineering')}
              onClick={() => setEngineeringExpanded(!engineeringExpanded)}
              {...H('hdr-engineering')}
            >
              <span><i className="bi bi-gear" /> {t('engineering') || 'Engineering'}</span>
              {chevron(engineeringExpanded)}
            </div>
            {engineeringExpanded && (
              <>
                {hasPermission('manufacturing.manage') && (
                  <>
                    <NavItem tab="bom"     label={t('bom') || 'BOM'}     icon="bi-diagram-3" isSub />
                    <NavItem tab="routing" label={t('routing') || 'Routing'} icon="bi-shuffle" isSub />
                  </>
                )}
                {hasPermission('work_order.manage') && (
                  <>
                    <NavItem tab="production-runs"      label="Production Runs"                                        icon="bi-collection-play" isSub />
                    <NavItem tab="manufacturing-orders" label={t('manufacturing_orders') || 'Manufacturing Orders'} icon="bi-list-task" isSub />
                    <NavItem tab="work-orders"          label={t('work_orders') || 'Work Orders'}                   icon="bi-tools" isSub />
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Dyeing & Setting ── */}
        {hasPermission('manufacturing.manage') && (
          <>
            <div
              style={hdrStyle(hovered === 'hdr-dyeing')}
              onClick={() => setDyeingExpanded(!dyeingExpanded)}
              {...H('hdr-dyeing')}
            >
              <span><i className="bi bi-droplet-half" /> Dyeing &amp; Setting</span>
              {chevron(dyeingExpanded)}
            </div>
            {dyeingExpanded && (
              <>
                <NavItem tab="dyeing-setting" label="Dyeing & Setting" icon="bi-palette" isSub />
                <NavItem tab="lab-dips" label="Lab Dip Requests" icon="bi-droplet" isSub />
              </>
            )}
          </>
        )}

        {/* ── Reports ── */}
        {hasPermission('reports.view') && (
          <>
            <div
              style={hdrStyle(hovered === 'hdr-reports')}
              onClick={() => setReportsExpanded(!reportsExpanded)}
              {...H('hdr-reports')}
            >
              <span><i className="bi bi-bar-chart" /> {t('reports') || 'Reports'}</span>
              {chevron(reportsExpanded)}
            </div>
            {reportsExpanded && (
              <>
                <NavItem tab="reports"    label={t('stock_ledger') || 'Stock Ledger'} icon="bi-journal-text" isSub />
                {hasPermission('admin.access') && (
                  <NavItem tab="audit-logs" label="Audit Logs" icon="bi-clipboard-check" isSub />
                )}
              </>
            )}
          </>
        )}

        {/* ── System Admin ── */}
        {hasPermission('admin.access') && (
          <NavItem tab="settings" label="System Admin" icon="bi-shield-lock" />
        )}
      </div>

      {/* ── Footer ── */}
      <div style={classic ? {
        background: '#c0cade',
        borderTop: '1px solid #9098b8',
        padding: '7px 8px',
        flexShrink: 0,
      } : {
        background: '#ffffff',
        borderTop: `1px solid ${M_BORDER}`,
        padding: '10px 12px',
        flexShrink: 0,
      }}>
        <button
          onClick={logout}
          {...H('logout')}
          style={classic ? {
            width: '100%',
            padding: '4px 0',
            background: hovered === 'logout'
              ? 'linear-gradient(to bottom, #ffffff, #e0dcd4)'
              : 'linear-gradient(to bottom, #f0efe6, #dddbd0)',
            borderTop: '1px solid #fff',
            borderLeft: '1px solid #fff',
            borderRight: '1px solid #555',
            borderBottom: '1px solid #555',
            color: '#800000',
            fontFamily: xpFont,
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          } : {
            width: '100%',
            padding: '8px 0',
            background: hovered === 'logout' ? '#fef2f2' : 'transparent',
            border: `1px solid ${hovered === 'logout' ? '#fecaca' : M_BORDER}`,
            borderRadius: 8,
            color: '#dc2626',
            fontFamily: modernFont,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            transition: 'all 0.12s',
          }}
        >
          <i className="bi bi-box-arrow-right" /> {t('logout') || 'Logout'}
        </button>
        <div style={{ marginTop: 5, textAlign: 'center' }}>
          <small style={{ fontSize: 9, color: classic ? '#6070a0' : '#94a3b8', fontFamily: classic ? xpFont : modernFont }}>
            {t('powered_by') || 'Powered by'} Teras ERP
          </small>
        </div>
      </div>
    </div>
  );
}
