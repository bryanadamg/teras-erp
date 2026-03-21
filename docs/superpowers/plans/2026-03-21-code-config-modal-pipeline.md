# CodeConfigModal Pipeline Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CodeConfigModal's static toggle UI with a drag-and-drop segment pipeline builder, preserving the `CodeConfig` interface and supporting both modern and XP classic themes.

**Architecture:** Single-file rewrite of `CodeConfigModal.tsx`. State moves from flat boolean flags to an ordered `Segment[]` array. Module-level pure helpers handle conversion to/from the legacy `CodeConfig` format and all array manipulation. DnD uses native HTML5 API with a `useRef` for drag state (not `dataTransfer`, which is inaccessible during `dragover`). Both visual themes share identical logic; only the JSX render differs.

**Tech Stack:** React 18, TypeScript, Next.js 14, Bootstrap 5 utilities, native HTML5 Drag-and-Drop API (no new dependencies)

**Spec:** `docs/superpowers/specs/2026-03-21-code-config-modal-pipeline-redesign.md`

---

## Files

| Action | Path | Responsibility |
|--------|------|----------------|
| Rewrite | `frontend/app/components/CodeConfigModal.tsx` | Types, pure helpers, DnD handlers, both-mode render |

No new files. No new npm packages.

---

## Task 1: Segment Types and Pure Helper Functions

**Files:**
- Modify: `frontend/app/components/CodeConfigModal.tsx` (top section — types + helpers only; existing render untouched for now)
- Create: `frontend/app/components/CodeConfigModal.test.mjs` (temporary verification script, deleted after Task 2)

Add all types and pure functions **above** the component export. The component body is not touched yet.

- [ ] **Step 1: Add the Segment type union and CHIP_COLORS constant**

At the top of `CodeConfigModal.tsx`, after the existing `CodeConfig` interface, add:

```ts
// ─── Pipeline Segment Types ───────────────────────────────────────────────────

export type Segment =
  | { type: 'prefix';    value: string }
  | { type: 'item' }
  | { type: 'attribute'; name: string }
  | { type: 'year' }
  | { type: 'month' }
  | { type: 'suffix';    value: string }
  | { type: 'counter' }

export const CHIP_COLORS: Record<string, string> = {
  prefix:    '#2563eb',
  item:      '#059669',
  attribute: '#7c3aed',
  year:      '#b45309',
  month:     '#be185d',
  suffix:    '#0e7490',
  counter:   '#475569',
};

// XP classic dark text colors per chip type (dark on light gradient)
export const CHIP_COLORS_CLASSIC_TEXT: Record<string, string> = {
  prefix:    '#00327a',
  item:      '#003a00',
  attribute: '#320070',
  year:      '#4a2e00',
  month:     '#5c0028',
  suffix:    '#003344',
  counter:   '#333333',
};
```

- [ ] **Step 2: Add `normalizeCounter` — enforces counter always last**

```ts
export function normalizeCounter(segs: Segment[]): Segment[] {
  const without = segs.filter(s => s.type !== 'counter');
  return [...without, { type: 'counter' }];
}
```

- [ ] **Step 3: Add `getDefaultSegments` — type-based initial segments**

```ts
export function getDefaultSegments(type: string): Segment[] {
  const defaultPrefixes: Record<string, string> = {
    BOM: 'BOM', WO: 'WO', PO: 'PO', SO: 'SO', SAMPLE: 'SMP', ITEM: 'ITM',
  };
  const prefix = defaultPrefixes[type] ?? 'CODE';
  const segs: Segment[] = [{ type: 'prefix', value: prefix }];
  if (type === 'BOM' || type === 'WO') segs.push({ type: 'item' });
  if (type === 'PO' || type === 'SAMPLE') segs.push({ type: 'year' });
  segs.push({ type: 'counter' });
  return segs;
}
```

- [ ] **Step 4: Add `configToSegments` — derives Segment[] from a saved CodeConfig**

```ts
export function configToSegments(
  cfg: CodeConfig,
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): Segment[] {
  // Migrate legacy single-string variantAttributeName
  const safe: any = { ...cfg };
  if (typeof safe.variantAttributeName === 'string') {
    safe.variantAttributeNames = [safe.variantAttributeName].filter(Boolean);
    delete safe.variantAttributeName;
  }
  if (!safe.variantAttributeNames) safe.variantAttributeNames = [];

  const segs: Segment[] = [];
  if (safe.prefix)         segs.push({ type: 'prefix', value: safe.prefix });
  if (safe.includeItemCode) segs.push({ type: 'item' });

  if (safe.includeVariant && safe.variantAttributeNames.length > 0) {
    const seen = new Set<string>();
    for (const name of safe.variantAttributeNames) {
      if (seen.has(name)) continue;                         // drop duplicates
      if (!attributes.find(a => a.name === name)) continue; // drop stale names
      seen.add(name);
      segs.push({ type: 'attribute', name });
    }
  }

  if (safe.includeYear)    segs.push({ type: 'year' });
  if (safe.includeMonth)   segs.push({ type: 'month' });
  if (safe.suffix)         segs.push({ type: 'suffix', value: safe.suffix });
  segs.push({ type: 'counter' });
  return segs;
}
```

- [ ] **Step 5: Add `segmentsToConfig` — derives CodeConfig from Segment[] (save path)**

```ts
export function segmentsToConfig(segs: Segment[], separator: string): CodeConfig {
  const normalized = normalizeCounter(segs);
  return {
    prefix:                (normalized.find(s => s.type === 'prefix') as any)?.value ?? '',
    suffix:                (normalized.find(s => s.type === 'suffix') as any)?.value ?? '',
    separator,
    includeItemCode:       normalized.some(s => s.type === 'item'),
    includeVariant:        normalized.some(s => s.type === 'attribute'),
    variantAttributeNames: normalized.filter(s => s.type === 'attribute').map((s: any) => s.name),
    includeYear:           normalized.some(s => s.type === 'year'),
    includeMonth:          normalized.some(s => s.type === 'month'),
  };
}
```

