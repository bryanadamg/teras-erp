'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import MobileShell from '../mobile/MobileShell';
import { useUser } from '../../context/UserContext';
import { useData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from '../../context/ThemeContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import PixelAvatar from './PixelAvatar';
import AppLoadBar from './AppLoadBar';
import BootShell from './BootShell';
import { SECTION_LABELS, PREFETCH_ROUTES, ROUTE_PERMISSIONS } from './navConfig';
import AccessDenied from './AccessDenied';

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const { currentUser, logout, loading, hasPermission, hasAnyPermission } = useUser();
    const { handleTabHover } = useData();
    const { language, setLanguage, t } = useLanguage();
    const { uiStyle } = useTheme();
    const router = useRouter();
    const pathname = usePathname();

    const [appName, setAppName] = useState('Teras ERP');
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const isMobile = useIsMobile();

    useEffect(() => {
        setMounted(true);
        const savedName = localStorage.getItem('app_name'); if (savedName) setAppName(savedName);
    }, []);

    // Auth Protection Logic
    useEffect(() => {
        if (mounted && !loading) {
            // 1. If authenticated and on root, go to dashboard
            if (currentUser && pathname === '/') {
                router.push('/dashboard');
            }
            // 2. If unauthenticated on any non-login, non-docs route, go to login
            else if (!currentUser && pathname !== '/login' && !pathname.startsWith('/docs')) {
                router.push('/login');
            }
        }
    }, [currentUser, loading, pathname, router, mounted]);

    // Route prefetch — nav uses router.push on <div>s (not <Link>), so Next never
    // prefetched the target route's JS chunk; every click paid the chunk+RSC load
    // before the page could paint. Warm the chunk ahead of the click:
    //  (a) on hover, alongside the existing data prefetch (handleTabHover);
    //  (b) once after mount for the common routes, so a fast click with no hover
    //      pause is still warm. Deferred so it doesn't compete with the first paint.
    const prefetchRoute = (tab: string) => (tab === 'dashboard' ? '/dashboard' : `/${tab}`);
    const handleTabHoverPrefetch = React.useCallback((tab: string) => {
        try { router.prefetch(prefetchRoute(tab)); } catch {}
        handleTabHover(tab);
    }, [router, handleTabHover]);

    useEffect(() => {
        if (!mounted || loading || !currentUser || isMobile) return;
        const id = setTimeout(() => { PREFETCH_ROUTES.forEach(r => { try { router.prefetch(r); } catch {} }); }, 1500);
        return () => clearTimeout(id);
    }, [mounted, loading, currentUser, isMobile, router]);

    // Allow Login Page and Docs pages to render without layout wrappers.
    // Checked BEFORE the boot gate: these two own their whole viewport, so an
    // unauthenticated cold start must not paint an app shell it is about to
    // throw away. Login runs its own boot indicator.
    if (pathname === '/login' || pathname.startsWith('/docs')) {
        return <>{children}</>;
    }

    // SSR / boot state — paint the chrome instead of covering it. Same DOM
    // classes as the real layout below, so nothing shifts when it swaps.
    if (!mounted || loading) {
        return <BootShell appName={appName} />;
    }

    // Protect all other routes
    if (!currentUser) return null;

    // Map pathname to activeTab for Sidebar highlighting
    const activeTab = !pathname || pathname === '/' ? 'dashboard' : pathname.substring(1).replace(/\//g, '-');

    // Route guard — hiding a sidebar leaf never stopped a typed URL, so the route
    // itself is checked against the same navConfig permissions the sidebar uses.
    // Routes absent from ROUTE_PERMISSIONS (dashboard, scanner, settings, the
    // mobile screens) stay open to any authenticated user. The API enforces its
    // own checks; this is the UI half so a blocked page reads as blocked instead
    // of as an empty list full of 403s.
    const routePerms = ROUTE_PERMISSIONS[activeTab];
    const routeBlocked = !!routePerms && !hasAnyPermission(...routePerms);
    const pageBody = routeBlocked ? <AccessDenied codes={routePerms} /> : children;

    // Mobile: render the XP mobile shell instead of sidebar layout
    if (isMobile) {
        return <MobileShell appName={appName}>{pageBody}</MobileShell>;
    }

    // Page title: prefer i18n label, fall back to the URL slug.
    // Section-home routes (/sections/<key>) have no i18n key — labels come from navConfig.
    const tabKey = activeTab.replace(/-/g, '_');
    const pageTitle = activeTab.startsWith('sections-')
        ? (SECTION_LABELS[activeTab.slice('sections-'.length)] || activeTab.replace(/-/g, ' '))
        : (t(tabKey) !== tabKey ? t(tabKey) : activeTab.replace(/-/g, ' '));

    const handleSetActiveTab = (tab: string) => {
        const route = tab === 'dashboard' ? '/' : `/${tab}`;
        router.push(route);
        setIsMobileSidebarOpen(false);
    };

    return (
        <div className={`app-container ui-style-${uiStyle}`}>
            <Sidebar 
                activeTab={activeTab} 
                setActiveTab={handleSetActiveTab} 
                onTabHover={handleTabHoverPrefetch}
                appName={appName} 
                isOpen={isMobileSidebarOpen} 
            />

            <div className="main-content flex-grow-1 overflow-y-auto overflow-x-hidden bg-light">
                <div className={`app-header sticky-top bg-white border-bottom shadow-sm px-4 d-flex justify-content-between align-items-center no-print ${uiStyle === 'classic' ? 'classic-header' : ''}`}>
                    <div className="d-flex align-items-center gap-3">
                        <button className="btn btn-link d-md-none p-0 text-dark" onClick={() => setIsMobileSidebarOpen(true)}><i className="bi bi-list fs-3"></i></button>
                        <h5 className="mb-0 fw-bold text-dark d-none d-md-block text-uppercase letter-spacing-1">{pageTitle}</h5>
                    </div>
                    
                    <div className="d-flex align-items-center gap-2 gap-md-3">
                        <button data-testid="scanner-btn" className={`btn btn-sm ${uiStyle === 'classic' ? 'btn-light' : 'btn-outline-secondary'}`} onClick={() => router.push('/scanner')} title="Scan QR Code"><i className="bi bi-qr-code-scan"></i></button>
                        <div className="d-flex align-items-center me-1">
                            <select 
                                data-testid="language-select"
                                className={`form-select form-select-sm py-0 ps-1 pe-3 ${uiStyle === 'classic' ? 'bg-transparent border-0' : 'rounded-pill border-0 bg-light'}`}
                                style={{height: '24px', fontSize: '11px', minWidth: '60px'}}
                                value={language}
                                onChange={(e) => setLanguage(e.target.value as any)}
                            >
                                <option value="en">EN</option>
                                <option value="id">ID</option>
                            </select>
                        </div>

                        <button data-testid="user-dropdown" className="btn btn-sm btn-light border d-flex align-items-center rounded-pill gap-2 px-2" onClick={() => router.push('/settings')} title="Settings" style={{ height: 30 }}>
                            <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <PixelAvatar avatarId={currentUser?.avatar_id} size={18} />
                            </div>
                            <span className="small fw-bold d-none d-sm-inline" data-testid="username-display">{currentUser?.username}</span>
                        </button>

                        <button data-testid="logout-btn" className={`btn btn-sm btn-outline-danger d-flex align-items-center gap-2`} onClick={logout} title="Terminate Session">
                            <i className="bi bi-box-arrow-right"></i>
                            <span className="small fw-bold d-none d-sm-inline">LOGOUT</span>
                        </button>
                    </div>
                </div>

                <AppLoadBar />

                <div className="px-0 py-3">
                    {pageBody}
                </div>
            </div>
        </div>
    );
}
