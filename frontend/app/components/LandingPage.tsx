'use client';

import { useRouter } from 'next/navigation';

export default function LandingPage() {
    const router = useRouter();

    return (
        <div className="vh-100 d-flex flex-column bg-dark text-white overflow-hidden position-relative">
            {/* Background Abstract Effect */}
            <div className="position-absolute top-0 start-0 w-100 h-100 opacity-10" 
                 style={{
                     background: 'radial-gradient(circle at 50% 50%, #4f46e5 0%, #000000 70%)',
                     pointerEvents: 'none'
                 }}>
            </div>

            {/* Header */}
            <header className="container py-4 d-flex justify-content-between align-items-center position-relative" style={{zIndex: 10}}>
                <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-layers-fill text-primary fs-4"></i>
                    <span className="fw-bold fs-5 letter-spacing-1">TERRAS ERP</span>
                </div>
                <button className="btn btn-outline-light btn-sm rounded-pill px-4" onClick={() => router.push('/login')}>
                    Client Login
                </button>
            </header>

            {/* Main Content */}
            <main className="container flex-grow-1 d-flex align-items-center position-relative" style={{zIndex: 10}}>
                <div className="row align-items-center w-100">
                    <div className="col-lg-6 mb-5 mb-lg-0">
                        <div className="mb-4">
                            <span className="badge bg-primary bg-opacity-25 text-primary border border-primary border-opacity-25 rounded-pill px-3 py-2 mb-3 extra-small uppercase fw-bold">
                                Enterprise Manufacturing OS
                            </span>
                            <h1 className="display-3 fw-bold mb-3 lh-sm">
                                Precision Control for <br/>
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-info" style={{background: 'linear-gradient(to right, #6366f1, #0ea5e9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Modern Industry</span>
                            </h1>
                            <p className="lead text-secondary mb-5" style={{maxWidth: '500px'}}>
                                Unified inventory, recursive engineering, and real-time shop floor intelligence in one modular platform.
                            </p>
                            <div className="d-flex gap-3">
                                <button className="btn btn-primary btn-lg rounded-pill px-5 shadow-lg fw-bold" onClick={() => router.push('/login')}>
                                    Launch Workspace <i className="bi bi-arrow-right ms-2"></i>
                                </button>
                                <button className="btn btn-outline-secondary btn-lg rounded-pill px-4 fw-bold" onClick={() => window.open('https://github.com/bryanadamg/terras-erp', '_blank')}>
                                    Documentation
                                </button>
                            </div>
                        </div>
                        
                        <div className="d-flex gap-5 mt-5 text-secondary small">
                            <div className="d-flex align-items-center gap-2">
                                <i className="bi bi-check-circle-fill text-success"></i>
                                <span>O(1) Stock Engine</span>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                                <i className="bi bi-check-circle-fill text-success"></i>
                                <span>Real-Time Socket</span>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                                <i className="bi bi-check-circle-fill text-success"></i>
                                <span>Offline First</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="col-lg-6 d-none d-lg-block">
                        <div className="position-relative">
                            <div className="card bg-dark border border-secondary border-opacity-25 shadow-lg p-3 rounded-4" style={{transform: 'perspective(1000px) rotateY(-5deg) rotateX(5deg)', transformStyle: 'preserve-3d'}}>
                                <div className="d-flex gap-2 mb-3 border-bottom border-secondary border-opacity-25 pb-3">
                                    <div className="rounded-circle bg-danger" style={{width:10, height:10}}></div>
                                    <div className="rounded-circle bg-warning" style={{width:10, height:10}}></div>
                                    <div className="rounded-circle bg-success" style={{width:10, height:10}}></div>
                                </div>
                                <div className="row g-3">
                                    <div className="col-6">
                                        <div className="p-3 bg-secondary bg-opacity-10 rounded mb-3">
                                            <div className="extra-small text-muted uppercase">Active Production</div>
                                            <div className="h4 fw-bold text-white mb-0">84.2%</div>
                                        </div>
                                    </div>
                                    <div className="col-6">
                                        <div className="p-3 bg-secondary bg-opacity-10 rounded mb-3">
                                            <div className="extra-small text-muted uppercase">Warehouse Yield</div>
                                            <div className="h4 fw-bold text-white mb-0">99.8%</div>
                                        </div>
                                    </div>
                                    <div className="col-12">
                                        <div className="p-2 bg-secondary bg-opacity-10 rounded d-flex align-items-center gap-3">
                                            <div className="bg-success rounded-circle p-2"><i className="bi bi-check text-white"></i></div>
                                            <div>
                                                <div className="small fw-bold text-white">System Synchronized</div>
                                                <div className="extra-small text-muted">Last update: 0ms ago</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="container py-4 text-center text-muted small position-relative" style={{zIndex: 10}}>
                <p>&copy; 2026 Terras Systems. Enterprise License.</p>
            </footer>
        </div>
    );
}