- [ ] **Step 6: Add `getSegmentPreviewValue` and `getPreview`**

```ts
export function getSegmentPreviewValue(
  seg: Segment,
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): string {
  switch (seg.type) {
    case 'prefix':    return seg.value || 'PREFIX';
    case 'item':      return 'ITEM001';
    case 'attribute': {
      const attr = attributes.find(a => a.name === (seg as any).name);
      return attr?.values[0]?.value.toUpperCase() ?? 'VAR';
    }
    case 'year':    return String(new Date().getFullYear());
    case 'month':   return String(new Date().getMonth() + 1).padStart(2, '0');
    case 'suffix':  return (seg as any).value || 'SUFFIX';
    case 'counter': return '001';
  }
}

export function getPreview(
  segs: Segment[],
  separator: string,
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): string {
  const normalized = normalizeCounter(segs);
  return normalized
    .map(s => getSegmentPreviewValue(s, attributes))
    .join(separator);
}
```

- [ ] **Step 7: Add `getAvailablePalette` — chips not currently on the track**

```ts
export function getAvailablePalette(
  segs: Segment[],
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): Segment[] {
  const palette: Segment[] = [];
  // prefix and suffix: only if not already on track
  if (!segs.some(s => s.type === 'prefix'))
    palette.push({ type: 'prefix', value: '' });
  if (!segs.some(s => s.type === 'suffix'))
    palette.push({ type: 'suffix', value: '' });
  // static segments: add if not on track
  const statics: Segment['type'][] = ['item', 'year', 'month'];
  for (const t of statics) {
    if (!segs.some(s => s.type === t)) palette.push({ type: t } as Segment);
  }
  // attribute chips: one per attribute not already on track
  for (const attr of attributes) {
    if (!segs.some(s => s.type === 'attribute' && (s as any).name === attr.name))
      palette.push({ type: 'attribute', name: attr.name });
  }
  return palette;
}
```

- [ ] **Step 8: Add `insertSegment` and `removeSegment` — pure array helpers**

```ts
export function removeSegment(segs: Segment[], index: number): Segment[] {
  return segs.filter((_, i) => i !== index);
}

// Insert `seg` at `gapIndex` (0 = before first element).
// If sourceIndex is provided (track-to-track), adjusts for prior removal.
export function insertAtGap(
  segs: Segment[],
  seg: Segment,
  gapIndex: number,
  sourceIndex?: number
): Segment[] {
  const without = sourceIndex !== undefined ? removeSegment(segs, sourceIndex) : segs;
  const insertAt = sourceIndex !== undefined && sourceIndex < gapIndex
    ? gapIndex - 1
    : gapIndex;
  const result = [...without];
  result.splice(insertAt, 0, seg);
  return normalizeCounter(result);
}
```

- [ ] **Step 9: Write verification script**

Create `frontend/app/components/CodeConfigModal.test.mjs`:

```js
// Quick Node verification — run with: node frontend/app/components/CodeConfigModal.test.mjs
// Delete this file after confirming.

// We can't import TS directly from Node without tsx. Copy the compiled logic:
// Instead, manually inline the functions or run `npx tsx CodeConfigModal.test.ts`.
// For a quick check, we'll use a simplified inline copy.

function normalizeCounter(segs) {
  const without = segs.filter(s => s.type !== 'counter');
  return [...without, { type: 'counter' }];
}

function insertAtGap(segs, seg, gapIndex, sourceIndex) {
  const without = sourceIndex !== undefined ? segs.filter((_, i) => i !== sourceIndex) : segs;
  const insertAt = sourceIndex !== undefined && sourceIndex < gapIndex ? gapIndex - 1 : gapIndex;
  const result = [...without];
  result.splice(insertAt, 0, seg);
  return normalizeCounter(result);
}

let pass = 0, fail = 0;
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`); fail++; }
}

// --- normalizeCounter ---
console.log('normalizeCounter:');
assert('counter already last',
  normalizeCounter([{type:'prefix',value:'A'},{type:'counter'}]),
  [{type:'prefix',value:'A'},{type:'counter'}]);
assert('counter not last → moved',
  normalizeCounter([{type:'counter'},{type:'prefix',value:'A'}]),
  [{type:'prefix',value:'A'},{type:'counter'}]);
assert('no counter → added',
  normalizeCounter([{type:'item'}]),
  [{type:'item'},{type:'counter'}]);

// --- insertAtGap track-to-track ---
console.log('insertAtGap (track-to-track):');
const track = [{type:'a'},{type:'b'},{type:'c'},{type:'counter'}];
assert('drag a(0) to gap[2] → b,a,c,counter',
  insertAtGap(track, {type:'a'}, 2, 0),
  [{type:'b'},{type:'a'},{type:'c'},{type:'counter'}]);
assert('drag c(2) to gap[1] → a,c,b,counter',
  insertAtGap(track, {type:'c'}, 1, 2),
  [{type:'a'},{type:'c'},{type:'b'},{type:'counter'}]);
assert('drag b(1) to gap[0] → b,a,c,counter',
  insertAtGap(track, {type:'b'}, 0, 1),
  [{type:'b'},{type:'a'},{type:'c'},{type:'counter'}]);

// --- insertAtGap palette-to-track ---
console.log('insertAtGap (palette-to-track):');
assert('insert year at gap[1] → a,year,b,counter',
  insertAtGap([{type:'a'},{type:'b'},{type:'counter'}], {type:'year'}, 1),
  [{type:'a'},{type:'year'},{type:'b'},{type:'counter'}]);
