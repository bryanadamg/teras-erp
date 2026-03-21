import { useState, useEffect, useRef, Fragment } from 'react';

export interface CodeConfig {
    prefix: string;
    suffix: string;
    separator: string;
    includeItemCode: boolean;
    includeVariant: boolean;
    variantAttributeNames?: string[]; // Array of selected attribute names
    includeYear: boolean;
    includeMonth: boolean;
}

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

export function normalizeCounter(segs: Segment[]): Segment[] {
  const without = segs.filter(s => s.type !== 'counter');
  return [...without, { type: 'counter' }];
}

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

export function configToSegments(
  cfg: CodeConfig,
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): Segment[] {
  const safe: any = { ...cfg };
  if (typeof safe.variantAttributeName === 'string') {
    safe.variantAttributeNames = [safe.variantAttributeName].filter(Boolean);
    delete safe.variantAttributeName;
  }
  if (!safe.variantAttributeNames) safe.variantAttributeNames = [];

  const segs: Segment[] = [];
  if (safe.prefix)          segs.push({ type: 'prefix', value: safe.prefix });
  if (safe.includeItemCode)  segs.push({ type: 'item' });

  if (safe.includeVariant && safe.variantAttributeNames.length > 0) {
    const seen = new Set<string>();
    for (const name of safe.variantAttributeNames) {
      if (seen.has(name)) continue;
      if (!attributes.find(a => a.name === name)) continue;
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

export function segmentsToConfig(segs: Segment[], separator: string): CodeConfig {
  const normalized = normalizeCounter(segs);
  return {
    prefix:                normalized.find((s): s is Extract<Segment, { type: 'prefix' }> => s.type === 'prefix')?.value ?? '',
    suffix:                normalized.find((s): s is Extract<Segment, { type: 'suffix' }> => s.type === 'suffix')?.value ?? '',
    separator,
    includeItemCode:       normalized.some(s => s.type === 'item'),
    includeVariant:        normalized.some(s => s.type === 'attribute'),
    variantAttributeNames: (normalized.filter((s): s is Extract<Segment, { type: 'attribute' }> => s.type === 'attribute')).map(s => s.name),
    includeYear:           normalized.some(s => s.type === 'year'),
    includeMonth:          normalized.some(s => s.type === 'month'),
  };
}

export function getSegmentPreviewValue(
  seg: Segment,
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): string {
  switch (seg.type) {
    case 'prefix':    return seg.value || 'PREFIX';
    case 'item':      return 'ITEM001';
    case 'attribute': {
      const attr = attributes.find(a => a.name === seg.name);
      return attr?.values[0]?.value.toUpperCase() ?? 'VAR';
    }
    case 'year':    return String(new Date().getFullYear());
    case 'month':   return String(new Date().getMonth() + 1).padStart(2, '0');
    case 'suffix':  return seg.value || 'SUFFIX';
    case 'counter': return '001';
  }
}

export function getPreview(
  segs: Segment[],
  separator: string,
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): string {
  const normalized = normalizeCounter(segs);
  return normalized.map(s => getSegmentPreviewValue(s, attributes)).join(separator);
}

export function getAvailablePalette(
  segs: Segment[],
  attributes: { id: any; name: string; values: { id: any; value: string }[] }[]
): Segment[] {
  const palette: Segment[] = [];
  if (!segs.some(s => s.type === 'prefix'))
    palette.push({ type: 'prefix', value: '' });
  if (!segs.some(s => s.type === 'suffix'))
    palette.push({ type: 'suffix', value: '' });
  const statics: Segment['type'][] = ['item', 'year', 'month'];
  for (const t of statics) {
    if (!segs.some(s => s.type === t)) palette.push({ type: t } as Segment);
  }
  for (const attr of attributes) {
    if (!segs.some(s => s.type === 'attribute' && (s as any).name === attr.name))
      palette.push({ type: 'attribute', name: attr.name });
  }
  return palette;
}

export function removeSegment(segs: Segment[], index: number): Segment[] {
  return segs.filter((_, i) => i !== index);
}

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

function getTypeName(type: string): string {
  const names: Record<string, string> = {
    BOM: 'BOM', WO: 'Work Order', PO: 'Purchase Order',
    SO: 'Sales Order', SAMPLE: 'Sample Request', ITEM: 'Item',
  };
  return names[type] ?? 'Document';
}

function SegmentChipDefault({
  seg, index, activeGap, separator,
  onDragStart, onDragEnd,
  onGapDragOver, onGapDragLeave, onGapDrop,
  onRemove, onPrefixChange, onSuffixChange,
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
}) {
  const color = CHIP_COLORS[seg.type] ?? '#64748b';
  const isCounter = seg.type === 'counter';
  const isPrefix = seg.type === 'prefix';
  const isSuffix = seg.type === 'suffix';
  const isEditable = isPrefix || isSuffix;

  return (
    <Fragment>
      {/* Gap indicator before this chip — doubles as separator char display */}
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
          background: color,
          color: '#fff',
          borderRadius: '5px',
          padding: isEditable ? '3px 6px' : '4px 10px',
          display: 'flex', alignItems: 'center', gap: '5px',
          minHeight: '28px',
        }}>
          {!isCounter && (
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', cursor: 'grab' }}>⠿</span>
          )}

          {isPrefix && (
            <input
              value={(seg as Extract<Segment, { type: 'prefix' }>).value}
              onChange={e => onPrefixChange(e.target.value)}
              placeholder="PREFIX"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '3px', color: '#fff', fontFamily: "'Courier New', monospace",
                fontSize: '12px', fontWeight: 700, letterSpacing: '1px',
                width: Math.max(50, (seg as Extract<Segment, { type: 'prefix' }>).value.length * 9 + 12) + 'px',
                padding: '1px 4px', outline: 'none',
              }}
            />
          )}
          {isSuffix && (
            <input
              value={(seg as Extract<Segment, { type: 'suffix' }>).value}
              onChange={e => onSuffixChange(e.target.value)}
              placeholder="SUFFIX"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '3px', color: '#fff', fontFamily: "'Courier New', monospace",
                fontSize: '12px', fontWeight: 700, letterSpacing: '1px',
                width: Math.max(50, (seg as Extract<Segment, { type: 'suffix' }>).value.length * 9 + 12) + 'px',
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
               : seg.type === 'attribute' ? (seg as Extract<Segment, { type: 'attribute' }>).name.toUpperCase()
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
        {/* Label below chip */}
        <div style={{
          fontSize: '9px', fontWeight: 600,
          color: isCounter ? '#64748b' : color,
          letterSpacing: '0.3px',
        }}>
          {seg.type === 'attribute' ? (seg as Extract<Segment, { type: 'attribute' }>).name
           : seg.type === 'counter' ? 'counter'
           : seg.type}
        </div>
      </div>
    </Fragment>
  );
}

interface CodeConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'BOM' | 'WO' | 'PO' | 'SO' | 'SAMPLE' | 'ITEM';
    onSave: (config: CodeConfig) => void;
    initialConfig?: CodeConfig;
    attributes: any[];
}

