import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

// ── XP inline styles ─────────────────────────────────────────────────────
const xpBevel: React.CSSProperties = {
    border: '2px solid', borderColor: '#dfdfdf #808080 #808080 #dfdfdf',
    boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', background: '#ece9d8', borderRadius: 0,
};
const xpTitleBar = (extra: any = {}): React.CSSProperties => ({
    background: 'linear-gradient(to right, #0058e6 0%, #08a5ff 100%)', color: '#ffffff',
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '12px', fontWeight: 'bold',
    padding: '4px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
    borderBottom: '1px solid #003080', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', minHeight: '26px', ...extra,
});
const xpToolbar: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)', borderBottom: '1px solid #b0a898',
    padding: '3px 6px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' as const,
};
const xpBtn = (extra: any = {}) => ({
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', padding: '2px 10px', cursor: 'pointer',
    background: 'linear-gradient(to bottom, #ffffff 0%, #d4d0c8 100%)', border: '1px solid',
    borderColor: '#dfdfdf #808080 #808080 #dfdfdf', color: '#000000', borderRadius: 0, ...extra,
});
const xpInput: React.CSSProperties = {
    fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '11px', border: '1px solid #7f9db9',
    boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.1)', padding: '1px 6px',
    background: '#ffffff', color: '#000000', height: '20px', outline: 'none',
};
const xpSep: React.CSSProperties = {
    width: '1px', height: '20px', background: '#a0988c', margin: '0 2px', flexShrink: 0,
};
const xpTableHeader: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080',
    fontSize: '10px', fontWeight: 'bold', color: '#000000',
};
const xpLabel: React.CSSProperties = {
    fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#000', display: 'block', marginBottom: 2,
};
const xpStatusBar: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
    padding: '2px 8px', display: 'flex', gap: 16,
    fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#333',
};

const emptyWC = { code: '', name: '', cost_per_hour: 0, center_type: 'GENERAL', input_location_id: '', output_location_id: '', parent_id: '' };