assert('insert at gap[0] → year,a,b,counter',
  insertAtGap([{type:'a'},{type:'b'},{type:'counter'}], {type:'year'}, 0),
  [{type:'year'},{type:'a'},{type:'b'},{type:'counter'}]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 10: Run the verification script**

```bash
node frontend/app/components/CodeConfigModal.test.mjs
```

Expected output:
```
normalizeCounter:
  ✓ counter already last
  ✓ counter not last → moved
  ✓ no counter → added
insertAtGap (track-to-track):
  ✓ drag a(0) to gap[2] → b,a,c,counter
  ✓ drag c(2) to gap[1] → a,c,b,counter
  ✓ drag b(1) to gap[0] → b,a,c,counter
insertAtGap (palette-to-track):
  ✓ insert year at gap[1] → a,year,b,counter
  ✓ insert at gap[0] → year,a,b,counter

8 passed, 0 failed
```

Fix any failures before proceeding.

- [ ] **Step 11: Delete the verification script and commit**

```bash
rm frontend/app/components/CodeConfigModal.test.mjs
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "feat(code-config): add Segment types and pure pipeline helpers"
```

---

## Task 2: Component State Wiring (No Render Change Yet)

**Files:**
- Modify: `frontend/app/components/CodeConfigModal.tsx` — replace internal state, keep existing JSX intact

Replace the component's `useState` for `config` with the new `segments` + `separator` + `activeGap` state, and replace `useEffect` body with the new re-derive logic. The **existing JSX render is removed** and replaced with a temporary `<div>Loading new UI…</div>` so the file compiles. This lets us verify state logic before building UI.

- [ ] **Step 1: Replace imports and state declarations**

Replace the top of the component function (from `const getDefaultPrefix` through the existing `useEffect`) with:

```tsx
export default function CodeConfigModal({
  isOpen, onClose, type, onSave, initialConfig, attributes,
}: CodeConfigModalProps) {
  const [segments, setSegments] = useState<Segment[]>(() => getDefaultSegments(type));
  const [separator, setSeparator] = useState('-');
  const [activeGap, setActiveGap] = useState<number | null>(null);
  const [currentStyle, setCurrentStyle] = useState('default');
  const dragRef = useRef<{
    sourceZone: 'track' | 'palette';
    index: number;
  } | null>(null);

  useEffect(() => {
    const savedStyle = localStorage.getItem('ui_style');
    if (savedStyle) setCurrentStyle(savedStyle);

    if (!isOpen) return;

    if (initialConfig) {
      setSegments(configToSegments(initialConfig, attributes));
      setSeparator(initialConfig.separator ?? '-');
    } else {
      setSegments(getDefaultSegments(type));
      setSeparator('-');
    }
  }, [isOpen, initialConfig]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;
```

- [ ] **Step 2: Replace handleSave**

```tsx
  const handleSave = () => {
    onSave(segmentsToConfig(segments, separator));
    onClose();
  };
```

- [ ] **Step 3: Add DnD handlers**

```tsx
  // ─── DnD Handlers ─────────────────────────────────────────────────────────

  const handleTrackDragStart = (e: React.DragEvent, index: number) => {
    dragRef.current = { sourceZone: 'track', index };
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePaletteDragStart = (e: React.DragEvent, palIndex: number) => {
    dragRef.current = { sourceZone: 'palette', index: palIndex };
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setActiveGap(null);
  };

  const handleGapDragOver = (e: React.DragEvent, gapIndex: number) => {
    e.preventDefault();
    setActiveGap(gapIndex);
  };

  const handleGapDragLeave = () => setActiveGap(null);

  const handleGapDrop = (e: React.DragEvent, gapIndex: number) => {
    e.preventDefault();
    setActiveGap(null);
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.sourceZone === 'track') {
      setSegments(prev => insertAtGap(prev, prev[drag.index], gapIndex, drag.index));
    } else {
      // palette → track
      const palette = getAvailablePalette(segments, attributes);
      const seg = palette[drag.index];
      if (seg) setSegments(prev => insertAtGap(normalizeCounter(prev), seg, gapIndex));
    }
    dragRef.current = null;
  };

  const handlePaletteDragOver = (e: React.DragEvent) => e.preventDefault();

  const handlePaletteDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setActiveGap(null);
    const drag = dragRef.current;
    if (drag?.sourceZone === 'track') {
      setSegments(prev => normalizeCounter(removeSegment(prev, drag.index)));
    }
    dragRef.current = null;
  };

  const handlePaletteChipClick = (seg: Segment) => {
    // Append before counter
    setSegments(prev => {
      const norm = normalizeCounter(prev);
      return insertAtGap(norm, seg, norm.length - 1);
    });
  };

  const handleRemoveFromTrack = (index: number) => {
    setSegments(prev => normalizeCounter(removeSegment(prev, index)));
  };

  const handlePrefixChange = (value: string) => {
    setSegments(prev => prev.map(s => s.type === 'prefix' ? { ...s, value: value.toUpperCase() } : s));
  };

  const handleSuffixChange = (value: string) => {
    setSegments(prev => prev.map(s => s.type === 'suffix' ? { ...s, value: value.toUpperCase() } : s));
  };
```

- [ ] **Step 4: Add temporary placeholder render and close the component**

Replace the existing `return (...)` block entirely with:

```tsx
  // TODO: replace with real render in Tasks 3–7
  const classic = currentStyle === 'classic';
  const preview = getPreview(segments, separator, attributes);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20100,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 400 }}>
        <p><strong>Pipeline builder coming soon</strong></p>
        <p>Preview: <code>{preview}</code></p>
        <p>Style: {classic ? 'classic' : 'default'}</p>
        <button onClick={onClose}>Close</button>
        <button onClick={handleSave} style={{ marginLeft: 8 }}>Save</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add `useRef` to the React import**

Change:
```tsx
import { useState, useEffect, Fragment } from 'react';
```
To:
```tsx
import { useState, useEffect, useRef, Fragment } from 'react';
```

- [ ] **Step 6: Start the dev server and verify it compiles with no TypeScript errors**

```bash
cd D:/BIE/teras-erp/frontend
npm run dev
```

Open the app in the browser. Open any modal that uses `CodeConfigModal` (e.g., BOM settings). Confirm:
- Modal opens showing the "Pipeline builder coming soon" placeholder
- Preview code string is correct
- Close and Save buttons work (no console errors)

Stop the dev server (`Ctrl+C`) after verification.

- [ ] **Step 7: Commit**

```bash
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "feat(code-config): wire segment state, DnD handlers, save path (placeholder render)"
```

---

## Task 3: Default Mode — Modal Shell, Header, Separator Row, Footer

**Files:**
- Modify: `frontend/app/components/CodeConfigModal.tsx` — replace placeholder render with the default-mode shell

This task builds the outer frame of the default (modern) modal. The track and palette are left as empty placeholder divs.

- [ ] **Step 1: Replace the placeholder `return` with the default-mode shell**

Replace the entire `return (...)` block with:

```tsx
  const classic = currentStyle === 'classic';
  const palette = getAvailablePalette(segments, attributes);

  if (classic) {
    // XP mode — built in Task 7
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20100 }}>
        <div style={{ background: '#fff', margin: '10vh auto', maxWidth: 400, padding: 24 }}>
          <p>XP mode coming soon — Task 7</p>
          <button onClick={onClose}>Close</button>
          <button onClick={handleSave} style={{ marginLeft: 8 }}>Save</button>
        </div>
      </div>
    );
  }

  // ─── Default (Modern) Mode ────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
      zIndex: 20100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className={`ui-style-${currentStyle}`} style={{
        width: '600px', maxWidth: '96vw',
        background: '#fff', borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.08)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a9e 100%)',
          padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '7px',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className="bi bi-gear-fill" style={{ color: '#fff', fontSize: '13px' }}></i>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '13px', lineHeight: 1.2 }}>
                Configure {getTypeName()} Code
              </div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', marginTop: '1px' }}>
                Drag segments to build your ID format
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
            color: 'rgba(255,255,255,0.75)', cursor: 'pointer',
            padding: '2px 8px 4px', fontSize: '18px', lineHeight: 1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>

          {/* Separator row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>Separator:</label>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={separator}
              onChange={e => setSeparator(e.target.value)}
            >
              <option value="-">Dash ( - )</option>
              <option value="_">Underscore ( _ )</option>
              <option value="/">Slash ( / )</option>
              <option value="">None</option>
            </select>
          </div>

          {/* Track placeholder — Task 4 */}
          <div style={{ minHeight: 60, background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#94a3b8', fontSize: 12 }}>
            Track coming in Task 4
          </div>

          {/* Palette placeholder — Task 5 */}
          <div style={{ minHeight: 40, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#94a3b8', fontSize: 12 }}>
            Palette coming in Task 5
          </div>

          {/* Preview bar */}
          <div style={{ background: '#1e293b', borderRadius: '7px', padding: '9px 13px',
                        display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="bi bi-code-slash" style={{ color: '#64748b', fontSize: '12px', flexShrink: 0 }}></i>
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: '14px', fontWeight: 700,
                           color: '#e2e8f0', letterSpacing: '1.2px' }}>
              {getPreview(segments, separator, attributes)}
            </span>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '11px 20px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          background: '#fafafa', flexShrink: 0,
        }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-sm btn-primary px-4" onClick={handleSave}>
            Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `getTypeName` helper function** (module-level, outside the component)

```ts
function getTypeName(type: string): string {
  const names: Record<string, string> = {
    BOM: 'BOM', WO: 'Work Order', PO: 'Purchase Order',
    SO: 'Sales Order', SAMPLE: 'Sample Request', ITEM: 'Item',
  };
  return names[type] ?? 'Document';
}
```

And update the `getTypeName()` call inside the component to `getTypeName(type)`.

- [ ] **Step 3: Start dev server and verify the shell renders correctly**

```bash
cd D:/BIE/teras-erp/frontend && npm run dev
```

Check:
- Navy header with title and close button
- Separator dropdown right-aligned
- Placeholder track and palette boxes visible
- Preview bar shows the code string (e.g. `BOM-ITEM001-2026-001` for BOM)
- Preview updates when separator is changed
- Cancel and Save buttons work

- [ ] **Step 4: Commit**

```bash
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "feat(code-config): default mode shell — header, separator row, preview bar, footer"
```

---

## Task 4: Default Mode — Track Panel with Chip Rendering and Gap Indicators

**Files:**
- Modify: `frontend/app/components/CodeConfigModal.tsx` — replace track placeholder with the real track

- [ ] **Step 1: Add a `SegmentChipDefault` render helper** (module-level function outside the component)

```tsx
function SegmentChipDefault({
  seg, index, activeGap, separator,
  onDragStart, onDragEnd,
  onGapDragOver, onGapDragLeave, onGapDrop,
  onRemove, onPrefixChange, onSuffixChange,
  isLast,
}: {
  seg: Segment; index: number; activeGap: number | null; separator: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onGapDragOver: (e: React.DragEvent, g: number) => void;
  onGapDragLeave: () => void;
  onGapDrop: (e: React.DragEvent, g: number) => void;
  onRemove: () => void;
  onPrefixChange: (v: string) => void;
  onSuffixChange: (v: string) => void;
  isLast: boolean;
}) {
  const color = CHIP_COLORS[seg.type] ?? '#64748b';
  const isCounter = seg.type === 'counter';
  const isEditable = seg.type === 'prefix' || seg.type === 'suffix';

  return (
    <Fragment>
      {/* Gap indicator before this chip */}
      <div
        onDragOver={e => onGapDragOver(e, index)}
        onDragLeave={onGapDragLeave}
        onDrop={e => onGapDrop(e, index)}
        style={{
          width: activeGap === index ? '16px' : '4px',
          minWidth: activeGap === index ? '16px' : '4px',
          height: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700, color: '#4b5563',
          background: activeGap === index ? `${color}22` : 'transparent',
          borderLeft: activeGap === index ? `2px solid ${color}` : 'none',
          transition: 'width 0.1s, background 0.1s',
          cursor: 'crosshair', userSelect: 'none', flexShrink: 0,
        }}
      >
        {activeGap !== index && index > 0 ? separator : ''}
      </div>

      {/* Chip */}
      <div
        draggable={!isCounter}
        onDragStart={isCounter ? undefined : onDragStart}
        onDragEnd={isCounter ? undefined : onDragEnd}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
          cursor: isCounter ? 'default' : 'grab',
          opacity: isCounter ? 0.75 : 1,
          flexShrink: 0,
        }}
      >
        <div style={{
          background: isCounter ? '#475569' : color,
          color: '#fff',
          borderRadius: '5px',
          padding: isEditable ? '3px 6px' : '4px 10px',
          display: 'flex', alignItems: 'center', gap: '5px',
          minHeight: '28px',
        }}>
          {!isCounter && (
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', cursor: 'grab' }}>⠿</span>
          )}

          {seg.type === 'prefix' && (
            <input
              value={seg.value}
              onChange={e => onPrefixChange(e.target.value)}
              placeholder="PREFIX"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '3px', color: '#fff', fontFamily: "'Courier New', monospace",
                fontSize: '12px', fontWeight: 700, letterSpacing: '1px',
                width: Math.max(50, seg.value.length * 9 + 12) + 'px',
                padding: '1px 4px', outline: 'none',
              }}
            />
          )}
          {seg.type === 'suffix' && (
            <input
              value={seg.value}
              onChange={e => onSuffixChange(e.target.value)}
              placeholder="SUFFIX"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '3px', color: '#fff', fontFamily: "'Courier New', monospace",
                fontSize: '12px', fontWeight: 700, letterSpacing: '1px',
                width: Math.max(50, seg.value.length * 9 + 12) + 'px',
                padding: '1px 4px', outline: 'none',
              }}
            />
          )}
          {!isEditable && (
            <span style={{
              fontFamily: "'Courier New', monospace", fontSize: '12px', fontWeight: 700,
              letterSpacing: '0.5px', color: '#fff',
            }}>
              {seg.type === 'item' ? 'ITEM001'
               : seg.type === 'attribute' ? (seg as any).name.toUpperCase()
               : seg.type === 'year' ? new Date().getFullYear()
               : seg.type === 'month' ? String(new Date().getMonth() + 1).padStart(2, '0')
               : '001'}
            </span>
          )}

          {!isCounter && (
            <button
              type="button"
              onClick={onRemove}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer', padding: '0 0 0 3px', fontSize: '13px', lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
        <div style={{
          fontSize: '9px', fontWeight: 600, color: isCounter ? '#64748b' : color,
          letterSpacing: '0.3px',
        }}>
          {seg.type === 'attribute' ? (seg as any).name
           : seg.type === 'counter' ? 'counter'
           : seg.type}
        </div>
      </div>
    </Fragment>
  );
}
```

- [ ] **Step 2: Replace the track placeholder div in the render**

Replace:
```tsx
{/* Track placeholder — Task 4 */}
<div style={{ ... }}>
  Track coming in Task 4
</div>
```

With:
```tsx
{/* Active Track */}
<div>
  <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af',
                textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
    Code Sequence
    <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '6px', color: '#cbd5e1' }}>
      drag to reorder — click × to remove
    </span>
  </div>
  <div style={{
    background: segments.filter(s => s.type !== 'counter').length === 0
      ? 'transparent' : '#f8fafc',
    border: segments.filter(s => s.type !== 'counter').length === 0
      ? '1.5px dashed #cbd5e1' : '1.5px solid #e2e8f0',
    borderRadius: '8px',
    padding: '10px 12px',
    display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '2px',
    minHeight: '60px',
  }}>
    {segments.length === 1 && segments[0].type === 'counter' ? (
      <span style={{ color: '#94a3b8', fontSize: '12px', margin: 'auto' }}>
        Drag segments here
      </span>
    ) : null}
    {segments.map((seg, i) => (
      <SegmentChipDefault
        key={`${seg.type}-${(seg as any).name ?? (seg as any).value ?? ''}-${i}`}
        seg={seg}
        index={i}
        activeGap={activeGap}
        separator={separator}
        onDragStart={e => handleTrackDragStart(e, i)}
        onDragEnd={handleDragEnd}
        onGapDragOver={handleGapDragOver}
        onGapDragLeave={handleGapDragLeave}
        onGapDrop={handleGapDrop}
        onRemove={() => handleRemoveFromTrack(i)}
        onPrefixChange={handlePrefixChange}
        onSuffixChange={handleSuffixChange}
        isLast={i === segments.length - 1}
      />
    ))}
  </div>
</div>
```

- [ ] **Step 3: Verify in browser**

Start dev server, open CodeConfigModal. Check:
- Chips render with correct colors
- Labels below chips are readable (full-opacity chip color on light bg)
- Drag handle `⠿` is visible (white on colored bg)
- Prefix chip shows inline input; typing updates the preview bar
- Counter chip has no drag handle and no × button
- Clicking × on a chip removes it from the track

- [ ] **Step 4: Commit**

```bash
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "feat(code-config): default mode track panel with chip rendering and gap indicators"
```

---

## Task 5: Default Mode — Palette Panel and Click-to-Add

**Files:**
- Modify: `frontend/app/components/CodeConfigModal.tsx` — replace palette placeholder

- [ ] **Step 1: Replace the palette placeholder div**

Replace:
```tsx
{/* Palette placeholder — Task 5 */}
<div style={{ ... }}>
  Palette coming in Task 5
</div>
```

With:
```tsx
{/* Palette */}
{palette.length > 0 && (
  <div>
    <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af',
                  textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
      Available Segments
      <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '6px', color: '#cbd5e1' }}>
        drag onto track or click to add
      </span>
    </div>
    <div
      onDragOver={handlePaletteDragOver}
      onDrop={handlePaletteDrop}
      style={{
        background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
        padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '44px',
      }}
    >
      {palette.map((seg, i) => {
        const color = CHIP_COLORS[seg.type] ?? '#64748b';
        const label = seg.type === 'attribute' ? (seg as any).name
                    : seg.type === 'prefix' ? 'Prefix'
                    : seg.type === 'suffix' ? 'Suffix'
                    : seg.type === 'item' ? 'Item Code'
                    : seg.type === 'year' ? 'Year'
                    : seg.type === 'month' ? 'Month'
                    : seg.type;
        return (
          <div
            key={`pal-${seg.type}-${(seg as any).name ?? i}`}
            draggable
            onDragStart={e => handlePaletteDragStart(e, i)}
            onDragEnd={handleDragEnd}
            onClick={() => handlePaletteChipClick(seg)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '5px', cursor: 'grab',
              border: `1.5px solid ${color}`, background: '#fff',
              color: color, fontSize: '12px', fontWeight: 600,
              fontFamily: "'Courier New', monospace", letterSpacing: '0.3px',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: '10px', opacity: 0.6 }}>⊕</span>
            {label}
          </div>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 2: Verify in browser**

- Palette shows chips not currently in the track
- Clicking a palette chip adds it to the end of the track (before counter)
- Prefix chip disappears from palette once added to track
- Removing a chip from track returns it to palette
- When all segments are on the track, palette section is hidden entirely

- [ ] **Step 3: Commit**

```bash
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "feat(code-config): default mode palette panel with click-to-add"
```

---

## Task 6: Verify Full DnD in Default Mode

This task has no code changes — it is a dedicated verification pass for drag-and-drop interactions.

- [ ] **Step 1: Start dev server and open the modal in a browser**

```bash
cd D:/BIE/teras-erp/frontend && npm run dev
```

- [ ] **Step 2: Verify each DnD scenario**

Work through each case. There must be no console errors and no incorrect segment ordering.

| # | Action | Expected |
|---|--------|----------|
| 1 | Drag track chip to a gap earlier in the track | Chip moves earlier; counter stays last |
| 2 | Drag track chip to a gap later in the track | Chip moves later; counter stays last |
| 3 | Drag palette chip onto gap[0] (before first chip) | Chip inserted at front |
| 4 | Drag palette chip onto gap in the middle | Chip inserted at correct position |
| 5 | Drag track chip onto the palette zone | Chip removed from track, appears in palette |
| 6 | Press Escape mid-drag (or drag off-screen) | `activeGap` resets; no phantom highlight remains |
| 7 | Drag gap highlights | Only hovered gap highlights; others stay `4px` |
| 8 | Gap shows separator char when inactive | Dash/underscore/slash visible between chips |
| 9 | Separator = None | No character shown in gaps |
| 10 | Preview bar updates after every change | Code string reflects current track order |

- [ ] **Step 3: Fix any failures, then commit if changes were needed**

If no code changes: no commit needed. If fixes were required:

```bash
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "fix(code-config): DnD edge cases from verification pass"
```

---

## Task 7: XP Classic Mode — Full Render

**Files:**
- Modify: `frontend/app/components/CodeConfigModal.tsx` — replace XP placeholder with full implementation

The XP mode uses the **same** `segments`, `separator`, `activeGap`, drag handlers, and DnD logic. Only the JSX differs.

- [ ] **Step 1: Replace the XP classic placeholder inside `if (classic)` with the full render**

Replace the `if (classic) { return (...placeholder...) }` block with:

```tsx
  if (classic) {
    const xpGap = (gapIndex: number) => (
      <div
        key={`xp-gap-${gapIndex}`}
        onDragOver={e => handleGapDragOver(e, gapIndex)}
        onDragLeave={handleGapDragLeave}
        onDrop={e => handleGapDrop(e, gapIndex)}
        style={{
          width: activeGap === gapIndex ? '16px' : '4px',
          minWidth: activeGap === gapIndex ? '16px' : '4px',
          height: '32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: '#555555',
          background: activeGap === gapIndex ? '#cce0ff' : 'transparent',
          borderLeft: activeGap === gapIndex ? '2px solid #0058e6' : 'none',
          transition: 'width 0.1s',
          cursor: 'crosshair', userSelect: 'none', flexShrink: 0,
          fontFamily: 'Tahoma, Arial, sans-serif',
        }}
      >
        {activeGap !== gapIndex && gapIndex > 0 ? separator : ''}
      </div>
    );

    const xpChip = (seg: Segment, i: number) => {
      const isCounter = seg.type === 'counter';
      const textColor = CHIP_COLORS_CLASSIC_TEXT[seg.type] ?? '#333';
      const isPrefix = seg.type === 'prefix';
      const isSuffix = seg.type === 'suffix';
      const label = seg.type === 'attribute' ? (seg as any).name
                  : seg.type === 'prefix' ? 'prefix'
                  : seg.type === 'suffix' ? 'suffix'
                  : seg.type === 'item' ? 'item code'
                  : seg.type;
      return (
        <Fragment key={`xp-chip-${seg.type}-${(seg as any).name ?? (seg as any).value ?? ''}-${i}`}>
          {xpGap(i)}
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', flexShrink: 0 }}
          >
            <div
              draggable={!isCounter}
              onDragStart={isCounter ? undefined : e => handleTrackDragStart(e, i)}
              onDragEnd={isCounter ? undefined : handleDragEnd}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: isCounter
                  ? 'linear-gradient(to bottom, #e0e0e0, #c0c0c0)'
                  : 'linear-gradient(to bottom, #ffffff, #d4d0c8)',
                border: '1px solid',
                borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                padding: isPrefix || isSuffix ? '2px 5px' : '2px 8px',
                fontFamily: isCounter ? 'Tahoma, Arial, sans-serif' : "'Courier New', monospace",
                fontSize: '11px', fontWeight: 'bold',
                color: isCounter ? '#333' : textColor,
                cursor: isCounter ? 'default' : 'grab',
                opacity: isCounter ? 0.85 : 1,
                userSelect: 'none',
                minHeight: '22px',
              }}
            >
              {!isCounter && (
                <span style={{ color: '#666', fontSize: '9px' }}>⠿</span>
              )}
              {isPrefix && (
                <input
                  value={seg.value}
                  onChange={e => handlePrefixChange(e.target.value)}
                  placeholder="PREFIX"
                  style={{
                    fontFamily: "'Courier New', monospace", fontSize: '11px', fontWeight: 'bold',
                    color: textColor, background: '#fff',
                    border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                    boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)',
                    padding: '1px 3px', width: Math.max(40, seg.value.length * 7 + 10) + 'px',
                    outline: 'none',
                  }}
                />
              )}
              {isSuffix && (
                <input
                  value={seg.value}
                  onChange={e => handleSuffixChange(e.target.value)}
                  placeholder="SUFFIX"
                  style={{
                    fontFamily: "'Courier New', monospace", fontSize: '11px', fontWeight: 'bold',
                    color: textColor, background: '#fff',
                    border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                    boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)',
                    padding: '1px 3px', width: Math.max(40, seg.value.length * 7 + 10) + 'px',
                    outline: 'none',
                  }}
                />
              )}
              {!isPrefix && !isSuffix && (
                <span>
                  {seg.type === 'item' ? 'ITEM001'
                   : seg.type === 'attribute' ? (seg as any).name.toUpperCase()
                   : seg.type === 'year' ? new Date().getFullYear()
                   : seg.type === 'month' ? String(new Date().getMonth() + 1).padStart(2, '0')
                   : '001'}
                </span>
              )}
              {!isCounter && (
                <button
                  type="button"
                  onClick={() => handleRemoveFromTrack(i)}
                  style={{
                    background: 'linear-gradient(to bottom, #fff, #d4d0c8)',
                    border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
                    color: '#800000', cursor: 'pointer', fontSize: '9px', lineHeight: 1,
                    padding: '0 3px', fontWeight: 'bold',
                  }}
                >×</button>
              )}
            </div>
            <div style={{ fontSize: '8px', color: '#333', fontFamily: 'Tahoma, Arial, sans-serif' }}>
              {label}
            </div>
          </div>
        </Fragment>
      );
    };

    const xpPaletteChip = (seg: Segment, i: number) => {
      const label = seg.type === 'attribute' ? (seg as any).name
                  : seg.type === 'prefix' ? '+ Prefix'
                  : seg.type === 'suffix' ? '+ Suffix'
                  : seg.type === 'item' ? '+ Item Code'
                  : seg.type === 'year' ? '+ Year'
                  : seg.type === 'month' ? '+ Month'
                  : `+ ${seg.type}`;
      return (
        <div
          key={`xp-pal-${seg.type}-${(seg as any).name ?? i}`}
          draggable
          onDragStart={e => handlePaletteDragStart(e, i)}
          onDragEnd={handleDragEnd}
          onClick={() => handlePaletteChipClick(seg)}
          style={{
            padding: '2px 8px',
            border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
            background: 'linear-gradient(to bottom, #fff, #d4d0c8)',
            fontFamily: "'Courier New', monospace", fontSize: '10px',
            color: CHIP_COLORS_CLASSIC_TEXT[seg.type] ?? '#333',
            cursor: 'grab', userSelect: 'none',
          }}
        >
          {label}
        </div>
      );
    };

    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 20100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: '540px', maxWidth: '96vw',
          border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
          boxShadow: '3px 3px 8px rgba(0,0,0,0.4)',
          background: '#ece9d8', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px',
        }}>
          {/* XP Title Bar */}
          <div style={{
            background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)',
            color: '#fff', padding: '4px 6px 4px 8px', fontWeight: 'bold', fontSize: '12px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)', borderBottom: '1px solid #003080',
            userSelect: 'none',
          }}>
            <span>
              <i className="bi bi-gear-fill" style={{ marginRight: '6px' }}></i>
              Configure {getTypeName(type)} Code
            </span>
            <button onClick={onClose} style={{
              background: 'linear-gradient(to bottom, #d9a0a0, #b03030)',
              border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
              color: '#fff', fontWeight: 'bold', fontSize: '9px',
              width: '16px', height: '16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>✕</button>
          </div>

          {/* Body */}
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

            {/* Separator row */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '10px' }}>Separator:</span>
              <select
                value={separator}
                onChange={e => setSeparator(e.target.value)}
                style={{
                  fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px',
                  border: '1px solid', borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                  boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)',
                  padding: '1px 4px', background: '#fff',
                }}
              >
                <option value="-">Dash (-)</option>
                <option value="_">Underscore (_)</option>
                <option value="/">Slash (/)</option>
                <option value="">None</option>
              </select>
            </div>

            {/* Track */}
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>
                Code Sequence <span style={{ fontWeight: 'normal', color: '#666' }}>(drag to reorder)</span>
              </div>
              <div style={{
                background: '#fff', border: '1px solid',
                borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.12)',
                padding: '7px 8px', display: 'flex', alignItems: 'flex-end',
                flexWrap: 'wrap', gap: '2px', minHeight: '46px',
              }}>
                {segments.map((seg, i) => xpChip(seg, i))}
              </div>
            </div>

            {/* Palette */}
            {palette.length > 0 && (
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>
                  Available <span style={{ fontWeight: 'normal', color: '#666' }}>(drag or click to add)</span>
                </div>
                <div
                  onDragOver={handlePaletteDragOver}
                  onDrop={handlePaletteDrop}
                  style={{
                    background: '#f5f3ee', border: '1px solid',
                    borderColor: '#808080 #dfdfdf #dfdfdf #808080',
                    boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.08)',
                    padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: '5px',
                    minHeight: '30px',
                  }}
                >
                  {palette.map((seg, i) => xpPaletteChip(seg, i))}
                </div>
              </div>
            )}

            {/* XP Preview */}
            <div style={{
              background: '#fff', border: '2px solid',
              borderColor: '#808080 #dfdfdf #dfdfdf #808080',
              boxShadow: 'inset 2px 2px 0 rgba(0,0,0,0.1)',
              padding: '7px 10px',
            }}>
              <div style={{ fontSize: '9px', color: '#555', marginBottom: '3px', fontWeight: 'bold',
                            textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <i className="bi bi-eye" style={{ marginRight: '4px' }}></i>Preview
              </div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: '14px',
                            fontWeight: 'bold', color: '#000', letterSpacing: '0.5px' }}>
                {getPreview(segments, separator, attributes)}
              </div>
            </div>

          </div>

          {/* XP Footer */}
          <div style={{
            borderTop: '1px solid #b0aaa0', padding: '7px 12px',
            display: 'flex', justifyContent: 'flex-end', gap: '6px', background: '#ece9d8',
          }}>
            <button onClick={onClose} style={{
              fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '4px 18px',
              background: 'linear-gradient(to bottom, #fff, #d4d0c8)',
              border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', cursor: 'pointer',
            }}>Cancel</button>
            <button onClick={handleSave} style={{
              fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '4px 18px',
              fontWeight: 'bold', background: 'linear-gradient(to bottom, #6699cc, #3366aa)',
              border: '1px solid', borderColor: '#99bbee #224477 #224477 #99bbee',
              color: '#fff', cursor: 'pointer',
            }}>Save Configuration</button>
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Switch to XP mode in the browser and verify**

