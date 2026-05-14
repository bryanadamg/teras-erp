'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';

const STATIC_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000').replace(/\/api$/, '');

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
    const { companyProfile } = useData() as any;
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
        document.body.classList.add('wo-print-preview-active');
        return () => { document.body.classList.remove('wo-print-preview-active'); };
    }, []);

    useEffect(() => {
        QRCode.toDataURL(workOrder.id, { margin: 1, width: 240 })
            .then(setQrDataUrl)
            .catch(() => {});
    }, [workOrder.id]);

    const update = (patch: Partial<StepPrintSettings>) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        try { localStorage.setItem('wo_step_print_settings', JSON.stringify(next)); } catch { /* noop */ }
    };

    const bomLines: any[] = parentMO?.bom?.lines || [];
    const woQty = workOrder.qty ?? 0;
    const doneQty = workOrder.qty_completed_total ?? 0;
    const pct = woQty > 0 ? Math.min(100, Math.round((doneQty / woQty) * 100)) : 0;
    const displayCompany = companyProfile?.name || '';

    const gridLbl: React.CSSProperties = { background: '#f0f0f0', border: '1px solid #ccc', padding: '2px 6px', fontSize: '8px', color: '#444', fontWeight: 'bold', whiteSpace: 'nowrap' };
    const gridVal: React.CSSProperties = { border: '1px solid #ccc', padding: '2px 6px', fontSize: '8px', color: '#000' };

    const documentContent = (
        <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#000', lineHeight: 1.4 }}>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '8px' }}>
                <div>
                    {companyProfile?.logo_url ? (
                        <img src={`${STATIC_BASE}${companyProfile.logo_url}`} alt="Logo" style={{ maxHeight: '40px', maxWidth: '140px', objectFit: 'contain', display: 'block', marginBottom: '2px' }} />
                    ) : (
                        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#003080' }}>{displayCompany}</div>
                    )}
                    {companyProfile?.address && <div style={{ fontSize: '7px', color: '#555' }}>{companyProfile.address}</div>}
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '15px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>KARTU KERJA</div>
                    <div style={{ fontSize: '7px', color: '#555', marginTop: '2px' }}>
                        {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                    {settings.headerDepartment && (
                        <div style={{ fontSize: '7px', color: '#555' }}>Dept: {settings.headerDepartment}</div>
                    )}
                </div>
                {/* Large QR — operator scans this to open the log form */}
                <div style={{ border: '2px solid #000', padding: '3px', flexShrink: 0, textAlign: 'center' }}>
                    {qrDataUrl
                        ? <img src={qrDataUrl} alt="QR" style={{ width: '90px', height: '90px', display: 'block' }} />
                        : <div style={{ width: '90px', height: '90px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#888' }}>Generating...</div>
                    }
                    <div style={{ fontSize: '6px', color: '#555', marginTop: '2px' }}>Scan in ERP Scanner</div>
                </div>
            </div>

            {/* Identity grid */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
                <tbody>
                    <tr>
                        <td style={{ ...gridLbl, width: '18%' }}>OPERASI</td>
                        <td colSpan={3} style={{ ...gridVal, fontWeight: 'bold', fontSize: '10px' }}>{workOrder.name}</td>
                    </tr>
                    <tr>
                        <td style={gridLbl}>Step #</td>
                        <td style={{ ...gridVal, width: '15%' }}>{workOrder.sequence}</td>
                        <td style={{ ...gridLbl, width: '18%' }}>Work Center</td>
                        <td style={gridVal}>{workOrder.work_center_name || '—'}</td>
                    </tr>
                    <tr>
                        <td style={gridLbl}>No. SPK</td>
                        <td style={{ ...gridVal, fontFamily: 'monospace' }}>{parentMO?.code || '—'}</td>
                        <td style={gridLbl}>Produk</td>
                        <td style={gridVal}>{parentMO?.item_name || '—'}</td>
                    </tr>
                    <tr>
                        <td style={gridLbl}>Target Qty</td>
                        <td style={{ ...gridVal, fontWeight: 'bold' }}>
                            {woQty > 0 ? `${woQty}` : '—'}
                        </td>
                        <td style={gridLbl}>Progress</td>
                        <td style={gridVal}>
                            {woQty > 0 ? (
                                <span>
                                    {doneQty.toFixed(2)} / {woQty}
                                    <span style={{ color: '#888', marginLeft: 4 }}>({pct}%)</span>
                                </span>
                            ) : '—'}
                        </td>
                    </tr>
                    <tr>
                        <td style={gridLbl}>Status</td>
                        <td style={gridVal}>{workOrder.status}</td>
                        <td style={gridLbl}>Tanggal Cetak</td>
                        <td style={{ ...gridVal, color: '#555' }}>{new Date().toLocaleString('id-ID')}</td>
                    </tr>
                </tbody>
            </table>

            {/* Materials */}
            {settings.showMaterials && bomLines.length > 0 && (
                <>
                    <div style={{ fontSize: '7px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.3px', marginBottom: '3px', borderTop: '1px solid #ccc', paddingTop: '5px' }}>
                        Material (berdasarkan BOM)
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px', marginBottom: '8px' }}>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'left' }}>Komponen</th>
                                <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'right', width: '20%' }}>Req. Qty</th>
                                <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'right', width: '20%' }}>Aktual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bomLines.map((line: any) => {
                                const reqQty = woQty > 0
                                    ? (parseFloat(line.percentage) > 0 ? (woQty * parseFloat(line.percentage)) / 100 : woQty * parseFloat(line.qty || 0))
                                    : null;
                                return (
                                    <tr key={line.id}>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 6px' }}>
                                            <span style={{ fontFamily: 'monospace', color: '#555', marginRight: '4px', fontSize: '7px' }}>
                                                {line.item_code || ''}
                                            </span>
                                            {line.item_name || line.item_id}
                                        </td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'right', fontWeight: 'bold' }}>
                                            {reqQty != null ? reqQty.toFixed(3) : '—'}
                                        </td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 6px' }} />
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}

            {/* Fill-in fields */}
            {settings.showFillFields && (
                <div style={{ borderTop: '1px solid #ccc', paddingTop: '6px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {['Output Aktual (qty)', 'Operator', 'Tanggal Selesai'].map(label => (
                        <div key={label} style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                            <span style={{ fontSize: '8px', fontWeight: 'bold', whiteSpace: 'nowrap', minWidth: '120px' }}>{label}:</span>
                            <div style={{ flex: 1, borderBottom: '1px solid #333', height: '14px' }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Signature */}
            {settings.showSignature && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #ccc', paddingTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #000', height: '28px', width: '100px', marginBottom: '2px' }} />
                        <div style={{ fontSize: '7px', fontWeight: 'bold' }}>ACC TEKNISI</div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: '8px', fontSize: '6px', color: '#999', borderTop: '1px solid #eee', paddingTop: '4px' }}>
                {parentMO?.code} · Step {workOrder.sequence}: {workOrder.name} · ID: {workOrder.id}
            </div>
        </div>
    );

    const headerStyle: React.CSSProperties = isClassic
        ? { background: 'linear-gradient(to right, #0058e6, #08a5ff)', color: '#fff', font: 'bold 12px Tahoma', padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
        : {};
    const headerClass = isClassic ? '' : 'bg-primary text-white px-3 py-2 d-flex justify-content-between align-items-center';
    const xpBtnGrey: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};
    const xpBevelStyle: React.CSSProperties = isClassic ? { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf' } : {};
    const sectionLabelStyle: React.CSSProperties = { fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#212529', letterSpacing: '0.5px', marginBottom: '6px' };
    const toggleLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#212529', cursor: 'pointer' };
    const fieldLabelStyle: React.CSSProperties = { fontSize: '10px', color: '#212529', marginBottom: '3px', fontWeight: '500' };
    const fieldInputStyle: React.CSSProperties = { width: '100%', fontSize: '11px', padding: '3px 6px', border: '1px solid #ced4da', boxSizing: 'border-box', color: '#000' };

    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={onClose}
            >
                <div
                    style={{ background: '#fff', width: '90vw', maxWidth: '880px', height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', ...xpBevelStyle }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={headerStyle} className={headerClass}>
                        <span>Print Kartu Kerja — {workOrder.name} ({parentMO?.code})</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '14px', cursor: 'pointer', lineHeight: '1', fontWeight: 'bold' }}>X</button>
                    </div>

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
                                        <input type="checkbox" checked={settings.showFillFields} onChange={e => update({ showFillFields: e.target.checked })} />
                                        Fill-in Fields
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

                        {/* Preview */}
                        <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: '16px', display: 'flex', justifyContent: 'center' }}>
                            <div className="wo-print-paper" style={{ background: '#fff', width: '100%', maxWidth: '520px', padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', fontSize: '9px', lineHeight: '1.5', color: '#000', fontFamily: 'Arial, sans-serif' }}>
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
                </div>
            </div>

            {createPortal(
                <div className="wo-print-paper-portal" style={{ display: 'none' }}>
                    <div className="wo-print-paper" style={{ background: '#fff', width: '100%', padding: '20px 24px', fontSize: '9px', lineHeight: '1.5', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                        {documentContent}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
