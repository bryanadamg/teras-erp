'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import TreeSelect, { buildLocationPickerTree } from '../shared/TreeSelect';
import { ShellWindow, ShellTitleBar } from '../shared/shellTheme';
import { Tabs, TabDef } from '../shared/Tabs';
import Pager from '../shared/Pager';
import { XPActionButton } from '../shared/xpTheme';
import { lvBtn, lvPrimaryBtn, lvInput, lvLabel, lvTh, lvTd, lvSep, lvRow } from '../shared/listViewTheme';

const WC_PAGE_SIZE = 20;
const OP_PAGE_SIZE = 20;

const CENTER_TYPES = ['GENERAL', 'BEAMING', 'WARPING', 'WEAVING', 'DYEING', 'SETTING', 'FINISHING', 'CUTTING'];

const emptyWC = { code: '', name: '', cost_per_hour: 0, center_type: 'GENERAL', input_location_id: '', output_location_id: '', parent_id: '' };

function getWcTypeChip(t?: string): React.CSSProperties {
    switch ((t || '').toUpperCase()) {
        case 'BEAMING':  return { background: '#fce8ff', color: '#660088', border: '1px solid #dda8f0' };
        case 'WARPING':  return { background: '#fff3cc', color: '#664400', border: '1px solid #f0d888' };
        case 'WEAVING':  return { background: '#e8d8ff', color: '#440099', border: '1px solid #c4a8ee' };
        case 'DYEING':   return { background: '#cce4ff', color: '#003d80', border: '1px solid #99c4ee' };
        case 'SETTING':  return { background: '#ffeacc', color: '#7a3d00', border: '1px solid #e8c488' };
        case 'FINISHING':return { background: '#d4f0d4', color: '#005500', border: '1px solid #99cc99' };
        case 'CUTTING':  return { background: '#fff0cc', color: '#886600', border: '1px solid #ddcc88' };
        default:         return { background: '#e8e8e8', color: '#444',    border: '1px solid #ccc' };
    }
}

// Build ordered list: groups first (parent_id=null), then each group's machines indented
function buildTree(wcs: any[]): { wc: any; isGroup: boolean; indent: boolean }[] {
    const groups = wcs.filter((w: any) => !w.parent_id);
    const machines = wcs.filter((w: any) => !!w.parent_id);
    const rows: { wc: any; isGroup: boolean; indent: boolean }[] = [];
    const groupIds = new Set(groups.map((g: any) => g.id));
    for (const g of groups) {
        rows.push({ wc: g, isGroup: true, indent: false });
        for (const m of machines.filter((m: any) => m.parent_id === g.id)) {
            rows.push({ wc: m, isGroup: false, indent: true });
        }
    }
    for (const m of machines.filter((m: any) => !groupIds.has(m.parent_id))) {
        rows.push({ wc: m, isGroup: false, indent: true });
    }
    return rows;
}

type TabKey = 'work_centers' | 'operations';