Open browser dev tools console, run:
```js
localStorage.setItem('ui_style', 'classic'); location.reload();
```

Then open the modal. Check:
- XP title bar with blue gradient
- XP bevel borders on modal shell
- Track shows XP-style raised button chips with beveled borders
- Chip text is dark (not white) — contrast is readable
- Drag handle `⠿` is `#666` on light chip background
- Labels below chips are `#333` on `#ece9d8` — readable
- Palette shows XP raised button style chips
- XP inset preview box with black Courier New text
- XP footer buttons
- DnD works identically to default mode

Reset back to default:
```js
localStorage.setItem('ui_style', 'default'); location.reload();
```

- [ ] **Step 3: Commit**

```bash
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "feat(code-config): XP classic mode — full pipeline render with beveled XP chip style"
```

---

## Task 8: Integration Verification and Cleanup

**Files:**
- Modify: `frontend/app/components/CodeConfigModal.tsx` — fix any remaining issues

- [ ] **Step 1: Test all 6 document types**

Open the CodeConfigModal for each type and verify the correct default segments are pre-loaded:

| Type | Expected default track |
|------|------------------------|
| BOM | Prefix(BOM) — Item — Counter |
| WO | Prefix(WO) — Item — Counter |
| PO | Prefix(PO) — Year — Counter |
| SO | Prefix(SO) — Counter |
| SAMPLE | Prefix(SMP) — Year — Counter |
| ITEM | Prefix(ITM) — Counter |

