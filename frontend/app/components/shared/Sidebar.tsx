import { Fragment, useState, useRef, useLayoutEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';
import { NAV_SECTIONS, navLabel, NavSection } from './navConfig';

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
    padding: isDeepSub ? '5px 8px 5px 32px'
           : isSub     ? '5px 8px 5px 24px'
           : '6px 10px 6px 13px',
    color: isActive ? M_PRIMARY : M_TEXT,
    background: bg,
    fontWeight: isActive ? 600 : 500,
    borderLeft: `3px solid ${isActive ? M_PRIMARY : 'transparent'}`,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: isSub ? 12 : 12.5,
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
    padding: '10px 14px 3px',
    marginTop: 4,
    borderTop: `1px solid ${M_BORDER}`,
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

  // Section header — clickable, navigates to that section's home mini-dashboard.
  // Highlighted when its own page OR any child page is active, so the group-level
  // "where am I" never gets lost.
  const SectionHeader = ({ section, childActive }: { section: NavSection; childActive: boolean }) => {
    const navKey = `sections/${section.key}`;
    const active = activeTab === `sections-${section.key}` || childActive;
    return (
      <div style={hdrStyle(hovered === navKey || active)} onClick={() => setActiveTab(navKey)} {...H(navKey)}>
        <span><i className={`bi ${section.icon}`} /> {navLabel(t, section)}</span>
        <i className="bi bi-chevron-right" style={{ fontSize: 9, opacity: classic ? 0.7 : 0.45 }} aria-hidden="true" />
      </div>
    );
  };

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

        {/* ── Sections (single source of truth: navConfig.ts) ── */}
        {NAV_SECTIONS.map((section) => {
          if (section.permissions && !section.permissions.some((p) => hasPermission(p))) return null;
          const visibleItems = section.items.filter((i) => !i.permission || hasPermission(i.permission));
          if (visibleItems.length === 0) return null;
          return (
            <Fragment key={section.key}>
              <SectionHeader section={section} childActive={visibleItems.some((i) => i.tab === activeTab)} />
              {visibleItems.map((i) => (
                <NavItem key={i.tab} tab={i.tab} label={navLabel(t, i)} icon={i.icon} isSub />
              ))}
            </Fragment>
          );
        })}

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
