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
        document.body.classList.add('wo-step-print-active');
        return () => { document.body.classList.remove('wo-step-print-active'); };
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

    const allBomLines: any[] = parentMO?.bom?.lines || [];
    const bomOps: any[] = parentMO?.bom?.operations || [];
    const woQty = workOrder.qty ?? 0;
    const woEnds = workOrder.ends ?? null;
    const doneQty = workOrder.qty_completed_total ?? 0;
    const pct = woQty > 0 ? Math.min(100, Math.round((doneQty / woQty) * 100)) : 0;
    const displayCompany = companyProfile?.name || '';

    // Components for THIS WO's step: BOM lines tied to an operation on this WO's work center.
    // Fall back to all BOM lines when the step has no material mapped (e.g. un-routed BOM / beam WO).
    const woWcId = String(workOrder.work_center_id || '');
    const stepOpIds = new Set(
        bomOps.filter((op: any) => woWcId && String(op.work_center_id || '') === woWcId).map((op: any) => String(op.id))
    );
    const stepLines = allBomLines.filter((l: any) => l.bom_operation_id && stepOpIds.has(String(l.bom_operation_id)));
    const usedAllLines = stepLines.length === 0;
    const bomLines = usedAllLines ? allBomLines : stepLines;

    // Actual consumed materials logged against this WO (summed across its completions)
    const actualByItem: Record<string, number> = {};
    (parentMO?.completions || [])
        .filter((c: any) => String(c.work_order_id || '') === String(workOrder.id))
        .forEach((c: any) => (c.actual_items || []).forEach((ai: any) => {
            const k = String(ai.item_id);
            actualByItem[k] = (actualByItem[k] || 0) + Number(ai.qty_used || 0);
        }));

    const gridLbl: React.CSSProperties = { background: '#f0f0f0', border: '1px solid #bbb', padding: '3px 6px', fontSize: '9px', color: '#333', fontWeight: 'bold', whiteSpace: 'nowrap' };
    const gridVal: React.CSSProperties = { border: '1px solid #bbb', padding: '3px 6px', fontSize: '11px', color: '#000' };
    const heroLbl: React.CSSProperties = { fontSize: '8px', color: '#555', fontWeight: 'bold', letterSpacing: '0.5px' };

    const documentContent = (
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', lineHeight: 1.3, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

            {/* Header: title + identity fill the top-left; QR right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '5px', marginBottom: '6px', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', lineHeight: 1.05 }}>KARTU KERJA</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}>{parentMO?.code || '—'}</div>
                    {displayCompany && <div style={{ fontSize: '8px', color: '#555', fontWeight: 'bold' }}>{displayCompany}</div>}
                    <div style={{ fontSize: '8px', color: '#666' }}>
                        {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {settings.headerDepartment ? ` · ${settings.headerDepartment}` : ''}
                    </div>
                </div>
                {/* QR — operator scans to open the log form */}
                <div style={{ border: '2px solid #000', padding: '2px', flexShrink: 0, textAlign: 'center' }}>
                    {qrDataUrl
                        ? <img src={qrDataUrl} alt="QR" style={{ width: '84px', height: '84px', display: 'block' }} />
                        : <div style={{ width: '84px', height: '84px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: '#888' }}>...</div>
                    }
                    <div style={{ fontSize: '6px', color: '#555', marginTop: '1px' }}>Scan in ERP Scanner</div>
                </div>
            </div>

            {/* OPERASI hero — primary operator read */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', border: '2px solid #000', padding: '4px 8px', marginBottom: '6px' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={heroLbl}>OPERASI</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', lineHeight: 1.05, wordBreak: 'break-word' }}>{workOrder.name}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={heroLbl}>WORK CENTER</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{workOrder.work_center_name || '—'}</div>
                    <div style={{ fontSize: '9px', color: '#555' }}>Step {workOrder.sequence}</div>
                </div>
            </div>

            {/* Qty hero — kg + ends, large for the floor */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <div style={{ flex: 1, border: '1px solid #999', padding: '3px 8px' }}>
                    <div style={heroLbl}>QTY (KG)</div>
                    <div style={{ fontSize: '17px', fontWeight: 'bold' }}>
                        {woQty > 0 ? woQty : '—'}<span style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{woQty > 0 ? ' kg' : ''}</span>
                    </div>
                </div>
                <div style={{ flex: 1, border: '1px solid #999', padding: '3px 8px' }}>
                    <div style={heroLbl}>QTY (ENDS / UTAS)</div>
                    <div style={{ fontSize: '17px', fontWeight: 'bold' }}>
                        {woEnds != null ? woEnds : '—'}<span style={{ fontSize: '9px', color: '#666', fontWeight: 'normal' }}>{woEnds != null ? ' utas' : ''}</span>
                    </div>
                </div>
            </div>

            {/* Identity grid — Produk / Status / Progress */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
                <tbody>
                    <tr>
                        <td style={{ ...gridLbl, width: '24%' }}>Produk</td>
                        <td colSpan={3} style={{ ...gridVal, fontWeight: 'bold' }}>{parentMO?.item_name || '—'}</td>
                    </tr>
                    <tr>
                        <td style={{ ...gridLbl, width: '24%' }}>Status</td>
                        <td style={{ ...gridVal, width: '26%' }}>{workOrder.status}</td>
                        <td style={{ ...gridLbl, width: '22%' }}>Progress</td>
                        <td style={gridVal}>
                            {woQty > 0 ? (
                                <span>{doneQty.toFixed(2)} / {woQty} <span style={{ color: '#888' }}>({pct}%)</span></span>
                            ) : '—'}
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Materials — components processed/needed for this WO */}
            {settings.showMaterials && bomLines.length > 0 && (
                <>
                    <div style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.3px', marginBottom: '2px' }}>
                        {usedAllLines ? 'Material (berdasarkan BOM)' : 'Komponen Operasi Ini'}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginBottom: '6px' }}>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'left' }}>Komponen</th>
                                <th style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', width: '22%' }}>Perlu</th>
                                <th style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', width: '22%' }}>Aktual</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bomLines.map((line: any) => {
                                const reqQty = woQty > 0
                                    ? (parseFloat(line.percentage) > 0 ? (woQty * parseFloat(line.percentage)) / 100 : woQty * parseFloat(line.qty || 0))
                                    : null;
                                const actual = actualByItem[String(line.item_id)];
                                return (
                                    <tr key={line.id}>
                                        <td style={{ border: '1px solid #bbb', padding: '2px 5px' }}>
                                            <span style={{ fontFamily: 'monospace', color: '#555', marginRight: '4px', fontSize: '8px' }}>
                                                {line.item_code || ''}
                                            </span>
                                            {line.item_name || line.item_id}
                                        </td>
                                        <td style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', fontWeight: 'bold' }}>
                                            {reqQty != null ? reqQty.toFixed(2) : '—'}
                                        </td>
                                        <td style={{ border: '1px solid #bbb', padding: '2px 5px', textAlign: 'right', fontWeight: actual != null ? 'bold' : 'normal' }}>
                                            {actual != null ? actual.toFixed(2) : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}

            {/* Spacer — pushes fill-in + signature to the bottom of the A6 card */}
            <div style={{ flexGrow: 1, minHeight: '6px' }} />

            {/* Fill-in fields */}
            {settings.showFillFields && (
                <div style={{ borderTop: '1px solid #ccc', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '11px', marginBottom: '6px' }}>
                    {['Output Aktual', 'Operator', 'Tgl Selesai'].map(label => (
                        <div key={label} style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap', minWidth: '78px' }}>{label}:</span>
                            <div style={{ flex: 1, borderBottom: '1px solid #333', height: '15px' }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Signature + footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #ccc', paddingTop: '6px' }}>
                <div style={{ fontSize: '6px', color: '#999', lineHeight: 1.3 }}>
                    {workOrder.code || `Step ${workOrder.sequence}`}<br />ID: {workOrder.id}
                </div>
                {settings.showSignature && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #000', height: '26px', width: '100px', marginBottom: '2px' }} />
                        <div style={{ fontSize: '8px', fontWeight: 'bold' }}>ACC TEKNISI</div>
                    </div>
                )}
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
                </div>
            </div>

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