export default function RoutingView({ workCenters, operations, locations, onCreateWorkCenter, onUpdateWorkCenter, onDeleteWorkCenter, onCreateOperation, onDeleteOperation }: any) {
  const { t } = useLanguage();
  const { hasPermission } = useUser();
  const canManage = hasPermission('manufacturing.manage');
  const { uiStyle: currentStyle } = useTheme();
  const classic = currentStyle === 'classic';

  const TABS: TabDef<TabKey>[] = [
      { key: 'work_centers', label: t('work_centers'), icon: 'bi-cpu-fill' },
      { key: 'operations', label: t('standard_operations'), icon: 'bi-gear-fill' },
  ];

  const [activeTab, setActiveTab] = useState<TabKey>('work_centers');
  const [newWorkCenter, setNewWorkCenter] = useState({ ...emptyWC });
  const [newOperation, setNewOperation] = useState({ code: '', name: '' });
  const [wcSearch, setWcSearch] = useState('');
  const [opSearch, setOpSearch] = useState('');
  const [wcPage, setWcPage] = useState(1);
  const [opPage, setOpPage] = useState(1);
  const [editingWC, setEditingWC] = useState<any | null>(null);

  useEffect(() => { setWcPage(1); }, [wcSearch]);
  useEffect(() => { setOpPage(1); }, [opSearch]);

  const locationList = locations || [];
  const locPickerTreeOptions = useMemo(() => buildLocationPickerTree(locationList), [locationList]);
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
  const wcPages = Math.max(1, Math.ceil(filteredWCRows.length / WC_PAGE_SIZE));
  const clampedWcPage = Math.min(wcPage, wcPages);
  const pagedWCRows = filteredWCRows.slice((clampedWcPage - 1) * WC_PAGE_SIZE, clampedWcPage * WC_PAGE_SIZE);

  const filteredOp = (operations || []).filter((op: any) =>
      op.code.toLowerCase().includes(opSearch.toLowerCase()) ||
      op.name.toLowerCase().includes(opSearch.toLowerCase())
  );
  const opPages = Math.max(1, Math.ceil(filteredOp.length / OP_PAGE_SIZE));
  const clampedOpPage = Math.min(opPage, opPages);
  const pagedOp = filteredOp.slice((clampedOpPage - 1) * OP_PAGE_SIZE, clampedOpPage * OP_PAGE_SIZE);

  // ── Shared inline edit row (Work Centers) ─────────────────────────────────
  const renderEditRow = (colSpan: number) => {
      if (!editingWC) return null;
      const isGroupNode = !editingWC.parent_id && groups.some((g: any) => g.id === editingWC.id);
      return (
          <tr style={{ background: classic ? '#fffde7' : '#fff8e1', borderBottom: classic ? '2px solid #0058e6' : '2px solid #2563eb' }}>
              <td colSpan={colSpan} style={{ padding: '8px 10px' }}>
                  <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                          <div>
                              <label style={lvLabel(classic)}>{t('item_code')}</label>
                              <input style={{ ...lvInput(classic), width: 80 }} value={editingWC.code} onChange={e => setEditingWC({ ...editingWC, code: e.target.value })} required />
                          </div>
                          <div style={{ flex: 1, minWidth: 140 }}>
                              <label style={lvLabel(classic)}>{t('station_name')}</label>
                              <input style={lvInput(classic)} value={editingWC.name} onChange={e => setEditingWC({ ...editingWC, name: e.target.value })} required />
                          </div>
                          <div>
                              <label style={lvLabel(classic)}>Type</label>
                              <select style={{ ...lvInput(classic), width: 110 }} value={editingWC.center_type} onChange={e => setEditingWC({ ...editingWC, center_type: e.target.value })}>
                                  {CENTER_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                              </select>
                          </div>
                          <div>
                              <label style={lvLabel(classic)}>Group</label>
                              <select style={{ ...lvInput(classic), width: 130 }} value={editingWC.parent_id || ''} onChange={e => setEditingWC({ ...editingWC, parent_id: e.target.value })}>
                                  <option value="">— group —</option>
                                  {groups.filter((g: any) => g.id !== editingWC.id).map((g: any) => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
                              </select>
                          </div>
                      </div>
                      {!isGroupNode && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                              <div style={{ flex: 1, minWidth: 160 }}>
                                  <label style={lvLabel(classic)}>Input Location</label>
                                  <TreeSelect options={locPickerTreeOptions} value={editingWC.input_location_id || ''} onChange={id => setEditingWC({ ...editingWC, input_location_id: id })} allowEmpty emptyLabel="— none —" size="sm" style={{ width: '100%' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 160 }}>
                                  <label style={lvLabel(classic)}>Output Location</label>
                                  <TreeSelect options={locPickerTreeOptions} value={editingWC.output_location_id || ''} onChange={id => setEditingWC({ ...editingWC, output_location_id: id })} allowEmpty emptyLabel="— none —" size="sm" style={{ width: '100%' }} />
                              </div>
                          </div>
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                          <button type="submit" style={lvPrimaryBtn(classic)}>Save</button>
                          <button type="button" style={lvBtn(classic)} onClick={() => setEditingWC(null)}>Cancel</button>
                      </div>
                  </form>
              </td>
          </tr>
      );
  };

  // ── Work Centers tab ───────────────────────────────────────────────────────
  const renderWorkCentersTab = () => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {canManage && (
              <div style={{ background: classic ? '#f5f4ef' : '#fff', borderBottom: classic ? '1px solid #b0a898' : '1px solid #dbe1ea', padding: classic ? '6px 8px' : '10px 12px' }}>
                  <form onSubmit={handleCreateWC} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                          <div>
                              <label style={lvLabel(classic)}>{t('item_code')}</label>
                              <input style={{ ...lvInput(classic), width: 80 }} placeholder="WC-01" value={newWorkCenter.code} onChange={e => setNewWorkCenter({ ...newWorkCenter, code: e.target.value })} required />
                          </div>
                          <div style={{ flex: 1, minWidth: 160 }}>
                              <label style={lvLabel(classic)}>{t('station_name')}</label>
                              <input style={lvInput(classic)} placeholder="Dyeing Machine 1" value={newWorkCenter.name} onChange={e => setNewWorkCenter({ ...newWorkCenter, name: e.target.value })} required />
                          </div>
                          <div>
                              <label style={lvLabel(classic)}>Type</label>
                              <select style={{ ...lvInput(classic), width: 110 }} value={newWorkCenter.center_type} onChange={e => setNewWorkCenter({ ...newWorkCenter, center_type: e.target.value })}>
                                  {CENTER_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                              </select>
                          </div>
                          <div>
                              <label style={lvLabel(classic)}>Group (optional)</label>
                              <select style={{ ...lvInput(classic), width: 150 }} value={newWorkCenter.parent_id} onChange={e => setNewWorkCenter({ ...newWorkCenter, parent_id: e.target.value, input_location_id: '', output_location_id: '' })}>
                                  <option value="">— group node —</option>
                                  {groups.map((g: any) => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
                              </select>
                          </div>
                          <button type="submit" style={lvPrimaryBtn(classic)}>
                              <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>{t('add')}
                          </button>
                      </div>
                      {newWorkCenter.parent_id && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                              <div style={{ flex: 1, minWidth: 160 }}>
                                  <label style={lvLabel(classic)}>Input Location</label>
                                  <TreeSelect options={locPickerTreeOptions} value={newWorkCenter.input_location_id} onChange={id => setNewWorkCenter({ ...newWorkCenter, input_location_id: id })} allowEmpty emptyLabel="— none —" size="sm" style={{ width: '100%' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 160 }}>
                                  <label style={lvLabel(classic)}>Output Location</label>
                                  <TreeSelect options={locPickerTreeOptions} value={newWorkCenter.output_location_id} onChange={id => setNewWorkCenter({ ...newWorkCenter, output_location_id: id })} allowEmpty emptyLabel="— none —" size="sm" style={{ width: '100%' }} />
                              </div>
                          </div>
                      )}
                  </form>
              </div>
          )}

          {/* Toolbar: search + count */}
          <div style={{
              background: classic ? 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)' : '#fff',
              borderBottom: classic ? '1px solid #b0a898' : '1px solid #dbe1ea',
              padding: classic ? '4px 8px' : '8px 10px',
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, flexShrink: 0,
          }}>
              <i className="bi bi-search" style={{ fontSize: 11, color: '#666' }}></i>
              <input style={{ ...lvInput(classic), width: 220, flexBasis: 220 }} placeholder="Search work centers…" value={wcSearch} onChange={e => setWcSearch(e.target.value)} />
              <span style={lvSep(classic)} />
              <span style={{ marginLeft: 'auto', fontSize: classic ? 11 : 12, color: classic ? '#444' : '#64748b', fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined }}>
                  {filteredWCRows.length.toLocaleString()} station{filteredWCRows.length !== 1 ? 's' : ''}
              </span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={classic ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' } : { background: '#eef1f6' }}>
                      <tr>
                          <th style={{ ...lvTh(classic), width: 90 }}>{t('item_code')}</th>
                          <th style={lvTh(classic)}>{t('station_name')}</th>
                          <th style={{ ...lvTh(classic), width: 90 }}>Type</th>
                          <th style={{ ...lvTh(classic), width: 100 }}>In Loc</th>
                          <th style={{ ...lvTh(classic), width: 100 }}>Out Loc</th>
                          <th style={{ ...lvTh(classic), width: 64, textAlign: 'right', borderRight: 'none' }}></th>
                      </tr>
                  </thead>
                  <tbody>
                      {pagedWCRows.map(({ wc, isGroup, indent }, i) => (
                          editingWC?.id === wc.id
                              ? <React.Fragment key={wc.id}>{renderEditRow(6)}</React.Fragment>
                              : (
                                  <tr key={wc.id} style={isGroup
                                      ? { background: classic ? '#e8eaf6' : '#eef1fb', borderBottom: classic ? '2px solid #9fa8da' : '2px solid #c7d2ee' }
                                      : lvRow(classic, i)}>
                                      <td style={{ ...lvTd(classic), paddingLeft: indent ? (classic ? 20 : 26) : undefined, fontWeight: 'bold', color: isGroup ? (classic ? '#1a237e' : '#1e293b') : (classic ? '#00008b' : '#2563eb') }}>
                                          {isGroup && <i className="bi bi-folder2" style={{ marginRight: 4, fontSize: classic ? 10 : 12 }}></i>}
                                          {indent && <i className="bi bi-dash" style={{ marginRight: 2, fontSize: classic ? 10 : 12, color: '#888' }}></i>}
                                          {wc.code}
                                      </td>
                                      <td style={{ ...lvTd(classic), paddingLeft: indent ? (classic ? 20 : 26) : undefined, fontStyle: isGroup ? 'italic' : 'normal' }}>{wc.name}</td>
                                      <td style={lvTd(classic)}>
                                          <span style={{ padding: '1px 6px', borderRadius: classic ? 2 : 6, fontSize: classic ? 10 : 11, ...getWcTypeChip(wc.center_type) }}>{wc.center_type || 'GENERAL'}</span>
                                      </td>
                                      <td style={{ ...lvTd(classic), color: classic ? '#444' : '#64748b', whiteSpace: 'nowrap' }}>{!isGroup ? getLocName(wc.input_location_id) : ''}</td>
                                      <td style={{ ...lvTd(classic), color: classic ? '#444' : '#64748b', whiteSpace: 'nowrap' }}>{!isGroup ? getLocName(wc.output_location_id) : ''}</td>
                                      <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                          {canManage && (
                                              <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                                                  <XPActionButton classic={classic} tone="neutral" icon="bi-pencil" title="Edit" onClick={() => setEditingWC({ ...wc })} />
                                                  <XPActionButton classic={classic} tone="danger" icon="bi-trash" title="Delete" onClick={() => onDeleteWorkCenter && onDeleteWorkCenter(wc.id)} />
                                              </div>
                                          )}
                                      </td>
                                  </tr>
                              )
                      ))}
                      {filteredWCRows.length === 0 && (
                          <tr><td colSpan={6} style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'center', padding: 20, color: classic ? '#888' : '#64748b', fontStyle: 'italic' }}>No work centers defined</td></tr>
                      )}
                  </tbody>
              </table>
          </div>

          <Pager page={clampedWcPage} total={filteredWCRows.length} pageSize={WC_PAGE_SIZE} onPageChange={setWcPage} hideWhenEmpty />

          {classic && (
              <div style={{
                  background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                  padding: '2px 8px', display: 'flex', gap: 16,
                  fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, color: '#333',
              }}>
                  <span><b>{wcList.length}</b> Total</span><span><b>{groups.length}</b> Groups</span>
              </div>
          )}
      </div>
  );

  // ── Operations tab ─────────────────────────────────────────────────────────
  const renderOperationsTab = () => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {canManage && (
              <div style={{ background: classic ? '#f5f4ef' : '#fff', borderBottom: classic ? '1px solid #b0a898' : '1px solid #dbe1ea', padding: classic ? '6px 8px' : '10px 12px' }}>
                  <form onSubmit={handleCreateOp} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                      <div>
                          <label style={lvLabel(classic)}>{t('item_code')}</label>
                          <input style={{ ...lvInput(classic), width: 80 }} placeholder="OP-10" value={newOperation.code} onChange={e => setNewOperation({ ...newOperation, code: e.target.value })} required />
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                          <label style={lvLabel(classic)}>{t('operation_name')}</label>
                          <input style={lvInput(classic)} placeholder="Cutting" value={newOperation.name} onChange={e => setNewOperation({ ...newOperation, name: e.target.value })} required />
                      </div>
                      <button type="submit" style={lvPrimaryBtn(classic)}>
                          <i className="bi bi-plus-lg" style={{ marginRight: 4 }}></i>{t('add')}
                      </button>
                  </form>
              </div>
          )}

          {/* Toolbar: search + count */}
          <div style={{
              background: classic ? 'linear-gradient(to bottom, #f5f4ef, #e0dfd8)' : '#fff',
              borderBottom: classic ? '1px solid #b0a898' : '1px solid #dbe1ea',
              padding: classic ? '4px 8px' : '8px 10px',
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, flexShrink: 0,
          }}>
              <i className="bi bi-search" style={{ fontSize: 11, color: '#666' }}></i>
              <input style={{ ...lvInput(classic), width: 220, flexBasis: 220 }} placeholder="Search operations…" value={opSearch} onChange={e => setOpSearch(e.target.value)} />
              <span style={lvSep(classic)} />
              <span style={{ marginLeft: 'auto', fontSize: classic ? 11 : 12, color: classic ? '#444' : '#64748b', fontFamily: classic ? 'Tahoma, Arial, sans-serif' : undefined }}>
                  {filteredOp.length.toLocaleString()} operation{filteredOp.length !== 1 ? 's' : ''}
              </span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={classic ? { background: 'linear-gradient(to bottom, #ffffff, #d4d0c8)', borderBottom: '2px solid #808080' } : { background: '#eef1f6' }}>
                      <tr>
                          <th style={{ ...lvTh(classic), width: 100 }}>{t('item_code')}</th>
                          <th style={lvTh(classic)}>{t('operation_name')}</th>
                          <th style={{ ...lvTh(classic), width: 50, textAlign: 'right', borderRight: 'none' }}></th>
                      </tr>
                  </thead>
                  <tbody>
                      {pagedOp.map((op: any, i: number) => (
                          <tr key={op.id} style={lvRow(classic, i)}>
                              <td style={{ ...lvTd(classic), fontWeight: 'bold', color: classic ? '#1a5e1a' : '#15803d' }}>
                                  {op.code}
                                  {op.is_system && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 'bold', color: '#555', background: '#ddd', border: '1px solid #aaa', borderRadius: 2, padding: '0 3px' }}>sys</span>}
                              </td>
                              <td style={lvTd(classic)}>{op.name}</td>
                              <td style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'right' }}>
                                  {!op.is_system && canManage && (
                                      <XPActionButton classic={classic} tone="danger" icon="bi-trash" title="Delete" onClick={() => onDeleteOperation && onDeleteOperation(op.id)} />
                                  )}
                              </td>
                          </tr>
                      ))}
                      {filteredOp.length === 0 && (
                          <tr><td colSpan={3} style={{ ...lvTd(classic), borderRight: 'none', textAlign: 'center', padding: 20, color: classic ? '#888' : '#64748b', fontStyle: 'italic' }}>No operations defined</td></tr>
                      )}
                  </tbody>
              </table>
          </div>

          <Pager page={clampedOpPage} total={filteredOp.length} pageSize={OP_PAGE_SIZE} onPageChange={setOpPage} hideWhenEmpty />

          {classic && (
              <div style={{
                  background: 'linear-gradient(to bottom, #e8e6df, #d5d3cc)', borderTop: '1px solid #b0a898',
                  padding: '2px 8px', display: 'flex', gap: 16,
                  fontFamily: 'Tahoma, Arial, sans-serif', fontSize: 11, color: '#333',
              }}>
                  <span><b>{(operations || []).length}</b> Total</span>
              </div>
          )}
      </div>
  );

  return (
      <ShellWindow classic={classic} fill="page" className="fade-in">
          <ShellTitleBar
              classic={classic}
              icon="bi-signpost-split-fill"
              title={t('routing')}
              subtitle="Work centers and standard operations used across manufacturing routings"
          />
          <Tabs tabs={TABS} activeKey={activeTab} onChange={(key) => setActiveTab(key)} classic={classic} />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: classic ? '#ece9d8' : '#fff' }}>
              <div style={{ display: activeTab === 'work_centers' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
                  {renderWorkCentersTab()}
              </div>
              <div style={{ display: activeTab === 'operations' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
                  {renderOperationsTab()}
              </div>
          </div>
      </ShellWindow>
  );
}