function XPPanel({ icon, title, accentColor, createForm, searchVal, onSearch, searchPlaceholder, countLabel, table }: any) {
    return (
        <div style={{ ...xpBevel, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={xpTitleBar({ background: `linear-gradient(to right, ${accentColor[0]} 0%, ${accentColor[1]} 100%)`, borderBottom: `1px solid ${accentColor[2]}` })}>
                <span><i className={`bi ${icon}`} style={{ marginRight: 6 }}></i>{title}</span>
            </div>
            <div style={{ background: '#f5f4ef', borderBottom: '1px solid #b0a898', padding: '6px 8px' }}>
                {createForm}
            </div>
            <div style={xpToolbar}>
                <i className="bi bi-search" style={{ fontSize: '11px', color: '#666' }}></i>
                <input style={{ ...xpInput, flex: 1, minWidth: 80 }} placeholder={searchPlaceholder} value={searchVal} onChange={(e: any) => onSearch(e.target.value)} />
                <div style={xpSep} />
                <span style={{ fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#444' }}>{countLabel}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff' }}>
                {table}
            </div>
        </div>
    );
}

// Build ordered list: groups first (parent_id=null), then each group's machines indented
function buildTree(wcs: any[]): { wc: any; isGroup: boolean; indent: boolean }[] {
    const groups = wcs.filter((w: any) => !w.parent_id);
    const machines = wcs.filter((w: any) => !!w.parent_id);
    const rows: { wc: any; isGroup: boolean; indent: boolean }[] = [];
    // ungrouped machines (no parent match)
    const groupIds = new Set(groups.map((g: any) => g.id));
    for (const g of groups) {
        rows.push({ wc: g, isGroup: true, indent: false });
        for (const m of machines.filter((m: any) => m.parent_id === g.id)) {
            rows.push({ wc: m, isGroup: false, indent: true });
        }
    }
    // orphaned machines whose parent_id doesn't match any group
    for (const m of machines.filter((m: any) => !groupIds.has(m.parent_id))) {
        rows.push({ wc: m, isGroup: false, indent: true });
    }
    return rows;
}

export default function RoutingView({ workCenters, operations, locations, onCreateWorkCenter, onUpdateWorkCenter, onDeleteWorkCenter, onCreateOperation, onDeleteOperation, onRefresh }: any) {
  const { t } = useLanguage();
  const [newWorkCenter, setNewWorkCenter] = useState({ ...emptyWC });
  const [newOperation, setNewOperation] = useState({ code: '', name: '' });
  const [wcSearch, setWcSearch] = useState('');
  const [opSearch, setOpSearch] = useState('');
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingWC, setEditingWC] = useState<any | null>(null);

  const locationList = locations || [];
  const wcList = workCenters || [];
  // Only groups (no parent) can be selected as parent
  const groups = wcList.filter((w: any) => !w.parent_id);

  const getLocName = (id: string | null) => {
      if (!id) return '—';
      const loc = locationList.find((l: any) => l.id === id);
      return loc ? loc.code : '—';
  };

  const handleCreateWC = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateWorkCenter({
          ...newWorkCenter,
          input_location_id: newWorkCenter.input_location_id || null,
          output_location_id: newWorkCenter.output_location_id || null,
          parent_id: newWorkCenter.parent_id || null,
      });
      setNewWorkCenter({ ...emptyWC });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingWC) return;
      onUpdateWorkCenter(editingWC.id, {
          code: editingWC.code,
          name: editingWC.name,
          description: editingWC.description,
          cost_per_hour: editingWC.cost_per_hour,
          center_type: editingWC.center_type,
          input_location_id: editingWC.input_location_id || null,
          output_location_id: editingWC.output_location_id || null,
          parent_id: editingWC.parent_id || null,
      });
      setEditingWC(null);
  };

  const handleCreateOp = (e: React.FormEvent) => {
      e.preventDefault();
      onCreateOperation(newOperation);
      setNewOperation({ code: '', name: '' });
  };

  const allWCRows = buildTree(wcList);
  const filteredWCRows = allWCRows.filter(({ wc }) =>
      wc.code.toLowerCase().includes(wcSearch.toLowerCase()) ||
      wc.name.toLowerCase().includes(wcSearch.toLowerCase())
  );
  const filteredOp = (operations || []).filter((op: any) =>
      op.code.toLowerCase().includes(opSearch.toLowerCase()) ||
      op.name.toLowerCase().includes(opSearch.toLowerCase())
  );

  // ── Shared inline edit form rows ─────────────────────────────────────────
  const renderEditRow = (colSpan: number, isClassic: boolean) => {
      if (!editingWC) return null;
      const isGroupNode = !editingWC.parent_id && groups.some((g: any) => g.id === editingWC.id);
      if (isClassic) {
          return (
              <tr style={{ background: '#fffde7', borderBottom: '2px solid #0058e6' }}>
                  <td colSpan={colSpan} style={{ padding: '6px 8px' }}>
                      <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                              <div>
                                  <label style={xpLabel}>Code</label>
                                  <input style={{ ...xpInput, width: 72 }} value={editingWC.code} onChange={e => setEditingWC({ ...editingWC, code: e.target.value })} required />
                              </div>
                              <div style={{ flex: 1 }}>
                                  <label style={xpLabel}>Name</label>
                                  <input style={{ ...xpInput, width: '100%' }} value={editingWC.name} onChange={e => setEditingWC({ ...editingWC, name: e.target.value })} required />
                              </div>
                              <div>
                                  <label style={xpLabel}>Type</label>
                                  <select style={{ ...xpInput, width: 90 }} value={editingWC.center_type} onChange={e => setEditingWC({ ...editingWC, center_type: e.target.value })}>
                                      <option value="GENERAL">GENERAL</option>
                                      <option value="DYEING">DYEING</option>
                                      <option value="SETTING">SETTING</option>
                                  </select>
                              </div>
                              <div>
                                  <label style={xpLabel}>Group</label>
                                  <select style={{ ...xpInput, width: 110 }} value={editingWC.parent_id || ''} onChange={e => setEditingWC({ ...editingWC, parent_id: e.target.value })}>
                                      <option value="">— group —</option>
                                      {groups.filter((g: any) => g.id !== editingWC.id).map((g: any) => <option key={g.id} value={g.id}>{g.code}</option>)}
                                  </select>
                              </div>
                          </div>
                          {!isGroupNode && (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                                  <div style={{ flex: 1 }}>
                                      <label style={xpLabel}>Input Location</label>
                                      <select style={{ ...xpInput, width: '100%' }} value={editingWC.input_location_id || ''} onChange={e => setEditingWC({ ...editingWC, input_location_id: e.target.value })}>
                                          <option value="">— none —</option>
                                          {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                      </select>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      <label style={xpLabel}>Output Location</label>
                                      <select style={{ ...xpInput, width: '100%' }} value={editingWC.output_location_id || ''} onChange={e => setEditingWC({ ...editingWC, output_location_id: e.target.value })}>
                                          <option value="">— none —</option>
                                          {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                      </select>
                                  </div>
                              </div>
                          )}
                          <div style={{ display: 'flex', gap: 4 }}>
                              <button type="submit" style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#fff', fontWeight: 'bold' })}>Save</button>
                              <button type="button" style={xpBtn()} onClick={() => setEditingWC(null)}>Cancel</button>
                          </div>
                      </form>
                  </td>
              </tr>
          );
      }
      return (
          <tr className="table-warning">
              <td colSpan={colSpan}>
                  <form onSubmit={handleSaveEdit}>
                      <div className="row g-2 align-items-end mb-2">
                          <div className="col-2">
                              <input className="form-control form-control-sm" value={editingWC.code} onChange={e => setEditingWC({ ...editingWC, code: e.target.value })} required />
                          </div>
                          <div className="col-3">
                              <input className="form-control form-control-sm" value={editingWC.name} onChange={e => setEditingWC({ ...editingWC, name: e.target.value })} required />
                          </div>
                          <div className="col-2">
                              <select className="form-select form-select-sm" value={editingWC.center_type} onChange={e => setEditingWC({ ...editingWC, center_type: e.target.value })}>
                                  <option value="GENERAL">GENERAL</option>
                                  <option value="DYEING">DYEING</option>
                                  <option value="SETTING">SETTING</option>
                              </select>
                          </div>
                          <div className="col-3">
                              <select className="form-select form-select-sm" value={editingWC.parent_id || ''} onChange={e => setEditingWC({ ...editingWC, parent_id: e.target.value })}>
                                  <option value="">— group node —</option>
                                  {groups.filter((g: any) => g.id !== editingWC.id).map((g: any) => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
                              </select>
                          </div>
                          <div className="col-2 d-flex gap-1">
                              <button type="submit" className="btn btn-sm btn-success">Save</button>
                              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditingWC(null)}>Cancel</button>
                          </div>
                      </div>
                      {!isGroupNode && (
                          <div className="row g-2 align-items-end">
                              <div className="col-4">
                                  <label className="form-label small mb-0">Input Location</label>
                                  <select className="form-select form-select-sm" value={editingWC.input_location_id || ''} onChange={e => setEditingWC({ ...editingWC, input_location_id: e.target.value })}>
                                      <option value="">— none —</option>
                                      {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                  </select>
                              </div>
                              <div className="col-4">
                                  <label className="form-label small mb-0">Output Location</label>
                                  <select className="form-select form-select-sm" value={editingWC.output_location_id || ''} onChange={e => setEditingWC({ ...editingWC, output_location_id: e.target.value })}>
                                      <option value="">— none —</option>
                                      {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                  </select>
                              </div>
                          </div>
                      )}
                  </form>
              </td>
          </tr>
      );
  };

  if (classic) {
      return (
          <div className="row g-3 fade-in">
              <div className="col-md-6">
                  <XPPanel
                      icon="bi-cpu-fill"
                      title={t('work_centers')}
                      accentColor={['#0058e6', '#08a5ff', '#003080']}
                      searchVal={wcSearch}
                      onSearch={setWcSearch}
                      searchPlaceholder="Search work centers..."
                      countLabel={`${wcList.length} station${wcList.length === 1 ? '' : 's'}`}
                      createForm={
                          <form onSubmit={handleCreateWC} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                                  <div>
                                      <label style={xpLabel}>{t('item_code')}</label>
                                      <input style={{ ...xpInput, width: 72 }} placeholder="WC-01" value={newWorkCenter.code} onChange={e => setNewWorkCenter({ ...newWorkCenter, code: e.target.value })} required />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      <label style={xpLabel}>{t('station_name')}</label>
                                      <input style={{ ...xpInput, width: '100%' }} placeholder="Dyeing Group" value={newWorkCenter.name} onChange={e => setNewWorkCenter({ ...newWorkCenter, name: e.target.value })} required />
                                  </div>
                                  <div>
                                      <label style={xpLabel}>Type</label>
                                      <select style={{ ...xpInput, width: 90 }} value={newWorkCenter.center_type} onChange={e => setNewWorkCenter({ ...newWorkCenter, center_type: e.target.value })}>
                                          <option value="GENERAL">GENERAL</option>
                                          <option value="DYEING">DYEING</option>
                                          <option value="SETTING">SETTING</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label style={xpLabel}>Group</label>
                                      <select style={{ ...xpInput, width: 110 }} value={newWorkCenter.parent_id} onChange={e => setNewWorkCenter({ ...newWorkCenter, parent_id: e.target.value })}>
                                          <option value="">— group —</option>
                                          {groups.map((g: any) => <option key={g.id} value={g.id}>{g.code}</option>)}
                                      </select>
                                  </div>
                              </div>
                              {newWorkCenter.parent_id && (
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                                      <div style={{ flex: 1 }}>
                                          <label style={xpLabel}>Input Location</label>
                                          <select style={{ ...xpInput, width: '100%' }} value={newWorkCenter.input_location_id} onChange={e => setNewWorkCenter({ ...newWorkCenter, input_location_id: e.target.value })}>
                                              <option value="">— none —</option>
                                              {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                          </select>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                          <label style={xpLabel}>Output Location</label>
                                          <select style={{ ...xpInput, width: '100%' }} value={newWorkCenter.output_location_id} onChange={e => setNewWorkCenter({ ...newWorkCenter, output_location_id: e.target.value })}>
                                              <option value="">— none —</option>
                                              {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                          </select>
                                      </div>
                                  </div>
                              )}
                              <div>
                                  <button type="submit" style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold', padding: '2px 10px' })}>
                                      <i className="bi bi-plus-lg" style={{ marginRight: 3 }}></i>{t('add')}
                                  </button>
                              </div>
                          </form>
                      }
                      table={
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                  <tr>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px', width: 70 }}>{t('item_code')}</th>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px' }}>{t('station_name')}</th>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px', width: 60 }}>Type</th>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px', width: 60 }}>In Loc</th>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px', width: 60 }}>Out Loc</th>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px', width: 50 }}></th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {filteredWCRows.map(({ wc, isGroup, indent }, i) => (
                                      editingWC?.id === wc.id
                                          ? renderEditRow(6, true)
                                          : (
                                              <tr key={wc.id} style={{ background: isGroup ? '#e8eaf6' : (i % 2 === 0 ? '#ffffff' : '#f5f3ee'), borderBottom: isGroup ? '2px solid #9fa8da' : '1px solid #c0bdb5' }}>
                                                  <td style={{ padding: '4px 8px', paddingLeft: indent ? 20 : 8, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', fontWeight: 'bold', color: isGroup ? '#1a237e' : '#00008b', fontVariant: 'all-small-caps' }}>
                                                      {isGroup && <i className="bi bi-folder2" style={{ marginRight: 4, fontSize: 10 }}></i>}
                                                      {indent && <i className="bi bi-dash" style={{ marginRight: 2, fontSize: 10, color: '#888' }}></i>}
                                                      {wc.code}
                                                  </td>
                                                  <td style={{ padding: '4px 8px', paddingLeft: indent ? 20 : 8, fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#000', fontStyle: isGroup ? 'italic' : 'normal' }}>{wc.name}</td>
                                                  <td style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px' }}>
                                                      {!isGroup && <span style={{ padding: '1px 5px', borderRadius: 2, background: wc.center_type === 'DYEING' ? '#cce4ff' : wc.center_type === 'SETTING' ? '#ffeacc' : '#e8e8e8', color: wc.center_type === 'DYEING' ? '#003d80' : wc.center_type === 'SETTING' ? '#7a3d00' : '#444' }}>{wc.center_type || 'GENERAL'}</span>}
                                                  </td>
                                                  <td style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#444' }}>{!isGroup ? getLocName(wc.input_location_id) : ''}</td>
                                                  <td style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '10px', color: '#444' }}>{!isGroup ? getLocName(wc.output_location_id) : ''}</td>
                                                  <td style={{ padding: '2px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                      <button style={{ ...xpBtn(), border: hoveredId === `wc-edit-${wc.id}` ? '1px solid #808080' : '1px solid transparent', background: 'transparent', padding: '1px 5px' }} onMouseEnter={() => setHoveredId(`wc-edit-${wc.id}`)} onMouseLeave={() => setHoveredId(null)} onClick={() => setEditingWC({ ...wc })} title="Edit"><i className="bi bi-pencil" style={{ fontSize: '11px' }}></i></button>
                                                      <button style={{ ...xpBtn(), border: hoveredId === `wc-${wc.id}` ? '1px solid #808080' : '1px solid transparent', background: 'transparent', padding: '1px 5px' }} onMouseEnter={() => setHoveredId(`wc-${wc.id}`)} onMouseLeave={() => setHoveredId(null)} onClick={() => onDeleteWorkCenter && onDeleteWorkCenter(wc.id)} title="Delete"><i className="bi bi-trash" style={{ color: '#c00000', fontSize: '11px' }}></i></button>
                                                  </td>
                                              </tr>
                                          )
                                  ))}
                                  {filteredWCRows.length === 0 && (
                                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '16px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#666' }}>No work centers defined</td></tr>
                                  )}
                              </tbody>
                          </table>
                      }
                  />
                  <div style={xpStatusBar}><span><b>{wcList.length}</b> Total</span><span><b>{groups.length}</b> Groups</span></div>
              </div>

              {/* Operations */}
              <div className="col-md-6">
                  <XPPanel
                      icon="bi-gear-fill"
                      title={t('standard_operations')}
                      accentColor={['#1a6e1a', '#3ab83a', '#0a4e0a']}
                      searchVal={opSearch}
                      onSearch={setOpSearch}
                      searchPlaceholder="Search operations..."
                      countLabel={`${filteredOp.length} operation${filteredOp.length === 1 ? '' : 's'}`}
                      createForm={
                          <form onSubmit={handleCreateOp} style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                              <div>
                                  <label style={xpLabel}>{t('item_code')}</label>
                                  <input style={{ ...xpInput, width: 72 }} placeholder="OP-10" value={newOperation.code} onChange={e => setNewOperation({ ...newOperation, code: e.target.value })} required />
                              </div>
                              <div style={{ flex: 1 }}>
                                  <label style={xpLabel}>{t('operation_name')}</label>
                                  <input style={{ ...xpInput, width: '100%' }} placeholder="Cutting" value={newOperation.name} onChange={e => setNewOperation({ ...newOperation, name: e.target.value })} required />
                              </div>
                              <button type="submit" style={xpBtn({ background: 'linear-gradient(to bottom,#5ec85e,#2d7a2d)', borderColor: '#1a5e1a #0a3e0a #0a3e0a #1a5e1a', color: '#ffffff', fontWeight: 'bold', padding: '2px 10px' })}>
                                  <i className="bi bi-plus-lg" style={{ marginRight: 3 }}></i>{t('add')}
                              </button>
                          </form>
                      }
                      table={
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                  <tr>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px', width: 80 }}>{t('item_code')}</th>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px' }}>{t('operation_name')}</th>
                                      <th style={{ ...xpTableHeader, padding: '3px 8px', width: 36 }}></th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {filteredOp.map((op: any, i: number) => (
                                      <tr key={op.id} style={{ background: i % 2 === 0 ? '#ffffff' : '#f5f3ee', borderBottom: '1px solid #c0bdb5' }}>
                                          <td style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', fontWeight: 'bold', color: '#1a5e1a', fontVariant: 'all-small-caps' }}>{op.code}</td>
                                          <td style={{ padding: '4px 8px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#000' }}>{op.name}</td>
                                          <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                                              <button style={{ ...xpBtn(), border: hoveredId === `op-${op.id}` ? '1px solid #808080' : '1px solid transparent', background: 'transparent', padding: '1px 5px' }} onMouseEnter={() => setHoveredId(`op-${op.id}`)} onMouseLeave={() => setHoveredId(null)} onClick={() => onDeleteOperation && onDeleteOperation(op.id)} title="Delete"><i className="bi bi-trash" style={{ color: '#c00000', fontSize: '11px' }}></i></button>
                                          </td>
                                      </tr>
                                  ))}
                                  {filteredOp.length === 0 && (
                                      <tr><td colSpan={3} style={{ textAlign: 'center', padding: '16px', fontFamily: 'Tahoma,Arial,sans-serif', fontSize: '11px', color: '#666' }}>No operations defined</td></tr>
                                  )}
                              </tbody>
                          </table>
                      }
                  />
                  <div style={xpStatusBar}><span><b>{(operations || []).length}</b> Total</span></div>
              </div>
          </div>
      );
  }

  // ── Modern (Bootstrap) mode ───────────────────────────────────────────────
  return (
      <div className="row g-4 fade-in">
          <div className="col-md-6">
              <div className="card h-100 shadow-sm border-0">
                  <div className="card-header bg-white d-flex justify-content-between align-items-center">
                      <div>
                          <h5 className="card-title mb-0">{t('work_centers')}</h5>
                          <p className="text-muted small mb-0 mt-1">Groups contain specific machines. Locations assigned at machine level.</p>
                      </div>
                      {onRefresh && <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}><i className="bi bi-arrow-clockwise"></i></button>}
                  </div>
                  <div className="card-body">
                      <form onSubmit={handleCreateWC} className="mb-3 p-3 bg-light rounded border">
                          <div className="row g-2 align-items-end mb-2">
                              <div className="col-2">
                                  <label className="form-label small">{t('item_code')}</label>
                                  <input className="form-control form-control-sm" placeholder="WC-01" value={newWorkCenter.code} onChange={e => setNewWorkCenter({ ...newWorkCenter, code: e.target.value })} required />
                              </div>
                              <div className="col-4">
                                  <label className="form-label small">{t('station_name')}</label>
                                  <input className="form-control form-control-sm" placeholder="Dyeing Machine 1" value={newWorkCenter.name} onChange={e => setNewWorkCenter({ ...newWorkCenter, name: e.target.value })} required />
                              </div>
                              <div className="col-3">
                                  <label className="form-label small">Type</label>
                                  <select className="form-select form-select-sm" value={newWorkCenter.center_type} onChange={e => setNewWorkCenter({ ...newWorkCenter, center_type: e.target.value })}>
                                      <option value="GENERAL">GENERAL</option>
                                      <option value="DYEING">DYEING</option>
                                      <option value="SETTING">SETTING</option>
                                  </select>
                              </div>
                              <div className="col-3">
                                  <label className="form-label small">Group (optional)</label>
                                  <select className="form-select form-select-sm" value={newWorkCenter.parent_id} onChange={e => setNewWorkCenter({ ...newWorkCenter, parent_id: e.target.value, input_location_id: '', output_location_id: '' })}>
                                      <option value="">— group node —</option>
                                      {groups.map((g: any) => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
                                  </select>
                              </div>
                          </div>
                          {newWorkCenter.parent_id && (
                              <div className="row g-2 align-items-end">
                                  <div className="col-5">
                                      <label className="form-label small">Input Location</label>
                                      <select className="form-select form-select-sm" value={newWorkCenter.input_location_id} onChange={e => setNewWorkCenter({ ...newWorkCenter, input_location_id: e.target.value })}>
                                          <option value="">— none —</option>
                                          {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                      </select>
                                  </div>
                                  <div className="col-5">
                                      <label className="form-label small">Output Location</label>
                                      <select className="form-select form-select-sm" value={newWorkCenter.output_location_id} onChange={e => setNewWorkCenter({ ...newWorkCenter, output_location_id: e.target.value })}>
                                          <option value="">— none —</option>
                                          {locationList.map((l: any) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                                      </select>
                                  </div>
                              </div>
                          )}
                          <div className="mt-2">
                              <button type="submit" className="btn btn-sm btn-primary">{t('add')}</button>
                          </div>
                      </form>
                      <div className="input-group input-group-sm mb-2">
                          <span className="input-group-text"><i className="bi bi-search"></i></span>
                          <input className="form-control" placeholder="Search work centers..." value={wcSearch} onChange={e => setWcSearch(e.target.value)} />
                      </div>
                      <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                              <thead className="table-light">
                                  <tr>
                                      <th>{t('item_code')}</th>
                                      <th>{t('station_name')}</th>
                                      <th>Type</th>
                                      <th>In Loc</th>
                                      <th>Out Loc</th>
                                      <th style={{ width: '80px' }}></th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {filteredWCRows.map(({ wc, isGroup, indent }) => (
                                      editingWC?.id === wc.id
                                          ? renderEditRow(6, false)
                                          : (
                                              <tr key={wc.id} className={isGroup ? 'table-light' : ''}>
                                                  <td className={`fw-bold font-monospace small ${isGroup ? 'text-dark' : 'text-primary'}`} style={{ paddingLeft: indent ? '2rem' : undefined }}>
                                                      {isGroup ? <i className="bi bi-folder2 me-1 text-secondary"></i> : <i className="bi bi-dash me-1 text-muted"></i>}
                                                      {wc.code}
                                                  </td>
                                                  <td style={{ fontStyle: isGroup ? 'italic' : 'normal', paddingLeft: indent ? '2rem' : undefined }}>{wc.name}</td>
                                                  <td>{!isGroup && <span className={`badge ${wc.center_type === 'DYEING' ? 'bg-primary' : wc.center_type === 'SETTING' ? 'bg-warning text-dark' : 'bg-secondary'}`} style={{ fontSize: 10 }}>{wc.center_type || 'GENERAL'}</span>}</td>
                                                  <td className="small text-muted">{!isGroup ? getLocName(wc.input_location_id) : ''}</td>
                                                  <td className="small text-muted">{!isGroup ? getLocName(wc.output_location_id) : ''}</td>
                                                  <td>
                                                      <button className="btn btn-sm text-primary me-1" onClick={() => setEditingWC({ ...wc })} title="Edit"><i className="bi bi-pencil"></i></button>
                                                      <button className="btn btn-sm text-danger" onClick={() => onDeleteWorkCenter && onDeleteWorkCenter(wc.id)}><i className="bi bi-trash"></i></button>
                                                  </td>
                                              </tr>
                                          )
                                  ))}
                                  {filteredWCRows.length === 0 && <tr><td colSpan={6} className="text-center py-3 text-muted small">No work centers defined</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>

          {/* Operations */}
          <div className="col-md-6">
              <div className="card h-100 shadow-sm border-0">
                  <div className="card-header bg-white">
                      <h5 className="card-title mb-0">{t('standard_operations')}</h5>
                      <p className="text-muted small mb-0 mt-1">Define reusable process steps like "Cutting", "Welding".</p>
                  </div>
                  <div className="card-body">
                      <form onSubmit={handleCreateOp} className="mb-3 p-3 bg-light rounded border">
                          <div className="row g-2 align-items-end">
                              <div className="col-4">
                                  <label className="form-label small">{t('item_code')}</label>
                                  <input className="form-control form-control-sm" placeholder="OP-10" value={newOperation.code} onChange={e => setNewOperation({ ...newOperation, code: e.target.value })} required />
                              </div>
                              <div className="col-5">
                                  <label className="form-label small">{t('operation_name')}</label>
                                  <input className="form-control form-control-sm" placeholder="Cutting" value={newOperation.name} onChange={e => setNewOperation({ ...newOperation, name: e.target.value })} required />
                              </div>
                              <div className="col-3">
                                  <button type="submit" className="btn btn-sm btn-success w-100">{t('add')}</button>
                              </div>
                          </div>
                      </form>
                      <div className="input-group input-group-sm mb-2">
                          <span className="input-group-text"><i className="bi bi-search"></i></span>
                          <input className="form-control" placeholder="Search operations..." value={opSearch} onChange={e => setOpSearch(e.target.value)} />
                      </div>
                      <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0">
                              <thead className="table-light">
                                  <tr>
                                      <th>{t('item_code')}</th>
                                      <th>{t('operation_name')}</th>
                                      <th style={{ width: '50px' }}></th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {filteredOp.map((op: any) => (
                                      <tr key={op.id}>
                                          <td className="fw-bold font-monospace text-success small">{op.code}</td>
                                          <td>{op.name}</td>
                                          <td>
                                              <button className="btn btn-sm text-danger" onClick={() => onDeleteOperation && onDeleteOperation(op.id)}><i className="bi bi-trash"></i></button>
                                          </td>
                                      </tr>
                                  ))}
                                  {filteredOp.length === 0 && <tr><td colSpan={3} className="text-center py-3 text-muted small">No operations defined</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );
}
