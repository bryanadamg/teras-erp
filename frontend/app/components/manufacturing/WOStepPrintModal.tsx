'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import KartuKerjaCard from './KartuKerjaCard';
import PrintModalShell from '../shared/PrintModalShell';

interface StepPrintSettings {
    showMaterials: boolean;
    showFillFields: boolean;
    showSignature: boolean;
    headerDepartment: string;
}

const defaultSettings: StepPrintSettings = {
    showMaterials: true,
    showFillFields: true,
    showSignature: true,
    headerDepartment: '',
};

export default function WOStepPrintModal({
    workOrder,
    parentMO,
    onClose,
}: {
    workOrder: any;
    parentMO: any;
    onClose: () => void;
}) {
    const { companyProfile, attributes } = useData() as any;
    const { uiStyle } = useTheme();
    const isClassic = uiStyle === 'classic';

    const [qrDataUrl, setQrDataUrl] = useState('');
    const [settings, setSettings] = useState<StepPrintSettings>(() => {
        try {
            const saved = localStorage.getItem('wo_step_print_settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch { return defaultSettings; }
    });

    useEffect(() => {
        document.body.classList.add('wo-step-print-active');
        return () => { document.body.classList.remove('wo-step-print-active'); };
    }, []);

    useEffect(() => {
        QRCode.toDataURL(workOrder.id, { margin: 4, width: 320, errorCorrectionLevel: 'H' })
            .then(setQrDataUrl)
            .catch(() => {});
    }, [workOrder.id]);

    const update = (patch: Partial<StepPrintSettings>) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        try { localStorage.setItem('wo_step_print_settings', JSON.stringify(next)); } catch { /* noop */ }
    };

    const documentContent = (
        <KartuKerjaCard
            workOrder={workOrder}
            parentMO={parentMO}
            qrDataUrl={qrDataUrl}
            settings={settings}
            companyName={companyProfile?.name}
            attributes={attributes}
        />
    );

    const xpBtnGrey: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};
    const sectionLabelStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#212529', letterSpacing: '0.5px', marginBottom: '6px' };
    const toggleLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#212529', cursor: 'pointer' };
    const fieldLabelStyle: React.CSSProperties = { fontSize: '10px', color: '#212529', marginBottom: '3px', fontWeight: '500' };
    const fieldInputStyle: React.CSSProperties = { width: '100%', fontSize: '11px', padding: '3px 6px', border: '1px solid #ced4da', boxSizing: 'border-box', color: '#000' };

    return (
        <>
            <PrintModalShell title={`Print Kartu Kerja — ${workOrder.name} (${parentMO?.code})`} onClose={onClose} width="90vw" maxWidth={880} height="88vh">
                    <div style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
                        {/* Settings panel */}
                        <div style={{ width: '200px', minWidth: '200px', borderRight: '1px solid #dee2e6', background: '#f8f9fa', padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <div style={sectionLabelStyle}>Sections</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <label style={toggleLabelStyle}>
                                        <input type="checkbox" checked={settings.showMaterials} onChange={e => update({ showMaterials: e.target.checked })} />
                                        Materials Table
                                    </label>
                                    <label style={toggleLabelStyle}>
                                        <input type="checkbox" checked={settings.showSignature} onChange={e => update({ showSignature: e.target.checked })} />
                                        Signature Line
                                    </label>
                                </div>
                            </div>
                            <hr style={{ margin: '0', borderColor: '#dee2e6' }} />
                            <div>
                                <div style={sectionLabelStyle}>Header</div>
                                <div>
                                    <div style={fieldLabelStyle}>Department</div>
                                    <input type="text" value={settings.headerDepartment} onChange={e => update({ headerDepartment: e.target.value })} style={fieldInputStyle} placeholder="e.g. Produksi" />
                                </div>
                            </div>
                            <div style={{ fontSize: '10px', color: '#555', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
                                QR encodes the WO ID. Scan in the ERP Scanner tab to open the log form.
                            </div>
                        </div>

                        {/* Preview — sized to A6 portrait (105×148mm) */}
                        <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                            <div className="wo-print-paper wo-step-card" style={{ background: '#fff', width: '378px', minHeight: '535px', padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', color: '#000', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                                {documentContent}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {isClassic ? (
                            <>
                                <button style={xpBtnGrey} onClick={onClose}>Close</button>
                                <button style={xpBtnGreen} onClick={() => { window.addEventListener('afterprint', onClose, { once: true }); window.print(); }}>Print</button>
                            </>
                        ) : (
                            <>
                                <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                <button className="btn btn-sm btn-success" onClick={() => { window.addEventListener('afterprint', onClose, { once: true }); window.print(); }}>
                                    <i className="bi bi-printer me-1"></i>Print
                                </button>
                            </>
                        )}
                    </div>
            </PrintModalShell>

            {createPortal(
                <div className="wo-print-paper-portal" style={{ display: 'none' }}>
                    <div className="wo-print-paper wo-step-card" style={{ background: '#fff', width: '100%', color: '#000', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column' }}>
                        {documentContent}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
