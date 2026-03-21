# WO Print Preview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full-screen overlay WO print with a modal dialog (left settings panel + right live preview) with section toggles, custom header fields, and `localStorage` persistence.

**Architecture:** A new `PrintPreviewModal` inner component is added inside `ManufacturingView`. It renders two copies of the document JSX — one inside the right panel (preview), one via `createPortal` into `document.body` (print target). `renderPrintBOMLines` and `renderChildWOsPrint` are hoisted from `WorkOrderPrintTemplate` to the outer scope so both components can call them.

**Tech Stack:** React 18 (useState, useEffect, createPortal), TypeScript, Bootstrap 5, `qrcode` npm library, `localStorage`, CSS `@media print`

---

## Files

| File | Change |
|---|---|
| `frontend/app/components/ManufacturingView.tsx` | Primary — all component changes |
| `frontend/app/globals.css` | Add portal print CSS rules |

---

### Task 1: Add `printSettings` state + localStorage persistence

**Files:**
- Modify: `frontend/app/components/ManufacturingView.tsx` (lines ~35, ~60–65, ~111–118)

**What:** Add the `PrintSettings` interface and `printSettings` state to `ManufacturingView`. Load from `localStorage` on mount alongside the existing `wo_code_config`/`ui_style` reads. Add `companyProfile` to the `useData()` destructure.

- [ ] **Step 1: Add `companyProfile` to `useData()` destructure**

  At line 35, change:
  ```ts
  const { authFetch } = useData();
  ```
  to:
  ```ts
  const { authFetch, companyProfile } = useData();
  ```

- [ ] **Step 2: Add `PrintSettings` interface and state**

  After the existing state declarations (around line 80), add:
  ```ts
  interface PrintSettings {
    showBOMTable: boolean;
    showTimeline: boolean;
    showChildWOs: boolean;
    showSignatureLine: boolean;
    headerCompanyName: string;
    headerDepartment: string;
    headerApprovedBy: string;
    headerReference: string;
  }

  const defaultPrintSettings: PrintSettings = {
    showBOMTable: true,
    showTimeline: true,
    showChildWOs: false,
    showSignatureLine: true,
    headerCompanyName: '',
    headerDepartment: '',
    headerApprovedBy: '',
    headerReference: '',
  };

  const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultPrintSettings);
  ```

- [ ] **Step 3: Load `printSettings` from localStorage in the existing mount `useEffect`**

  The existing `useEffect` at line 111 loads `wo_code_config` and `ui_style`. Add `wo_print_settings` loading to the same effect:
  ```ts
  useEffect(() => {
      const savedConfig = localStorage.getItem('wo_code_config');
      if (savedConfig) {
          try { setCodeConfig(JSON.parse(savedConfig)); } catch (e) {}
      }
      const savedStyle = localStorage.getItem('ui_style');
      if (savedStyle) setCurrentStyle(savedStyle);
      const savedPrintSettings = localStorage.getItem('wo_print_settings');
      if (savedPrintSettings) {
          try { setPrintSettings(JSON.parse(savedPrintSettings)); } catch (e) {}
      }
  }, []);
  ```

- [ ] **Step 4: Save `printSettings` to localStorage whenever it changes**

  Add a new `useEffect` after the mount effect:
  ```ts
  useEffect(() => {
      localStorage.setItem('wo_print_settings', JSON.stringify(printSettings));
  }, [printSettings]);
  ```

