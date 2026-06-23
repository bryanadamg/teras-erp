import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

const ALL = '__all__';

export default function LocationsView({
  locations,
  onCreateLocation,
  onUpdateLocation,
  onDeleteLocation,
  onRefresh,
  fetchLocations,
}: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  const [selectedWh, setSelectedWh] = useState<string>(ALL);
  const [searchTerm, setSearchTerm] = useState('');

  // Add warehouse (top-level)
  const [addingWh, setAddingWh] = useState(false);
  const [newWh, setNewWh] = useState({ code: '', name: '' });
  const [savingWh, setSavingWh] = useState(false);

  // Add spot (child of selected warehouse)
  const [showSpotForm, setShowSpotForm] = useState(false);
  const [newSpotName, setNewSpotName] = useState('');
  const [savingSpot, setSavingSpot] = useState(false);

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag-drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredWh, setHoveredWh] = useState<string | null>(null);

  // ---------- styles (classic XP) ----------
  const xpBevel: React.CSSProperties = { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0 };
  const xpTitleBar: React.CSSProperties = { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, fontWeight: 'bold', padding: '4px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)', borderBottom: '1px solid #003080', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 26 };
  const xpToolbar: React.CSSProperties = { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const };
  const xpBtn = (extra: any = {}) => ({ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 0, ...extra });
  const xpInput: React.CSSProperties = { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, border: '1px solid #7f9db9', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px', background: '#fff', color: '#000', height: 20, outline: 'none' };
  const xpLabel: React.CSSProperties = { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#000', display: 'block', marginBottom: 2 };

  // ---------- derived data ----------
  const all = (locations || []);
  const topLevel = all.filter((l: any) => !l.parent_id).sort((a: any, b: any) => a.name.localeCompare(b.name));
  const childrenOf = (id: string) => all.filter((l: any) => l.parent_id === id).sort((a: any, b: any) => a.name.localeCompare(b.name));
  const childCount = (id: string) => all.filter((l: any) => l.parent_id === id).length;
  const selectedWarehouse = selectedWh !== ALL ? all.find((l: any) => l.id === selectedWh) : null;
  const codeSet = new Set(all.map((l: any) => l.code));
  const ensureUniqueCode = (base: string) => {
    let c = base, n = 1;
    while (codeSet.has(c)) { c = `${base}-${n}`; n++; }
    return c;
  };

  // If the selected warehouse disappears, fall back to All.
  useEffect(() => {
    if (selectedWh !== ALL && !all.some((l: any) => l.id === selectedWh)) setSelectedWh(ALL);
  }, [locations, selectedWh]);

  // ---------- handlers ----------
  const handleAddWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingWh) return;
    setSavingWh(true);
    try {
      const res = await onCreateLocation({ code: newWh.code, name: newWh.name, parent_id: null });
      if (res && res.status === 400) {
        showToast(`Code "${newWh.code}" already exists`, 'warning');
        setNewWh({ ...newWh, code: ensureUniqueCode(newWh.code.replace(/-\d+$/, '')) });
      } else if (res && res.ok) {
        showToast('Warehouse added', 'success');
        setNewWh({ code: '', name: '' });
        setAddingWh(false);
      } else { showToast('Failed to add warehouse', 'danger'); }
    } finally { setSavingWh(false); }
  };

  const handleAddSpot = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSpotName.trim();
    if (!name || savingSpot || !selectedWarehouse) return;
    setSavingSpot(true);
    try {
      const base = `${selectedWarehouse.code}-${name}`.replace(/\s+/g, '-');
      const code = ensureUniqueCode(base);
      const res = await onCreateLocation({ code, name, parent_id: selectedWarehouse.id });
      if (res && res.ok) {
        showToast('Spot added', 'success');
        setNewSpotName(''); // keep form open for rapid entry
      } else if (res && res.status === 400) {
        showToast('Could not add spot (duplicate code)', 'warning');
      } else { showToast('Failed to add spot', 'danger'); }
    } finally { setSavingSpot(false); }
  };

  const startRename = (loc: any) => { setRenamingId(loc.id); setRenameValue(loc.name); };
  const commitRename = async () => {
    const id = renamingId; const name = renameValue.trim();
    if (!id) return;
    const cur = all.find((l: any) => l.id === id);
    if (!name || (cur && name === cur.name)) { setRenamingId(null); return; }
    const res = onUpdateLocation ? await onUpdateLocation(id, { name }) : null;
    if (res && res.ok) showToast('Renamed', 'success');
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    const err = await onDeleteLocation(id);
    if (typeof err === 'string') showToast(err, 'danger');
  };

  // drag-drop: spots dragged onto a warehouse re-parent
  const onRowDragStart = (e: React.DragEvent, loc: any) => { setDraggingId(loc.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', loc.id); } catch {} };
  const onRowDragEnd = () => { setDraggingId(null); setDragOverId(null); };
  const onWhDragOver = (e: React.DragEvent, whId: string) => { if (!draggingId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverId !== whId) setDragOverId(whId); };
  const onWhDragLeave = (whId: string) => setDragOverId(prev => (prev === whId ? null : prev));
  const onWhDrop = (e: React.DragEvent, whId: string) => {
    e.preventDefault();
    const id = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null); setDragOverId(null);
    if (!id || !onUpdateLocation) return;
    const loc = all.find((l: any) => l.id === id);
    if (!loc || loc.parent_id === whId || loc.id === whId) return;
    onUpdateLocation(id, { parent_id: whId });
  };

  const q = searchTerm.toLowerCase();
  const matches = (l: any) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q);

  // =========================================================
  // CLASSIC (XP)
  // =========================================================
  if (classic) {
    const whRow = (loc: any) => {
      const active = selectedWh === loc.id;
      const over = dragOverId === loc.id;
      const renaming = renamingId === loc.id;
      const cnt = childCount(loc.id);
      return (
        <div
          key={loc.id}
          onClick={() => !renaming && setSelectedWh(loc.id)}
          onMouseEnter={() => setHoveredWh(loc.id)}
          onMouseLeave={() => setHoveredWh(null)}
          onDragOver={(e) => onWhDragOver(e, loc.id)}
          onDragLeave={() => onWhDragLeave(loc.id)}
          onDrop={(e) => onWhDrop(e, loc.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: active ? '#fff' : '#000', background: over ? '#ffe9a8' : active ? 'linear-gradient(to bottom,#3c8cf0,#1a5fd0)' : 'transparent', border: over ? '1px dashed #b8860b' : '1px solid transparent' }}
        >
          <i className={`bi ${cnt > 0 ? 'bi-house-fill' : 'bi-house'}`} style={{ color: active ? '#fff' : '#caa55a' }} />
          {renaming ? (
            <input autoFocus style={{ ...xpInput, flex: 1, minWidth: 0 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</span>
          )}
          <span style={{ fontSize: 10, color: active ? '#dde' : '#777' }}>{cnt}</span>
          {!renaming && hoveredWh === loc.id && (
            <>
              <i className="bi bi-pencil" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(loc); }} style={{ color: active ? '#fff' : '#333', fontSize: 11 }} />
              <i className="bi bi-trash" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }} style={{ color: active ? '#fff' : '#c00000', fontSize: 11 }} />
            </>
          )}
        </div>
      );
    };

    const spotRow = (loc: any) => {
      const renaming = renamingId === loc.id;
      return (
        <div
          key={loc.id}
          draggable={!renaming}
          onDragStart={(e) => onRowDragStart(e, loc)}
          onDragEnd={onRowDragEnd}
          onMouseEnter={() => setHoveredRow(loc.id)}
          onMouseLeave={() => setHoveredRow(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderBottom: '1px solid #e3e0d8', background: draggingId === loc.id ? '#fff7d6' : hoveredRow === loc.id ? '#f0f6ff' : '#fff', cursor: 'grab' }}
        >
          <i className="bi bi-grip-vertical" style={{ color: '#aaa' }} />
          <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: '#00008b', fontVariant: 'all-small-caps', width: 130 }}>{loc.code}</span>
          {renaming ? (
            <input autoFocus style={{ ...xpInput, flex: 1, minWidth: 0 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</span>
          )}
          <i className="bi bi-pencil" title="Rename" onClick={() => startRename(loc)} style={{ color: '#666', cursor: 'pointer' }} />
          <button style={xpBtn({ padding: '1px 5px', background: 'transparent', border: '1px solid transparent' })} onClick={() => handleDelete(loc.id)} title="Delete"><i className="bi bi-trash" style={{ color: '#c00000' }} /></button>
        </div>
      );
    };

    const renderRightList = () => {
      if (selectedWh === ALL) {
        const blocks: React.ReactNode[] = [];
        for (const wh of topLevel) {
          const kids = childrenOf(wh.id).filter(matches);
          const whMatch = matches(wh);
          if (!whMatch && kids.length === 0 && q) continue;
          blocks.push(
            <div key={`h-${wh.id}`} style={{ padding: '3px 10px', background: '#dfe8f6', borderBottom: '1px solid #b0c4de', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: '#003080' }}>
              <i className="bi bi-house-fill" style={{ marginRight: 4, color: '#caa55a' }} />{wh.name} <span style={{ color: '#7088aa', fontWeight: 'normal' }}>({childCount(wh.id)})</span>
            </div>
          );
          kids.forEach((s: any) => blocks.push(spotRow(s)));
          if (childCount(wh.id) === 0) blocks.push(<div key={`e-${wh.id}`} style={{ padding: '4px 14px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#999', fontStyle: 'italic' }}>No spots — open this warehouse to add some.</div>);
        }
        if (blocks.length === 0) blocks.push(<div key="none" style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#666' }}>No warehouses yet. Use “New warehouse”.</div>);
        return blocks;
      }
      const kids = childrenOf(selectedWh).filter(matches);
      if (kids.length === 0) return <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#666' }}>No spots {q ? 'match your search' : 'yet — add one above.'}</div>;
      return kids.map(spotRow);
    };

    return (
      <div className="row justify-content-center fade-in">
        <div className="col-md-11">
          <div style={xpBevel}>
            <div style={xpTitleBar}><span><i className="bi bi-geo-alt-fill" style={{ marginRight: 6 }} />{t('locations')}</span></div>
            <div style={{ display: 'flex', minHeight: 440 }}>
              {/* LEFT: warehouses */}
              <div style={{ width: 250, flexShrink: 0, borderRight: '1px solid #b0a898', background: '#f5f4ef', display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...xpToolbar, justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold' }}>Warehouses / Areas</span>
                  <button style={xpBtn({ padding: '1px 6px' })} onClick={() => setAddingWh(v => !v)} title="New warehouse"><i className="bi bi-plus-lg" /></button>
                </div>
                {addingWh && (
                  <form onSubmit={handleAddWarehouse} style={{ padding: '6px', borderBottom: '1px solid #d8d4c8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input style={{ ...xpInput }} placeholder="Code (e.g. GM1)" value={newWh.code} onChange={(e) => setNewWh({ ...newWh, code: e.target.value })} required />
                    <input style={{ ...xpInput }} placeholder="Name (e.g. Gudang Material 1)" value={newWh.name} onChange={(e) => setNewWh({ ...newWh, name: e.target.value })} required />
                    <button type="submit" disabled={savingWh} style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: savingWh ? 0.6 : 1 })}>{savingWh ? '...' : 'Add warehouse'}</button>
                  </form>
                )}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
                  <div onClick={() => setSelectedWh(ALL)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: selectedWh === ALL ? '#fff' : '#000', background: selectedWh === ALL ? 'linear-gradient(to bottom,#3c8cf0,#1a5fd0)' : 'transparent' }}>
                    <i className="bi bi-collection" style={{ color: selectedWh === ALL ? '#fff' : '#888' }} /><span style={{ flex: 1 }}>All locations</span><span style={{ fontSize: 10, color: selectedWh === ALL ? '#dde' : '#777' }}>{all.length}</span>
                  </div>
                  <div style={{ height: 1, background: '#d8d4c8', margin: '2px 6px' }} />
                  {topLevel.map(whRow)}
                  {topLevel.length === 0 && <div style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>No warehouses yet</div>}
                </div>
                <div style={{ background: 'linear-gradient(to bottom,#e8e6df,#d5d3cc)', borderTop: '1px solid #b0a898', padding: '2px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#333' }}>
                  <b>{topLevel.length}</b> warehouses · <b>{all.length}</b> total
                </div>
              </div>

              {/* RIGHT: spots */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={xpToolbar}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 12, fontWeight: 'bold', color: '#003080' }}>
                    {selectedWarehouse ? selectedWarehouse.name : 'All locations'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <i className="bi bi-search" style={{ fontSize: 11, color: '#666' }} />
                  <input style={{ ...xpInput, width: 150 }} placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  {selectedWarehouse && (
                    <button style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' })} onClick={() => setShowSpotForm(v => !v)}>
                      <i className="bi bi-plus-lg" style={{ marginRight: 3 }} />Add spot
                    </button>
                  )}
                </div>
                {selectedWarehouse && showSpotForm && (
                  <form onSubmit={handleAddSpot} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '6px 8px', background: '#eef3fb', borderBottom: '1px solid #b0c4de' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={xpLabel}>Spot / bin name (e.g. A1, A2, B1)</label>
                      <input autoFocus style={{ ...xpInput, width: '100%' }} placeholder="A1" value={newSpotName} onChange={(e) => setNewSpotName(e.target.value)} required />
                    </div>
                    <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#666' }}>code: {selectedWarehouse.code}-{newSpotName || '…'}</span>
                    <button type="submit" disabled={savingSpot} style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: savingSpot ? 0.6 : 1 })}>{savingSpot ? '...' : 'Save'}</button>
                    <button type="button" onClick={() => setShowSpotForm(false)} style={xpBtn()}><i className="bi bi-x-lg" /></button>
                  </form>
                )}
                <div style={{ flex: 1, overflowY: 'auto' }}>{renderRightList()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // MODERN (Bootstrap)
  // =========================================================
  const mWhItem = (loc: any) => {
    const active = selectedWh === loc.id;
    const over = dragOverId === loc.id;
    const renaming = renamingId === loc.id;
    const cnt = childCount(loc.id);
    return (
      <button
        key={loc.id}
        type="button"
        onClick={() => !renaming && setSelectedWh(loc.id)}
        onMouseEnter={() => setHoveredWh(loc.id)}
        onMouseLeave={() => setHoveredWh(null)}
        onDragOver={(e) => onWhDragOver(e, loc.id)}
        onDragLeave={() => onWhDragLeave(loc.id)}
        onDrop={(e) => onWhDrop(e, loc.id)}
        className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${active ? 'active' : ''}`}
        style={over ? { background: '#fff3cd', border: '1px dashed #b8860b' } : undefined}
      >
        <i className={`bi ${cnt > 0 ? 'bi-house-fill' : 'bi-house'}`} style={{ color: active ? '#fff' : '#caa55a' }} />
        {renaming ? (
          <input autoFocus className="form-control form-control-sm" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
        ) : (
          <span className="flex-grow-1 text-truncate text-start">{loc.name}</span>
        )}
        <span className={`badge rounded-pill ${active ? 'bg-light text-dark' : 'bg-secondary'}`}>{cnt}</span>
        {!renaming && hoveredWh === loc.id && (
          <span className="d-flex gap-2">
            <i className="bi bi-pencil" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(loc); }} />
            <i className="bi bi-trash text-danger" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }} />
          </span>
        )}
      </button>
    );
  };

  const mSpotRow = (loc: any) => {
    const renaming = renamingId === loc.id;
    return (
      <li
        key={loc.id}
        draggable={!renaming}
        onDragStart={(e) => onRowDragStart(e, loc)}
        onDragEnd={onRowDragEnd}
        className="list-group-item d-flex align-items-center gap-2"
        style={{ cursor: 'grab', background: draggingId === loc.id ? '#fff7d6' : undefined }}
      >
        <i className="bi bi-grip-vertical text-muted" />
        <span className="fw-medium font-monospace text-primary" style={{ width: 150 }}>{loc.code}</span>
        {renaming ? (
          <input autoFocus className="form-control form-control-sm" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
        ) : (
          <span className="flex-grow-1 text-truncate">{loc.name}</span>
        )}
        <i className="bi bi-pencil text-muted" title="Rename" style={{ cursor: 'pointer' }} onClick={() => startRename(loc)} />
        <button className="btn btn-sm btn-link text-danger p-0 px-1" onClick={() => handleDelete(loc.id)} title="Delete"><i className="bi bi-trash" /></button>
      </li>
    );
  };

  const mRenderRightList = () => {
    if (selectedWh === ALL) {
      const out: React.ReactNode[] = [];
      for (const wh of topLevel) {
        const kids = childrenOf(wh.id).filter(matches);
        if (!matches(wh) && kids.length === 0 && q) continue;
        out.push(
          <li key={`h-${wh.id}`} className="list-group-item bg-light fw-bold small py-1">
            <i className="bi bi-house-fill me-2" style={{ color: '#caa55a' }} />{wh.name} <span className="text-muted fw-normal">({childCount(wh.id)})</span>
          </li>
        );
        kids.forEach((s: any) => out.push(mSpotRow(s)));
        if (childCount(wh.id) === 0) out.push(<li key={`e-${wh.id}`} className="list-group-item text-muted fst-italic small py-1 ps-4">No spots — open this warehouse to add some.</li>);
      }
      if (out.length === 0) out.push(<li key="none" className="list-group-item text-center text-muted py-4">No warehouses yet. Use “New warehouse”.</li>);
      return out;
    }
    const kids = childrenOf(selectedWh).filter(matches);
    if (kids.length === 0) return <li className="list-group-item text-center text-muted py-4">No spots {q ? 'match your search' : 'yet — add one above.'}</li>;
    return kids.map(mSpotRow);
  };

  return (
    <div className="row justify-content-center fade-in">
      <div className="col-lg-11">
        <div className="card h-100">
          <div className="card-header bg-white d-flex align-items-center">
            <h5 className="card-title mb-0"><i className="bi bi-geo-alt-fill me-2" />{t('locations')}</h5>
          </div>
          <div className="card-body p-0">
            <div className="row g-0" style={{ minHeight: 460 }}>
              {/* LEFT: warehouses */}
              <div className="col-md-4 col-lg-3 border-end d-flex flex-column">
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                  <span className="text-muted text-uppercase small fw-bold">Warehouses / Areas</span>
                  <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAddingWh(v => !v)} title="New warehouse"><i className="bi bi-plus-lg" /></button>
                </div>
                {addingWh && (
                  <form onSubmit={handleAddWarehouse} className="p-2 border-bottom d-flex flex-column gap-2">
                    <input className="form-control form-control-sm" placeholder="Code (e.g. GM1)" value={newWh.code} onChange={(e) => setNewWh({ ...newWh, code: e.target.value })} required />
                    <input className="form-control form-control-sm" placeholder="Name (e.g. Gudang Material 1)" value={newWh.name} onChange={(e) => setNewWh({ ...newWh, name: e.target.value })} required />
                    <button type="submit" className="btn btn-sm btn-success" disabled={savingWh}>{savingWh ? '...' : 'Add warehouse'}</button>
                  </form>
                )}
                <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                  <button type="button" onClick={() => setSelectedWh(ALL)} className={`list-group-item list-group-item-action d-flex align-items-center gap-2 fw-bold ${selectedWh === ALL ? 'active' : ''}`}>
                    <i className="bi bi-collection" /><span className="flex-grow-1 text-start">All locations</span><span className={`badge rounded-pill ${selectedWh === ALL ? 'bg-light text-dark' : 'bg-secondary'}`}>{all.length}</span>
                  </button>
                  {topLevel.map(mWhItem)}
                  {topLevel.length === 0 && <div className="px-3 py-2 text-muted small">No warehouses yet</div>}
                </div>
                <div className="px-3 py-2 border-top text-muted small"><b>{topLevel.length}</b> warehouses · <b>{all.length}</b> total</div>
              </div>

              {/* RIGHT: spots */}
              <div className="col-md-8 col-lg-9 d-flex flex-column">
                <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
                  <h6 className="mb-0 text-primary">{selectedWarehouse ? selectedWarehouse.name : 'All locations'}</h6>
                  <div className="flex-grow-1" />
                  <div className="input-group input-group-sm" style={{ width: 200 }}>
                    <span className="input-group-text"><i className="bi bi-search" /></span>
                    <input className="form-control" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  {selectedWarehouse && <button className="btn btn-sm btn-success text-nowrap" onClick={() => setShowSpotForm(v => !v)}><i className="bi bi-plus-lg me-1" />Add spot</button>}
                </div>
                {selectedWarehouse && showSpotForm && (
                  <form onSubmit={handleAddSpot} className="d-flex align-items-end gap-2 px-3 py-2 border-bottom" style={{ background: '#eef3fb' }}>
                    <div className="flex-grow-1">
                      <label className="form-label small mb-1">Spot / bin name (e.g. A1, A2, B1)</label>
                      <input autoFocus className="form-control form-control-sm" placeholder="A1" value={newSpotName} onChange={(e) => setNewSpotName(e.target.value)} required />
                    </div>
                    <span className="text-muted small text-nowrap pb-1">code: {selectedWarehouse.code}-{newSpotName || '…'}</span>
                    <button type="submit" className="btn btn-sm btn-success" disabled={savingSpot}>{savingSpot ? '...' : 'Save'}</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowSpotForm(false)}><i className="bi bi-x-lg" /></button>
                  </form>
                )}
                <div className="flex-grow-1 overflow-auto">
                  <ul className="list-group list-group-flush">{mRenderRightList()}</ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
