'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface WinState {
    id: string;
    title: string;
    x: number;
    y: number;
    z: number;
    content: string;
    minimized: boolean;
}

export default function LandingPage() {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [startMenuOpen, setStartMenuOpen] = useState(false);
    const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
    const [displayedText, setDisplayedText] = useState('');
    const [charsRevealed, setCharsRevealed] = useState(0);
    const [progressWidth, setProgressWidth] = useState(0);
    const [progressWidth2, setProgressWidth2] = useState(0);
    const [stockData, setStockData] = useState([
        { name: 'Raw Cotton', qty: 500, unit: 'kg', color: 'text-success', low: false },
        { name: 'Dye (Red)', qty: 12, unit: 'L', color: 'text-danger', low: true },
        { name: 'Thread (Blue)', qty: 234, unit: 'm', color: 'text-primary', low: false },
    ]);
    const [chartHeights, setChartHeights] = useState([0, 0, 0, 0]);
    const [etaSeconds, setEtaSeconds] = useState(48);

    const fullTagline = 'The Operating System For Your Factory.';
    const checklistItems = [
        'Complete Visibility (No More Blind Spots)',
        'Production Tracking (Start to Finish)',
        'Anti-Theft Inventory Logs',
    ];

    const [windows, setWindows] = useState<WinState[]>([
        { id: 'stock', title: 'Live Inventory', x: 50, y: 40, z: 1, content: 'stock', minimized: false },
        { id: 'wo', title: 'Production.exe', x: 380, y: 120, z: 2, content: 'wo', minimized: false },
        { id: 'graph', title: 'Performance.xls', x: 100, y: 280, z: 3, content: 'graph', minimized: false },
        { id: 'sales', title: 'SalesBoard.exe', x: 220, y: 60, z: 1, content: 'sales', minimized: false },
    ]);
    const dragRef = useRef<{ id: string; startX: number; startY: number } | null>(null);

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Typing animation
    useEffect(() => {
        if (charsRevealed < fullTagline.length) {
            const timer = setTimeout(() => {
                setDisplayedText(fullTagline.slice(0, charsRevealed + 1));
                setCharsRevealed(prev => prev + 1);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [charsRevealed]);

    // Progress bar animation
    useEffect(() => {
        const timer = setTimeout(() => {
            setProgressWidth(75);
            setProgressWidth2(30);
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    // Chart bar animation
    useEffect(() => {
        const timer = setTimeout(() => {
            setChartHeights([40, 60, 85, 50]);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    // Stock ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setStockData(prev =>
                prev.map(item => ({
                    ...item,
                    qty: Math.max(1, item.qty + Math.floor(Math.random() * 11) - 5),
                }))
            );
        }, 3000);
        return () => clearInterval(timer);
    }, []);

    // ETA countdown
    useEffect(() => {
        const timer = setInterval(() => {
            setEtaSeconds(prev => (prev > 0 ? prev - 1 : 48));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleMouseDown = (e: React.MouseEvent, id: string) => {
        const w = windows.find(w => w.id === id);
        if (!w) return;
        bringToFront(id);
        dragRef.current = { id, startX: e.clientX - w.x, startY: e.clientY - w.y };
    };

    const bringToFront = (id: string) => {
        setWindows(prev =>
            prev.map(win => ({ ...win, z: win.id === id ? 10 : win.z }))
        );
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current) return;
        const { id, startX, startY } = dragRef.current;
        setWindows(prev =>
            prev.map(win =>
                win.id !== id ? win : { ...win, x: e.clientX - startX, y: e.clientY - startY }
            )
        );
    };

    const handleMouseUp = () => {
        dragRef.current = null;
    };

    const closeWindow = (id: string) => {
        setWindows(prev => prev.filter(w => w.id !== id));
    };

    const minimizeWindow = (id: string) => {
        setWindows(prev => prev.map(w => (w.id === id ? { ...w, minimized: true } : w)));
    };

    const toggleMinimize = (id: string) => {
        setWindows(prev =>
            prev.map(w => {
                if (w.id !== id) return w;
                const willRestore = w.minimized;
                return { ...w, minimized: !w.minimized, z: willRestore ? 10 : w.z };
            })
        );
    };

    const getWindowIcon = (id: string) => {
        const map: Record<string, string> = {
            stock: 'bi-box-seam',
            wo: 'bi-gear-wide',
            graph: 'bi-bar-chart-fill',
            sales: 'bi-cart3',
        };
        return map[id] || 'bi-window';
    };

    const desktopIcons = [
        { id: 'icon-stock', icon: 'bi-box-seam-fill', label: 'Inventory.exe', winId: 'stock' },
        { id: 'icon-wo', icon: 'bi-gear-wide-connected', label: 'Production.exe', winId: 'wo' },
        { id: 'icon-graph', icon: 'bi-bar-chart-line-fill', label: 'Reports.xls', winId: 'graph' },
        { id: 'icon-sales', icon: 'bi-diagram-3-fill', label: 'BOM_Designer.exe', winId: 'sales' },
        { id: 'icon-hr', icon: 'bi-people-fill', label: 'HR_Module.exe', winId: null },
        { id: 'icon-recycle', icon: 'bi-recycle', label: 'Recycle Bin', winId: null },
    ];

    const handleIconDoubleClick = (iconId: string, winId: string | null) => {
        if (!winId) return;
        const existing = windows.find(w => w.id === winId);
        if (existing) {
            setWindows(prev =>
                prev.map(w => (w.id === winId ? { ...w, minimized: false, z: 10 } : w))
            );
        } else {
            const defaults: Record<string, WinState> = {
                stock: { id: 'stock', title: 'Live Inventory', x: 50, y: 40, z: 10, content: 'stock', minimized: false },
                wo: { id: 'wo', title: 'Production.exe', x: 380, y: 120, z: 10, content: 'wo', minimized: false },
                graph: { id: 'graph', title: 'Performance.xls', x: 100, y: 280, z: 10, content: 'graph', minimized: false },
                sales: { id: 'sales', title: 'SalesBoard.exe', x: 220, y: 60, z: 10, content: 'sales', minimized: false },
            };
            if (defaults[winId]) setWindows(prev => [...prev, defaults[winId]]);
        }
    };

    const typingDone = charsRevealed >= fullTagline.length;

    return (
        <div
            className="vh-100 d-flex flex-column overflow-hidden position-relative"
            style={{ backgroundColor: '#5b7edc', fontFamily: 'Segoe UI, Tahoma, sans-serif' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={() => { setStartMenuOpen(false); setSelectedIcon(null); }}
        >
            {/* Bliss-inspired background */}
            <div
                className="position-absolute top-0 start-0 w-100 h-100"
                style={{ background: 'linear-gradient(to bottom, #6d9bf1 0%, #a0c2f5 50%, #5b7edc 100%)', zIndex: 0 }}
            >
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }} />
            </div>

            {/* Navbar */}
            <header
                className="d-flex justify-content-between align-items-center px-4 py-3 position-relative shadow-sm"
                style={{ zIndex: 20, background: 'linear-gradient(to bottom, #ffffff 0%, #ece9d8 100%)', borderBottom: '1px solid #00309c' }}
            >
                <div className="d-flex align-items-center gap-2">
                    <div
                        className="bg-primary text-white rounded-1 d-flex align-items-center justify-content-center border border-dark"
                        style={{ width: 32, height: 32, boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.4)' }}
                    >
                        <i className="bi bi-grid-3x3-gap-fill" />
                    </div>
                    <div>
                        <h5 className="mb-0 fw-bold text-primary" style={{ textShadow: '1px 1px 0 #fff' }}>Terras ERP</h5>
                        <small className="text-muted" style={{ fontSize: '10px' }}>ENTERPRISE EDITION v2026</small>
                    </div>
                </div>
                <button
                    className="btn fw-bold px-4 shadow-sm d-flex align-items-center gap-2"
                    onClick={() => router.push('/login')}
                    style={{
                        background: 'linear-gradient(to bottom, #fff 0%, #ece9d8 100%)',
                        border: '1px solid #707070',
                        borderRadius: '3px',
                        color: '#000',
                        fontSize: '13px',
                    }}
                >
                    <i className="bi bi-key-fill text-warning" /> Secure Login
                </button>
            </header>

            {/* Main Desktop */}
            <main className="flex-grow-1 position-relative container-fluid p-0" style={{ zIndex: 10 }}>
                <div className="row h-100 m-0">
                    {/* Left: Hero */}
                    <div className="col-lg-5 d-flex flex-column justify-content-center p-5 text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                        <h1 className="display-4 fw-bold mb-3" style={{ fontFamily: 'Tahoma, sans-serif', minHeight: '4.5rem' }}>
                            {displayedText}
                            {!typingDone && (
                                <span style={{ borderRight: '3px solid white', animation: 'blink 0.7s step-end infinite' }}> </span>
                            )}
                        </h1>

                        <p
                            className="lead mb-4 fw-medium"
                            style={{ fontSize: '1.2rem', opacity: charsRevealed > 5 ? 0.9 : 0, transition: 'opacity 1s' }}
                        >
                            Bring the stability of the past to the speed of the future.
                            Manage inventory, production, and sales with zero downtime.
                        </p>

                        <div className="d-flex flex-column gap-3 mb-5">
                            {checklistItems.map((item, i) => (
                                <div
                                    key={i}
                                    className="d-flex align-items-center gap-3"
                                    style={{
                                        opacity: typingDone ? 1 : 0,
                                        transform: typingDone ? 'translateX(0)' : 'translateX(-12px)',
                                        transition: `opacity 0.5s ${i * 0.2}s, transform 0.5s ${i * 0.2}s`,
                                    }}
                                >
                                    <i className="bi bi-check-square-fill text-warning fs-4" />
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => router.push('/login')}
                            className="btn btn-lg fw-bold d-flex align-items-center gap-3 px-4 py-3"
                            style={{
                                background: 'linear-gradient(to bottom, #3cda3c 0%, #30b030 100%)',
                                border: '2px solid #fff',
                                borderRadius: '8px',
                                color: 'white',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                                width: 'fit-content',
                                opacity: typingDone ? 1 : 0,
                                transition: 'opacity 0.5s 0.8s',
                            }}
                        >
                            <div className="bg-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: 30, height: 30 }}>
                                <i className="bi bi-play-fill text-success fs-5" />
                            </div>
                            <span>START SYSTEM</span>
                        </button>
                    </div>

                    {/* Right: Desktop Playground */}
                    <div className="col-lg-7 position-relative d-none d-lg-block">
                        {/* Desktop Icons */}
                        <div style={{
                            position: 'absolute', top: 16, left: 16, zIndex: 1,
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                        }}>
                            {desktopIcons.map(icon => (
                                <div
                                    key={icon.id}
                                    onClick={e => { e.stopPropagation(); setSelectedIcon(icon.id); }}
                                    onDoubleClick={() => handleIconDoubleClick(icon.id, icon.winId)}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                        gap: '4px', padding: '4px', cursor: 'pointer', borderRadius: '4px',
                                        background: selectedIcon === icon.id ? 'rgba(0,80,200,0.45)' : 'transparent',
                                        border: selectedIcon === icon.id ? '1px dotted rgba(255,255,255,0.8)' : '1px solid transparent',
                                        userSelect: 'none', width: '72px',
                                    }}
                                >
                                    <div style={{
                                        width: 48, height: 48,
                                        background: 'rgba(255,255,255,0.15)',
                                        border: '1px solid rgba(255,255,255,0.3)',
                                        borderRadius: '4px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '24px', color: 'white',
                                    }}>
                                        <i className={`bi ${icon.icon}`} />
                                    </div>
                                    <span style={{
                                        color: 'white', fontSize: '10px', textAlign: 'center',
                                        textShadow: '1px 1px 1px #000, -1px -1px 1px #000',
                                        lineHeight: '1.2', wordBreak: 'break-word',
                                    }}>{icon.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Floating Windows */}
                        {windows.map(win => (
                            <div
                                key={win.id}
                                onMouseDown={e => handleMouseDown(e, win.id)}
                                className="position-absolute shadow-lg"
                                style={{
                                    left: win.x, top: win.y, zIndex: win.z,
                                    width: '320px',
                                    backgroundColor: '#ece9d8',
                                    border: '2px solid #0038a8',
                                    borderRadius: '4px 4px 0 0',
                                    cursor: 'default',
                                }}
                            >
                                {/* Title Bar */}
                                <div
                                    className="d-flex justify-content-between align-items-center px-2 text-white fw-bold"
                                    style={{
                                        background: 'linear-gradient(to right, #0058e6 0%, #3a93ff 100%)',
                                        borderRadius: '2px 2px 0 0',
                                        cursor: 'grab',
                                        height: '24px',
                                    }}
                                >
                                    <small className="d-flex align-items-center gap-2" style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        <i className={`bi ${getWindowIcon(win.id)}`} />
                                        {win.title}
                                        {win.id === 'stock' && (
                                            <span style={{
                                                background: '#00c800', color: 'white',
                                                fontSize: '9px', padding: '1px 4px', borderRadius: '2px',
                                                animation: 'blink 1.5s step-end infinite', flexShrink: 0,
                                            }}>● LIVE</span>
                                        )}
                                    </small>
                                    <div className="d-flex gap-1" style={{ marginLeft: '6px', flexShrink: 0 }}>
                                        {/* Minimize */}
                                        <button
                                            onMouseDown={e => e.stopPropagation()}
                                            onClick={e => { e.stopPropagation(); minimizeWindow(win.id); }}
                                            style={{
                                                width: 14, height: 14,
                                                background: 'linear-gradient(to bottom, #e8e0d0, #c4b9a8)',
                                                border: '1px solid #888', borderRadius: '2px',
                                                cursor: 'pointer', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                fontSize: '10px', color: '#000', lineHeight: 1, padding: 0,
                                            }}
                                        >_</button>
                                        {/* Maximize */}
                                        <button
                                            onMouseDown={e => e.stopPropagation()}
                                            style={{
                                                width: 14, height: 14,
                                                background: 'linear-gradient(to bottom, #e8e0d0, #c4b9a8)',
                                                border: '1px solid #888', borderRadius: '2px',
                                                cursor: 'pointer', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                fontSize: '9px', color: '#000', lineHeight: 1, padding: 0,
                                            }}
                                        >□</button>
                                        {/* Close */}
                                        <button
                                            onMouseDown={e => e.stopPropagation()}
                                            onClick={e => { e.stopPropagation(); closeWindow(win.id); }}
                                            style={{
                                                width: 14, height: 14,
                                                background: 'linear-gradient(to bottom, #e84040, #d9362a)',
                                                border: '1px solid #880000', borderRadius: '2px',
                                                cursor: 'pointer', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center',
                                                fontSize: '10px', color: 'white', fontWeight: 'bold', lineHeight: 1, padding: 0,
                                            }}
                                        >✕</button>
                                    </div>
                                </div>

                                {/* Content (hidden when minimized) */}
                                {!win.minimized && (
                                    <div className="p-2 bg-white m-1 border border-secondary" style={{ minHeight: '120px' }}>
                                        {win.content === 'stock' && (
                                            <div>
                                                <div className="d-flex justify-content-between border-bottom pb-1 mb-2">
                                                    <span className="small fw-bold">Item</span>
                                                    <span className="small fw-bold">Qty</span>
                                                </div>
                                                {stockData.map((item, i) => (
                                                    <div key={i} className="d-flex justify-content-between small mb-1">
                                                        <span className="text-muted">{item.name}{item.low ? ' ⚠' : ''}</span>
                                                        <span className={item.color} style={{ transition: 'all 0.5s', fontWeight: item.low ? 'bold' : 'normal' }}>
                                                            {item.qty} {item.unit}{item.low ? ' (Low)' : ''}
                                                        </span>
                                                    </div>
                                                ))}
                                                <div className="mt-2 p-1 bg-light border text-center">
                                                    <small className="text-primary" style={{ fontSize: '10px' }}>Status: SYNCHRONIZED</small>
                                                </div>
                                            </div>
                                        )}
                                        {win.content === 'wo' && (
                                            <div>
                                                <div className="d-flex align-items-center justify-content-between mb-1">
                                                    <small className="fw-bold">Batch #4092</small>
                                                    <small className="text-muted" style={{ fontSize: '10px' }}>ETA: {etaSeconds}s</small>
                                                </div>
                                                <div className="progress mb-1" style={{ height: '10px', border: '1px solid #999' }}>
                                                    <div className="progress-bar bg-success" style={{ width: `${progressWidth}%`, transition: 'width 1s ease-out' }} />
                                                </div>
                                                <div className="text-end mb-2">
                                                    <small className="text-muted" style={{ fontSize: '10px' }}>{progressWidth}% Complete</small>
                                                </div>
                                                <div className="d-flex align-items-center justify-content-between mb-1">
                                                    <small className="fw-bold">Batch #4093</small>
                                                    <small className="text-muted" style={{ fontSize: '10px' }}>Queued</small>
                                                </div>
                                                <div className="progress" style={{ height: '10px', border: '1px solid #999' }}>
                                                    <div className="progress-bar bg-warning" style={{ width: `${progressWidth2}%`, transition: 'width 1.2s ease-out' }} />
                                                </div>
                                                <div className="text-end">
                                                    <small className="text-muted" style={{ fontSize: '10px' }}>{progressWidth2}% Complete</small>
                                                </div>
                                            </div>
                                        )}
                                        {win.content === 'graph' && (
                                            <div>
                                                <div style={{ position: 'relative', height: '100px' }}>
                                                    {/* Target line */}
                                                    <div style={{
                                                        position: 'absolute', left: 0, right: 0, bottom: '70%',
                                                        borderTop: '1px dashed #aaa', zIndex: 1,
                                                    }} />
                                                    <div className="d-flex align-items-end justify-content-between h-100 px-2 gap-2">
                                                        {(['#0d6efd', '#198754', '#ffc107', '#0dcaf0'] as const).map((color, i) => (
                                                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                                                <div style={{
                                                                    width: '100%',
                                                                    height: `${chartHeights[i]}%`,
                                                                    background: color,
                                                                    transition: `height 0.8s ease-out ${i * 0.15}s`,
                                                                }} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="d-flex justify-content-between px-2 mt-1">
                                                    {['Jan', 'Feb', 'Mar', 'Apr'].map(m => (
                                                        <small key={m} style={{ fontSize: '9px', color: '#666', flex: 1, textAlign: 'center' }}>{m}</small>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {win.content === 'sales' && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                                {[
                                                    { label: 'Orders Today', value: '14', color: '#0d6efd' },
                                                    { label: 'Revenue', value: 'Rp 48.2M', color: '#198754' },
                                                    { label: 'Pending', value: '3', color: '#fd7e14' },
                                                    { label: 'Fulfilled', value: '11', color: '#0dcaf0' },
                                                ].map((card, i) => (
                                                    <div key={i} style={{
                                                        background: '#f8f9fa',
                                                        border: '1px solid #dee2e6',
                                                        borderTop: `3px solid ${card.color}`,
                                                        borderRadius: '2px',
                                                        padding: '6px',
                                                        textAlign: 'center',
                                                    }}>
                                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: card.color }}>{card.value}</div>
                                                        <div style={{ fontSize: '9px', color: '#666' }}>{card.label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* XP Start Menu */}
            {startMenuOpen && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'absolute', bottom: '42px', left: '0', zIndex: 100,
                        width: '360px',
                        border: '1px solid #000080',
                        boxShadow: '3px 3px 10px rgba(0,0,0,0.5)',
                        borderRadius: '4px 4px 0 0',
                        overflow: 'hidden',
                        fontFamily: 'Tahoma, sans-serif',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        background: 'linear-gradient(to right, #1a4cc0, #3a7adf)',
                        padding: '8px 12px',
                        display: 'flex', alignItems: 'center', gap: '12px',
                    }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '50%',
                            background: '#5599ee', border: '2px solid #aaccff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <i className="bi bi-person-fill text-white fs-4" />
                        </div>
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>Teras ERP User</span>
                    </div>

                    {/* Two-column body */}
                    <div style={{ display: 'flex' }}>
                        {/* Left: white */}
                        <div style={{ flex: 1, background: 'white', padding: '6px 0' }}>
                            {[
                                { icon: 'bi-box-seam', label: 'Inventory', color: '#0d6efd' },
                                { icon: 'bi-gear-wide-connected', label: 'Manufacturing', color: '#198754' },
                                { icon: 'bi-cart3', label: 'Sales', color: '#dc3545' },
                                { icon: 'bi-bar-chart-fill', label: 'Reports', color: '#fd7e14' },
                                { icon: 'bi-diagram-3', label: 'BOM Designer', color: '#6f42c1' },
                            ].map((item, i) => (
                                <div
                                    key={i}
                                    onClick={() => router.push('/login')}
                                    onMouseOver={e => (e.currentTarget.style.background = '#316ac5')}
                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '5px 12px', cursor: 'pointer', fontSize: '12px',
                                    }}
                                >
                                    <i className={`bi ${item.icon}`} style={{ color: item.color, fontSize: '18px', width: '24px', textAlign: 'center' }} />
                                    <span>{item.label}</span>
                                </div>
                            ))}
                            <hr style={{ margin: '4px 8px', borderColor: '#ccc' }} />
                            <div
                                onClick={() => router.push('/login')}
                                onMouseOver={e => (e.currentTarget.style.background = '#316ac5')}
                                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px' }}
                            >
                                <i className="bi bi-person" style={{ color: '#666', fontSize: '18px', width: '24px', textAlign: 'center' }} />
                                <span>Profile</span>
                            </div>
                        </div>

                        {/* Right: blue */}
                        <div style={{ flex: 1, background: 'linear-gradient(to bottom, #0958c8, #0038a8)', padding: '6px 0' }}>
                            {[
                                { icon: 'bi-folder2', label: 'My Documents' },
                                { icon: 'bi-sliders', label: 'Control Panel' },
                                { icon: 'bi-question-circle', label: 'Help and Support' },
                            ].map((item, i) => (
                                <div
                                    key={i}
                                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: 'white' }}
                                >
                                    <i className={`bi ${item.icon}`} style={{ fontSize: '16px', width: '24px', textAlign: 'center' }} />
                                    <span>{item.label}</span>
                                </div>
                            ))}
                            <hr style={{ margin: '4px 8px', borderColor: 'rgba(255,255,255,0.3)' }} />
                            <div
                                onClick={() => router.push('/login')}
                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', color: 'white' }}
                            >
                                <i className="bi bi-box-arrow-right" style={{ fontSize: '16px', width: '24px', textAlign: 'center' }} />
                                <span>Log On</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                        background: '#0038a8', borderTop: '1px solid #000080',
                        padding: '5px 12px', display: 'flex', justifyContent: 'flex-end', gap: '8px',
                    }}>
                        {['Log Off', 'Shut Down'].map(label => (
                            <button
                                key={label}
                                onClick={() => router.push('/login')}
                                style={{
                                    background: 'linear-gradient(to bottom, #2a5adb, #1a3db0)',
                                    color: 'white', border: '1px solid #8888cc',
                                    borderRadius: '3px', padding: '3px 10px',
                                    fontSize: '11px', cursor: 'pointer',
                                }}
                            >{label}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Taskbar */}
            <footer
                className="position-relative w-100"
                style={{ zIndex: 20, height: '40px', background: 'linear-gradient(to bottom, #245edb 0%, #1941a5 100%)', borderTop: '2px solid #3f8cf3' }}
            >
                <div className="container-fluid h-100 px-0 d-flex align-items-center justify-content-between">
                    <div className="d-flex h-100" style={{ flex: 1, overflow: 'hidden' }}>
                        {/* Start Button */}
                        <button
                            className="btn h-100 px-3 d-flex align-items-center gap-2 fw-bold fst-italic"
                            onClick={e => { e.stopPropagation(); setStartMenuOpen(prev => !prev); }}
                            style={{
                                background: 'linear-gradient(to bottom, #3cda3c 0%, #30b030 100%)',
                                color: 'white',
                                borderRadius: '0 12px 12px 0',
                                border: 'none',
                                boxShadow: startMenuOpen ? 'inset 1px 1px 3px rgba(0,0,0,0.4)' : '2px 0 5px rgba(0,0,0,0.3)',
                                fontSize: '14px',
                                textShadow: '1px 1px 1px rgba(0,0,0,0.4)',
                                flexShrink: 0,
                            }}
                        >
                            <i className="bi bi-windows fs-5" />
                            Start
                        </button>

                        {/* Divider */}
                        <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '4px 4px' }} />

                        {/* Taskbar Window Buttons */}
                        <div className="d-none d-md-flex align-items-center ms-1 gap-1" style={{ overflow: 'hidden' }}>
                            {windows.map(win => (
                                <button
                                    key={win.id}
                                    onClick={e => { e.stopPropagation(); toggleMinimize(win.id); }}
                                    style={{
                                        background: win.minimized
                                            ? 'linear-gradient(to bottom, #1e4db0, #1941a5)'
                                            : 'linear-gradient(to bottom, #15388b, #0d2a6e)',
                                        color: 'white',
                                        border: '1px solid #102a63',
                                        borderRadius: '3px',
                                        padding: '2px 10px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        boxShadow: win.minimized ? 'none' : 'inset 1px 1px 0 rgba(0,0,0,0.3)',
                                        maxWidth: '120px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                    }}
                                >
                                    <i className={`bi ${getWindowIcon(win.id)}`} style={{ fontSize: '11px', flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{win.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Clock Tray */}
                    <div
                        className="h-100 px-3 d-flex align-items-center gap-3"
                        style={{ background: '#0b78e3', borderLeft: '1px solid #102a63', boxShadow: 'inset 2px 0 5px rgba(0,0,0,0.2)', flexShrink: 0 }}
                    >
                        <i className="bi bi-volume-up-fill text-white small opacity-75" />
                        <i className="bi bi-wifi text-white small opacity-75" />
                        <span className="text-white small fw-medium">
                            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>
            </footer>

            <style>{`
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