- [ ] **Step 5: Verify no TypeScript errors**

  Run:
  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: no errors from the new state declarations.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/app/components/ManufacturingView.tsx
  git commit -m "feat: add PrintSettings state and localStorage persistence"
  ```

---

### Task 2: Hoist `renderPrintBOMLines` and `renderChildWOsPrint` to outer scope

**Files:**
- Modify: `frontend/app/components/ManufacturingView.tsx` (lines ~603–675)

**What:** Move the two render helper functions from inside `WorkOrderPrintTemplate` to the outer `ManufacturingView` scope. Update their signatures and all call sites.

**Background:** Currently both functions are defined inside `WorkOrderPrintTemplate` (which starts at line 604). After hoisting they will be regular functions inside `ManufacturingView`, accessible by closure to both `WorkOrderPrintTemplate` and the new `PrintPreviewModal`.

- [ ] **Step 1: Hoist `renderPrintBOMLines` with new signature**

  Cut `renderPrintBOMLines` from inside `WorkOrderPrintTemplate` and paste it into `ManufacturingView` scope, **before** the `WorkOrderPrintTemplate` definition. Update its signature to add `wo` as the first parameter (since it uses `wo.qty`, `wo.source_location_id`, `wo.location_id` which were previously in scope from `WorkOrderPrintTemplate`'s closure):

  ```ts
  const renderPrintBOMLines = (wo: any, lines: any[], level = 0, currentParentQty = 1, currentBOM: any): any => {
      return lines.map((line: any) => {
          const subBOM = boms.find((b: any) => b.item_id === line.item_id);
          let scaledQty = parseFloat(line.qty);
          if (line.is_percentage) {
              scaledQty = (currentParentQty * scaledQty) / 100;
          } else {
              scaledQty = currentParentQty * scaledQty;
          }
          const tolerance = parseFloat(currentBOM?.tolerance_percentage || 0);
          if (tolerance > 0) {
              scaledQty = scaledQty * (1 + (tolerance / 100));
          }

          return (
              <>
                  <tr key={line.id}>
                      <td style={{paddingLeft: `${level * 12 + 8}px`}}>
                          <span className="font-monospace extra-small">{line.item_code || getItemCode(line.item_id)}</span>
                      </td>
                      <td>
                          <div style={{fontSize: '9pt'}}>
                              {level > 0 && <span className="text-muted me-1 small">↳</span>}
                              {line.item_name || getItemName(line.item_id)}
                          </div>
                      </td>
                      <td className="extra-small fst-italic">
                          {line.qty}{line.is_percentage ? '%' : ''}
                          {(line.attribute_value_ids || []).length > 0 && ` • ${(line.attribute_value_ids || []).map(getAttributeValueName).join(', ')}`}
                      </td>
                      <td><span className="extra-small">{getLocationName(line.source_location_id || wo.source_location_id || wo.location_id)}</span></td>
                      <td className="text-end fw-bold small">{(scaledQty * wo.qty).toFixed(3)}</td>
                  </tr>
                  {subBOM && subBOM.lines && renderPrintBOMLines(wo, subBOM.lines, level + 1, scaledQty, subBOM)}
              </>
          );
      });
  };
  ```

  Note the recursive call at the end now passes `wo` as first argument.

- [ ] **Step 2: Hoist `renderChildWOsPrint` with new signature**

  Cut `renderChildWOsPrint` from inside `WorkOrderPrintTemplate` and paste it into `ManufacturingView` scope, after `renderPrintBOMLines`. The function now takes `qrUrls` as an explicit second parameter (replacing the closed-over `qrDataUrls`). Update the function body to use `qrUrls[child.code]` instead of `qrDataUrls[child.code]`:

  ```ts
  const renderChildWOsPrint = (children: any[], qrUrls: Record<string, string>) => {
      if (!children || children.length === 0) return null;
      return (
          <div className="mt-5 pt-4 border-top">
              <h6 className="fw-bold text-uppercase text-muted extra-small mb-3"><i className="bi bi-diagram-3-fill me-2"></i>Child Work Orders (Nested Chain)</h6>
              <div className="row g-3">
                  {children.map(child => (
                      <div key={child.id} className="col-12 border rounded p-2 bg-light bg-opacity-10 d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center gap-3">
                              <img
                                  src={qrUrls[child.code] || ''}
                                  alt="QR"
                                  style={{ width: '60px', height: '60px' }}
                              />
                              <div>
                                  <div className="font-monospace extra-small fw-bold text-primary">{child.code}</div>
                                  <div className="fw-bold small">{child.item_name || getItemName(child.item_id)}</div>
                                  <div className="extra-small text-muted">Qty: {child.qty} • Loc: {getLocationName(child.location_id)}</div>
                              </div>
                          </div>
                          <div className="text-end pe-2">
                              <div className="extra-small text-muted">Status: {child.status}</div>
                              <div className="extra-small text-muted">Due: {formatDate(child.target_end_date)}</div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  };
  ```

- [ ] **Step 3: Update `WorkOrderPrintTemplate` call sites**

  Inside `WorkOrderPrintTemplate`, remove the now-deleted function definitions, then update the two call sites:

  - Line ~739: `renderPrintBOMLines(bom.lines, 0, 1, bom)` → `renderPrintBOMLines(wo, bom.lines, 0, 1, bom)`
  - Line ~743: `renderChildWOsPrint(wo.child_wos)` → `renderChildWOsPrint(wo.child_wos, qrDataUrls)`

- [ ] **Step 4: Verify no TypeScript errors and page still loads**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: no new errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/app/components/ManufacturingView.tsx
  git commit -m "refactor: hoist renderPrintBOMLines/renderChildWOsPrint to ManufacturingView scope"
  ```

---

### Task 3: Update `WorkOrderPrintTemplate` to manage its own QR

**Files:**
- Modify: `frontend/app/components/ManufacturingView.tsx` (inside `WorkOrderPrintTemplate`, ~line 604)

**What:** `WorkOrderPrintTemplate` currently reads `qrDataUrl` (singular) from the outer scope. We will remove that outer state in Task 4, so `WorkOrderPrintTemplate` must generate its own QR internally.

- [ ] **Step 1: Add local QR state and `useEffect` inside `WorkOrderPrintTemplate`**

  At the top of `WorkOrderPrintTemplate` (after `const bom = ...`), add:
  ```ts
  const [localQrUrl, setLocalQrUrl] = useState('');
  useEffect(() => {
      QRCode.toDataURL(wo.code, { margin: 1, width: 200 })
          .then(setLocalQrUrl)
          .catch(() => {});
  }, [wo.code]);
  ```

- [ ] **Step 2: Replace `qrDataUrl` reference with `localQrUrl`**

  At line ~684:
  ```tsx
  // before:
  <img src={qrDataUrl} alt="WO QR" style={{ width: '100px', height: '100px' }} />
  // after:
  <img src={localQrUrl} alt="WO QR" style={{ width: '100px', height: '100px' }} />
  ```

- [ ] **Step 3: Verify no TypeScript errors**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/app/components/ManufacturingView.tsx
  git commit -m "refactor: WorkOrderPrintTemplate generates its own QR code internally"
  ```

---

### Task 4: Swap out old print state + simplify `handlePrintWO`

**Files:**
- Modify: `frontend/app/components/ManufacturingView.tsx` (lines ~60–65, ~195–206, ~764)

**What:** Replace `printingWO` + `qrDataUrl` (singular) state with `printPreviewWO`. Simplify `handlePrintWO` to just open the modal.

- [ ] **Step 1: Replace `printingWO` state with `printPreviewWO`**

  Line ~60: replace:
  ```ts
  const [printingWO, setPrintingWO] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  ```
  with:
  ```ts
  const [printPreviewWO, setPrintPreviewWO] = useState<any>(null);
  ```

- [ ] **Step 2: Simplify `handlePrintWO`**

  Replace the full `handlePrintWO` function (lines ~195–206) with:
  ```ts
  const handlePrintWO = (wo: any) => {
      setPrintPreviewWO(wo);
  };
  ```

- [ ] **Step 3: Update render JSX**

  At line ~764, replace:
  ```tsx
  {printingWO && <WorkOrderPrintTemplate wo={printingWO} />}
  ```
  with:
  ```tsx
  {printPreviewWO && (
      <PrintPreviewModal
          wo={printPreviewWO}
          onClose={() => setPrintPreviewWO(null)}
          printSettings={printSettings}
          onPrintSettingsChange={setPrintSettings}
      />
  )}
  ```

- [ ] **Step 4: Add `createPortal` import**

  At the top of the file, the import from `react` is:
  ```ts
  import { useState, useEffect, useCallback, useRef } from 'react';
  ```
  Add the react-dom import below it:
  ```ts
  import { createPortal } from 'react-dom';
  ```

- [ ] **Step 5: Fix any remaining references to `setPrintingWO` and `qrDataUrl`**

  The close button inside `WorkOrderPrintTemplate` (line ~754) still calls `setPrintingWO(null)`. Update it to do nothing (the template is now only used by `handlePrintList`; the close button is irrelevant for list print but should still compile). Change it to:
  ```tsx
  <button className="btn btn-dark shadow" onClick={() => {}}>
      <i className="bi bi-x-lg me-2"></i>Close Preview
  </button>
  ```
  *(After Task 4, `WorkOrderPrintTemplate` is no longer rendered in any live code path — `PrintPreviewModal` handles single-WO print. The close button becomes dead code; making it a no-op avoids a dangling `setPrintingWO` reference.)*

- [ ] **Step 6: TypeScript check**

  Complete Steps 1–5 atomically before running this check. Running `tsc` after Step 1 alone will show a `setPrintingWO` not-defined error (patched in Step 5).

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: errors only about `PrintPreviewModal` not yet being defined — that's fine, it will be created in Task 5.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/app/components/ManufacturingView.tsx
  git commit -m "refactor: swap printingWO for printPreviewWO, simplify handlePrintWO"
  ```

---

### Task 5: Build `PrintPreviewModal` — shell + left panel

**Files:**
- Modify: `frontend/app/components/ManufacturingView.tsx` (add inner component before `WorkOrderPrintTemplate`)

**What:** Define the `PrintPreviewModal` component with its outer shell, modal box structure, header, left settings panel, and footer. No document content yet — the right panel will be a placeholder.

- [ ] **Step 1: Define the component skeleton with all props**

  Add this function just **before** `WorkOrderPrintTemplate`:

  ```tsx
  const PrintPreviewModal = ({
      wo,
      onClose,
      printSettings,
      onPrintSettingsChange,
  }: {
      wo: any;
      onClose: () => void;
      printSettings: PrintSettings;
      onPrintSettingsChange: (updated: PrintSettings) => void;
  }) => {
      const { showBOMTable, showTimeline, showChildWOs, showSignatureLine,
              headerCompanyName, headerDepartment, headerApprovedBy, headerReference } = printSettings;

      const [qrDataUrl, setQrDataUrl] = useState('');
      const [childQrUrls, setChildQrUrls] = useState<Record<string, string>>({});

      // Add body class for print CSS isolation
      useEffect(() => {
          document.body.classList.add('wo-print-preview-active');
          return () => { document.body.classList.remove('wo-print-preview-active'); };
      }, []);

      // Generate main WO QR on mount
      useEffect(() => {
          QRCode.toDataURL(wo.code, { margin: 1, width: 200 })
              .then(setQrDataUrl)
              .catch(() => {});
      }, []);

      // Generate child WO QRs when showChildWOs is enabled
      useEffect(() => {
          if (!showChildWOs) return;
          (wo.child_wos || []).forEach((child: any) => {
              QRCode.toDataURL(child.code, { margin: 1, width: 160 })
                  .then(url => setChildQrUrls(prev => prev[child.code] ? prev : { ...prev, [child.code]: url }))
                  .catch(() => {});
          });
      }, [showChildWOs, wo.child_wos]);

      const update = (patch: Partial<PrintSettings>) =>
          onPrintSettingsChange({ ...printSettings, ...patch });

      const isClassic = currentStyle === 'classic';

      const xpBevelStyle = isClassic
          ? { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf' }
          : {};

      const headerStyle = isClassic
          ? { background: 'linear-gradient(to right, #0058e6, #08a5ff)', color: '#fff', font: 'bold 12px Tahoma', padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
          : {};
      const headerClass = isClassic ? '' : 'bg-primary text-white px-3 py-2 d-flex justify-content-between align-items-center';

      const xpBtnGrey = isClassic
          ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 12px', background: 'linear-gradient(to bottom,#fff,#d4d0c8)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer' }
          : {};
      const xpBtnGreen = isClassic
          ? { fontFamily: 'Tahoma', fontSize: '11px', padding: '3px 14px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', border: '1px solid', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }
          : {};

      const sectionLabelStyle: React.CSSProperties = {
          fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase',
          color: '#212529', letterSpacing: '0.5px', marginBottom: '6px',
      };
      const toggleLabelStyle: React.CSSProperties = {
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '12px', color: '#212529', cursor: 'pointer',
      };
      const fieldLabelStyle: React.CSSProperties = {
          fontSize: '10px', color: '#212529', marginBottom: '3px', fontWeight: '500',
      };
      const fieldInputStyle: React.CSSProperties = {
          width: '100%', fontSize: '11px', padding: '3px 6px',
          border: '1px solid #ced4da', boxSizing: 'border-box', color: '#000',
      };

      // TODO: document content rendered here in Task 6
      const documentContent = (
          <div style={{ fontSize: '9px', color: '#888', padding: '20px' }}>
              [Document preview — coming in next task]
          </div>
      );

      return (
          <>
              {/* Backdrop + modal box */}
              <div
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={onClose}
              >
                  <div
                      style={{ background: '#fff', width: '90vw', maxWidth: '960px', height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', ...xpBevelStyle }}
                      onClick={e => e.stopPropagation()}
                  >
                      {/* Modal header */}
                      <div style={headerStyle} className={headerClass}>
                          <span>🖨 Print Work Order — {wo.code}</span>
                          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                      </div>

                      {/* Body row: left panel + right panel */}
                      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>

                          {/* LEFT PANEL */}
                          <div style={{ width: '230px', minWidth: '230px', borderRight: '1px solid #dee2e6', background: '#f8f9fa', padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                              {/* Section toggles */}
                              <div>
                                  <div style={sectionLabelStyle}>Sections</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                      <label style={{ ...toggleLabelStyle, opacity: 0.5 }}>
                                          <input type="checkbox" checked disabled />
                                          QR Code <span style={{ fontSize: '10px', color: '#555' }}>(always on)</span>
                                      </label>
                                      <label style={toggleLabelStyle}>
                                          <input type="checkbox" checked={showBOMTable} onChange={e => update({ showBOMTable: e.target.checked })} />
                                          BOM / Materials Table
                                      </label>
                                      <label style={toggleLabelStyle}>
                                          <input type="checkbox" checked={showTimeline} onChange={e => update({ showTimeline: e.target.checked })} />
                                          Timeline
                                      </label>
                                      <label style={toggleLabelStyle}>
                                          <input type="checkbox" checked={showChildWOs} onChange={e => update({ showChildWOs: e.target.checked })} />
                                          Child Work Orders
                                      </label>
                                      <label style={toggleLabelStyle}>
                                          <input type="checkbox" checked={showSignatureLine} onChange={e => update({ showSignatureLine: e.target.checked })} />
                                          Signature Line
                                      </label>
                                  </div>
                              </div>

                              <hr style={{ margin: '0', borderColor: '#dee2e6' }} />

                              {/* Header fields */}
                              <div>
                                  <div style={sectionLabelStyle}>Header Fields</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {[
                                          { label: 'Company Name', key: 'headerCompanyName', value: headerCompanyName || companyProfile?.name || '' },
                                          { label: 'Department', key: 'headerDepartment', value: headerDepartment },
                                          { label: 'Approved By', key: 'headerApprovedBy', value: headerApprovedBy },
                                          { label: 'Reference No.', key: 'headerReference', value: headerReference },
                                      ].map(({ label, key, value }) => (
                                          <div key={key}>
                                              <div style={fieldLabelStyle}>{label}</div>
                                              <input
                                                  type="text"
                                                  value={value}
                                                  onChange={e => update({ [key]: e.target.value } as Partial<PrintSettings>)}
                                                  style={fieldInputStyle}
                                              />
                                          </div>
                                      ))}
                                  </div>
                              </div>

                              {/* Footer note */}
                              <div style={{ fontSize: '10px', color: '#555', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
                                  Paper size &amp; margins set in browser print dialog.
                              </div>
                          </div>

                          {/* RIGHT PANEL — preview */}
                          <div style={{ flex: 1, background: '#e0e0e0', overflowY: 'auto', padding: '16px', display: 'flex', justifyContent: 'center' }}>
                              <div className="wo-print-paper" style={{ background: '#fff', width: '100%', maxWidth: '560px', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.25)', fontSize: '9px', lineHeight: '1.5', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                                  {documentContent}
                              </div>
                          </div>

                      </div>{/* /body row */}

                      {/* Modal footer */}
                      <div style={{ padding: '8px 12px', borderTop: '1px solid #dee2e6', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#666' }}>Settings saved automatically</span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                              {isClassic ? (
                                  <>
                                      <button style={xpBtnGrey} onClick={onClose}>Close</button>
                                      <button style={xpBtnGreen} onClick={() => { window.onafterprint = onClose; window.print(); }}>🖨 Print</button>
                                  </>
                              ) : (
                                  <>
                                      <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
                                      <button className="btn btn-sm btn-success" onClick={() => { window.onafterprint = onClose; window.print(); }}>🖨 Print</button>
                                  </>
                              )}
                          </div>
                      </div>

                  </div>{/* /modal box */}
              </div>{/* /backdrop */}

              {/* PRINT PORTAL — second instance of same document content, rendered into document.body */}
              {createPortal(
                  <div className="wo-print-paper-portal" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                      <div className="wo-print-paper" style={{ background: '#fff', width: '100%', maxWidth: '560px', padding: '24px 28px', fontSize: '9px', lineHeight: '1.5', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                          {documentContent}
                      </div>
                  </div>,
                  document.body
              )}
          </>
      );
  };
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: clean (or only pre-existing errors).

- [ ] **Step 3: Smoke test in browser**

  Open the manufacturing page, click the Print button on any WO row. The modal should open with the settings panel on the left and a placeholder on the right.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/app/components/ManufacturingView.tsx
  git commit -m "feat: PrintPreviewModal shell with left settings panel and portal skeleton"
  ```

---

### Task 6: Build the document content (paper sheet JSX)

**Files:**
- Modify: `frontend/app/components/ManufacturingView.tsx` (inside `PrintPreviewModal`)

**What:** Replace the placeholder `documentContent` with the real document JSX — company header, WO identity row (QR + details + conditional timeline), conditional BOM table, conditional child WOs, conditional signature line.

- [ ] **Step 1: Build a `PaperContent` helper inside `PrintPreviewModal`**

  Replace the `// TODO: document content rendered here in Task 6` comment and the placeholder `documentContent` variable with:

  ```tsx
  const displayCompanyName = headerCompanyName || companyProfile?.name || '';

  const documentContent = (
      <>
          {/* Company header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '10px' }}>
              <div>
                  {companyProfile?.logo_url ? (
                      <img src={companyProfile.logo_url} alt="Logo" style={{ maxHeight: '64px', maxWidth: '200px', objectFit: 'contain', display: 'block', marginBottom: '4px' }} />
                  ) : (
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0058e6' }}>{displayCompanyName}</div>
                  )}
                  {companyProfile?.address && <div style={{ color: '#555' }}>{companyProfile.address}</div>}
                  {(companyProfile?.phone || companyProfile?.email) && (
                      <div style={{ color: '#555' }}>{[companyProfile.phone, companyProfile.email].filter(Boolean).join(' · ')}</div>
                  )}
              </div>
              <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Work Order</div>
                  {headerDepartment && <div style={{ color: '#555' }}>Dept: <strong>{headerDepartment}</strong></div>}
                  {headerApprovedBy && <div style={{ color: '#555' }}>Approved By: <strong>{headerApprovedBy}</strong></div>}
                  {headerReference && <div style={{ color: '#555' }}>Ref: <strong>{headerReference}</strong></div>}
              </div>
          </div>

          {/* WO identity row */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '10px' }}>
              {/* QR */}
              <div style={{ border: '2px solid #000', padding: '3px', flexShrink: 0 }}>
                  {qrDataUrl
                      ? <img src={qrDataUrl} alt="QR" style={{ width: '84px', height: '84px', display: 'block' }} />
                      : <div style={{ width: '84px', height: '84px', background: '#eee' }} />
                  }
              </div>
              <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#0058e6' }}>{wo.code}</div>
                  <div style={{ fontSize: '8px', background: '#f0ad4e', display: 'inline-block', padding: '1px 5px', color: '#000', fontWeight: 'bold', margin: '2px 0' }}>{wo.status}</div>
                  <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                      <div><span style={{ color: '#666' }}>Item:</span> <strong>{wo.item_name || getItemName(wo.item_id)}</strong></div>
                      <div><span style={{ color: '#666' }}>Qty:</span> <strong>{wo.qty}</strong></div>
                      {showTimeline && (
                          <>
                              <div><span style={{ color: '#666' }}>Target Start:</span> <strong>{formatDate(wo.target_start_date) || '—'}</strong></div>
                              <div><span style={{ color: '#666' }}>Target End:</span> <strong>{formatDate(wo.target_end_date) || '—'}</strong></div>
                              <div><span style={{ color: '#666' }}>Actual Start:</span> <strong>{wo.actual_start_date ? formatDate(wo.actual_start_date) : '—'}</strong></div>
                              <div><span style={{ color: '#666' }}>Actual End:</span> <strong>{wo.actual_end_date ? formatDate(wo.actual_end_date) : '—'}</strong></div>
                          </>
                      )}
                  </div>
              </div>
          </div>

          {/* BOM / Materials Table */}
          {showBOMTable && (() => {
              const bom = boms.find((b: any) => b.id === wo.bom_id);
              return (
                  <>
                      <div style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', letterSpacing: '0.3px', marginBottom: '3px', borderTop: '1px solid #ccc', paddingTop: '6px' }}>
                          Bill of Materials
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px', marginBottom: '10px' }}>
                          <thead>
                              <tr style={{ background: '#f0f0f0' }}>
                                  <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'left' }}>Code</th>
                                  <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'left' }}>Component</th>
                                  <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'left' }}>Specs</th>
                                  <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'left' }}>Source</th>
                                  <th style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'right' }}>Req. Qty</th>
                              </tr>
                          </thead>
                          <tbody>
                              {bom ? renderPrintBOMLines(wo, bom.lines, 0, 1, bom) : (
                                  <tr><td colSpan={5} style={{ border: '1px solid #ccc', padding: '4px', color: '#888' }}>No BOM found</td></tr>
                              )}
                          </tbody>
                      </table>
                  </>
              );
          })()}

          {/* Child Work Orders */}
          {showChildWOs && renderChildWOsPrint(wo.child_wos || [], childQrUrls)}

          {/* Signature line */}
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#555', borderTop: '1px solid #ccc', paddingTop: '8px' }}>
              <div>Printed: {new Date().toLocaleString()}</div>
              {showSignatureLine && (
                  <div style={{ textAlign: 'center', width: '140px' }}>
                      <div style={{ borderBottom: '1px solid #000', height: '28px', marginBottom: '2px' }}></div>
                      Authorized Signature
                  </div>
              )}
          </div>
      </>
  );
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 3: Browser smoke test**

  Open a WO print modal. Verify:
  - Company header row appears with name/address
  - QR code loads
  - BOM table visible (toggle it off and confirm it disappears)
  - Timeline toggle hides/shows date rows
  - Header field changes update the document live

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/app/components/ManufacturingView.tsx
  git commit -m "feat: PrintPreviewModal document content (company header, WO identity, BOM, timeline, signature)"
  ```

---

### Task 7: Add print CSS to `globals.css`

**Files:**
- Modify: `frontend/app/globals.css` (inside existing `@media print` block, starting at line 846)

**What:** Add the portal isolation CSS rules so only the paper sheet prints when the modal is open.

- [ ] **Step 1: Add rules to the `@media print` block**

  Inside the `@media print { ... }` block (after the existing rules, before the closing `}`), add:

  ```css
  /* WO print preview modal — hide everything except the paper portal */
  body.wo-print-preview-active > *:not(.wo-print-paper-portal) {
    display: none !important;
  }
  body.wo-print-preview-active .wo-print-paper-portal {
    display: block !important;
    position: static !important;
    left: 0 !important;
    width: 100% !important;
  }
  body.wo-print-preview-active .wo-print-paper-portal .wo-print-paper {
    box-shadow: none !important;
    padding: 20px !important;
    max-width: 100% !important;
    width: 100% !important;
  }
  ```

- [ ] **Step 2: Browser print test**

  Open a WO print modal, click Print, proceed through the browser print dialog. Verify only the paper sheet content appears in the print preview (not the sidebar, settings panel, or modal chrome).

- [ ] **Step 3: List-print regression test**

  Close any open modal. Click the list Print button (toolbar). Verify the full WO list prints as before (no `wo-print-preview-active` class → portal rules don't fire).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/app/globals.css
  git commit -m "feat: add @media print isolation CSS for WO print preview portal"
  ```

---

### Task 8: XP classic mode styling

**Files:**
- Modify: `frontend/app/components/ManufacturingView.tsx` (inside `PrintPreviewModal`)

**What:** The modal header and modal box already have classic-mode branching from Task 5. This task verifies the XP bevel border and gradient header are correct and adds any missing classic-mode details.

- [ ] **Step 1: Verify classic mode visually**

  Set `localStorage.setItem('ui_style', 'classic')` in the browser console and refresh. Open a WO print modal. Verify:
  - Blue gradient header (left `#0058e6` → right `#08a5ff`)
  - Bevel border on modal box (`border-color: #dfdfdf #808080 #808080 #dfdfdf`)
  - Grey XP close button and green XP print button in footer

- [ ] **Step 2: Verify default mode**

  Set `localStorage.setItem('ui_style', 'default')` and refresh. Verify Bootstrap blue header (`bg-primary`) and standard buttons.

- [ ] **Step 3: Commit** (only if any fixes were needed)

  ```bash
  git add frontend/app/components/ManufacturingView.tsx
  git commit -m "fix: verify XP classic mode styling on PrintPreviewModal"
  ```

---

### Task 9: Final acceptance criteria check

**Files:** none (verification only)

**What:** Walk through every acceptance criterion from the spec.

- [ ] **AC1:** Click Print on a WO row → modal opens (not full-screen overlay). ✓ if Task 5 worked.
- [ ] **AC2:** Modal has left settings panel and right document preview. ✓
- [ ] **AC3:** QR code always rendered; toggle visible but disabled (opacity 0.5). ✓
- [ ] **AC4:** Toggle BOM Table, Timeline, Child WOs, Signature Line — preview updates immediately. ✓
- [ ] **AC5:** All settings panel labels/text use `color: #212529`. ✓ (verify in browser)
- [ ] **AC6:** Company Name, Department, Approved By, Reference No. appear in document header. ✓
- [ ] **AC7:** Company Name shows profile name when `headerCompanyName` is empty. Verify with fresh `wo_print_settings` (delete from localStorage and reload).
- [ ] **AC8:** Settings persist — close and reopen modal, verify settings are remembered.
- [ ] **AC9:** Click Print → `window.print()` fires → modal closes after dialog dismissed.
- [ ] **AC10:** During print, only paper sheet is visible (verify in browser print preview).
- [ ] **AC11:** Click backdrop or Close → modal dismisses without printing.
- [ ] **AC12:** XP classic mode: bevel border + gradient header.
- [ ] **AC13 (regression):** Click list Print button → existing list print still works.

- [ ] **Step 1: Commit final verification**

  ```bash
  git add -p  # stage only if any small fixes made
  git commit -m "feat: WO print preview modal — all acceptance criteria verified"
  ```