export default function CodeConfigModal({ isOpen, onClose, type, onSave, initialConfig, attributes }: CodeConfigModalProps) {
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
  }, [isOpen, initialConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(segmentsToConfig(segments, separator));
    onClose();
  };

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

  const classic = currentStyle === 'classic';
  const palette = getAvailablePalette(segments, attributes);

  if (classic) {
    // XP mode — built in Task 7
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20100 }}>
        <div style={{ background: '#fff', margin: '10vh auto', maxWidth: 400, padding: 24, fontFamily: 'Tahoma, Arial, sans-serif' }}>
          <p><strong>XP mode coming soon — Task 7</strong></p>
          <p>Preview: <code>{getPreview(segments, separator, attributes)}</code></p>
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
                Configure {getTypeName(type)} Code
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

          {/* Active Track */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
              Code Sequence
              <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '6px', color: '#cbd5e1',
                             fontSize: '10px' }}>
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
                  key={`${seg.type}-${seg.type === 'attribute' ? (seg as any).name : seg.type === 'prefix' || seg.type === 'suffix' ? (seg as any).value : ''}-${i}`}
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
                />
              ))}
            </div>
          </div>

          {/* Palette placeholder — replaced in Task 5 */}
          <div style={{ minHeight: 40, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#94a3b8', fontSize: 12 }}>
            Palette (Task 5)
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
