'use client';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';

const STATIC_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000').replace(/\/api$/, '');

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
    const { companyProfile } = useData() as any;
    const { uiStyle } = useTheme();
    const isClassic = uiStyle === 'classic';

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
                QRCode.toDataURL(wo.id, { margin: 1, width: 200 })
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

    const getStepMaterials = (wo: any, parentMO: any): any[] => {
        const ops: any[] = parentMO?.bom?.operations || [];
        const op = ops.find(o => o.sequence === wo.sequence);
        if (!op) return [];
        return (parentMO?.bom?.lines || []).filter((l: any) => l.bom_operation_id === op.id);
    };

    const displayCompany = companyProfile?.name || '';

    const renderCard = (wo: any, forPortal: boolean) => {
        const parentMO = manufacturingOrders.find(m => m.id === wo.mo_id);
        const woQty = wo.qty ?? 0;
        const stepMaterials = settings.showMaterials ? getStepMaterials(wo, parentMO) : [];
        const qrUrl = qrUrls[wo.id] || '';

        const lbl: React.CSSProperties = {
            background: '#f0f0f0', border: '1px solid #ccc',
            padding: '2px 4px', fontSize: '7px', color: '#444', fontWeight: 'bold', whiteSpace: 'nowrap',
        };
        const val: React.CSSProperties = { border: '1px solid #ccc', padding: '2px 4px', fontSize: '7px', color: '#000' };

        return (
            <div key={wo.id} style={{
                border: '1px solid #888',
                padding: forPortal ? '4mm' : '8px',
                fontFamily: 'Arial, sans-serif',
                fontSize: '7px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                breakInside: 'avoid' as any,
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '4px', marginBottom: '5px' }}>
                    <div>
                        {companyProfile?.logo_url ? (
                            <img src={`${STATIC_BASE}${companyProfile.logo_url}`} alt="" style={{ maxHeight: '26px', maxWidth: '90px', objectFit: 'contain', display: 'block', marginBottom: '1px' }} />
                        ) : (
                            <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#003080' }}>{displayCompany}</div>
                        )}
                        <div style={{ fontSize: '6px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#555', marginTop: '1px' }}>KARTU KERJA</div>
                        {settings.headerDepartment && <div style={{ fontSize: '6px', color: '#555' }}>Dept: {settings.headerDepartment}</div>}
                    </div>
                    <div style={{ border: '2px solid #000', padding: '2px', flexShrink: 0, textAlign: 'center' }}>
                        {qrUrl
                            ? <img src={qrUrl} alt="QR" style={{ width: '58px', height: '58px', display: 'block' }} />
                            : <div style={{ width: '58px', height: '58px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6px', color: '#888' }}>...</div>
                        }
                        <div style={{ fontSize: '5px', color: '#555', marginTop: '1px' }}>Scan to Log</div>
                    </div>
                </div>

                {/* Identity grid */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
                    <tbody>
                        <tr>
                            <td style={{ ...lbl, width: '22%' }}>OPERASI</td>
                            <td colSpan={3} style={{ ...val, fontWeight: 'bold', fontSize: '9px' }}>{wo.name}</td>
                        </tr>
                        <tr>
                            <td style={lbl}>Step #</td>
                            <td style={{ ...val, width: '12%' }}>{wo.sequence}</td>
                            <td style={{ ...lbl, width: '22%' }}>Work Center</td>
                            <td style={val}>{wo.work_center_name || '—'}</td>
                        </tr>
                        <tr>
                            <td style={lbl}>No. SPK</td>
                            <td colSpan={3} style={{ ...val, fontFamily: 'monospace', fontSize: '6px' }}>{parentMO?.code || wo.mo_code || '—'}</td>
                        </tr>
                        <tr>
                            <td style={lbl}>Produk</td>
                            <td colSpan={3} style={val}>{parentMO?.item_name || wo.item_name || '—'}</td>
                        </tr>
                        <tr>
                            <td style={lbl}>Target Qty</td>
                            <td colSpan={3} style={{ ...val, fontWeight: 'bold' }}>{woQty > 0 ? woQty : '—'}</td>
                        </tr>
                    </tbody>
                </table>

                {/* Step materials */}
                {settings.showMaterials && stepMaterials.length > 0 && (
                    <>
                        <div style={{ fontSize: '6px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', borderTop: '1px solid #ccc', paddingTop: '3px', marginBottom: '2px' }}>
                            Material (step)
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6px', marginBottom: '4px' }}>
                            <thead>
                                <tr style={{ background: '#f0f0f0' }}>
                                    <th style={{ border: '1px solid #ccc', padding: '1px 3px', textAlign: 'left' }}>Komponen</th>
                                    <th style={{ border: '1px solid #ccc', padding: '1px 3px', textAlign: 'right', width: '22%' }}>Req Qty</th>
                                    <th style={{ border: '1px solid #ccc', padding: '1px 3px', width: '20%' }}>Aktual</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stepMaterials.map((line: any) => {
                                    const reqQty = woQty > 0
                                        ? (parseFloat(line.percentage) > 0
                                            ? (woQty * parseFloat(line.percentage)) / 100
                                            : woQty * parseFloat(line.qty || 0))
                                        : null;
                                    return (
                                        <tr key={line.id}>
                                            <td style={{ border: '1px solid #ccc', padding: '1px 3px' }}>
                                                <span style={{ fontFamily: 'monospace', color: '#555', marginRight: '3px', fontSize: '5px' }}>{line.item_code || ''}</span>
                                                {line.item_name || line.item_id}
                                            </td>
                                            <td style={{ border: '1px solid #ccc', padding: '1px 3px', textAlign: 'right', fontWeight: 'bold' }}>
                                                {reqQty != null ? reqQty.toFixed(2) : '—'}
                                            </td>
                                            <td style={{ border: '1px solid #ccc', padding: '1px 3px' }} />
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </>
                )}

                {/* Fill-in fields */}
                {settings.showFillFields && (
                    <div style={{ borderTop: '1px solid #ccc', paddingTop: '4px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        {['Output Aktual', 'Operator', 'Tgl Selesai'].map(label => (
                            <div key={label} style={{ display: 'flex', alignItems: 'flex-end', gap: '5px' }}>
                                <span style={{ fontSize: '6px', fontWeight: 'bold', whiteSpace: 'nowrap', minWidth: '70px' }}>{label}:</span>
                                <div style={{ flex: 1, borderBottom: '1px solid #333', height: '12px' }} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Signature */}
                {settings.showSignature && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid #ccc', paddingTop: '5px', display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ borderBottom: '1px solid #000', height: '20px', width: '70px', marginBottom: '2px' }} />
                            <div style={{ fontSize: '6px', fontWeight: 'bold' }}>ACC TEKNISI</div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: '4px', fontSize: '5px', color: '#bbb', borderTop: '1px solid #eee', paddingTop: '2px' }}>
                    {wo.mo_code} · {wo.code || `Step ${wo.sequence}`} · {wo.id}
                </div>
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
    const xpBevelStyle: React.CSSProperties = isClassicBool ? { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf' } : {};
    const headerStyle: React.CSSProperties = isClassicBool
        ? { background: 'linear-gradient(to right, #0058e6, #08a5ff)', color: '#fff', font: 'bold 12px Tahoma', padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
        : {};
    const headerClass = isClassicBool ? '' : 'bg-primary text-white px-3 py-2 d-flex justify-content-between align-items-center';

    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={onClose}
            >
                <div
                    style={{ background: '#fff', width: '92vw', maxWidth: '960px', height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', ...xpBevelStyle }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={headerStyle} className={headerClass}>
                        <span>Bulk Print Kartu Kerja — {selectedWOs.length} WO</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '14px', cursor: 'pointer', lineHeight: '1', fontWeight: 'bold' }}>X</button>
                    </div>

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
                                        <input type="checkbox" checked={settings.showFillFields} onChange={e => update({ showFillFields: e.target.checked })} />
                                        Fill-in Fields
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
                                <button style={xpBtnGreen} onClick={() => { window.addEventListener('afterprint', onClose, { once: true }); window.print(); }}>Print</button>
                            </>
                        ) : (
                            <>
                                <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                <button className="btn btn-sm btn-success" onClick={() => { window.addEventListener('afterprint', onClose, { once: true }); window.print(); }}>
                                    <i className="bi bi-printer me-1" />Print {selectedWOs.length} WOs
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

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
