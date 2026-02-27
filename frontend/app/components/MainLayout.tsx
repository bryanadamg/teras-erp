'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { useUser } from '../context/UserContext';
import { useData } from '../context/DataContext';
import { useRouter, usePathname } from 'next/navigation';

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const { currentUser, logout, loading, hasPermission } = useUser();
    const { handleTabHover } = useData();
    const router = useRouter();
    const pathname = usePathname();
    
    const [appName, setAppName] = useState('Terras ERP');
    const [uiStyle, setUiStyle] = useState('classic');
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedName = localStorage.getItem('app_name'); if (savedName) setAppName(savedName);
        const savedStyle = localStorage.getItem('ui_style'); if (savedStyle) setUiStyle(savedStyle);
    }, []);

    useEffect(() => {
        if (mounted && !loading && !currentUser && pathname !== '/login') {
            router.push('/login');
        }
    }, [currentUser, loading, pathname, router, mounted]);

    // SSR / Initial Loading State
    if (!mounted || loading) {
        return <div className="d-flex justify-content-center align-items-center vh-100 bg-light text-muted fw-bold">INITIALIZING_TERRAS_CORE...</div>;
    }

    // Auth Protection
    if (!currentUser && pathname !== '/login') {
        return <div className="d-flex justify-content-center align-items-center vh-100 bg-light text-muted fw-bold">RE-ESTABLISHING_AUTHENTICATION...</div>;
    }

    // Map pathname to activeTab for Sidebar highlighting
    const activeTab = !pathname || pathname === '/' ? 'dashboard' : pathname.substring(1).replace(/\//g, '-');

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
                onTabHover={handleTabHover} 
                appName={appName} 
                isOpen={isMobileSidebarOpen} 
            />

            <div className="main-content flex-grow-1 overflow-auto bg-light">
                <div className={`app-header sticky-top bg-white border-bottom shadow-sm px-4 d-flex justify-content-between align-items-center no-print ${uiStyle === 'classic' ? 'classic-header' : ''}`}>
                    <div className="d-flex align-items-center gap-3">
                        <button className="btn btn-link d-md-none p-0 text-dark" onClick={() => setIsMobileSidebarOpen(true)}><i className="bi bi-list fs-3"></i></button>
                        <h5 className="mb-0 fw-bold text-dark d-none d-md-block text-uppercase letter-spacing-1">{activeTab.replace('-', ' ')}</h5>
                    </div>
                    
                    <div className="d-flex align-items-center gap-2 gap-md-3">
                        <button className={`btn btn-sm ${uiStyle === 'classic' ? 'btn-light' : 'btn-outline-secondary'}`} onClick={() => router.push('/scanner')} title="Scan QR Code"><i className="bi bi-qr-code-scan"></i></button>
                        {hasPermission('admin.access') && <button className={`btn btn-sm ${uiStyle === 'classic' ? 'btn-light' : 'btn-outline-info'}`} onClick={() => router.push('/settings')} title="Settings"><i className="bi bi-gear-fill"></i></button>}
                        <div className="dropdown">
                            <button className="btn btn-sm btn-light border d-flex align-items-center gap-2 rounded-pill px-2" data-bs-toggle="dropdown" id="userDropdown">
                                <i className="bi bi-person-circle text-primary"></i><span className="small fw-bold d-none d-sm-inline">{currentUser?.username}</span>
                            </button>
                            <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2" aria-labelledby="userDropdown">
                                <li className="px-3 py-2 border-bottom mb-1"><div className="small fw-bold">{currentUser?.full_name}</div></li>
                                <li><button className="dropdown-item py-2 small" onClick={() => router.push('/settings')}><i className="bi bi-gear me-2"></i>Preferences & Admin</button></li>
                                <li><hr className="dropdown-divider" /></li>
                                <li><button className="dropdown-item py-2 small text-danger" onClick={logout}><i className="bi bi-box-arrow-right me-2"></i>Logout</button></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="p-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
