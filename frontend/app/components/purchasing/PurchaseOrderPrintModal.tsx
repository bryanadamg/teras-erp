'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface POPrintSettings {
    attn: string;
    contactTelp: string;
    contactFax: string;
    ssn: string;
    rateMode: 'kurs_pajak' | 'ktbi';
    kursPajak: string;
    ktbi: string;
    code: string;
    paymentTerm: string;
    category: string;
    vatPercent: number;
    discount: number;
    preparedBy: string;
    examinedBy: string;
    approvedBy: string;
    notes: string;
    showFooterNotes: boolean;
}

const DEFAULT_SETTINGS: POPrintSettings = {
    attn: '',
    contactTelp: '',
    contactFax: '',
    ssn: '',
    rateMode: 'kurs_pajak',
    kursPajak: '',
    ktbi: '',
    code: '',
    paymentTerm: '',
    category: '',
    vatPercent: 11,
    discount: 0,
    preparedBy: '',
    examinedBy: '',
    approvedBy: '',
    notes: '',
    showFooterNotes: true,
};

const SETTINGS_KEY = 'po_print_settings';

const FOOTER_NOTES = [
    'Please confirm before delivery',
    'Please sign and fax back to confirm the order',
    'Please fill in PO Number in your delivery note. If not, goods will be rejected.',
    'Please deliver the goods based on delivery schedule or special request',
    'Goods are accepted from Monday to Friday at 09:00 AM - 03:00 PM',
];

const MIN_TABLE_ROWS = 8;

const money = (n: number) =>
    (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (d: string | null | undefined) => {
    if (!d) return '';
    try {
        const dt = new Date(d);
        return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
    } catch { return ''; }
};

// Deterministic decorative barcode strip derived from the PO number (not a scannable symbology).
function Barcode({ value }: { value: string }) {
    const bars: { w: number; on: boolean }[] = [];
    const seed = value || 'PO';
    for (let i = 0; i < seed.length; i++) {
        const c = seed.charCodeAt(i);
        bars.push({ w: (c % 3) + 1, on: true });
        bars.push({ w: (c % 2) + 1, on: false });
        bars.push({ w: ((c >> 2) % 3) + 1, on: true });
        bars.push({ w: 1, on: false });
    }
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 42, gap: 0 }}>
            {bars.map((b, i) => (
                <div key={i} style={{ width: b.w * 1.4, height: '100%', background: b.on ? '#000' : 'transparent' }} />
            ))}
        </div>
    );
}

