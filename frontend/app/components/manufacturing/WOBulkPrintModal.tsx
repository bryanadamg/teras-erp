'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import KartuKerjaCard from './KartuKerjaCard';
import PrintModalShell from '../shared/PrintModalShell';

interface PrintSettings {
    showMaterials: boolean;
    showFillFields: boolean;
    showSignature: boolean;
    headerDepartment: string;
}

const defaultSettings: PrintSettings = {
    showMaterials: true,
    showFillFields: true,
    showSignature: true,
    headerDepartment: '',
};

export default function WOBulkPrintModal({
    selectedWOs,
    manufacturingOrders,
    onClose,
}: {
    selectedWOs: any[];
    manufacturingOrders: any[];
    onClose: () => void;
}) {
    const { companyProfile, attributes, authFetch } = useData() as any;
    const { uiStyle } = useTheme();
    const isClassic = uiStyle === 'classic';

    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '') + '/api';
    // Bulk print marks every included WO's card in one call.
    const doPrint = () => {
        const ids = selectedWOs.map(w => w.id).filter(Boolean);
        if (ids.length) {
            try {
                authFetch(`${API_BASE}/work-orders/mark-printed-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids, kind: 'card' }),
                }).catch(() => {});
            } catch { /* noop */ }
        }
        window.addEventListener('afterprint', onClose, { once: true });
        window.print();
    };

    const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
    const [settings, setSettings] = useState<PrintSettings>(() => {
        try {
            const saved = localStorage.getItem('wo_step_print_settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch { return defaultSettings; }
    });

    useEffect(() => {
        document.body.classList.add('wo-bulk-print-active');
        return () => { document.body.classList.remove('wo-bulk-print-active'); };
    }, []);

    useEffect(() => {
        Promise.all(
            selectedWOs.map(wo =>
                QRCode.toDataURL(wo.id, { margin: 4, width: 320, errorCorrectionLevel: 'H' })
                    .then(url => [wo.id, url] as [string, string])
                    .catch(() => [wo.id, ''] as [string, string])
            )
        ).then(entries => setQrUrls(Object.fromEntries(entries)));
    }, [selectedWOs]);

    const update = (patch: Partial<PrintSettings>) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        try { localStorage.setItem('wo_step_print_settings', JSON.stringify(next)); } catch {}
    };

    const renderCard = (wo: any, forPortal: boolean) => {
        const parentMO = manufacturingOrders.find(m => m.id === wo.mo_id);
        return (
            <div key={wo.id} style={{
                border: '1px solid #888',
                padding: forPortal ? '4mm' : '10px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                breakInside: 'avoid' as any,
                ...(forPortal ? {} : { minHeight: '352px' }),
            }}>
                <KartuKerjaCard
                    workOrder={wo}
                    parentMO={parentMO}
                    qrDataUrl={qrUrls[wo.id] || ''}
                    settings={settings}
                    companyName={companyProfile?.name}
                    attributes={attributes}
                />
            </div>
        );
    };

    // Group into pages of 4
    const pages: any[][] = [];
    for (let i = 0; i < selectedWOs.length; i += 4) {
        pages.push(selectedWOs.slice(i, i + 4));
    }

    const isClassicBool = isClassic as boolean;
    const xpBtnGrey: React.CSSProperties = isClassicBool
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassicBool
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};
    return (
        <>
            <PrintModalShell title={`Bulk Print Kartu Kerja — ${selectedWOs.length} WO`} onClose={onClose} width="92vw" height="90vh">
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Settings panel */}
                        <div style={{ width: '200px', minWidth: '200px', borderRight: '1px solid #dee2e6', background: '#f8f9fa', padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#212529', letterSpacing: '0.5px', marginBottom: '6px' }}>Sections</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#212529', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={settings.showMaterials} onChange={e => update({ showMaterials: e.target.checked })} />
                                        Step Materials
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#212529', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={settings.showSignature} onChange={e => update({ showSignature: e.target.checked })} />
                                        Signature Line
                                    </label>
                                </div>
                            </div>
                            <hr style={{ margin: '0', borderColor: '#dee2e6' }} />
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#212529', letterSpacing: '0.5px', marginBottom: '6px' }}>Header</div>
                                <div style={{ fontSize: '10px', color: '#212529', marginBottom: '3px', fontWeight: '500' }}>Department</div>
                                <input
                                    type="text"
                                    value={settings.headerDepartment}
                                    onChange={e => update({ headerDepartment: e.target.value })}
                                    style={{ width: '100%', fontSize: '11px', padding: '3px 6px', border: '1px solid #ced4da', boxSizing: 'border-box', color: '#000' }}
                                    placeholder="e.g. Produksi"
                                />
                            </div>
                            <div style={{ fontSize: '10px', color: '#888', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
                                4 cards per A4. Materials show only lines assigned to each WO's routing step.
                            </div>
                        </div>

                        {/* Preview */}
                        <div style={{ flex: 1, background: '#ccc', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            {pages.map((pageWOs, pi) => (
                                <div key={pi}>
                                    <div style={{ fontSize: '10px', color: '#555', marginBottom: '4px', textAlign: 'center' }}>
                                        Page {pi + 1} of {pages.length}
                                    </div>
                                    <div style={{ background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', padding: '8px', width: '520px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                            {pageWOs.map(wo => renderCard(wo, false))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {isClassicBool ? (
                            <>
                                <button style={xpBtnGrey} onClick={onClose}>Close</button>
                                <button style={xpBtnGreen} onClick={doPrint}>Print</button>
                            </>
                        ) : (
                            <>
                                <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                <button className="btn btn-sm btn-success" onClick={doPrint}>
                                    <i className="bi bi-printer me-1" />Print {selectedWOs.length} WOs
                                </button>
                            </>
                        )}
                    </div>
            </PrintModalShell>

            {createPortal(
                <div className="wo-bulk-print-portal" style={{ display: 'none' }}>
                    {pages.map((pageWOs, pi) => (
                        <div key={pi} className="wo-bulk-page-group">
                            {pageWOs.map(wo => renderCard(wo, true))}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
}