- [ ] **Step 2: Test initialConfig round-trip**

Save a config, re-open the modal, verify the saved config is correctly loaded back as segments. Specifically:
- Attribute chips appear in the correct saved order
- Prefix value is pre-filled in the inline input
- Year/Month toggles correctly restore

- [ ] **Step 3: Test legacy migration**

If any saved configs exist with the old single `variantAttributeName` string, confirm they load without error and the attribute chip appears.

- [ ] **Step 4: Contrast check — scan for light-on-light or dark-on-dark violations**

In default mode, inspect visually:
- [ ] All chip labels below chips use full-saturation color (not faded)
- [ ] Separator chars in gaps are `#4b5563` on `#f8fafc` — readable
- [ ] Palette chip text is full chip color on white
- [ ] Preview bar: `#e2e8f0` on `#1e293b`

In classic mode:
- [ ] Chip text is dark (`#00327a`, `#003a00`, `#320070`, `#4a2e00`, `#5c0028`, `#003344`)
- [ ] Drag handle `⠿` is `#666` on light gradient
- [ ] Labels below chips are `#333` on `#ece9d8`
- [ ] Preview: black on white

Fix any contrast violations found.

- [ ] **Step 5: Verify no TypeScript build errors**

```bash
cd D:/BIE/teras-erp/frontend
npm run build
```

