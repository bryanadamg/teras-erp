import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useLanguage } from '../context/LanguageContext';

interface QRScannerViewProps {
    workOrders: any[];
    onUpdateStatus: (id: string, status: string) => void;
    onClose: () => void;
}

export default function QRScannerView({ workOrders, onUpdateStatus, onClose }: QRScannerViewProps) {
    const { t } = useLanguage();
    const [scannedWO, setScannedWO] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        // Initialize Scanner
        scannerRef.current = new Html5QrcodeScanner(
            "reader", 
            { fps: 10, qrbox: { width: 250, height: 250 } }, 
            /* verbose= */ false
        );

        const onScanSuccess = (decodedText: string) => {
            // Find the WO in our list
            const found = workOrders.find(wo => wo.code === decodedText);
            if (found) {
                setScannedWO(found);
                setError(null);
                // We stop scanning once found to let user interact with the card
                if (scannerRef.current) {
                    scannerRef.current.clear();
                }
            } else {
                setError(`Work Order "${decodedText}" not found in current list.`);
            }
        };

        const onScanFailure = (error: any) => {
            // Silent failure for most frames
        };

        scannerRef.current.render(onScanSuccess, onScanFailure);

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(e => console.error("Scanner cleanup failed", e));
            }
        };
    }, [workOrders]);

    const handleUpdate = async (status: string) => {
        if (!scannedWO) return;
        await onUpdateStatus(scannedWO.id, status);
        // Refresh scanned WO locally to show new status
        setScannedWO({ ...scannedWO, status });
    };

    return (
        <div className="card border-0 shadow-lg fade-in">
            <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                <h5 className="mb-0"><i className="bi bi-qr-code-scan me-2"></i>Operator Scan Terminal</h5>
                <button className="btn btn-sm btn-outline-light" onClick={onClose}><i className="bi bi-x-lg"></i></button>
            </div>
            <div className="card-body">
                {!scannedWO ? (
                    <div className="text-center py-4">
                        <div id="reader" style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}></div>
                        <div className="mt-4">
                            <p className="lead text-muted">Point your camera at a Work Order QR Code</p>
                            {error && <div className="alert alert-warning py-2 small">{error}</div>}
                        </div>
                    </div>
                ) : (
                    <div className="py-2">
                        <div className="d-flex align-items-center justify-content-between mb-4 bg-light p-3 rounded border border-info border-opacity-25 shadow-sm">
                            <div>
                                <h2 className="fw-bold mb-0 font-monospace text-primary">{scannedWO.code}</h2>
                                <span className={`badge ${scannedWO.status === 'COMPLETED' ? 'bg-success' : 'bg-warning text-dark'} fs-6 mt-2`}>{scannedWO.status}</span>
                            </div>
                            <button className="btn btn-outline-secondary" onClick={() => { setScannedWO(null); window.location.reload(); }}>
                                <i className="bi bi-arrow-repeat me-2"></i>Scan Next
                            </button>
                        </div>

                        <div className="row g-3">
                            <div className="col-12">
                                <h6 className="small text-uppercase text-muted fw-bold mb-3">Available Actions</h6>
                                <div className="d-grid gap-3">
                                    {scannedWO.status === 'PENDING' && (
                                        <button className="btn btn-lg btn-primary shadow py-3" onClick={() => handleUpdate('IN_PROGRESS')}>
                                            <i className="bi bi-play-fill me-2 fs-4"></i> START PRODUCTION
                                        </button>
                                    )}
                                    {scannedWO.status === 'IN_PROGRESS' && (
                                        <button className="btn btn-lg btn-success shadow py-3" onClick={() => handleUpdate('COMPLETED')}>
                                            <i className="bi bi-check-lg me-2 fs-4"></i> MARK AS COMPLETED
                                        </button>
                                    )}
                                    {scannedWO.status === 'COMPLETED' && (
                                        <div className="alert alert-success d-flex align-items-center py-4">
                                            <i className="bi bi-check-circle-fill me-3 fs-2"></i>
                                            <div>
                                                <h5 className="mb-0 fw-bold">PRODUCTION COMPLETE</h5>
                                                <small>This order has been received into inventory.</small>
                                            </div>
                                        </div>
                                    )}
                                    <button className="btn btn-outline-danger mt-2" onClick={() => handleUpdate('CANCELLED')}>
                                        CANCEL ORDER
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div className="card-footer bg-light extra-small text-muted text-center italic">
                Device camera required. Permissions must be granted in your browser.
            </div>
        </div>
    );
}
