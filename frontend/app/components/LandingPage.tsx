'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState(new Date());
    
    // Window Dragging State
    const [windows, setWindows] = useState([
        { id: 'stock', title: 'Live Inventory', x: 50, y: 40, z: 1, content: 'stock' },
        { id: 'wo', title: 'Production.exe', x: 380, y: 120, z: 2, content: 'wo' },
        { id: 'graph', title: 'Performance.xls', x: 100, y: 280, z: 3, content: 'graph' }
    ]);
    const dragRef = useRef<{id: string, startX: number, startY: number} | null>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleMouseDown = (e: React.MouseEvent, id: string) => {
        const w = windows.find(w => w.id === id);
        if (!w) return;
        
        // Bring to front
        setWindows(prev => prev.map(win => ({
            ...win,
            z: win.id === id ? 10 : 1
        })));

        dragRef.current = {
            id,
            startX: e.clientX - w.x,
            startY: e.clientY - w.y
        };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current) return;
        const { id, startX, startY } = dragRef.current;
        
        setWindows(prev => prev.map(win => {
            if (win.id !== id) return win;
            return { ...win, x: e.clientX - startX, y: e.clientY - startY };
        }));
    };

    const handleMouseUp = () => {
        dragRef.current = null;
    };

    return (
        <div 
            className="vh-100 d-flex flex-column overflow-hidden position-relative" 
            style={{ backgroundColor: '#5b7edc', fontFamily: 'Segoe UI, Tahoma, sans-serif' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* Bliss-inspired Abstract Background */}
            <div className="position-absolute top-0 start-0 w-100 h-100" 
                 style={{
                     background: 'linear-gradient(to bottom, #6d9bf1 0%, #a0c2f5 50%, #5b7edc 100%)',
                     zIndex: 0
                 }}>
                 {/* Subtle Grid for "Blueprint" feel */}
                 <div style={{
                     position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                     backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                     backgroundSize: '40px 40px'
                 }}></div>
            </div>

            {/* Navbar (Classic Title Bar Style) */}
            <header className="d-flex justify-content-between align-items-center px-4 py-3 position-relative shadow-sm" 
                    style={{ zIndex: 20, background: 'linear-gradient(to bottom, #ffffff 0%, #ece9d8 100%)', borderBottom: '1px solid #00309c' }}>
                <div className="d-flex align-items-center gap-2">
                    <div className="bg-primary text-white rounded-1 d-flex align-items-center justify-content-center border border-dark" style={{width: 32, height: 32, boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.4)'}}>
                        <i className="bi bi-grid-3x3-gap-fill"></i>
                    </div>
                    <div>
                        <h5 className="mb-0 fw-bold text-primary" style={{textShadow: '1px 1px 0 #fff'}}>Terras ERP</h5>
                        <small className="text-muted extra-small" style={{fontSize: '10px'}}>ENTERPRISE EDITION v2026</small>
                    </div>
                </div>
                <div>
                    <button 
                        className="btn fw-bold px-4 shadow-sm d-flex align-items-center gap-2"
                        onClick={() => router.push('/login')}
                        style={{
                            background: 'linear-gradient(to bottom, #fff 0%, #ece9d8 100%)',
                            border: '1px solid #707070',
                            borderRadius: '3px',
                            color: '#000',
                            fontSize: '13px'
                        }}
                    >
                        <i className="bi bi-key-fill text-warning"></i> Secure Login
                    </button>
                </div>
            </header>

            {/* Main Desktop Area */}
            <main className="flex-grow-1 position-relative container-fluid p-0" style={{ zIndex: 10 }}>
                <div className="row h-100 m-0">
                    {/* Left: Value Proposition */}
                    <div className="col-lg-5 d-flex flex-column justify-content-center p-5 text-white" style={{textShadow: '0 2px 4px rgba(0,0,0,0.3)'}}>
                        <h1 className="display-4 fw-bold mb-3" style={{fontFamily: 'Tahoma, sans-serif'}}>
                            The Operating System <br/>
                            <span style={{color: '#fdf6e3'}}>For Your Factory.</span>
                        </h1>
                        <p className="lead mb-4 fw-medium" style={{fontSize: '1.2rem', opacity: 0.9}}>
                            Bring the stability of the past to the speed of the future. 
                            Manage inventory, production, and sales with zero downtime.
                        </p>
                        
                        <div className="d-flex flex-column gap-3 mb-5">
                            <div className="d-flex align-items-center gap-3">
                                <i className="bi bi-check-square-fill text-warning fs-4"></i>
                                <span>Complete Visibility (No More Blind Spots)</span>
                            </div>
                            <div className="d-flex align-items-center gap-3">
                                <i className="bi bi-check-square-fill text-warning fs-4"></i>
                                <span>Production Tracking (Start to Finish)</span>
                            </div>
                            <div className="d-flex align-items-center gap-3">
                                <i className="bi bi-check-square-fill text-warning fs-4"></i>
                                <span>Anti-Theft Inventory Logs</span>
                            </div>
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
                                width: 'fit-content'
                            }}
                        >
                            <div className="bg-white rounded-circle d-flex align-items-center justify-content-center" style={{width:30, height:30}}>
                                <i className="bi bi-play-fill text-success fs-5"></i>
                            </div>
                            <span>START SYSTEM</span>
                        </button>
                    </div>

                    {/* Right: Interactive Desktop Playground */}
                    <div className="col-lg-7 position-relative d-none d-lg-block">
                        {windows.map(win => (
                            <div 
                                key={win.id}
                                onMouseDown={(e) => handleMouseDown(e, win.id)}
                                className="position-absolute shadow-lg"
                                style={{
                                    left: win.x, top: win.y, zIndex: win.z,
                                    width: '320px',
                                    backgroundColor: '#ece9d8',
                                    border: '1px solid #0054e3',
                                    borderTopLeftRadius: '8px',
                                    borderTopRightRadius: '8px',
                                    cursor: 'default'
                                }}
                            >
                                {/* Window Title Bar */}
                                <div className="d-flex justify-content-between align-items-center px-2 py-1 text-white fw-bold"
                                     style={{
                                         background: 'linear-gradient(to right, #0058e6 0%, #3a93ff 100%)',
                                         borderTopLeftRadius: '6px',
                                         borderTopRightRadius: '6px',
                                         cursor: 'grab'
                                     }}>
                                    <small className="d-flex align-items-center gap-2">
                                        <i className={`bi ${win.id === 'stock' ? 'bi-box-seam' : win.id === 'wo' ? 'bi-gear-wide' : 'bi-bar-chart-fill'}`}></i>
                                        {win.title}
                                    </small>
                                    <div className="d-flex gap-1">
                                        <div className="bg-danger border border-light rounded-1" style={{width:12, height:12, opacity: 0.8}}></div>
                                    </div>
                                </div>

                                {/* Window Content */}
                                <div className="p-2 bg-white m-1 border border-secondary" style={{minHeight: '120px'}}>
                                    {win.content === 'stock' && (
                                        <div>
                                            <div className="d-flex justify-content-between border-bottom pb-1 mb-2">
                                                <span className="small fw-bold">Item</span>
                                                <span className="small fw-bold">Qty</span>
                                            </div>
                                            <div className="d-flex justify-content-between small text-muted mb-1">
                                                <span>Raw Cotton</span>
                                                <span className="text-success">500 kg</span>
                                            </div>
                                            <div className="d-flex justify-content-between small text-muted mb-1">
                                                <span>Dye (Red)</span>
                                                <span className="text-danger fw-bold">12 L (Low)</span>
                                            </div>
                                            <div className="mt-3 p-2 bg-light border text-center">
                                                <small className="text-primary" style={{fontSize:'10px'}}>Status: SYNCHRONIZED</small>
                                            </div>
                                        </div>
                                    )}
                                    {win.content === 'wo' && (
                                        <div>
                                            <div className="alert alert-info py-1 px-2 mb-2 extra-small border-info bg-opacity-10">
                                                <i className="bi bi-info-circle me-1"></i> Machine A is running
                                            </div>
                                            <div className="small fw-bold mb-1">Batch #4092</div>
                                            <div className="progress" style={{height: '10px', border: '1px solid #999'}}>
                                                <div className="progress-bar bg-success" style={{width: '75%'}}></div>
                                            </div>
                                            <div className="text-end mt-1">
                                                <small className="text-muted" style={{fontSize:'10px'}}>75% Complete</small>
                                            </div>
                                        </div>
                                    )}
                                    {win.content === 'graph' && (
                                        <div className="d-flex align-items-end justify-content-between h-100 pt-3 px-2 gap-2" style={{height: '100px'}}>
                                            <div className="bg-primary w-100" style={{height: '40%'}}></div>
                                            <div className="bg-success w-100" style={{height: '60%'}}></div>
                                            <div className="bg-warning w-100" style={{height: '85%'}}></div>
                                            <div className="bg-info w-100" style={{height: '50%'}}></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Taskbar Footer */}
            <footer className="position-relative w-100" style={{zIndex: 20, height: '40px', background: 'linear-gradient(to bottom, #245edb 0%, #1941a5 100%)', borderTop: '2px solid #3f8cf3'}}>
                <div className="container-fluid h-100 px-0 d-flex align-items-center justify-content-between">
                    <div className="d-flex h-100">
                        {/* Start Button */}
                        <button 
                            className="btn h-100 px-3 d-flex align-items-center gap-2 fw-bold fst-italic"
                            onClick={() => router.push('/login')}
                            style={{
                                background: 'linear-gradient(to bottom, #3cda3c 0%, #30b030 100%)',
                                color: 'white',
                                borderRadius: '0 12px 12px 0',
                                border: 'none',
                                boxShadow: '2px 0 5px rgba(0,0,0,0.3)',
                                fontSize: '14px',
                                textShadow: '1px 1px 1px rgba(0,0,0,0.4)'
                            }}
                        >
                            <i className="bi bi-windows fs-5"></i>
                            Start
                        </button>
                        
                        {/* Taskbar Items */}
                        <div className="d-none d-md-flex align-items-center ms-3 gap-1">
                            <div className="px-3 py-1 text-white small" style={{background: '#15388b', borderRadius: '3px', border: '1px solid #102a63', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.2)'}}>
                                <i className="bi bi-hdd-network me-2"></i>System Online
                            </div>
                        </div>
                    </div>

                    {/* Clock Tray */}
                    <div className="h-100 px-3 d-flex align-items-center gap-3" 
                         style={{
                             background: '#0b78e3', 
                             borderLeft: '1px solid #102a63',
                             boxShadow: 'inset 2px 0 5px rgba(0,0,0,0.2)'
                         }}>
                        <i className="bi bi-volume-up-fill text-white small opacity-75"></i>
                        <i className="bi bi-wifi text-white small opacity-75"></i>
                        <span className="text-white small fw-medium">
                            {currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