function PODocument({
    po, companyProfile, items, attributes, partners, settings,
}: {
    po: any;
    companyProfile: any;
    items: any[];
    attributes: any[];
    partners: any[];
    settings: POPrintSettings;
}) {
    const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api').replace(/\/api$/, '');

    const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;
    const getItemUOM = (id: string) => items.find((i: any) => i.id === id)?.uom || '';
    const supplier = partners.find((p: any) => p.id === po.supplier_id);
    const getAttributeValueName = (valId: string) => {
        for (const attr of attributes) {
            const val = attr.values?.find((v: any) => v.id === valId);
            if (val) return val.value;
        }
        return '';
    };

    const lineTotal = (line: any) => (Number(line.qty) || 0) * (Number(line.unit_price) || 0);
    const subtotal = po.lines.reduce((s: number, l: any) => s + lineTotal(l), 0);
    const discount = Number(settings.discount) || 0;
    const vat = (subtotal - discount) * (Number(settings.vatPercent) || 0) / 100;
    const total = subtotal - discount + vat;

    const paddedLines = [
        ...po.lines,
        ...Array(Math.max(0, MIN_TABLE_ROWS - po.lines.length)).fill(null),
    ];

    const border = '1px solid #000';
    const cell: React.CSSProperties = { border, padding: '2px 5px', verticalAlign: 'top' };
    const labelCell: React.CSSProperties = { whiteSpace: 'nowrap', verticalAlign: 'top', paddingRight: 4 };

    return (
        <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', color: '#000', lineHeight: 1.35 }}>

            {/* Company Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 6, borderBottom: '1.5px solid #000' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0 }}>
                        {companyProfile?.logo_url ? (
                            <img src={`${API_BASE}${companyProfile.logo_url}`} alt="Logo"
                                style={{ maxHeight: 56, maxWidth: 64, objectFit: 'contain', display: 'block' }} />
                        ) : (
                            <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 13 }}>BIE</div>
                        )}
                    </div>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: 15, letterSpacing: '0.3px' }}>{companyProfile?.name || 'PT BOLA INTAN ELASTIC'}</div>
                        {companyProfile?.address && <div style={{ whiteSpace: 'pre-line' }}>{companyProfile.address}</div>}
                        <div>
                            {companyProfile?.phone && <span>Telp: {companyProfile.phone}</span>}
                            {companyProfile?.fax && <span>{companyProfile?.phone ? '  ' : ''}FAX: {companyProfile.fax}</span>}
                        </div>
                        {companyProfile?.email && <div>Email: {companyProfile.email}</div>}
                    </div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                    <Barcode value={po.po_number} />
                    <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 2 }}>PURCHASE ORDER</div>
                </div>
            </div>

            {/* Supplier / Contact / PO meta block */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                <tbody>
                    <tr>
                        {/* Supplier */}
                        <td style={{ ...cell, width: '46%' }}>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 4 }}>SUPPLIER</div>
                            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <tbody>
                                    <tr><td style={labelCell}>Attn</td><td>: {settings.attn}</td></tr>
                                    <tr><td style={labelCell}>Company</td><td>: {supplier?.name || ''}</td></tr>
                                    <tr><td style={labelCell}>Address</td><td style={{ whiteSpace: 'pre-line' }}>: {supplier?.address || ''}</td></tr>
                                </tbody>
                            </table>
                        </td>
                        {/* Contact Person */}
                        <td style={{ ...cell, width: '27%' }}>
                            <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 4 }}>CONTACT PERSON</div>
                            <div>Telp : {settings.contactTelp}</div>
                            <div style={{ marginTop: 10 }}>Fax : {settings.contactFax}</div>
                        </td>
                        {/* PO meta */}
                        <td style={{ ...cell, width: '27%', padding: 0 }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%', height: '100%' }}>
                                <tbody>
                                    <tr><td style={{ ...cell, fontWeight: 'bold' }}>PO NUMBER :</td><td style={{ ...cell, textAlign: 'right' as const, fontWeight: 'bold' }}>{po.po_number}</td></tr>
                                    <tr><td style={{ ...cell, fontWeight: 'bold' }}>SSN :</td><td style={{ ...cell, textAlign: 'right' as const }}>{settings.ssn}</td></tr>
                                    <tr><td style={{ ...cell, fontWeight: 'bold' }}>PO DATE :</td><td style={{ ...cell, textAlign: 'right' as const }}>{formatDate(po.order_date)}</td></tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Left meta strip */}
            <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: border, borderRight: border, borderBottom: border, fontSize: '9px' }}>
                <tbody>
                    {([
                        ['Email', companyProfile?.email || ''],
                        settings.rateMode === 'ktbi' ? ['KTBI', settings.ktbi] : ['Kurs Pajak', settings.kursPajak],
                        ['Code', settings.code],
                        ['Payment', settings.paymentTerm],
                        ['Category', settings.category],
                    ] as [string, string][]).map(([label, value]) => (
                        <tr key={label}>
                            <td style={{ width: 80, paddingLeft: 5, fontWeight: 500 }}>{label}</td>
                            <td>: {value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Items table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginTop: -1 }}>
                <thead>
                    <tr>
                        <th style={{ ...cell, textAlign: 'center', width: '5%' }} rowSpan={2}>No</th>
                        <th style={{ ...cell, textAlign: 'center', width: '37%' }}>DESCRIPTION</th>
                        <th style={{ ...cell, textAlign: 'center', width: '13%' }} rowSpan={2}>Qty</th>
                        <th style={{ ...cell, textAlign: 'center', width: '15%' }}>Price<br />( Rp )</th>
                        <th style={{ ...cell, textAlign: 'center', width: '17%' }}>Total<br />( Rp )</th>
                        <th style={{ ...cell, textAlign: 'center', width: '13%' }} rowSpan={2}>Deadline</th>
                    </tr>
                    <tr>
                        <th style={{ ...cell, textAlign: 'center' }}>Item Description</th>
                        <th style={{ ...cell }}>&nbsp;</th>
                        <th style={{ ...cell }}>&nbsp;</th>
                    </tr>
                </thead>
                <tbody>
                    {paddedLines.map((line: any, idx: number) => (
                        <tr key={idx}>
                            <td style={{ ...cell, textAlign: 'center', height: line ? 'auto' : 26 }}>{line ? idx + 1 : ''}</td>
                            <td style={{ ...cell }}>
                                {line && (
                                    <>
                                        <div style={{ fontWeight: 'bold' }}>{getItemName(line.item_id)}</div>
                                        {(line.attribute_value_ids || []).map((vid: string) => (
                                            <div key={vid} style={{ marginTop: 6 }}>{getAttributeValueName(vid)}</div>
                                        ))}
                                    </>
                                )}
                                {!line && <span>&nbsp;</span>}
                            </td>
                            <td style={{ ...cell, textAlign: 'center' }}>{line ? `${Number(line.qty).toLocaleString('en-US')}  ${getItemUOM(line.item_id)}`.trim() : ''}</td>
                            <td style={{ ...cell, textAlign: 'right' as const }}>{line && line.unit_price != null ? money(Number(line.unit_price)) : ''}</td>
                            <td style={{ ...cell, textAlign: 'right' as const }}>{line && line.unit_price != null ? money(lineTotal(line)) : ''}</td>
                            <td style={{ ...cell, textAlign: 'center' }}>{line ? formatDate(line.due_date) : ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Notes + totals */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginTop: -1 }}>
                <tbody>
                    <tr>
                        <td style={{ ...cell, width: '58%', verticalAlign: 'top' }} rowSpan={4}>
                            <div style={{ fontWeight: 'bold' }}>Notes</div>
                            <div style={{ whiteSpace: 'pre-line', marginTop: 2 }}>{settings.notes || po.notes || ''}</div>
                        </td>
                        <td style={{ ...cell, width: '20%', fontWeight: 'bold' }}>Subtotal</td>
                        <td style={{ ...cell, textAlign: 'right' as const }}>Rp&nbsp;&nbsp;{money(subtotal)}</td>
                    </tr>
                    <tr>
                        <td style={{ ...cell, fontWeight: 'bold' }}>Discount</td>
                        <td style={{ ...cell, textAlign: 'right' as const }}>Rp&nbsp;&nbsp;{discount ? money(discount) : ''}</td>
                    </tr>
                    <tr>
                        <td style={{ ...cell, fontWeight: 'bold' }}>VAT {settings.vatPercent}%</td>
                        <td style={{ ...cell, textAlign: 'right' as const }}>Rp&nbsp;&nbsp;{money(vat)}</td>
                    </tr>
                    <tr>
                        <td style={{ ...cell, fontWeight: 'bold' }}>Total</td>
                        <td style={{ ...cell, textAlign: 'right' as const, fontWeight: 'bold' }}>Rp&nbsp;&nbsp;{money(total)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Signatures */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', marginTop: 8 }}>
                <tbody>
                    <tr>
                        {[
                            ['Prepared by', settings.preparedBy],
                            ['Examined by', settings.examinedBy],
                            ['Approved by', settings.approvedBy],
                            ['Supplier', supplier?.name || ''],
                        ].map(([label, name], i) => (
                            <td key={i} style={{ width: '25%', textAlign: 'center', verticalAlign: 'top', padding: '0 6px' }}>
                                <div style={{ marginBottom: 38 }}>{label}</div>
                                <div style={{ fontWeight: 'bold' }}>{name}</div>
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>

            {/* Footer notes */}
            {settings.showFooterNotes && (
                <div style={{ marginTop: 14, fontSize: '8.5px' }}>
                    {FOOTER_NOTES.map((note, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 1 }}>
                            <span style={{ width: 28, flexShrink: 0 }}>{i === 0 ? 'Note' : '-'}</span>
                            <span style={{ flexShrink: 0 }}>:</span>
                            <span>{note}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function PurchaseOrderPrintModal({
    po, onClose, currentStyle, companyProfile, items, attributes, partners,
}: {
    po: any;
    onClose: () => void;
    currentStyle: string;
    companyProfile: any;
    items: any[];
    attributes: any[];
    partners: any[];
}) {
    const isClassic = currentStyle === 'classic';

    const [settings, setSettings] = useState<POPrintSettings>(() => {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
        } catch { return DEFAULT_SETTINGS; }
    });

    const update = (patch: Partial<POPrintSettings>) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    };

    useEffect(() => {
        document.body.classList.add('po-print-preview-active');
        return () => { document.body.classList.remove('po-print-preview-active'); };
    }, []);

    const handlePrint = () => {
        const handler = () => onClose();
        window.addEventListener('afterprint', handler, { once: true });
        window.print();
    };

    const headerStyle: React.CSSProperties = isClassic
        ? { background: 'linear-gradient(to right, #0058e6, #08a5ff)', color: '#fff', fontFamily: 'Tahoma', fontWeight: 'bold', fontSize: 12, padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
        : {};
    const headerClass = isClassic ? '' : 'bg-primary text-white px-3 py-2 d-flex justify-content-between align-items-center';

    const xpBtnGrey: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: 11, padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer', color: '#000' }
        : {};
    const xpBtnGreen: React.CSSProperties = isClassic
        ? { fontFamily: 'Tahoma', fontSize: 11, padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
        : {};

    const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' as const, color: '#111', letterSpacing: '0.5px', marginBottom: 6 };
    const fieldLabel: React.CSSProperties = { fontSize: 10, color: '#111', marginBottom: 3, fontWeight: 500 };
    const fieldInput: React.CSSProperties = { width: '100%', fontSize: 11, padding: '3px 6px', border: '1px solid #ced4da', boxSizing: 'border-box' as const, color: '#000' };

    const docContent = (
        <PODocument
            po={po}
            companyProfile={companyProfile}
            items={items}
            attributes={attributes}
            partners={partners}
            settings={settings}
        />
    );

    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={onClose}
            >
                <div
                    style={{ background: '#fff', width: '92vw', maxWidth: 1020, height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div style={headerStyle} className={headerClass}>
                        <span>Print Purchase Order — {po.po_number}</span>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 16, cursor: 'pointer', lineHeight: 1, fontWeight: 'bold' }}>X</button>
                    </div>

                    {/* Body */}
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                        {/* LEFT — settings panel */}
                        <div style={{ width: 230, minWidth: 230, borderRight: '1px solid #dee2e6', background: '#f8f9fa', padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

                            <div>
                                <div style={sectionLabel}>Contact Person</div>
                                <div style={fieldLabel}>Attn</div>
                                <input style={fieldInput} value={settings.attn} onChange={e => update({ attn: e.target.value })} placeholder="e.g. Pak Nicolas" />
                                <div style={{ ...fieldLabel, marginTop: 6 }}>Telp</div>
                                <input style={fieldInput} value={settings.contactTelp} onChange={e => update({ contactTelp: e.target.value })} placeholder="e.g. 021 5869948" />
                                <div style={{ ...fieldLabel, marginTop: 6 }}>Fax</div>
                                <input style={fieldInput} value={settings.contactFax} onChange={e => update({ contactFax: e.target.value })} placeholder="e.g. 021 5868012" />
                            </div>

                            <hr style={{ margin: 0, borderColor: '#dee2e6' }} />

                            <div>
                                <div style={sectionLabel}>PO Details</div>
                                <div style={{ marginBottom: 6 }}>
                                    <div style={fieldLabel}>SSN</div>
                                    <input style={fieldInput} value={settings.ssn} onChange={e => update({ ssn: e.target.value })} placeholder="e.g. BI 084/KMK/26/06/09" />
                                </div>
                                <div style={{ marginBottom: 6 }}>
                                    <div style={fieldLabel}>Rate Variant</div>
                                    <select style={fieldInput} value={settings.rateMode} onChange={e => update({ rateMode: e.target.value as POPrintSettings['rateMode'] })}>
                                        <option value="kurs_pajak">Kurs Pajak</option>
                                        <option value="ktbi">KTBI</option>
                                    </select>
                                </div>
                                {settings.rateMode === 'ktbi' ? (
                                    <div style={{ marginBottom: 6 }}>
                                        <div style={fieldLabel}>KTBI</div>
                                        <input style={fieldInput} value={settings.ktbi} onChange={e => update({ ktbi: e.target.value })} placeholder="e.g. KTBI value" />
                                    </div>
                                ) : (
                                    <div style={{ marginBottom: 6 }}>
                                        <div style={fieldLabel}>Kurs Pajak</div>
                                        <input style={fieldInput} value={settings.kursPajak} onChange={e => update({ kursPajak: e.target.value })} placeholder="e.g. Rp 17.805 (09.06.26)" />
                                    </div>
                                )}
                                {([
                                    ['Code', 'code', ''],
                                    ['Payment', 'paymentTerm', 'e.g. Net 45 days'],
                                    ['Category', 'category', 'e.g. dsc'],
                                ] as [string, keyof POPrintSettings, string][]).map(([label, key, ph]) => (
                                    <div key={key} style={{ marginBottom: 6 }}>
                                        <div style={fieldLabel}>{label}</div>
                                        <input style={fieldInput} value={settings[key] as string} onChange={e => update({ [key]: e.target.value } as any)} placeholder={ph} />
                                    </div>
                                ))}
                            </div>

                            <hr style={{ margin: 0, borderColor: '#dee2e6' }} />

                            <div>
                                <div style={sectionLabel}>Totals</div>
                                <div style={fieldLabel}>VAT %</div>
                                <input type="number" style={fieldInput} value={settings.vatPercent} onChange={e => update({ vatPercent: parseFloat(e.target.value) || 0 })} />
                                <div style={{ ...fieldLabel, marginTop: 6 }}>Discount (Rp)</div>
                                <input type="number" style={fieldInput} value={settings.discount} onChange={e => update({ discount: parseFloat(e.target.value) || 0 })} />
                            </div>

                            <hr style={{ margin: 0, borderColor: '#dee2e6' }} />

                            <div>
                                <div style={sectionLabel}>Signatures</div>
                                {([
                                    ['Prepared by', 'preparedBy'],
                                    ['Examined by', 'examinedBy'],
                                    ['Approved by', 'approvedBy'],
                                ] as [string, keyof POPrintSettings][]).map(([label, key]) => (
                                    <div key={key} style={{ marginBottom: 6 }}>
                                        <div style={fieldLabel}>{label}</div>
                                        <input style={fieldInput} value={settings[key] as string} onChange={e => update({ [key]: e.target.value } as any)} />
                                    </div>
                                ))}
                            </div>

                            <hr style={{ margin: 0, borderColor: '#dee2e6' }} />

                            <div>
                                <div style={sectionLabel}>Notes</div>
                                <textarea style={{ ...fieldInput, minHeight: 50, resize: 'vertical' as const }} value={settings.notes} onChange={e => update({ notes: e.target.value })} placeholder="Optional notes" />
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#111', cursor: 'pointer', marginTop: 8 }}>
                                    <input type="checkbox" checked={settings.showFooterNotes} onChange={e => update({ showFooterNotes: e.target.checked })} />
                                    Footer Notes
                                </label>
                            </div>

                            <div style={{ fontSize: 10, color: '#555', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #dee2e6' }}>
                                Settings saved automatically. Paper size &amp; margins set in browser print dialog.
                            </div>
                        </div>

                        {/* RIGHT — live preview */}
                        <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                            <div className="po-print-paper" style={{ background: '#fff', width: '100%', maxWidth: 720, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', fontSize: '9px', lineHeight: 1.4, color: '#000', fontFamily: 'Arial, sans-serif' }}>
                                {docContent}
                            </div>
                        </div>

                    </div>

                    {/* Footer */}
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#555' }}>Settings saved automatically</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {isClassic ? (
                                <>
                                    <button style={xpBtnGrey} onClick={onClose}>Close</button>
                                    <button style={xpBtnGreen} onClick={handlePrint}>Print</button>
                                </>
                            ) : (
                                <>
                                    <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                    <button className="btn btn-sm btn-success" onClick={handlePrint}>
                                        <i className="bi bi-printer me-1"></i>Print
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Print portal — rendered into body, shown only during actual print */}
            {createPortal(
                <div className="po-print-paper-portal" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                    <div className="po-print-paper" style={{ background: '#fff', width: '100%', padding: '12px 16px', fontSize: '9px', lineHeight: 1.4, color: '#000', fontFamily: 'Arial, sans-serif' }}>
                        {docContent}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