Expected: Build completes with no TypeScript errors. Fix any type errors before proceeding.

- [ ] **Step 6: Final commit**

```bash
cd D:/BIE/teras-erp
git add frontend/app/components/CodeConfigModal.tsx
git commit -m "feat(code-config): pipeline builder complete — both modes, DnD, contrast verified"
```

---

## Acceptance Criteria Summary

Before calling this done, all of these must be true:

- [ ] Both themes render correctly (modern + XP classic)
- [ ] Drag-to-reorder works in both modes (track-to-track)
- [ ] Drag from palette to track works
- [ ] Drag from track to palette zone removes chip
- [ ] Click on palette chip appends to track
- [ ] Click × removes chip from track
- [ ] Prefix/suffix chips show inline inputs; auto-upcases
- [ ] Prefix/suffix are hidden from palette when on track
- [ ] Counter chip is always last, no drag handle, no × button
- [ ] `onSave` is called with a valid `CodeConfig` (backward-compatible shape)
- [ ] `initialConfig` is correctly deserialized into segments on open
- [ ] Legacy `variantAttributeName` string migration works
- [ ] Stale attribute names in `variantAttributeNames` are silently dropped
- [ ] `npm run build` passes with no TypeScript errors
- [ ] No WCAG contrast failures (verified visually per Task 8 checklist)
