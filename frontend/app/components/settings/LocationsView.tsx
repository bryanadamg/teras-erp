import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { xpToolbar as sharedXpToolbar, ShellWindow, ShellTitleBar } from '../shared/shellTheme';
import { lvTh, lvTd, lvRow } from '../shared/listViewTheme';
import { XPActionButton } from '../shared/xpTheme';

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
  const { hasPermission, hasAnyPermission } = useUser();
  const canManage = hasAnyPermission('location.create', 'location.edit', 'location.delete');

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
  const xpToolbar: React.CSSProperties = sharedXpToolbar({ gap: 6 });
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

  // Quarantine hold flag. Set on the STORE and inherited by its zones/bins —
  // stock held anywhere under it shows on the Quarantine Packing page and cannot
  // be packed until its lot is dispositioned OK. Editable on system stores too:
  // a plant may hold elsewhere than the seeded Quarantine warehouse.
  const toggleQuarantine = async (loc: any) => {
    if (!onUpdateLocation) return;
    const next = !loc.is_quarantine;
    await onUpdateLocation(loc.id, { is_quarantine: next });
    showToast(
      next
        ? `${loc.name} is now a quarantine hold area`
        : `${loc.name} is no longer a quarantine hold area`,
      'success',
    );
  };

  const quarantineTitle = (loc: any) => loc.is_quarantine
    ? 'Quarantine hold area — click to stop holding stock here'
    : 'Click to make this a quarantine hold area';

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
          {(loc.is_quarantine || (canManage && hoveredStore === loc.id)) && (
            <i
              className={`bi ${loc.is_quarantine ? 'bi-shield-fill-exclamation' : 'bi-shield'}`}
              title={quarantineTitle(loc)}
              onClick={(e) => { e.stopPropagation(); if (canManage) toggleQuarantine(loc); }}
              style={{ color: loc.is_quarantine ? (active ? '#ffd479' : '#b8860b') : (active ? '#cde' : '#999'), fontSize: 11, cursor: canManage ? 'pointer' : 'default' }}
            />
          )}
          <span style={{ fontSize: 10, color: active ? '#dde' : '#777' }}>{cnt}</span>
          {canManage && !renaming && !isSystem && hoveredStore === loc.id && (
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
          {canManage && !renaming && hoveredZone === loc.id && (
            <>
              <i className="bi bi-pencil" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(loc); }} style={{ color: active ? '#fff' : '#333', fontSize: 11 }} />
              <i className="bi bi-trash" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }} style={{ color: active ? '#fff' : '#c00000', fontSize: 11 }} />
            </>
          )}
        </div>
      );
    };

    const binRow = (loc: any, i: number) => {
      const renaming = renamingId === loc.id;
      return (
        <tr
          key={loc.id}
          draggable={!renaming}
          onDragStart={(e) => onDragStart(e, loc)}
          onDragEnd={onDragEnd}
          onMouseEnter={() => setHoveredBin(loc.id)}
          onMouseLeave={() => setHoveredBin(null)}
          style={{ ...lvRow(true, i), background: draggingId === loc.id ? '#fff7d6' : hoveredBin === loc.id ? '#f0f6ff' : lvRow(true, i).background, cursor: 'grab' }}
        >
          <td style={{ ...lvTd(true), width: 24, textAlign: 'center' }}><i className="bi bi-grip-vertical" style={{ color: '#aaa' }} /></td>
          <td style={{ ...lvTd(true), width: 150, fontWeight: 'bold', color: '#00008b' }}>{loc.code}</td>
          <td style={lvTd(true)}>
            {renaming ? (
              <input autoFocus style={{ ...xpInput, width: '100%' }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
            ) : (
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</span>
            )}
          </td>
          <td style={{ ...lvTd(true), borderRight: 'none', width: 60, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
            {canManage && (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <XPActionButton classic icon="bi-pencil" title="Rename" onClick={() => startRename(loc)} />
                <XPActionButton classic tone="danger" icon="bi-trash" title="Delete" onClick={() => handleDelete(loc.id)} />
              </span>
            )}
          </td>
        </tr>
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

    const bins = selectedZone ? binsOf(selectedZone).filter(matches) : [];
    const renderBinPanel = () => {
      if (!selectedZone) {
        return <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>Select a zone to manage bins.</div>;
      }
      if (bins.length === 0) return <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>No bins{q ? ' match' : ' yet — add one above'}.</div>;
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080', position: 'sticky', top: 0 }}>
            <tr>
              <th style={{ ...lvTh(true), width: 24 }}></th>
              <th style={{ ...lvTh(true), width: 150 }}>Code</th>
              <th style={lvTh(true)}>Name</th>
              <th style={{ ...lvTh(true), width: 60, borderRight: 'none' }}></th>
            </tr>
          </thead>
          <tbody>{bins.map(binRow)}</tbody>
        </table>
      );
    };

    return (
      <ShellWindow classic fill="page" className="fade-in">
        <ShellTitleBar classic icon="bi-geo-alt-fill" title={t('locations')} />
        <div className="locations-panes" style={{ flex: 1, minHeight: 0 }}>

              {/* LEFT: stores */}
              <div className="loc-pane" style={{ width: 210, flexShrink: 0, borderRight: '1px solid #b0a898', background: '#f5f4ef', display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...xpToolbar, justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold' }}>Stores</span>
                  {canManage && <button style={xpBtn({ padding: '1px 6px' })} onClick={() => setAddingStore(v => !v)} title="New store"><i className="bi bi-plus-lg" /></button>}
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
              <div className="loc-pane" style={{ width: 200, flexShrink: 0, borderRight: '1px solid #b0a898', background: '#f5f4ef', display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...xpToolbar, justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: '#003080' }}>
                    {selectedStoreObj ? selectedStoreObj.name : 'Zones'}
                  </span>
                  {canManage && selectedStoreObj && (
                    <button style={xpBtn({ padding: '1px 6px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' })} onClick={() => setShowZoneForm(v => !v)} title="New zone"><i className="bi bi-plus-lg" /></button>
                  )}
                </div>
                {canManage && selectedStoreObj && showZoneForm && (
                  <form onSubmit={handleAddZone} style={{ display: 'flex', gap: 4, padding: '4px 6px', background: '#eef3fb', borderBottom: '1px solid #b0c4de' }}>
                    <input autoFocus style={{ ...xpInput, flex: 1, minWidth: 0 }} placeholder="Zone name" value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} required />
                    <button type="submit" disabled={savingZone} style={xpBtn({ padding: '1px 6px', background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: savingZone ? 0.6 : 1 })}>{savingZone ? '...' : 'Add'}</button>
                  </form>
                )}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>{renderZonePanel()}</div>
              </div>

              {/* RIGHT: bins */}
              <div className="loc-pane" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={xpToolbar}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 12, fontWeight: 'bold', color: '#003080' }}>
                    {selectedZoneObj ? selectedZoneObj.name : 'Bins'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <i className="bi bi-search" style={{ fontSize: 11, color: '#666' }} />
                  <input style={{ ...xpInput, width: 150 }} placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  {canManage && selectedZoneObj && (
                    <button style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' })} onClick={() => setShowBinForm(v => !v)}>
                      <i className="bi bi-plus-lg" style={{ marginRight: 3 }} />Add bin
                    </button>
                  )}
                </div>
                {canManage && selectedZoneObj && showBinForm && (
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
      </ShellWindow>
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
        {(loc.is_quarantine || (canManage && hoveredStore === loc.id)) && (
          <i
            className={`bi ${loc.is_quarantine ? 'bi-shield-fill-exclamation' : 'bi-shield'}`}
            title={quarantineTitle(loc)}
            onClick={(e) => { e.stopPropagation(); if (canManage) toggleQuarantine(loc); }}
            style={{ color: loc.is_quarantine ? (active ? '#ffd479' : '#b8860b') : undefined, cursor: canManage ? 'pointer' : 'default' }}
          />
        )}
        <span className={`badge rounded-pill ${active ? 'bg-light text-dark' : 'bg-secondary'}`}>{cnt}</span>
        {canManage && !renaming && !isSystem && hoveredStore === loc.id && (
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
        {canManage && !renaming && hoveredZone === loc.id && (
          <span className="d-flex gap-2" onClick={e => e.stopPropagation()}>
            <i className="bi bi-pencil" title="Rename" onClick={() => startRename(loc)} style={{ cursor: 'pointer' }} />
            <i className="bi bi-trash text-danger" title="Delete" onClick={() => handleDelete(loc.id)} style={{ cursor: 'pointer' }} />
          </span>
        )}
      </button>
    );
  };

  const mBinRow = (loc: any, i: number) => {
    const renaming = renamingId === loc.id;
    return (
      <tr
        key={loc.id}
        draggable={!renaming}
        onDragStart={(e) => onDragStart(e, loc)}
        onDragEnd={onDragEnd}
        style={{ ...lvRow(false, i), cursor: 'grab', background: draggingId === loc.id ? '#fff7d6' : lvRow(false, i).background }}
      >
        <td style={{ ...lvTd(false), width: 24, textAlign: 'center' }}><i className="bi bi-grip-vertical text-muted" /></td>
        <td style={{ ...lvTd(false), width: 150 }}><span className="fw-medium font-monospace text-primary">{loc.code}</span></td>
        <td style={lvTd(false)}>
          {renaming ? (
            <input autoFocus className="form-control form-control-sm" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }} />
          ) : (
            <span className="text-truncate d-block">{loc.name}</span>
          )}
        </td>
        <td style={{ ...lvTd(false), width: 70, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
          {canManage && <i className="bi bi-pencil text-muted" title="Rename" style={{ cursor: 'pointer' }} onClick={() => startRename(loc)} />}
          {canManage && <button className="btn btn-sm btn-link text-danger p-0 px-1" onClick={() => handleDelete(loc.id)} title="Delete"><i className="bi bi-trash" /></button>}
        </td>
      </tr>
    );
  };

  return (
    <ShellWindow classic={false} fill="page" className="fade-in">
      <ShellTitleBar classic={false} icon="bi-geo-alt-fill" title={t('locations')} />
        <div className="locations-panes" style={{ flex: 1, minHeight: 0 }}>

              {/* LEFT: stores */}
              <div className="loc-pane border-end d-flex flex-column" style={{ width: 220, flexShrink: 0 }}>
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                  <span className="text-muted text-uppercase small fw-bold">Stores</span>
                  {canManage && <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAddingStore(v => !v)} title="New store"><i className="bi bi-plus-lg" /></button>}
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
              <div className="loc-pane border-end d-flex flex-column" style={{ width: 200, flexShrink: 0 }}>
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                  <span className="text-muted text-uppercase small fw-bold">{selectedStoreObj ? selectedStoreObj.name : 'Zones'}</span>
                  {canManage && selectedStoreObj && (
                    <button className="btn btn-sm btn-outline-success py-0" onClick={() => setShowZoneForm(v => !v)} title="New zone"><i className="bi bi-plus-lg" /></button>
                  )}
                </div>
                {canManage && selectedStoreObj && showZoneForm && (
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
              <div className="loc-pane flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
                <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
                  <h6 className="mb-0 text-primary">{selectedZoneObj ? selectedZoneObj.name : 'Bins'}</h6>
                  <div className="flex-grow-1" />
                  <div className="input-group input-group-sm" style={{ width: 200 }}>
                    <span className="input-group-text"><i className="bi bi-search" /></span>
                    <input className="form-control" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  {canManage && selectedZoneObj && <button className="btn btn-sm btn-success text-nowrap" onClick={() => setShowBinForm(v => !v)}><i className="bi bi-plus-lg me-1" />Add bin</button>}
                </div>
                {canManage && selectedZoneObj && showBinForm && (
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
                  {(() => {
                    if (!selectedZone) return <div className="text-center text-muted py-4 small">Select a zone to manage bins.</div>;
                    const mBins = binsOf(selectedZone).filter(matches);
                    if (mBins.length === 0) return <div className="text-center text-muted py-4 small">No bins{q ? ' match' : ' yet — add one above.'}.</div>;
                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ ...lvTh(false), width: 24 }}></th>
                            <th style={{ ...lvTh(false), width: 150 }}>Code</th>
                            <th style={lvTh(false)}>Name</th>
                            <th style={{ ...lvTh(false), width: 70 }}></th>
                          </tr>
                        </thead>
                        <tbody>{mBins.map(mBinRow)}</tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>

        </div>
    </ShellWindow>
  );
}
