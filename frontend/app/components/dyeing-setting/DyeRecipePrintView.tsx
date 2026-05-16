'use client';
import React, { useEffect } from 'react';

interface RecipeLine {
  id: string;
  chemical_type: string;
  item_name: string | null;
  qty_per_liter: number | null;
  qty_per_100kg: number | null;
  uom_name: string | null;
  sort_order: number;
}

interface WashBath {
  bath_number: number;
  description: string;
}

interface FinishingStep {
  description: string;
  sort_order: number;
}

interface DyeRecipeForPrint {
  id: string;
  code: string;
  name: string;
  color_standard: string | null;
  substrate_type: string | null;
  notes: string | null;
  lines: RecipeLine[];
  wash_baths: WashBath[];
  finishing_steps: FinishingStep[];
}

interface Props {
  recipe: DyeRecipeForPrint;
  onClose: () => void;
}

export default function DyeRecipePrintView({ recipe, onClose }: Props) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const sortedLines = [...recipe.lines].sort((a, b) => a.sort_order - b.sort_order);
  const dyes = sortedLines.filter(l => l.chemical_type === 'DYE');
  const chems = sortedLines.filter(l => l.chemical_type !== 'DYE');
  const allLines = [...dyes, ...chems];

  const today = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).replace(/\//g, '.');

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #recipe-print-area, #recipe-print-area * { visibility: visible; }
          #recipe-print-area { position: fixed; top: 0; left: 0; width: 100%; padding: 24px 32px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
        <div style={{
          background: '#fff', width: 740, maxHeight: '92vh', overflowY: 'auto',
          borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        }}>
          {/* Action bar — hidden on print */}
          <div className="no-print" style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            padding: '10px 16px', borderBottom: '1px solid #ddd', background: '#f8f9fa',
          }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => window.print()}
            >
              Print
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Close
            </button>
          </div>

          {/* Printable card */}
          <div id="recipe-print-area" style={{
            padding: '28px 36px',
            fontFamily: 'Arial, sans-serif',
            fontSize: 12,
            color: '#000',
            lineHeight: '1.5',
          }}>
            {/* Company header */}
            <div style={{
              textAlign: 'center',
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: 6,
              marginBottom: 6,
            }}>
              PT BOLA INTAN
            </div>
            <hr style={{ borderTop: '2px solid #000', margin: '4px 0 14px' }} />

            {/* Job metadata — 2-column grid */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
              <tbody>
                <tr>
                  <td style={{ width: '50%', paddingBottom: 2 }}>
                    <span style={{ display: 'inline-block', width: 110 }}>Customer</span>
                    <span style={{ marginRight: 6 }}>:</span>
                    <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 160 }}>&nbsp;</span>
                  </td>
                  <td style={{ paddingBottom: 2 }}>
                    <span style={{ display: 'inline-block', width: 110 }}>Color Matching</span>
                    <span style={{ marginRight: 6 }}>:</span>
                    <strong>{recipe.color_standard ?? '—'}</strong>
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingBottom: 2 }}>
                    <span style={{ display: 'inline-block', width: 110 }}>Nomor PO</span>
                    <span style={{ marginRight: 6 }}>:</span>
                    <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 160 }}>&nbsp;</span>
                  </td>
                  <td style={{ paddingBottom: 2 }}>
                    <span style={{ display: 'inline-block', width: 110 }}>LOT</span>
                    <span style={{ marginRight: 6 }}>:</span>
                    <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 80 }}>&nbsp;</span>
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingBottom: 2 }}>
                    <span style={{ display: 'inline-block', width: 110 }}>Artikel</span>
                    <span style={{ marginRight: 6 }}>:</span>
                    <span>{recipe.code}</span>
                  </td>
                  <td style={{ paddingBottom: 2 }}>
                    <span style={{ display: 'inline-block', width: 110 }}>Qty Order</span>
                    <span style={{ marginRight: 6 }}>:</span>
                    <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 60 }}>&nbsp;</span>
                    <span style={{ marginLeft: 6 }}>KG</span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ paddingBottom: 2 }}>
                    <span style={{ display: 'inline-block', width: 110 }}>Warna</span>
                    <span style={{ marginRight: 6 }}>:</span>
                    <strong>{recipe.name}</strong>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Volume Air */}
            <div style={{ marginBottom: 8 }}>
              <span style={{ display: 'inline-block', width: 110 }}>Volume Air</span>
              <span style={{ marginRight: 6 }}>:</span>
              <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 60 }}>&nbsp;</span>
              <span style={{ marginLeft: 8 }}>Liter</span>
            </div>

            {/* Machine params */}
            <div style={{ display: 'flex', gap: 32, marginBottom: 12 }}>
              <div>
                <span style={{ display: 'inline-block', width: 90 }}>Mesin Celup</span>
                <span style={{ marginRight: 6 }}>:</span>
                <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 40 }}>&nbsp;</span>
              </div>
              <div>
                <span>Tekanan</span>
                <span style={{ margin: '0 6px' }}>:</span>
                <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 40 }}>&nbsp;</span>
              </div>
              <div>
                <span>Speed</span>
                <span style={{ margin: '0 6px' }}>:</span>
                <span style={{ borderBottom: '1px solid #999', display: 'inline-block', minWidth: 40 }}>&nbsp;</span>
              </div>
            </div>

            {/* Chemical lines */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <tbody>
                {allLines.map((line, i) => {
                  const dyeIdx = dyes.indexOf(line);
                  const chemIdx = chems.indexOf(line);
                  const label = dyeIdx >= 0 ? `Dyes ${dyeIdx + 1}` : `Chem ${chemIdx + 1}`;
                  const rate = line.qty_per_liter ?? line.qty_per_100kg ?? null;
                  const unit = line.uom_name ?? (line.qty_per_liter != null ? 'g/L' : line.qty_per_100kg != null ? 'g/100kg' : '');
                  return (
                    <tr key={line.id} style={{ lineHeight: '26px' }}>
                      <td style={{ width: 28, color: '#555' }}>{i + 1}.</td>
                      <td style={{ width: 80, color: '#555' }}>{label}</td>
                      <td style={{ width: 14 }}>:</td>
                      <td style={{ width: 220, fontWeight: 500 }}>{line.item_name ?? '—'}</td>
                      <td style={{ width: 24, textAlign: 'center', color: '#888' }}></td>
                      <td style={{ width: 70, textAlign: 'right' }}>
                        {rate !== null ? rate : ''}
                      </td>
                      <td style={{ width: 60, textAlign: 'center', color: '#555', fontSize: 10 }}>
                        {unit}
                      </td>
                      <td style={{ width: 16, textAlign: 'center' }}>=</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, borderBottom: '1px solid #ccc', minWidth: 70 }}>
                        &nbsp;
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Bak Cuci */}
            {recipe.wash_baths.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>BAK CUCI:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 32, rowGap: 2 }}>
                  {recipe.wash_baths.map(wb => (
                    <div key={wb.bath_number} style={{ fontSize: 11 }}>
                      <span style={{ display: 'inline-block', width: 20, fontWeight: 600 }}>{wb.bath_number}</span>
                      <span style={{ marginRight: 4 }}>:</span>
                      {wb.description}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Finishing */}
            {recipe.finishing_steps.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>FINISHING</div>
                {recipe.finishing_steps.map((fs, i) => (
                  <div key={i} style={{ fontSize: 11 }}>{fs.description}</div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, alignItems: 'flex-end' }}>
              <div style={{ fontSize: 11, color: '#555' }}>
                {recipe.notes && <div>Catatan: {recipe.notes}</div>}
              </div>
              <div style={{ textAlign: 'center', fontSize: 12 }}>
                <div>Tangerang, {today}</div>
                <div style={{ marginTop: 48, borderTop: '1px solid #000', paddingTop: 4, minWidth: 120 }}>
                  Div Celup
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
