import { useState, useEffect } from 'react';
import { useToast } from '../shared/Toast';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

const ALL = '__all__';
const UNCAT = '__uncat__';

export default function LocationsView({
  locations,
  locationCategories = [],
  onCreateLocation,
  onUpdateLocation,
  onDeleteLocation,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onRefresh,
  fetchLocations,
}: any) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  const [selectedCat, setSelectedCat] = useState<string>(ALL);
  const [searchTerm, setSearchTerm] = useState('');

  // Create location (inline form)
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocation, setNewLocation] = useState({ code: '', name: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category management
  const [addingCat, setAddingCat] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag-drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  // If the selected category disappears (e.g. deleted), fall back to All.
  useEffect(() => {
    if (selectedCat !== ALL && selectedCat !== UNCAT) {
      const exists = (locationCategories || []).some((c: any) => c.id === selectedCat);
      if (!exists) setSelectedCat(ALL);
    }
  }, [locationCategories, selectedCat]);

  // ---------- styles (classic XP) ----------
  const xpBevel: React.CSSProperties = { border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0 };
  const xpTitleBar: React.CSSProperties = { background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#fff', fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 12, fontWeight: 'bold', padding: '4px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)', borderBottom: '1px solid #003080', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 26 };
  const xpToolbar: React.CSSProperties = { background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const };
  const xpBtn = (extra: any = {}) => ({ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, padding: '2px 10px', cursor: 'pointer', background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000', borderRadius: 0, ...extra });
  const xpInput: React.CSSProperties = { fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, border: '1px solid #7f9db9', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px', background: '#fff', color: '#000', height: 20, outline: 'none' };
  const xpLabel: React.CSSProperties = { fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#000', display: 'block', marginBottom: 2 };

  // ---------- derived data ----------
  const catNameOf = (loc: any): string => {
    if (loc.category_name) return loc.category_name;
    const c = (locationCategories || []).find((x: any) => x.id === loc.category_id);
    return c ? c.name : '';
  };
  const sortedCategories = [...(locationCategories || [])].sort((a: any, b: any) => a.name.localeCompare(b.name));
  const countFor = (id: string) => (locations || []).filter((l: any) => l.category_id === id).length;
  const uncatCount = (locations || []).filter((l: any) => !l.category_id).length;
  const totalCount = (locations || []).length;

  const scopeCreateCategoryId: string | null = (selectedCat === ALL || selectedCat === UNCAT) ? null : selectedCat;
  const scopeLabel = selectedCat === ALL ? 'All locations' : selectedCat === UNCAT ? 'Uncategorized' : (sortedCategories.find((c: any) => c.id === selectedCat)?.name || 'Category');

  let scopeLocs = (locations || []);
  if (selectedCat === UNCAT) scopeLocs = scopeLocs.filter((l: any) => !l.category_id);
  else if (selectedCat !== ALL) scopeLocs = scopeLocs.filter((l: any) => l.category_id === selectedCat);

  const q = searchTerm.toLowerCase();
  const visible = scopeLocs.filter((l: any) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q));

  const grouped = selectedCat === ALL;
  const sortedVisible = [...visible].sort((a: any, b: any) => {
    if (grouped) {
      const an = catNameOf(a), bn = catNameOf(b);
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      if (an !== bn) return an.localeCompare(bn);
    }
    return (a.code || '').localeCompare(b.code || '');
  });

  // ---------- handlers ----------
  const handleSubmitLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = { code: newLocation.code, name: newLocation.name, category_id: scopeCreateCategoryId };
      const res = await onCreateLocation(payload);
      if (res && res.status === 400) {
        const fresh = fetchLocations ? await fetchLocations() : locations;
        let baseCode = newLocation.code;
        const m = baseCode.match(/^(.*)-(\d+)$/);
        if (m) baseCode = m[1];
        let n = 1; let sug = `${baseCode}-${n}`;
        while (fresh.some((l: any) => l.code === sug)) { n++; sug = `${baseCode}-${n}`; }
        showToast(`Location Code "${newLocation.code}" already exists. Suggesting: ${sug}`, 'warning');
        setNewLocation({ ...newLocation, code: sug });
      } else if (res && res.ok) {
        showToast('Location added', 'success');
        setNewLocation({ code: '', name: '' }); // keep form open for rapid entry
      } else {
        showToast('Failed to add location', 'danger');
      }
    } finally { setIsSubmitting(false); }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name || isAddingCat || !onCreateCategory) return;
    setIsAddingCat(true);
    try {
      const res = await onCreateCategory(name);
      if (res && res.ok) { showToast('Category added', 'success'); setNewCategoryName(''); setAddingCat(false); }
      else if (res && res.status === 400) { showToast('Category already exists', 'warning'); }
      else { showToast('Failed to add category', 'danger'); }
    } finally { setIsAddingCat(false); }
  };

  const startRename = (c: any) => { setRenamingCatId(c.id); setRenameValue(c.name); };
  const commitRename = async () => {
    const id = renamingCatId; const name = renameValue.trim();
    if (!id) return;
    const current = sortedCategories.find((c: any) => c.id === id);
    if (!name || (current && name === current.name)) { setRenamingCatId(null); return; }
    const res = onRenameCategory ? await onRenameCategory(id, name) : null;
    if (res && res.ok) showToast('Category renamed', 'success');
    else if (res && res.status === 400) showToast('Category name already exists', 'warning');
    setRenamingCatId(null);
  };

  const onRowDragStart = (e: React.DragEvent, loc: any) => { setDraggingId(loc.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', loc.id); } catch {} };
  const onRowDragEnd = () => { setDraggingId(null); setDragOverKey(null); };
  const onTargetDragOver = (e: React.DragEvent, key: string) => { if (!draggingId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverKey !== key) setDragOverKey(key); };
  const onTargetDragLeave = (key: string) => setDragOverKey(prev => (prev === key ? null : prev));
  const onTargetDrop = (e: React.DragEvent, key: string, targetId: string | null) => {
    e.preventDefault();
    const id = draggingId || e.dataTransfer.getData('text/plain');
    setDraggingId(null); setDragOverKey(null);
    if (!id || !onUpdateLocation) return;
    const loc = (locations || []).find((l: any) => l.id === id);
    if (loc && (loc.category_id || null) === targetId) return; // no-op
    onUpdateLocation(id, { category_id: targetId });
  };

  // =========================================================
  // CLASSIC (XP)
  // =========================================================
  if (classic) {
    const catRow = (key: string, label: string, count: number, opts: { catObj?: any; isDrop?: boolean; targetId?: string | null } = {}) => {
      const active = selectedCat === key;
      const over = dragOverKey === key;
      const renaming = opts.catObj && renamingCatId === opts.catObj.id;
      return (
        <div
          key={key}
          onClick={() => !renaming && setSelectedCat(key)}
          onMouseEnter={() => setHoveredCat(key)}
          onMouseLeave={() => setHoveredCat(null)}
          onDragOver={opts.isDrop ? (e) => onTargetDragOver(e, key) : undefined}
          onDragLeave={opts.isDrop ? () => onTargetDragLeave(key) : undefined}
          onDrop={opts.isDrop ? (e) => onTargetDrop(e, key, opts.targetId ?? null) : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer',
            fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11,
            color: active ? '#fff' : '#000',
            background: over ? '#ffe9a8' : active ? 'linear-gradient(to bottom,#3c8cf0,#1a5fd0)' : 'transparent',
            border: over ? '1px dashed #b8860b' : '1px solid transparent',
          }}
        >
          <i className={`bi ${key === ALL ? 'bi-collection' : key === UNCAT ? 'bi-folder' : 'bi-folder-fill'}`} style={{ color: active ? '#fff' : key === UNCAT ? '#999' : '#caa55a' }} />
          {renaming ? (
            <input
              autoFocus
              style={{ ...xpInput, flex: 1, minWidth: 0 }}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingCatId(null); }}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          )}
          <span style={{ fontSize: 10, color: active ? '#dde' : '#777' }}>{count}</span>
          {opts.catObj && !renaming && hoveredCat === key && (
            <>
              <i className="bi bi-pencil" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(opts.catObj); }} style={{ color: active ? '#fff' : '#333', fontSize: 11 }} />
              {onDeleteCategory && <i className="bi bi-trash" title="Delete" onClick={(e) => { e.stopPropagation(); onDeleteCategory(opts.catObj.id); }} style={{ color: active ? '#fff' : '#c00000', fontSize: 11 }} />}
            </>
          )}
        </div>
      );
    };

    let lastGroup = ' ';
    return (
      <div className="row justify-content-center fade-in">
        <div className="col-md-11">
          <div style={xpBevel}>
            <div style={xpTitleBar}>
              <span><i className="bi bi-geo-alt-fill" style={{ marginRight: 6 }} />{t('locations')}</span>
            </div>

            <div style={{ display: 'flex', minHeight: 420 }}>
              {/* LEFT: category rail */}
              <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid #b0a898', background: '#f5f4ef', display: 'flex', flexDirection: 'column' }}>
                <div style={{ ...xpToolbar, justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold' }}>Location Categories</span>
                  <button style={xpBtn({ padding: '1px 6px' })} onClick={() => setAddingCat(v => !v)} title="New location category"><i className="bi bi-folder-plus" /></button>
                </div>
                {addingCat && (
                  <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: 4, padding: '4px 6px', borderBottom: '1px solid #d8d4c8' }}>
                    <input autoFocus style={{ ...xpInput, flex: 1, minWidth: 0 }} placeholder="Location category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                    <button type="submit" disabled={isAddingCat} style={xpBtn({ opacity: isAddingCat ? 0.6 : 1 })}>{t('add')}</button>
                  </form>
                )}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }}>
                  {catRow(ALL, 'All locations', totalCount)}
                  <div style={{ height: 1, background: '#d8d4c8', margin: '2px 6px' }} />
                  {sortedCategories.map((c: any) => catRow(c.id, c.name, countFor(c.id), { catObj: c, isDrop: true, targetId: c.id }))}
                  {sortedCategories.length === 0 && <div style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#888' }}>No categories yet</div>}
                  <div style={{ height: 1, background: '#d8d4c8', margin: '2px 6px' }} />
                  {catRow(UNCAT, 'Uncategorized', uncatCount, { isDrop: true, targetId: null })}
                </div>
                <div style={{ background: 'linear-gradient(to bottom,#e8e6df,#d5d3cc)', borderTop: '1px solid #b0a898', padding: '2px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#333' }}>
                  <b>{totalCount}</b> locations · <b>{sortedCategories.length}</b> location categories
                </div>
              </div>

              {/* RIGHT: locations */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={xpToolbar}>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 12, fontWeight: 'bold', color: '#003080' }}>{scopeLabel}</span>
                  <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#666' }}>({visible.length})</span>
                  <div style={{ flex: 1 }} />
                  <i className="bi bi-search" style={{ fontSize: 11, color: '#666' }} />
                  <input style={{ ...xpInput, width: 150 }} placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <button style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' })} onClick={() => setShowAddForm(v => !v)}>
                    <i className="bi bi-plus-lg" style={{ marginRight: 3 }} />Add location
                  </button>
                </div>

                {showAddForm && (
                  <form onSubmit={handleSubmitLocation} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '6px 8px', background: '#eef3fb', borderBottom: '1px solid #b0c4de' }}>
                    <div>
                      <label style={xpLabel}>{t('location_code')}</label>
                      <input autoFocus style={{ ...xpInput, width: 110 }} placeholder="WH-01" value={newLocation.code} onChange={(e) => setNewLocation({ ...newLocation, code: e.target.value })} required />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={xpLabel}>{t('location_name')}</label>
                      <input style={{ ...xpInput, width: '100%' }} placeholder="Main Warehouse" value={newLocation.name} onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })} required />
                    </div>
                    <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#555' }}>
                      <i className="bi bi-folder-fill" style={{ color: scopeCreateCategoryId ? '#caa55a' : '#999', marginRight: 3 }} />{scopeCreateCategoryId ? scopeLabel : 'No category'}
                    </span>
                    <button type="submit" disabled={isSubmitting} style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold', opacity: isSubmitting ? 0.6 : 1 })}>{isSubmitting ? '...' : 'Save'}</button>
                    <button type="button" onClick={() => setShowAddForm(false)} style={xpBtn()}><i className="bi bi-x-lg" /></button>
                  </form>
                )}

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {sortedVisible.map((loc: any) => {
                    const rows: React.ReactNode[] = [];
                    if (grouped) {
                      const gl = catNameOf(loc) || 'Uncategorized';
                      if (gl !== lastGroup) {
                        lastGroup = gl;
                        rows.push(
                          <div key={`hdr-${loc.id}`} style={{ padding: '3px 10px', background: '#dfe8f6', borderBottom: '1px solid #b0c4de', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: '#003080' }}>
                            <i className="bi bi-folder-fill" style={{ marginRight: 4, color: catNameOf(loc) ? '#caa55a' : '#999' }} />{gl}
                          </div>
                        );
                      }
                    }
                    rows.push(
                      <div
                        key={loc.id}
                        draggable
                        onDragStart={(e) => onRowDragStart(e, loc)}
                        onDragEnd={onRowDragEnd}
                        onMouseEnter={() => setHoveredRow(loc.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderBottom: '1px solid #e3e0d8', background: draggingId === loc.id ? '#fff7d6' : hoveredRow === loc.id ? '#f0f6ff' : '#fff', cursor: 'grab' }}
                      >
                        <i className="bi bi-grip-vertical" style={{ color: '#aaa' }} />
                        <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, fontWeight: 'bold', color: '#00008b', fontVariant: 'all-small-caps', width: 90 }}>{loc.code}</span>
                        <span style={{ flex: 1, minWidth: 0, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</span>
                        <button style={xpBtn({ padding: '1px 5px', background: 'transparent', border: '1px solid transparent' })} onClick={() => onDeleteLocation(loc.id)} title="Delete"><i className="bi bi-trash" style={{ color: '#c00000' }} /></button>
                      </div>
                    );
                    return rows;
                  })}
                  {visible.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 24, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: 11, color: '#666' }}>
                      No locations {searchTerm ? 'match your search' : 'here'}.
                    </div>
                  )}
                </div>
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
  const mCatItem = (key: string, label: string, count: number, opts: { catObj?: any; isDrop?: boolean; targetId?: string | null } = {}) => {
    const active = selectedCat === key;
    const over = dragOverKey === key;
    const renaming = opts.catObj && renamingCatId === opts.catObj.id;
    return (
      <button
        key={key}
        type="button"
        onClick={() => !renaming && setSelectedCat(key)}
        onMouseEnter={() => setHoveredCat(key)}
        onMouseLeave={() => setHoveredCat(null)}
        onDragOver={opts.isDrop ? (e) => onTargetDragOver(e, key) : undefined}
        onDragLeave={opts.isDrop ? () => onTargetDragLeave(key) : undefined}
        onDrop={opts.isDrop ? (e) => onTargetDrop(e, key, opts.targetId ?? null) : undefined}
        className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${active ? 'active' : ''}`}
        style={over ? { background: '#fff3cd', border: '1px dashed #b8860b' } : undefined}
      >
        <i className={`bi ${key === ALL ? 'bi-collection' : key === UNCAT ? 'bi-folder' : 'bi-folder-fill'}`} style={{ color: active ? '#fff' : key === UNCAT ? '#adb5bd' : '#caa55a' }} />
        {renaming ? (
          <input
            autoFocus
            className="form-control form-control-sm"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingCatId(null); }}
          />
        ) : (
          <span className="flex-grow-1 text-truncate text-start">{label}</span>
        )}
        <span className={`badge rounded-pill ${active ? 'bg-light text-dark' : 'bg-secondary'}`}>{count}</span>
        {opts.catObj && !renaming && hoveredCat === key && (
          <span className="d-flex gap-2">
            <i className="bi bi-pencil" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(opts.catObj); }} />
            {onDeleteCategory && <i className="bi bi-trash text-danger" title="Delete" onClick={(e) => { e.stopPropagation(); onDeleteCategory(opts.catObj.id); }} />}
          </span>
        )}
      </button>
    );
  };

  let lastGroupM = ' ';
  return (
    <div className="row justify-content-center fade-in">
      <div className="col-lg-11">
        <div className="card h-100">
          <div className="card-header bg-white d-flex align-items-center">
            <h5 className="card-title mb-0"><i className="bi bi-geo-alt-fill me-2" />{t('locations')}</h5>
          </div>
          <div className="card-body p-0">
            <div className="row g-0" style={{ minHeight: 460 }}>
              {/* LEFT: category rail */}
              <div className="col-md-4 col-lg-3 border-end d-flex flex-column">
                <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
                  <span className="text-muted text-uppercase small fw-bold">Location Categories</span>
                  <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setAddingCat(v => !v)} title="New location category"><i className="bi bi-folder-plus" /></button>
                </div>
                {addingCat && (
                  <form onSubmit={handleAddCategory} className="input-group input-group-sm p-2 border-bottom">
                    <input autoFocus className="form-control" placeholder="Location category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                    <button type="submit" className="btn btn-outline-primary" disabled={isAddingCat}>{t('add')}</button>
                  </form>
                )}
                <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                  {mCatItem(ALL, 'All locations', totalCount)}
                  {sortedCategories.map((c: any) => mCatItem(c.id, c.name, countFor(c.id), { catObj: c, isDrop: true, targetId: c.id }))}
                  {sortedCategories.length === 0 && <div className="px-3 py-2 text-muted small">No categories yet</div>}
                  {mCatItem(UNCAT, 'Uncategorized', uncatCount, { isDrop: true, targetId: null })}
                </div>
                <div className="px-3 py-2 border-top text-muted small">
                  <b>{totalCount}</b> locations · <b>{sortedCategories.length}</b> location categories
                </div>
              </div>

              {/* RIGHT: locations */}
              <div className="col-md-8 col-lg-9 d-flex flex-column">
                <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
                  <h6 className="mb-0 text-primary">{scopeLabel}</h6>
                  <span className="text-muted small">({visible.length})</span>
                  <div className="flex-grow-1" />
                  <div className="input-group input-group-sm" style={{ width: 200 }}>
                    <span className="input-group-text"><i className="bi bi-search" /></span>
                    <input className="form-control" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <button className="btn btn-sm btn-success text-nowrap" onClick={() => setShowAddForm(v => !v)}><i className="bi bi-plus-lg me-1" />Add location</button>
                </div>

                {showAddForm && (
                  <form onSubmit={handleSubmitLocation} className="d-flex align-items-end gap-2 px-3 py-2 border-bottom" style={{ background: '#eef3fb' }}>
                    <div>
                      <label className="form-label small mb-1">{t('location_code')}</label>
                      <input autoFocus className="form-control form-control-sm" style={{ width: 120 }} placeholder="WH-01" value={newLocation.code} onChange={(e) => setNewLocation({ ...newLocation, code: e.target.value })} required />
                    </div>
                    <div className="flex-grow-1">
                      <label className="form-label small mb-1">{t('location_name')}</label>
                      <input className="form-control form-control-sm" placeholder="Main Warehouse" value={newLocation.name} onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })} required />
                    </div>
                    <span className="text-muted small text-nowrap pb-1"><i className="bi bi-folder-fill me-1" style={{ color: scopeCreateCategoryId ? '#caa55a' : '#adb5bd' }} />{scopeCreateCategoryId ? scopeLabel : 'No category'}</span>
                    <button type="submit" className="btn btn-sm btn-success" disabled={isSubmitting}>{isSubmitting ? '...' : 'Save'}</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowAddForm(false)}><i className="bi bi-x-lg" /></button>
                  </form>
                )}

                <div className="flex-grow-1 overflow-auto">
                  <ul className="list-group list-group-flush">
                    {sortedVisible.flatMap((loc: any) => {
                      const out: React.ReactNode[] = [];
                      if (grouped) {
                        const gl = catNameOf(loc) || 'Uncategorized';
                        if (gl !== lastGroupM) {
                          lastGroupM = gl;
                          out.push(
                            <li key={`hdr-${loc.id}`} className="list-group-item bg-light fw-bold small text-uppercase py-1">
                              <i className="bi bi-folder-fill me-2" style={{ color: catNameOf(loc) ? '#caa55a' : '#adb5bd' }} />{gl}
                            </li>
                          );
                        }
                      }
                      out.push(
                        <li
                          key={loc.id}
                          draggable
                          onDragStart={(e) => onRowDragStart(e, loc)}
                          onDragEnd={onRowDragEnd}
                          className="list-group-item d-flex align-items-center gap-2"
                          style={{ cursor: 'grab', background: draggingId === loc.id ? '#fff7d6' : undefined }}
                        >
                          <i className="bi bi-grip-vertical text-muted" />
                          <span className="fw-medium font-monospace text-primary" style={{ width: 90 }}>{loc.code}</span>
                          <span className="flex-grow-1 text-truncate">{loc.name}</span>
                          <button className="btn btn-sm btn-link text-danger p-0 px-1" onClick={() => onDeleteLocation(loc.id)} title="Delete"><i className="bi bi-trash" /></button>
                        </li>
                      );
                      return out;
                    })}
                    {visible.length === 0 && <li className="list-group-item text-center text-muted py-4">No locations {searchTerm ? 'match your search' : 'here'}.</li>}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
