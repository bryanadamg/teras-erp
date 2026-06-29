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

  const [selectedStore, setSelectedStore] = useState<string>(ALL);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Add warehouse (store)
  const [addingStore, setAddingStore] = useState(false);
  const [newStore, setNewStore] = useState({ code: '', name: '' });
  const [savingStore, setSavingStore] = useState(false);

  // Add zone
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [savingZone, setSavingZone] = useState(false);

  // Add bin
  const [showBinForm, setShowBinForm] = useState(false);
  const [newBinName, setNewBinName] = useState('');
  const [savingBin, setSavingBin] = useState(false);

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag-drop (bins between zones)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [hoveredStore, setHoveredStore] = useState<string | null>(null);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [hoveredBin, setHoveredBin] = useState<string | null>(null);

  // ---------- styles (classic XP) ----------
  const xpBevel: React.CSSProperties = { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0 };
  const xpTitleBar: React.CSSProperties = { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, fontWeight: 'bold', padding: '4px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)', borderBottom: '1px solid #003080', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 26 };
  const xpToolbar: React.CSSProperties = { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const };
  const xpBtn = (extra: any = {}) => ({ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 0, ...extra });
  const xpInput: React.CSSProperties = { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, border: '1px solid #7f9db9', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px', background: '#fff', color: '#000', height: 20, outline: 'none' };
  const xpLabel: React.CSSProperties = { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#000', display: 'block', marginBottom: 2 };

  // ---------- derived data ----------
  const all = (locations || []);
  const stores = all.filter((l: any) => l.location_type === 'warehouse').sort((a: any, b: any) => a.name.localeCompare(b.name));
  const zonesOf = (storeId: string) => all.filter((l: any) => l.parent_id === storeId && l.location_type === 'zone').sort((a: any, b: any) => a.name.localeCompare(b.name));
  const binsOf = (zoneId: string) => all.filter((l: any) => l.parent_id === zoneId && l.location_type === 'bin').sort((a: any, b: any) => a.name.localeCompare(b.name));
  const zoneCount = (storeId: string) => all.filter((l: any) => l.parent_id === storeId).length;
  const binCount = (zoneId: string) => all.filter((l: any) => l.parent_id === zoneId).length;
  const selectedStoreObj = selectedStore !== ALL ? all.find((l: any) => l.id === selectedStore) : null;
  const selectedZoneObj = selectedZone ? all.find((l: any) => l.id === selectedZone) : null;
  const codeSet = new Set(all.map((l: any) => l.code));
  const ensureUniqueCode = (base: string) => {
    let c = base, n = 1;
    while (codeSet.has(c)) { c = `${base}-${n}`; n++; }
    return c;
  };

  // Reset zone selection when store changes
  useEffect(() => { setSelectedZone(null); setShowBinForm(false); }, [selectedStore]);

  // Fallback if selected items disappear
  useEffect(() => {
    if (selectedStore !== ALL && !all.some((l: any) => l.id === selectedStore)) setSelectedStore(ALL);
  }, [locations, selectedStore]);
  useEffect(() => {
    if (selectedZone && !all.some((l: any) => l.id === selectedZone)) setSelectedZone(null);
  }, [locations, selectedZone]);

  // ---------- handlers ----------
  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingStore) return;
    setSavingStore(true);
    try {
      const res = await onCreateLocation({ code: newStore.code, name: newStore.name, parent_id: null });
      if (res && res.status === 400) {
        showToast(`Code "${newStore.code}" already exists`, 'warning');
        setNewStore({ ...newStore, code: ensureUniqueCode(newStore.code.replace(/-\d+$/, '')) });
      } else if (res && res.ok) {
        showToast('Store added', 'success');
        setNewStore({ code: '', name: '' });
        setAddingStore(false);
      } else { showToast('Failed to add store', 'danger'); }
    } finally { setSavingStore(false); }
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newZoneName.trim();
    if (!name || savingZone || !selectedStoreObj) return;
    setSavingZone(true);
    try {
      const base = `${selectedStoreObj.code}-${name}`.replace(/\s+/g, '-');
      const code = ensureUniqueCode(base);
      const res = await onCreateLocation({ code, name, parent_id: selectedStoreObj.id });
      if (res && res.ok) {
        showToast('Zone added', 'success');
        setNewZoneName('');
      } else { showToast('Failed to add zone', 'danger'); }
    } finally { setSavingZone(false); }
  };

  const handleAddBin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBinName.trim();
    if (!name || savingBin || !selectedZoneObj) return;
    setSavingBin(true);
    try {
      const base = `${selectedZoneObj.code}-${name}`.replace(/\s+/g, '-');
      const code = ensureUniqueCode(base);
      const res = await onCreateLocation({ code, name, parent_id: selectedZoneObj.id });
      if (res && res.ok) {
        showToast('Bin added', 'success');
        setNewBinName('');
      } else { showToast('Failed to add bin', 'danger'); }
    } finally { setSavingBin(false); }
  };

  const startRename = (loc: any) => { setRenamingId(loc.id); setRenameValue(loc.name); };
  const commitRename = async () => {
    const id = renamingId; const name = renameValue.trim();
    if (!id) return;
    const cur = all.find((l: any) => l.id === id);
    if (!name || (cur && name === cur.name)) { setRenamingId(null); return; }
    const res = onUpdateLocation ? await onUpdateLocation(id, { name }) : null;
    if (res && res.ok) showToast('Renamed', 'success');
    else if (res && res.status === 400) showToast('Cannot rename system stores', 'warning');
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    const err = await onDeleteLocation(id);
    if (typeof err === 'string') showToast(err, 'danger');
  };

  // drag-drop: bins dragged onto a zone re-parent
  const onDragStart = (e: React.DragEvent, loc: any) => { setDraggingId(loc.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', loc.id); } catch {} };
  const onDragEnd = () => { setDraggingId(null); setDragOverId(null); };
  const onZoneDragOver = (e: React.DragEvent, zoneId: string) => { if (!draggingId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverId !== zoneId) setDragOverId(zoneId); };
  const onZoneDragLeave = (zoneId: string) => setDragOverId(prev => (prev === zoneId ? null : prev));
  const onZoneDrop = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    const id = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null); setDragOverId(null);
    if (!id || !onUpdateLocation) return;
    const loc = all.find((l: any) => l.id === id);
    if (!loc || loc.parent_id === zoneId || loc.id === zoneId) return;
    onUpdateLocation(id, { parent_id: zoneId });
  };

  const q = searchTerm.toLowerCase();
  const matches = (l: any) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q);

  // =========================================================
  // CLASSIC (XP)
  // =========================================================
  if (classic) {
    const storeRow = (loc: any) => {
      const active = selectedStore === loc.id;
      const over = dragOverId === loc.id;
      const renaming = renamingId === loc.id;
      const cnt = zoneCount(loc.id);
      const isSystem = !!loc.system_code;
      return (
        <div
          key={loc.id}
          onClick={() => !renaming && setSelectedStore(loc.id)}
          onMouseEnter={() => setHoveredStore(loc.id)}
          onMouseLeave={() => setHoveredStore(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: active ? '#fff' : '#000', background: over ? '#ffe9a8' : active ? 'linear-gradient(to bottom,#3c8cf0,#1a5fd0)' : 'transparent', border: over ? '1px dashed #b8860b' : '1px solid transparent' }}
        >
          <i className={`bi ${cnt > 0 ? 'bi-building-fill' : 'bi-building'}`} style={{ color: active ? '#fff' : '#caa55a' }} />
          {renaming ? (
            <input autoFocus style={{ ...xpInput, flex: 1, minWidth: 0 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</span>
          )}
          {isSystem && <i className="bi bi-lock-fill" title="System store" style={{ color: active ? '#cde' : '#888', fontSize: 9 }} />}
          <span style={{ fontSize: 10, color: active ? '#dde' : '#777' }}>{cnt}</span>
          {!renaming && !isSystem && hoveredStore === loc.id && (
            <>
              <i className="bi bi-pencil" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(loc); }} style={{ color: active ? '#fff' : '#333', fontSize: 11 }} />
              <i className="bi bi-trash" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }} style={{ color: active ? '#fff' : '#c00000', fontSize: 11 }} />
            </>
          )}
        </div>
      );
    };

    const zoneRow = (loc: any) => {
      const active = selectedZone === loc.id;
      const over = dragOverId === loc.id;
      const renaming = renamingId === loc.id;
      const cnt = binCount(loc.id);
      return (
        <div
          key={loc.id}
          onClick={() => !renaming && setSelectedZone(active ? null : loc.id)}
          onMouseEnter={() => setHoveredZone(loc.id)}
          onMouseLeave={() => setHoveredZone(null)}
          onDragOver={(e) => onZoneDragOver(e, loc.id)}
          onDragLeave={() => onZoneDragLeave(loc.id)}
          onDrop={(e) => onZoneDrop(e, loc.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: active ? '#fff' : '#000', background: over ? '#ffe9a8' : active ? 'linear-gradient(to bottom,#3c8cf0,#1a5fd0)' : 'transparent', border: over ? '1px dashed #b8860b' : '1px solid transparent' }}
        >
          <i className={`bi ${cnt > 0 ? 'bi-folder-fill' : 'bi-folder'}`} style={{ color: active ? '#fff' : '#c8a030' }} />
          {renaming ? (
            <input autoFocus style={{ ...xpInput, flex: 1, minWidth: 0 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</span>
          )}
          <span style={{ fontSize: 10, color: active ? '#dde' : '#777' }}>{cnt}</span>
          {!renaming && hoveredZone === loc.id && (
            <>
              <i className="bi bi-pencil" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(loc); }} style={{ color: active ? '#fff' : '#333', fontSize: 11 }} />
              <i className="bi bi-trash" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }} style={{ color: active ? '#fff' : '#c00000', fontSize: 11 }} />
            </>
          )}
        </div>
      );
    };

    const binRow = (loc: any) => {
      const renaming = renamingId === loc.id;
      return (
        <div
          key={loc.id}
          draggable={!renaming}
          onDragStart={(e) => onDragStart(e, loc)}
          onDragEnd={onDragEnd}
          onMouseEnter={() => setHoveredBin(loc.id)}
          onMouseLeave={() => setHoveredBin(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderBottom: '1px solid #e3e0d8', background: draggingId === loc.id ? '#fff7d6' : hoveredBin === loc.id ? '#f0f6ff' : '#fff', cursor: 'grab' }}
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

    const renderZonePanel = () => {
      if (selectedStore === ALL) {
        return <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>Select a store to manage zones.</div>;
      }
      const zones = zonesOf(selectedStore).filter(matches);
      if (zones.length === 0) return <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>No zones{q ? ' match' : ' yet — add one above'}.</div>;
      return zones.map(zoneRow);
    };

    const renderBinPanel = () => {
      if (!selectedZone) {
        return <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>Select a zone to manage bins.</div>;
      }
      const bins = binsOf(selectedZone).filter(matches);
      if (bins.length === 0) return <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>No bins{q ? ' match' : ' yet — add one above'}.</div>;
      return bins.map(binRow);
    };

    return (
      <div className="row justify-content-center fade-in">
        <div className="col-12">
          <div style={xpBevel}>
            <div style={xpTitleBar}><span><i className="bi bi-geo-alt-fill" style={{ marginRight: 6 }} />{t('locations')}</span></div>
            <div style={{ display: 'flex', minHeight: 440 }}>

              {/* LEFT: stores */}
              <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid #b0a898', background: '#f5f4ef', display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...xpToolbar, justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold' }}>Stores</span>
                  <button style={xpBtn({ padding: '1px 6px' })} onClick={() => setAddingStore(v => !v)} title="New store"><i className="bi bi-plus-lg" /></button>
                </div>
                {addingStore && (
                  <form onSubmit={handleAddStore} style={{ padding: '6px', borderBottom: '1px solid #d8d4c8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input style={xpInput} placeholder="Code (e.g. RAW2)" value={newStore.code} onChange={(e) => setNewStore({ ...newStore, code: e.target.value })} required />
                    <input style={xpInput} placeholder="Name (e.g. Raw Material 2)" value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} required />
                    <button type="submit" disabled={savingStore} style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: savingStore ? 0.6 : 1 })}>{savingStore ? '...' : 'Add store'}</button>
                  </form>
                )}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
                  <div onClick={() => setSelectedStore(ALL)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: selectedStore === ALL ? '#fff' : '#000', background: selectedStore === ALL ? 'linear-gradient(to bottom,#3c8cf0,#1a5fd0)' : 'transparent' }}>
                    <i className="bi bi-collection" style={{ color: selectedStore === ALL ? '#fff' : '#888' }} /><span style={{ flex: 1 }}>All stores</span><span style={{ fontSize: 10, color: selectedStore === ALL ? '#dde' : '#777' }}>{stores.length}</span>
                  </div>
                  <div style={{ height: 1, background: '#d8d4c8', margin: '2px 6px' }} />
                  {stores.map(storeRow)}
                  {stores.length === 0 && <div style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>No stores yet</div>}
                </div>
                <div style={{ background: 'linear-gradient(to bottom,#e8e6df,#d5d3cc)', borderTop: '1px solid #b0a898', padding: '2px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#333' }}>
                  <b>{stores.length}</b> stores · <b>{all.length}</b> total
                </div>
              </div>

              {/* MIDDLE: zones */}
              <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #b0a898', background: '#f5f4ef', display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...xpToolbar, justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: '#003080' }}>
                    {selectedStoreObj ? selectedStoreObj.name : 'Zones'}
                  </span>
                  {selectedStoreObj && (
                    <button style={xpBtn({ padding: '1px 6px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' })} onClick={() => setShowZoneForm(v => !v)} title="New zone"><i className="bi bi-plus-lg" /></button>
                  )}
                </div>
                {selectedStoreObj && showZoneForm && (
                  <form onSubmit={handleAddZone} style={{ display: 'flex', gap: 4, padding: '4px 6px', background: '#eef3fb', borderBottom: '1px solid #b0c4de' }}>
                    <input autoFocus style={{ ...xpInput, flex: 1, minWidth: 0 }} placeholder="Zone name" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} required />
                    <button type="submit" disabled={savingZone} style={xpBtn({ padding: '1px 6px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: savingZone ? 0.6 : 1 })}>{savingZone ? '...' : 'Add'}</button>
                  </form>
                )}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>{renderZonePanel()}</div>
              </div>

              {/* RIGHT: bins */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={xpToolbar}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 12, fontWeight: 'bold', color: '#003080' }}>
                    {selectedZoneObj ? selectedZoneObj.name : 'Bins'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <i className="bi bi-search" style={{ fontSize: 11, color: '#666' }} />
                  <input style={{ ...xpInput, width: 150 }} placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  {selectedZoneObj && (
                    <button style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' })} onClick={() => setShowBinForm(v => !v)}>
                      <i className="bi bi-plus-lg" style={{ marginRight: 3 }} />Add bin
                    </button>
                  )}
                </div>
                {selectedZoneObj && showBinForm && (
                  <form onSubmit={handleAddBin} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '6px 8px', background: '#eef3fb', borderBottom: '1px solid #b0c4de' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={xpLabel}>Bin / shelf name (e.g. A1, A2, B1)</label>
                      <input autoFocus style={{ ...xpInput, width: '100%' }} placeholder="A1" value={newBinName} onChange={(e) => setNewBinName(e.target.value)} required />
                    </div>
                    <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 10, color: '#666' }}>code: {selectedZoneObj.code}-{newBinName || '…'}</span>
                    <button type="submit" disabled={savingBin} style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: savingBin ? 0.6 : 1 })}>{savingBin ? '...' : 'Save'}</button>
                    <button type="button" onClick={() => setShowBinForm(false)} style={xpBtn()}><i className="bi bi-x-lg" /></button>
                  </form>
                )}
                <div style={{ flex: 1, overflowY: 'auto' }}>{renderBinPanel()}</div>
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
  const mStoreItem = (loc: any) => {
    const active = selectedStore === loc.id;
    const renaming = renamingId === loc.id;
    const cnt = zoneCount(loc.id);
    const isSystem = !!loc.system_code;
    return (
      <button
        key={loc.id}
        type="button"
        onClick={() => !renaming && setSelectedStore(loc.id)}
        onMouseEnter={() => setHoveredStore(loc.id)}
        onMouseLeave={() => setHoveredStore(null)}
        className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${active ? 'active' : ''}`}
      >
        <i className={`bi ${cnt > 0 ? 'bi-building-fill' : 'bi-building'}`} style={{ color: active ? '#fff' : '#caa55a' }} />
        {renaming ? (
          <input autoFocus className="form-control form-control-sm" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
        ) : (
          <span className="flex-grow-1 text-truncate text-start">{loc.name}</span>
        )}
        {isSystem && <i className="bi bi-lock-fill" title="System store" style={{ color: active ? '#cde' : '#888', fontSize: 10 }} />}
        <span className={`badge rounded-pill ${active ? 'bg-light text-dark' : 'bg-secondary'}`}>{cnt}</span>
        {!renaming && !isSystem && hoveredStore === loc.id && (
          <span className="d-flex gap-2" onClick={e => e.stopPropagation()}>
            <i className="bi bi-pencil" title="Rename" onClick={() => startRename(loc)} style={{ cursor: 'pointer' }} />
            <i className="bi bi-trash text-danger" title="Delete" onClick={() => handleDelete(loc.id)} style={{ cursor: 'pointer' }} />
          </span>
        )}
      </button>
    );
  };

  const mZoneItem = (loc: any) => {
    const active = selectedZone === loc.id;
    const over = dragOverId === loc.id;
    const renaming = renamingId === loc.id;
    const cnt = binCount(loc.id);
    return (
      <button
        key={loc.id}
        type="button"
        onClick={() => !renaming && setSelectedZone(active ? null : loc.id)}
        onMouseEnter={() => setHoveredZone(loc.id)}
        onMouseLeave={() => setHoveredZone(null)}
        onDragOver={(e) => onZoneDragOver(e, loc.id)}
        onDragLeave={() => onZoneDragLeave(loc.id)}
        onDrop={(e) => onZoneDrop(e, loc.id)}
        className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${active ? 'active' : ''}`}
        style={over ? { background: '#fff3cd', border: '1px dashed #b8860b' } : undefined}
      >
        <i className={`bi ${cnt > 0 ? 'bi-folder-fill' : 'bi-folder'}`} style={{ color: active ? '#fff' : '#c8a030' }} />
        {renaming ? (
          <input autoFocus className="form-control form-control-sm" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
        ) : (
          <span className="flex-grow-1 text-truncate text-start">{loc.name}</span>
        )}
        <span className={`badge rounded-pill ${active ? 'bg-light text-dark' : 'bg-secondary'}`}>{cnt}</span>
        {!renaming && hoveredZone === loc.id && (
          <span className="d-flex gap-2" onClick={e => e.stopPropagation()}>
            <i className="bi bi-pencil" title="Rename" onClick={() => startRename(loc)} style={{ cursor: 'pointer' }} />
            <i className="bi bi-trash text-danger" title="Delete" onClick={() => handleDelete(loc.id)} style={{ cursor: 'pointer' }} />
          </span>
        )}
      </button>
    );
  };

  const mBinRow = (loc: any) => {
    const renaming = renamingId === loc.id;
    return (
      <li
        key={loc.id}
        draggable={!renaming}
        onDragStart={(e) => onDragStart(e, loc)}
        onDragEnd={onDragEnd}
        className="list-group-item d-flex align-items-center gap-2"
        style={{ cursor: 'grab', background: draggingId === loc.id ? '#fff7d6' : undefined }}
      >
        <i className="bi bi-grip-vertical text-muted" />
        <span className="fw-medium font-monospace text-primary" style={{ width: 140 }}>{loc.code}</span>
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

  return (
    <div className="row justify-content-center fade-in">
      <div className="col-12">
        <div className="card h-100">
          <div className="card-header bg-white d-flex align-items-center">
            <h5 className="card-title mb-0"><i className="bi bi-geo-alt-fill me-2" />{t('locations')}</h5>
          </div>
          <div className="card-body p-0">
            <div className="d-flex" style={{ minHeight: 460 }}>

              {/* LEFT: stores */}
              <div style={{ width: 220, flexShrink: 0 }} className="border-end d-flex flex-column">
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                  <span className="text-muted text-uppercase small fw-bold">Stores</span>
                  <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAddingStore(v => !v)} title="New store"><i className="bi bi-plus-lg" /></button>
                </div>
                {addingStore && (
                  <form onSubmit={handleAddStore} className="p-2 border-bottom d-flex flex-column gap-2">
                    <input className="form-control form-control-sm" placeholder="Code (e.g. RAW2)" value={newStore.code} onChange={(e) => setNewStore({ ...newStore, code: e.target.value })} required />
                    <input className="form-control form-control-sm" placeholder="Name" value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} required />
                    <button type="submit" className="btn btn-sm btn-success" disabled={savingStore}>{savingStore ? '...' : 'Add store'}</button>
                  </form>
                )}
                <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                  <button type="button" onClick={() => setSelectedStore(ALL)} className={`list-group-item list-group-item-action d-flex align-items-center gap-2 fw-bold ${selectedStore === ALL ? 'active' : ''}`}>
                    <i className="bi bi-collection" /><span className="flex-grow-1 text-start">All stores</span><span className={`badge rounded-pill ${selectedStore === ALL ? 'bg-light text-dark' : 'bg-secondary'}`}>{stores.length}</span>
                  </button>
                  {stores.map(mStoreItem)}
                  {stores.length === 0 && <div className="px-3 py-2 text-muted small">No stores yet</div>}
                </div>
                <div className="px-3 py-2 border-top text-muted small"><b>{stores.length}</b> stores · <b>{all.length}</b> total</div>
              </div>

              {/* MIDDLE: zones */}
              <div style={{ width: 200, flexShrink: 0 }} className="border-end d-flex flex-column">
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                  <span className="text-muted text-uppercase small fw-bold">{selectedStoreObj ? selectedStoreObj.name : 'Zones'}</span>
                  {selectedStoreObj && (
                    <button className="btn btn-sm btn-outline-success py-0" onClick={() => setShowZoneForm(v => !v)} title="New zone"><i className="bi bi-plus-lg" /></button>
                  )}
                </div>
                {selectedStoreObj && showZoneForm && (
                  <form onSubmit={handleAddZone} className="d-flex gap-1 p-2 border-bottom">
                    <input autoFocus className="form-control form-control-sm" placeholder="Zone name" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} required />
                    <button type="submit" className="btn btn-sm btn-success" disabled={savingZone}>{savingZone ? '...' : 'Add'}</button>
                  </form>
                )}
                <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                  {selectedStore === ALL
                    ? <div className="px-3 py-4 text-muted small text-center">Select a store.</div>
                    : zonesOf(selectedStore).filter(matches).length === 0
                      ? <div className="px-3 py-4 text-muted small text-center">No zones yet.</div>
                      : zonesOf(selectedStore).filter(matches).map(mZoneItem)
                  }
                </div>
              </div>

              {/* RIGHT: bins */}
              <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
                <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
                  <h6 className="mb-0 text-primary">{selectedZoneObj ? selectedZoneObj.name : 'Bins'}</h6>
                  <div className="flex-grow-1" />
                  <div className="input-group input-group-sm" style={{ width: 200 }}>
                    <span className="input-group-text"><i className="bi bi-search" /></span>
                    <input className="form-control" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  {selectedZoneObj && <button className="btn btn-sm btn-success text-nowrap" onClick={() => setShowBinForm(v => !v)}><i className="bi bi-plus-lg me-1" />Add bin</button>}
                </div>
                {selectedZoneObj && showBinForm && (
                  <form onSubmit={handleAddBin} className="d-flex align-items-end gap-2 px-3 py-2 border-bottom" style={{ background: '#eef3fb' }}>
                    <div className="flex-grow-1">
                      <label className="form-label small mb-1">Bin / shelf name (e.g. A1)</label>
                      <input autoFocus className="form-control form-control-sm" placeholder="A1" value={newBinName} onChange={(e) => setNewBinName(e.target.value)} required />
                    </div>
                    <span className="text-muted small text-nowrap pb-1">code: {selectedZoneObj.code}-{newBinName || '…'}</span>
                    <button type="submit" className="btn btn-sm btn-success" disabled={savingBin}>{savingBin ? '...' : 'Save'}</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowBinForm(false)}><i className="bi bi-x-lg" /></button>
                  </form>
                )}
                <div className="flex-grow-1 overflow-auto">
                  {!selectedZone
                    ? <div className="text-center text-muted py-4 small">Select a zone to manage bins.</div>
                    : binsOf(selectedZone).filter(matches).length === 0
                      ? <div className="text-center text-muted py-4 small">No bins{q ? ' match' : ' yet — add one above.'}.</div>
                      : <ul className="list-group list-group-flush">{binsOf(selectedZone).filter(matches).map(mBinRow)}</ul>
                  }
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
